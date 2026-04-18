import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Task, TaskStore } from "../persistence/task-store.js";

/**
 * Manages project context that gets injected into worker and PM prompts.
 *
 * Two layers of context:
 * 1. WORKSPACE.md — persistent project-level context (tech stack, conventions, current state)
 * 2. Task results — completed task outputs that provide context for related work
 */
export class ContextManager {
  private workspacePath: string;
  private taskStore: TaskStore;

  constructor(dataDir: string, taskStore: TaskStore) {
    this.workspacePath = join(dataDir, "WORKSPACE.md");
    this.taskStore = taskStore;
  }

  /** Read the WORKSPACE.md file. Returns empty string if not found. */
  getWorkspace(): string {
    if (!existsSync(this.workspacePath)) return "";
    return readFileSync(this.workspacePath, "utf-8").trim();
  }

  /** Write or overwrite the WORKSPACE.md file. */
  setWorkspace(content: string): void {
    mkdirSync(dirname(this.workspacePath), { recursive: true });
    writeFileSync(this.workspacePath, content, "utf-8");
  }

  /** Get the path to the WORKSPACE.md file. */
  get path(): string {
    return this.workspacePath;
  }

  /**
   * Build the full context string to inject into a worker's prompt.
   * Includes: workspace context + relevant completed task results.
   */
  buildWorkerContext(task: Task): string {
    const sections: string[] = [];

    // 1. Project workspace context
    const workspace = this.getWorkspace();
    if (workspace) {
      sections.push(`## Project Context\n\n${workspace}`);
    }

    // 2. Results from completed tasks in the same project
    const relevantResults = this.getRelevantResults(task);
    if (relevantResults.length > 0) {
      const resultsText = relevantResults
        .map((r) => `### ${r.id}: ${r.title} (${r.role ?? "worker"})\n${r.result}`)
        .join("\n\n");
      sections.push(`## Previous Work\n\nThese tasks have already been completed by other team members:\n\n${resultsText}`);
    }

    // 3. Related tasks currently in progress
    const inProgress = this.taskStore
      .list({ status: "in_progress" })
      .filter((t) => t.id !== task.id);
    if (inProgress.length > 0) {
      const ipText = inProgress
        .map((t) => `- ${t.id}: ${t.title} (${t.role ?? "worker"}) — in progress`)
        .join("\n");
      sections.push(`## Currently In Progress\n\nOther workers are currently handling:\n\n${ipText}`);
    }

    if (sections.length === 0) return "";

    return `\n\n---\n# Team Context\n\n${sections.join("\n\n---\n\n")}`;
  }

  /**
   * Append a completed task summary to WORKSPACE.md.
   * Called by the orchestrator when a worker finishes.
   */
  appendTaskSummary(task: Task, result: string): void {
    const workspace = this.getWorkspace();
    const timestamp = new Date().toISOString().split("T")[0];
    const summary = `\n\n### ${task.id}: ${task.title} (${timestamp})\n- Role: ${task.role ?? "worker"}\n- Status: done\n- Summary: ${result.slice(0, 300).split("\n")[0]}`;

    // Find or create the "## Completed Work" section
    if (workspace.includes("## Completed Work")) {
      const updated = workspace.replace(
        "## Completed Work",
        `## Completed Work${summary}`,
      );
      this.setWorkspace(updated);
    } else {
      this.setWorkspace(workspace + `\n\n## Completed Work${summary}`);
    }
  }

  /**
   * Get results from completed tasks that are relevant to the given task.
   * Prioritizes: tasks with same role, recent tasks, tasks the current task depends on.
   */
  private getRelevantResults(task: Task): Pick<Task, "id" | "title" | "role" | "result">[] {
    const doneTasks = this.taskStore.list({ status: "done" });
    const withResults = doneTasks.filter((t) => t.result && t.id !== task.id);

    if (withResults.length === 0) return [];

    // Sort: dependency first, then same role, then most recent
    const dependsOn = task.depends_on;
    withResults.sort((a, b) => {
      // Dependency gets top priority
      if (dependsOn) {
        if (a.id === dependsOn) return -1;
        if (b.id === dependsOn) return 1;
      }
      // Same role next
      if (task.role) {
        const aMatch = a.role === task.role ? 1 : 0;
        const bMatch = b.role === task.role ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      // Most recent last
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    // Limit to avoid blowing up context window — take most relevant 5, cap each at 2000 chars
    return withResults.slice(0, 5).map((t) => ({
      id: t.id,
      title: t.title,
      role: t.role,
      result: t.result!.length > 2000 ? t.result!.slice(0, 2000) + "\n...(truncated)" : t.result!,
    }));
  }
}
