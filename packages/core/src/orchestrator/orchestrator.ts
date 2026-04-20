import { EventEmitter } from "node:events";
import type { TaskStore, Task } from "../persistence/task-store.js";
import type { EventLogger } from "../persistence/event-logger.js";
import type { SkillLoader } from "../skills/skill-loader.js";
import type { ContextManager } from "../context/context-manager.js";
import type { McpManager } from "../mcp-server/mcp-manager.js";
import type { AgentNames } from "./agent-names.js";
import type { KnowledgeBase } from "../context/knowledge-base.js";
import type { AgentMemory } from "../persistence/agent-memory.js";
import type { PerformanceTracker } from "../persistence/performance-tracker.js";
import type { DecisionStore } from "../persistence/decision-store.js";
import type { ProviderType, TokenUsage } from "./cli-provider.js";
import { WorkerRunner } from "./worker-runner.js";

export interface WorkerInfo {
  taskId: string;
  taskTitle: string;
  role: string | null;
  name: string;
  status: "running" | "completed" | "error";
  startedAt: string;
}

export interface OrchestratorOptions {
  taskStore: TaskStore;
  eventLogger: EventLogger;
  cwd: string;
  skillLoader?: SkillLoader;
  contextManager?: ContextManager;
  mcpManager?: McpManager;
  agentNames?: AgentNames;
  knowledgeBase?: KnowledgeBase;
  agentMemory?: AgentMemory;
  performanceTracker?: PerformanceTracker;
  decisionStore?: DecisionStore;
  provider?: ProviderType;
  maxConcurrentWorkers?: number;
  pollIntervalMs?: number;
  retryDelayMs?: number;
}

export class Orchestrator extends EventEmitter {
  private taskStore: TaskStore;
  private eventLogger: EventLogger;
  private cwd: string;
  private skillLoader: SkillLoader | null;
  private contextManager: ContextManager | null;
  private mcpManager: McpManager | null;
  private agentNames: AgentNames | null;
  private knowledgeBase: KnowledgeBase | null;
  private agentMemory: AgentMemory | null;
  private performanceTracker: PerformanceTracker | null;
  private decisionStore: DecisionStore | null;
  private provider: ProviderType;
  private maxWorkers: number;
  private pollIntervalMs: number;
  private activeWorkers = new Map<string, WorkerRunner>();
  private workerInfoMap = new Map<string, WorkerInfo>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private workerCounter = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private retryDelayMs: number;

  constructor(options: OrchestratorOptions) {
    super();
    this.taskStore = options.taskStore;
    this.eventLogger = options.eventLogger;
    this.cwd = options.cwd;
    this.skillLoader = options.skillLoader ?? null;
    this.contextManager = options.contextManager ?? null;
    this.mcpManager = options.mcpManager ?? null;
    this.agentNames = options.agentNames ?? null;
    this.knowledgeBase = options.knowledgeBase ?? null;
    this.agentMemory = options.agentMemory ?? null;
    this.performanceTracker = options.performanceTracker ?? null;
    this.decisionStore = options.decisionStore ?? null;
    this.provider = options.provider ?? "claude";
    this.maxWorkers = options.maxConcurrentWorkers ?? 3;
    this.pollIntervalMs = options.pollIntervalMs ?? 3000;
    this.retryDelayMs = options.retryDelayMs ?? 5000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.eventLogger.log({
      agent: "orchestrator",
      type: "orchestrator_started",
      detail: `Polling every ${this.pollIntervalMs}ms, max ${this.maxWorkers} workers`,
    });

    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const [, worker] of new Map(this.activeWorkers)) {
      worker.stop();
    }
    this.activeWorkers.clear();
    for (const [, timer] of this.retryTimers) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
  }

  get workerCount(): number {
    return this.activeWorkers.size;
  }

  setProvider(provider: ProviderType): void {
    this.provider = provider;
  }

  /** Returns current state of all tracked workers (active + recently finished). */
  getWorkers(): WorkerInfo[] {
    return Array.from(this.workerInfoMap.values());
  }

  private poll(): void {
    if (!this.running) return;

    const assignedTasks = this.taskStore.list({ status: "assigned" });

    for (const task of assignedTasks) {
      if (this.activeWorkers.has(task.id)) continue;
      if (this.activeWorkers.size >= this.maxWorkers) break;

      // Check if all dependencies are met before spawning
      if (!this.taskStore.areDependenciesMet(task.id)) {
        continue;
      }

      this.spawnWorker(task);
    }
  }

  private generateWorkerName(role: string | null): string {
    this.workerCounter++;
    const humanName = role && this.agentNames ? this.agentNames.get(role) : null;
    if (humanName && humanName !== role) {
      return `${humanName}-${this.workerCounter}`;
    }
    const base = role ?? "worker";
    return `${base[0].toUpperCase()}${base.slice(1)}-${this.workerCounter}`;
  }

  private spawnWorker(task: Task): void {
    const worker = new WorkerRunner({
      task,
      cwd: this.cwd,
      eventLogger: this.eventLogger,
      skillLoader: this.skillLoader ?? undefined,
      contextManager: this.contextManager ?? undefined,
      mcpManager: this.mcpManager ?? undefined,
      knowledgeBase: this.knowledgeBase ?? undefined,
      agentMemory: this.agentMemory ?? undefined,
      decisionStore: this.decisionStore ?? undefined,
      provider: (this.agentNames?.getProvider(task.role ?? "") ?? this.provider) as "claude" | "kimi",
    });

    this.activeWorkers.set(task.id, worker);

    const workerInfo: WorkerInfo = {
      taskId: task.id,
      taskTitle: task.title,
      role: task.role ?? null,
      name: this.generateWorkerName(task.role),
      status: "running",
      startedAt: new Date().toISOString(),
    };
    this.workerInfoMap.set(task.id, workerInfo);

    this.eventLogger.log({
      agent: "orchestrator",
      type: "worker_spawned",
      task_id: task.id,
      detail: `Spawning ${workerInfo.name} for "${task.title}"`,
    });

    // Update task to in_progress
    this.taskStore.update(task.id, { status: "in_progress" });
    this.emit("task_updated", this.taskStore.get(task.id));
    this.emit("workers_changed", this.getWorkers());

    worker.on("output", (data: { taskId: string; chunk: string }) => {
      this.emit("worker_output", data);
    });

    worker.on("complete", (result: string, usage?: TokenUsage) => {
      this.taskStore.update(task.id, { status: "done", result });
      if (usage && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
        this.taskStore.updateTokens(task.id, usage.inputTokens, usage.outputTokens);
      }
      this.activeWorkers.delete(task.id);

      const info = this.workerInfoMap.get(task.id);
      if (info) info.status = "completed";

      this.eventLogger.log({
        agent: "orchestrator",
        type: "worker_completed",
        task_id: task.id,
        detail: result,
      });

      // Log performance event
      if (this.performanceTracker) {
        const startTime = new Date(workerInfo.startedAt).getTime();
        this.performanceTracker.logEvent({
          type: "task_completed",
          agent_role: task.role ?? "unknown",
          agent_name: workerInfo.name,
          task_id: task.id,
          task_category: task.role ?? undefined,
          outcome: "success",
          duration_ms: Date.now() - startTime,
          input_tokens: usage?.inputTokens ?? 0,
          output_tokens: usage?.outputTokens ?? 0,
          retries: task.retry_count,
        });
      }

      // Auto-update WORKSPACE.md with task summary
      if (this.contextManager) {
        this.contextManager.appendTaskSummary(task, result);
      }

      this.emit("task_updated", this.taskStore.get(task.id));
      this.emit("worker_done", { taskId: task.id, result });
      this.emit("workers_changed", this.getWorkers());

      // Clean up completed worker info after 60s to prevent memory leak
      setTimeout(() => this.workerInfoMap.delete(task.id), 60000);

      // Check if completing this task unblocks dependents
      this.checkUnblockedDependents(task.id);
    });

    worker.on("error", (err: Error) => {
      this.activeWorkers.delete(task.id);

      const info = this.workerInfoMap.get(task.id);
      if (info) info.status = "error";

      const canRetry = this.taskStore.recordFailure(task.id, err.message);
      const updatedTask = this.taskStore.get(task.id)!;

      if (canRetry) {
        this.eventLogger.log({
          agent: "orchestrator",
          type: "worker_retry",
          task_id: task.id,
          detail: `Retry ${updatedTask.retry_count}/${updatedTask.max_retries} after error: ${err.message}`,
        });

        // Schedule retry after delay
        const timer = setTimeout(() => {
          this.retryTimers.delete(task.id);
          // Re-read task in case it was manually changed
          const current = this.taskStore.get(task.id);
          if (current && current.status === "assigned") {
            this.emit("task_updated", current);
          }
        }, this.retryDelayMs);
        this.retryTimers.set(task.id, timer);
      } else {
        this.eventLogger.log({
          agent: "orchestrator",
          type: "worker_rejected",
          task_id: task.id,
          detail: `Max retries (${updatedTask.max_retries}) reached. Error: ${err.message}`,
        });
      }

      // Log performance event (failure)
      if (this.performanceTracker && !canRetry) {
        const wInfo = this.workerInfoMap.get(task.id);
        const startTime = wInfo ? new Date(wInfo.startedAt).getTime() : Date.now();
        this.performanceTracker.logEvent({
          type: "task_failed",
          agent_role: task.role ?? "unknown",
          agent_name: wInfo?.name,
          task_id: task.id,
          task_category: task.role ?? undefined,
          outcome: "failure",
          duration_ms: Date.now() - startTime,
          retries: updatedTask.retry_count,
        });
      }

      // Auto-log failure to agent memory DLQ
      if (this.agentMemory) {
        const workerInfo = this.workerInfoMap.get(task.id);
        this.agentMemory.logFailure({
          task_id: task.id,
          agent_role: task.role ?? undefined,
          agent_name: workerInfo?.name,
          error: err.message,
        });
      }

      this.emit("task_updated", updatedTask);
      this.emit("workers_changed", this.getWorkers());

      // Clean up errored worker info after 60s to prevent memory leak
      setTimeout(() => this.workerInfoMap.delete(task.id), 60000);
    });

    worker.start();
  }

  /** When a task completes, check if any blocked dependents can now be assigned. */
  private checkUnblockedDependents(completedTaskId: string): void {
    const dependents = this.taskStore.getDependents(completedTaskId);

    for (const dep of dependents) {
      if (dep.status !== "blocked") continue;

      if (this.taskStore.areDependenciesMet(dep.id)) {
        this.taskStore.update(dep.id, { status: "assigned" });
        this.eventLogger.log({
          agent: "orchestrator",
          type: "task_unblocked",
          task_id: dep.id,
          detail: `Unblocked after ${completedTaskId} completed`,
        });
        this.emit("task_updated", this.taskStore.get(dep.id));
      }
    }
  }
}
