import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import type BetterSqlite3 from "better-sqlite3";
import { buildCliArgs, parseStreamEvent, type ProviderType } from "../orchestrator/cli-provider.js";

const require = createRequire(import.meta.url);

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
  private provider: ProviderType;

  constructor(cwd: string, systemPrompt?: string, db?: BetterSqlite3.Database, provider?: ProviderType) {
    super();
    this.cwd = cwd;
    this.db = db ?? null;
    this.provider = provider ?? "claude";

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
You manage a team of AI worker agents. The team is loaded dynamically from the workspace configuration — do NOT assume any specific agents exist. Wait for the team info section to be injected.

Do NOT reference agents from CLAUDE.md or other config files — those are unrelated to your team. Only reference agents listed in the "## Your Team" section after it gets updated.

## First Interaction
When the user sends their FIRST message in a new workspace:
1. Introduce yourself briefly as Facu, the PM
2. Ask what the project is about: tech stack, what they want to build, any existing code
3. Use **set_workspace** to save the project context so all workers know what they're working on
4. Then start creating tasks based on what the user described

Do NOT assume you know the project context. Always ask first if there's no WORKSPACE.md loaded.

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

## Workflows
You can execute structured multi-phase workflows for complex tasks:
- **Bug Fix** (5 phases): Triage → Root Cause → Fix → Test → Review
- **Feature** (6 phases): Brainstorm → Research → Foundation → Integration → Test → Review
- **Quick Refinement** (3 phases): Triage → Implement → Verify
- **Refactoring** (5 phases): Scope → Test First → Refactor → Verify → Review
- **Security Audit** (5 phases): Scope → Scan → Review → Fix → Verify

When the user describes work that matches a workflow pattern:
1. Identify the type (bug fix, feature, refactor, security, or quick tweak)
2. Tell the user which workflow you'll use and briefly list the phases
3. Create the first phase task with the right role
4. The system will auto-advance phases when tasks complete

If the team is missing a role needed for the workflow, warn the user:
"⚠️ This workflow needs a [tester/reviewer/etc.] but your team doesn't have one. Add one in Workers → + Add Agent."

## Behavior
- For development work → create a task with assignee="worker" and the appropriate role. Confirm to the user with the task ID.
- For complex work → use a workflow (bug fix, feature, refactor, etc.) to ensure structured execution.
- For status questions → use list_tasks and present a clean summary.
- For simple conversation → respond directly, no task needed.
- When assigning tasks, always set a role (default to "developer" if unclear).
- After creating/updating tasks, give a brief confirmation with the key details.
- When the user describes their project for the first time, use set_workspace to save the context so workers know what they're working on.`;

    // Prepend identity so Clara knows what provider she runs on
    const providerLabel = this.provider === "kimi" ? "Kimi (by Moonshot AI)" : "Claude (by Anthropic)";
    this.systemPrompt = `## Identity\nYou are powered by ${providerLabel}. When the user asks what model or AI you use, answer "${this.provider === "kimi" ? "Kimi" : "Claude"}".\n\n` + this.systemPrompt;
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
      const { command, args } = buildCliArgs(this.provider, {
        prompt,
        systemPrompt: this.systemPrompt,
        sessionId: this.sessionId,
        cwd: this.cwd,
      });

      // Claude-specific: add allowed MCP tools
      if (this.provider === "claude") {
        // Remove "-p" and prompt from end, insert --allowedTools before them
        const promptArg = args.pop()!; // prompt text
        const pFlag = args.pop()!;     // "-p"
        args.push(
          "--allowedTools",
          "mcp__openteam__create_task,mcp__openteam__list_tasks,mcp__openteam__update_task,mcp__openteam__post_update,mcp__openteam__get_updates,mcp__openteam__get_workspace,mcp__openteam__set_workspace",
        );
        args.push(pFlag, promptArg);
      }

      let fullOutput = "";
      let responseText = "";
      let capturedSessionId: string | null = null;

      // Use child_process.spawn instead of PTY for cleaner output
      const { spawn: cpSpawn } = require("node:child_process") as typeof import("node:child_process");
      const child = cpSpawn(command, args, {
        cwd: this.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      child.stdout.on("data", (data: Buffer) => {
        fullOutput += data.toString();

        const lines = fullOutput.split("\n");
        fullOutput = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as StreamJsonEvent;

            const chunk = parseStreamEvent(this.provider, event as unknown as Record<string, unknown>);
            if (chunk) {
              responseText += chunk;
              this.emit("stream", chunk);
            }

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

      let stderrOutput = "";
      child.stderr.on("data", (data: Buffer) => {
        stderrOutput += data.toString();
      });

      child.on("close", (code) => {
        // Process any remaining output
        if (fullOutput.trim()) {
          try {
            const event = JSON.parse(fullOutput) as StreamJsonEvent;
            const chunk = parseStreamEvent(this.provider, event as unknown as Record<string, unknown>);
            if (chunk) {
              responseText += chunk;
              this.emit("stream", chunk);
            }
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
          const debugInfo = stderrOutput.trim() ? ` — ${stderrOutput.trim().slice(0, 300)}` : "";
          reject(new Error(`${this.provider} exited with code ${code}${debugInfo}`));
        } else {
          resolve(responseText || "(no response)");
        }
      });

      child.on("error", (err) => {
        reject(err);
      });
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

  /** Update the team info in the system prompt. Called when team changes. */
  setTeamInfo(members: Array<{ roleId: string; name: string; provider?: string }>): void {
    const teamLines = members.map((m) => {
      const prov = m.provider ? ` — uses ${m.provider === "kimi" ? "Kimi" : "Claude"}` : "";
      return `- **${m.name}** (${m.roleId}${prov})`;
    }).join("\n");
    const roleList = members.map((m) => `"${m.roleId}"`).join(", ");
    const teamSection = `## Your Team
You manage a team of AI worker agents:
${teamLines}

These are the worker roles in the current team. When the user asks about "the team" or "agents", refer to them by their names.
Use their names naturally: "Le asigné a ${members[0]?.name ?? "the developer"}" instead of role names.

Available roles for task assignment: ${roleList}`;

    // Replace the team section in the system prompt
    this.systemPrompt = this.systemPrompt.replace(
      /## Your Team[\s\S]*?(?=## MCP Tools)/,
      teamSection + "\n\n",
    );
  }

  /** Update MCP server info in the PM's system prompt. */
  setMcpServers(servers: Array<{ name: string; enabled: boolean }>): void {
    const enabled = servers.filter((s) => s.enabled);
    let mcpSection = "";
    if (enabled.length > 0) {
      mcpSection = "\n\nWorkers in this workspace also have access to these MCP servers:\n" +
        enabled.map((s) => `- **${s.name}**`).join("\n") +
        "\nWhen the user asks about tools or MCP servers, mention these.";
    }

    // Insert after ## MCP Tools section, before ## Project Context
    const marker = "## Project Context";
    const idx = this.systemPrompt.indexOf(marker);
    if (idx !== -1) {
      // Remove any previous workspace MCP section
      this.systemPrompt = this.systemPrompt.replace(/\n\nWorkers in this workspace also have access[\s\S]*?(?=\n\n## Project Context)/, "");
      // Insert new section
      this.systemPrompt = this.systemPrompt.slice(0, idx) + mcpSection + "\n\n" + this.systemPrompt.slice(idx);
    }
  }

  /** Change the AI provider at runtime. Updates system prompt too. */
  setProvider(provider: ProviderType): void {
    this.provider = provider;
    // Update system prompt to reflect the provider
    this.systemPrompt = this.systemPrompt.replace(
      /## Identity\n.*?\n/s,
      "",
    );
    this.systemPrompt = `## Identity\nYou are powered by ${provider === "kimi" ? "Kimi (by Moonshot AI)" : "Claude (by Anthropic)"}. When asked, say you use ${provider === "kimi" ? "Kimi" : "Claude"}.\n\n` + this.systemPrompt;
  }

  /** Clear chat history from memory and DB. */
  clearHistory(): void {
    this.history = [];
    if (this.db) {
      this.db.prepare("DELETE FROM chat_messages").run();
    }
  }
}
