import { EventEmitter } from "node:events";
import { PtyManager, createEmitter } from "../agent-runtime/pty-manager.js";
import type { Task } from "../persistence/task-store.js";
import type { EventLogger } from "../persistence/event-logger.js";
import type { SkillLoader } from "../skills/skill-loader.js";
import type { ContextManager } from "../context/context-manager.js";
import type { McpManager } from "../mcp-server/mcp-manager.js";
import type { KnowledgeBase } from "../context/knowledge-base.js";
import type { AgentMemory } from "../persistence/agent-memory.js";
import type { DecisionStore } from "../persistence/decision-store.js";
import { buildCliArgs, parseStreamEvent, parseTokenUsage, type ProviderType, type TokenUsage } from "./cli-provider.js";

const DEFAULT_WORKER_PROMPT = `You are a Worker agent in the OpenTeam framework.
You have been assigned a task. Complete it efficiently and concisely.
Focus only on what the task asks. Do not create new tasks or ask questions.
When you are done, simply output your result.`;

export interface WorkerRunnerOptions {
  task: Task;
  cwd: string;
  eventLogger: EventLogger;
  skillLoader?: SkillLoader;
  contextManager?: ContextManager;
  mcpManager?: McpManager;
  knowledgeBase?: KnowledgeBase;
  agentMemory?: AgentMemory;
  decisionStore?: DecisionStore;
  provider?: ProviderType;
}

export class WorkerRunner extends EventEmitter {
  private task: Task;
  private cwd: string;
  private eventLogger: EventLogger;
  private skillLoader: SkillLoader | null;
  private contextManager: ContextManager | null;
  private mcpManager: McpManager | null;
  private knowledgeBase: KnowledgeBase | null;
  private agentMemory: AgentMemory | null;
  private decisionStore: DecisionStore | null;
  private provider: ProviderType;
  private pty: PtyManager | null = null;

  constructor(options: WorkerRunnerOptions) {
    super();
    this.task = options.task;
    this.cwd = options.cwd;
    this.eventLogger = options.eventLogger;
    this.skillLoader = options.skillLoader ?? null;
    this.contextManager = options.contextManager ?? null;
    this.mcpManager = options.mcpManager ?? null;
    this.knowledgeBase = options.knowledgeBase ?? null;
    this.agentMemory = options.agentMemory ?? null;
    this.decisionStore = options.decisionStore ?? null;
    this.provider = options.provider ?? "claude";
  }

  start(): void {
    const emitter = createEmitter();
    this.pty = new PtyManager(emitter);

    let systemPrompt = this.skillLoader
      ? this.skillLoader.buildWorkerPrompt(this.task.role ?? undefined)
      : DEFAULT_WORKER_PROMPT;

    // Append relevant knowledge docs
    if (this.knowledgeBase) {
      systemPrompt += this.knowledgeBase.buildPromptSection(
        this.task.title,
        this.task.description,
        this.task.role ?? undefined,
      );
    }

    // Append agent memory (lessons learned + known issues)
    if (this.agentMemory) {
      systemPrompt += this.agentMemory.buildPromptSection(
        this.task.title,
        this.task.role ?? undefined,
      );
    }

    // Append accepted ADRs
    if (this.decisionStore) {
      systemPrompt += this.decisionStore.buildPromptSection();
    }

    // Append MCP tools info to system prompt
    if (this.mcpManager) {
      systemPrompt += this.mcpManager.buildPromptSection();
    }

    const prompt = this.buildPrompt();
    const mcpConfig = this.mcpManager?.buildMcpConfigJson() ?? null;

    const { command, args } = buildCliArgs(this.provider, {
      prompt,
      systemPrompt,
      mcpConfigJson: mcpConfig,
      cwd: this.cwd,
    });

    let fullOutput = "";
    let responseText = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    emitter.on("output", (output) => {
      fullOutput += output.data;
      const lines = fullOutput.split("\n");
      fullOutput = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          const chunk = parseStreamEvent(this.provider, event);
          if (chunk) {
            responseText += chunk;
            this.emit("output", {
              taskId: this.task.id,
              chunk,
            });
          }
          const usage = parseTokenUsage(this.provider, event);
          if (usage) {
            totalInputTokens += usage.inputTokens;
            totalOutputTokens += usage.outputTokens;
          }
        } catch {
          // skip non-JSON
        }
      }
    });

    emitter.on("exit", (code) => {
      this.pty = null;

      if (code === 0) {
        this.eventLogger.log({
          agent: `worker:${this.task.id}`,
          type: "task_completed",
          task_id: this.task.id,
          detail: responseText.slice(0, 500),
        });
        this.emit("complete", responseText || "(completed with no output)", {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        } as TokenUsage);
      } else {
        this.emit("error", new Error(`Worker exited with code ${code}`));
      }
    });

    try {
      this.pty.spawn({
        command,
        args,
        cwd: this.cwd,
      });
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  stop(): void {
    this.pty?.kill();
  }

  private buildPrompt(): string {
    let prompt = `Task ${this.task.id}: ${this.task.title}`;
    if (this.task.description) {
      prompt += `\n\nDescription: ${this.task.description}`;
    }
    prompt += `\n\nPriority: ${this.task.priority}`;

    // Inject team context (workspace + previous task results)
    if (this.contextManager) {
      const context = this.contextManager.buildWorkerContext(this.task);
      if (context) {
        prompt += context;
      }
    }

    return prompt;
  }
}
