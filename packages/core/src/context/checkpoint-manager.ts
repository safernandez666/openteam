import type BetterSqlite3 from "better-sqlite3";
import type { TaskStore } from "../persistence/task-store.js";

export interface CheckpointData {
  id?: number;
  workspaceId: string;
  summary: string;
  taskStatus: Array<{ taskId: string; title: string; status: string; role: string | null }>;
  activeWorkers: Array<{ taskId: string; role: string; name: string; startedAt: string }>;
  workflowState: Record<string, unknown> | null;
  resumeInstructions: string;
  chatSummary: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export class CheckpointManager {
  private db: BetterSqlite3.Database;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingData: CheckpointData | null = null;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  /** Save checkpoint (debounced — persists after 30s or on force). */
  saveCheckpoint(data: CheckpointData, force = false): void {
    this.pendingData = data;
    if (force) {
      this.persistNow();
      return;
    }
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => this.persistNow(), 30000);
    }
  }

  /** Force persist pending checkpoint immediately. */
  persistNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.pendingData) return;
    this.doSave(this.pendingData);
    this.pendingData = null;
  }

  private doSave(data: CheckpointData): void {
    // Deactivate previous checkpoints for this workspace
    this.db.prepare(
      "UPDATE session_checkpoints SET is_active = 0 WHERE workspace_id = ? AND is_active = 1",
    ).run(data.workspaceId);

    this.db.prepare(
      `INSERT INTO session_checkpoints (workspace_id, summary, task_status, active_workers, workflow_state, resume_instructions, chat_summary, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      data.workspaceId,
      data.summary,
      JSON.stringify(data.taskStatus),
      JSON.stringify(data.activeWorkers),
      data.workflowState ? JSON.stringify(data.workflowState) : null,
      data.resumeInstructions,
      data.chatSummary,
    );

    // Prune old checkpoints (keep last 10)
    this.pruneCheckpoints(data.workspaceId);
  }

  /** Get active checkpoint for workspace. */
  getActiveCheckpoint(workspaceId: string): CheckpointData | null {
    const row = this.db.prepare(
      "SELECT * FROM session_checkpoints WHERE workspace_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1",
    ).get(workspaceId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.parseRow(row);
  }

  /** Get checkpoint by ID. */
  getCheckpoint(id: number): CheckpointData | null {
    const row = this.db.prepare("SELECT * FROM session_checkpoints WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.parseRow(row);
  }

  /** List checkpoints for workspace. */
  listCheckpoints(workspaceId: string, limit = 10): CheckpointData[] {
    const rows = this.db.prepare(
      "SELECT * FROM session_checkpoints WHERE workspace_id = ? ORDER BY id DESC LIMIT ?",
    ).all(workspaceId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.parseRow(r));
  }

  /** Archive a checkpoint (mark as inactive). */
  archiveCheckpoint(id: number): void {
    this.db.prepare("UPDATE session_checkpoints SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  }

  /** Delete a checkpoint. */
  deleteCheckpoint(id: number): boolean {
    return this.db.prepare("DELETE FROM session_checkpoints WHERE id = ?").run(id).changes > 0;
  }

  /** Prune old checkpoints, keep last N. */
  pruneCheckpoints(workspaceId: string, keep = 10): void {
    this.db.prepare(
      `DELETE FROM session_checkpoints WHERE workspace_id = ? AND id NOT IN (
        SELECT id FROM session_checkpoints WHERE workspace_id = ? ORDER BY id DESC LIMIT ?
      )`,
    ).run(workspaceId, workspaceId, keep);
  }

  /** Build a checkpoint from current system state. */
  buildFromState(
    workspaceId: string,
    taskStore: TaskStore,
    activeWorkers: Array<{ taskId: string; role: string | null; name: string; startedAt: string }>,
    workflowState: Record<string, unknown> | null,
    chatMessages: ReadonlyArray<{ role: string; content: string }>,
  ): CheckpointData {
    // Get non-done tasks
    const allTasks = taskStore.list();
    const activeTasks = allTasks.filter((t) => !["done", "rejected"].includes(t.status));
    const taskStatus = activeTasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      role: t.role,
    }));

    // Condense chat into summary (last 10 messages)
    const recentMessages = chatMessages.slice(-10);
    const chatSummary = recentMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content.slice(0, 100))
      .join(" | ");

    // Summary from last user message
    const lastUserMsg = [...chatMessages].reverse().find((m) => m.role === "user");
    const summary = lastUserMsg?.content.slice(0, 200) ?? "No active conversation";

    // Resume instructions
    const resumeLines: string[] = [];
    if (activeTasks.length > 0) {
      const inProgress = activeTasks.filter((t) => t.status === "in_progress");
      if (inProgress.length > 0) {
        resumeLines.push(`${inProgress.length} tasks in progress`);
      }
      const blocked = activeTasks.filter((t) => t.status === "blocked");
      if (blocked.length > 0) {
        resumeLines.push(`${blocked.length} tasks blocked`);
      }
    }
    if (activeWorkers.length > 0) {
      resumeLines.push(`${activeWorkers.length} workers still running`);
    }

    return {
      workspaceId,
      summary,
      taskStatus,
      activeWorkers: activeWorkers.map((w) => ({
        taskId: w.taskId,
        role: w.role ?? "unknown",
        name: w.name,
        startedAt: w.startedAt,
      })),
      workflowState,
      resumeInstructions: resumeLines.join(". ") || "No pending work",
      chatSummary,
      isActive: true,
    };
  }

  /** Build a prompt section for Facu from the active checkpoint. */
  buildPromptSection(workspaceId: string): string {
    const checkpoint = this.getActiveCheckpoint(workspaceId);
    if (!checkpoint) return "";

    let section = "\n\n## Session Checkpoint (Previous State)\n\n";
    if (checkpoint.summary) {
      section += `**Last conversation:** ${checkpoint.summary}\n\n`;
    }

    if (checkpoint.taskStatus.length > 0) {
      section += "**Active work:**\n";
      for (const t of checkpoint.taskStatus.slice(0, 10)) {
        section += `- ${t.taskId}: ${t.title} [${t.status}]${t.role ? ` (${t.role})` : ""}\n`;
      }
      section += "\n";
    }

    if (checkpoint.activeWorkers.length > 0) {
      section += "**Workers that were running:**\n";
      for (const w of checkpoint.activeWorkers) {
        section += `- ${w.name} working on ${w.taskId} (started ${w.startedAt})\n`;
      }
      section += "\n";
    }

    if (checkpoint.resumeInstructions) {
      section += `**Resume:** ${checkpoint.resumeInstructions}\n\n`;
    }

    if (checkpoint.chatSummary) {
      section += `**Context:** ${checkpoint.chatSummary}\n`;
    }

    return section;
  }

  private parseRow(row: Record<string, unknown>): CheckpointData {
    return {
      id: row.id as number,
      workspaceId: row.workspace_id as string,
      summary: row.summary as string,
      taskStatus: JSON.parse((row.task_status as string) || "[]"),
      activeWorkers: JSON.parse((row.active_workers as string) || "[]"),
      workflowState: row.workflow_state ? JSON.parse(row.workflow_state as string) : null,
      resumeInstructions: row.resume_instructions as string,
      chatSummary: row.chat_summary as string,
      isActive: (row.is_active as number) === 1,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
