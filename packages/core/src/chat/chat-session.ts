import { EventEmitter } from "node:events";
import { PtyManager, createEmitter } from "../agent-runtime/pty-manager.js";
import type BetterSqlite3 from "better-sqlite3";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatEvents {
  stream: (chunk: string) => void;
  response: (message: ChatMessage) => void;
  error: (error: Error) => void;
  status: (status: "idle" | "working") => void;
}

interface StreamJsonEvent {
  type: string;
  subtype?: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string | null;
  };
  result?: string;
  session_id?: string;
}

/**
 * Manages a conversation with Claude Code.
 * Each user message spawns a short-lived `claude --print` process.
 * Conversation continuity is maintained via `--resume <sessionId>`.
 */
export class ChatSession extends EventEmitter {
  private sessionId: string | null = null;
  private cwd: string;
  private systemPrompt: string;
  private history: ChatMessage[] = [];
  private _isProcessing = false;
  private db: BetterSqlite3.Database | null = null;

  constructor(cwd: string, systemPrompt?: string, db?: BetterSqlite3.Database) {
    super();
    this.cwd = cwd;
    this.db = db ?? null;

    // Restore chat history from DB
    if (this.db) {
      const rows = this.db
        .prepare("SELECT role, content, created_at FROM chat_messages ORDER BY id ASC")
        .all() as Array<{ role: string; content: string; created_at: string }>;
      for (const row of rows) {
        this.history.push({
          role: row.role as "user" | "assistant",
          content: row.content,
          timestamp: row.created_at,
        });
      }
    }
    this.systemPrompt =
      systemPrompt ??
      `You are the Project Manager (PM) for OpenTeam — a friendly, organized, and proactive AI team lead.

## Personality
- Warm and professional. Use emojis naturally to make messages scannable (✅ ⚡ 🔧 📋 🚀 ⏳ 🎯 etc.)
- Always respond in the same language the user writes to you.
- Be concise but structured — use bullet points, short tables, or numbered lists when reporting status.
- Celebrate wins briefly. Flag blockers clearly.
- When reporting task status, format it cleanly with task IDs, titles, and current state.

## Your Team
You manage a team of AI worker agents. Each has a human name:
- 🔧 **Lucas** (developer) — writes code, creates files, implements features, fixes bugs
- 🎨 **Sofia** (designer) — UI/UX design, components, accessibility, visual polish
- 🧪 **Max** (tester) — writes tests, validates behavior, ensures quality
- 🔍 **Ana** (reviewer) — reviews code for correctness, security, performance

These are the ONLY worker roles available in OpenTeam right now. Do NOT reference agents from CLAUDE.md or other config files — those are unrelated to your team. When the user asks about "the team" or "agents", refer to these 4 by their names.

When spawned, workers are named like Lucas-1, Sofia-2, etc. Use their names naturally in conversation: "Le asigné a Lucas el bugfix" instead of "Developer-1 assigned".

## MCP Tools
You have these tools to manage the project board:
- **create_task**: Create a task (title, description, priority, assignee, role). Set assignee="worker" to auto-execute. Use role for the worker skill: "developer", "designer", "tester", or "reviewer".
- **list_tasks**: List tasks, optionally filtered by status or assignee.
- **update_task**: Update status, assignee, role, title, description, or priority.
- **post_update**: Post a team-wide update.
- **get_updates**: Get recent team updates.
- **get_workspace**: Read the project's WORKSPACE.md context file.
- **set_workspace**: Write/update WORKSPACE.md — this context is injected into every worker's prompt automatically.

## Project Context (WORKSPACE.md)
Workers receive context from a file called WORKSPACE.md. This should describe the project's tech stack, file structure, coding conventions, and current state. When the user first describes their project or you learn important context, use **set_workspace** to save it. Workers also automatically see results from completed tasks, so they can build on each other's work.

## Behavior
- For development work → create a task with assignee="worker" and the appropriate role. Confirm to the user with the task ID.
- For status questions → use list_tasks and present a clean summary.
- For simple conversation → respond directly, no task needed.
- When assigning tasks, always set a role (default to "developer" if unclear).
- After creating/updating tasks, give a brief confirmation with the key details.
- When the user describes their project for the first time, use set_workspace to save the context so workers know what they're working on.`;
  }

  get isProcessing(): boolean {
    return this._isProcessing;
  }

  get messages(): readonly ChatMessage[] {
    return this.history;
  }

  async sendMessage(userInput: string): Promise<ChatMessage> {
    if (this._isProcessing) {
      throw new Error("Already processing a message");
    }

    this._isProcessing = true;
    this.emit("status", "working");

    const userMessage: ChatMessage = {
      role: "user",
      content: userInput,
      timestamp: new Date().toISOString(),
    };
    this.history.push(userMessage);
    this.persistMessage(userMessage);

    try {
      const response = await this.runClaudeOnce(userInput);
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      };
      this.history.push(assistantMessage);
      this.persistMessage(assistantMessage);
      this.emit("response", assistantMessage);
      return assistantMessage;
    } finally {
      this._isProcessing = false;
      this.emit("status", "idle");
    }
  }

  private async runClaudeOnce(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const emitter = createEmitter();
      const pty = new PtyManager(emitter);

      const args = [
        "--print",
        "--verbose",
        "--output-format", "stream-json",
        "--allowedTools", "mcp__openteam__create_task,mcp__openteam__list_tasks,mcp__openteam__update_task,mcp__openteam__post_update,mcp__openteam__get_updates,mcp__openteam__get_workspace,mcp__openteam__set_workspace",
      ];

      if (this.systemPrompt) {
        args.push("--append-system-prompt", this.systemPrompt);
      }

      if (this.sessionId) {
        args.push("--resume", this.sessionId);
      }

      args.push(prompt);

      let fullOutput = "";
      let responseText = "";
      let capturedSessionId: string | null = null;

      emitter.on("output", (output) => {
        fullOutput += output.data;

        const lines = fullOutput.split("\n");
        fullOutput = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as StreamJsonEvent;
            this.processStreamEvent(event, (chunk) => {
              responseText += chunk;
              this.emit("stream", chunk);
            });

            if (event.type === "system" && event.subtype === "init" && event.session_id) {
              capturedSessionId = event.session_id;
            }

            if (event.type === "result" && event.session_id) {
              capturedSessionId = event.session_id;
            }
          } catch {
            // Not valid JSON, skip
          }
        }
      });

      emitter.on("exit", (code) => {
        // Process any remaining output
        if (fullOutput.trim()) {
          try {
            const event = JSON.parse(fullOutput) as StreamJsonEvent;
            this.processStreamEvent(event, (chunk) => {
              responseText += chunk;
              this.emit("stream", chunk);
            });
            if (event.type === "result" && event.session_id) {
              capturedSessionId = event.session_id;
            }
          } catch {
            // ignore
          }
        }

        if (capturedSessionId) {
          this.sessionId = capturedSessionId;
        }

        if (code !== 0 && !responseText) {
          reject(new Error(`Claude Code exited with code ${code}`));
        } else {
          resolve(responseText || "(no response)");
        }
      });

      try {
        pty.spawn({
          command: "claude",
          args,
          cwd: this.cwd,
        });
      } catch (err) {
        this._isProcessing = false;
        reject(err);
      }
    });
  }

  private processStreamEvent(
    event: StreamJsonEvent,
    onChunk: (text: string) => void,
  ): void {
    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          onChunk(block.text);
        }
      }
    }
  }

  private persistMessage(msg: ChatMessage): void {
    if (!this.db) return;
    this.db
      .prepare("INSERT INTO chat_messages (role, content, created_at) VALUES (?, ?, ?)")
      .run(msg.role, msg.content, msg.timestamp);
  }

  /** Clear chat history from memory and DB. */
  clearHistory(): void {
    this.history = [];
    if (this.db) {
      this.db.prepare("DELETE FROM chat_messages").run();
    }
  }
}
