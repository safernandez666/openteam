import { EventEmitter } from "node:events";
import { PtyManager, createEmitter } from "../agent-runtime/pty-manager.js";

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

  constructor(cwd: string, systemPrompt?: string) {
    super();
    this.cwd = cwd;
    this.systemPrompt =
      systemPrompt ??
      "You are the Project Manager (PM) for OpenTeam. You help the user manage tasks and coordinate work. Be concise and helpful. Respond in the same language the user writes to you.";
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

    try {
      const response = await this.runClaudeOnce(userInput);
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      };
      this.history.push(assistantMessage);
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

      const args = ["--print", "--verbose", "--output-format", "stream-json"];

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
}
