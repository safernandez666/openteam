import type BetterSqlite3 from "better-sqlite3";

export interface LessonLearned {
  id: number;
  category: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  source_task: string | null;
  created_at: string;
}

export interface KnownIssue {
  id: number;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "resolved" | "wont_fix";
  root_cause: string | null;
  workaround: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentFailure {
  id: number;
  task_id: string;
  agent_role: string | null;
  agent_name: string | null;
  error: string;
  output: string | null;
  status: "unresolved" | "resolved" | "ignored";
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

export class AgentMemory {
  constructor(private db: BetterSqlite3.Database) {}

  // ── Lessons Learned ────────────────────────────────

  getLessons(category?: string): LessonLearned[] {
    if (category) {
      return this.db
        .prepare("SELECT * FROM lessons_learned WHERE category = ? ORDER BY created_at DESC")
        .all(category) as LessonLearned[];
    }
    return this.db
      .prepare("SELECT * FROM lessons_learned ORDER BY created_at DESC")
      .all() as LessonLearned[];
  }

  addLesson(input: { category: string; title: string; description: string; severity?: string; source_task?: string }): LessonLearned {
    const stmt = this.db.prepare(
      "INSERT INTO lessons_learned (category, title, description, severity, source_task) VALUES (?, ?, ?, ?, ?)",
    );
    const result = stmt.run(
      input.category,
      input.title,
      input.description,
      input.severity ?? "info",
      input.source_task ?? null,
    );
    return this.db.prepare("SELECT * FROM lessons_learned WHERE id = ?").get(result.lastInsertRowid) as LessonLearned;
  }

  deleteLesson(id: number): boolean {
    return this.db.prepare("DELETE FROM lessons_learned WHERE id = ?").run(id).changes > 0;
  }

  // ── Known Issues ───────────────────────────────────

  getIssues(status?: string): KnownIssue[] {
    if (status) {
      return this.db
        .prepare("SELECT * FROM known_issues WHERE status = ? ORDER BY created_at DESC")
        .all(status) as KnownIssue[];
    }
    return this.db
      .prepare("SELECT * FROM known_issues ORDER BY created_at DESC")
      .all() as KnownIssue[];
  }

  addIssue(input: { title: string; description: string; severity?: string; root_cause?: string; workaround?: string }): KnownIssue {
    const stmt = this.db.prepare(
      "INSERT INTO known_issues (title, description, severity, root_cause, workaround) VALUES (?, ?, ?, ?, ?)",
    );
    const result = stmt.run(
      input.title,
      input.description,
      input.severity ?? "medium",
      input.root_cause ?? null,
      input.workaround ?? null,
    );
    return this.db.prepare("SELECT * FROM known_issues WHERE id = ?").get(result.lastInsertRowid) as KnownIssue;
  }

  updateIssue(id: number, updates: Partial<Pick<KnownIssue, "status" | "root_cause" | "workaround" | "severity">>): KnownIssue | null {
    const fields: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];

    if (updates.status !== undefined) { fields.push("status = ?"); params.push(updates.status); }
    if (updates.root_cause !== undefined) { fields.push("root_cause = ?"); params.push(updates.root_cause); }
    if (updates.workaround !== undefined) { fields.push("workaround = ?"); params.push(updates.workaround); }
    if (updates.severity !== undefined) { fields.push("severity = ?"); params.push(updates.severity); }

    params.push(id);
    this.db.prepare(`UPDATE known_issues SET ${fields.join(", ")} WHERE id = ?`).run(...params);
    return this.db.prepare("SELECT * FROM known_issues WHERE id = ?").get(id) as KnownIssue | null;
  }

  deleteIssue(id: number): boolean {
    return this.db.prepare("DELETE FROM known_issues WHERE id = ?").run(id).changes > 0;
  }

  // ── Agent Failures (DLQ) ───────────────────────────

  getFailures(status?: string): AgentFailure[] {
    if (status) {
      return this.db
        .prepare("SELECT * FROM agent_failures WHERE status = ? ORDER BY created_at DESC")
        .all(status) as AgentFailure[];
    }
    return this.db
      .prepare("SELECT * FROM agent_failures ORDER BY created_at DESC")
      .all() as AgentFailure[];
  }

  logFailure(input: { task_id: string; agent_role?: string; agent_name?: string; error: string; output?: string }): AgentFailure {
    const stmt = this.db.prepare(
      "INSERT INTO agent_failures (task_id, agent_role, agent_name, error, output) VALUES (?, ?, ?, ?, ?)",
    );
    const result = stmt.run(
      input.task_id,
      input.agent_role ?? null,
      input.agent_name ?? null,
      input.error,
      input.output ?? null,
    );
    return this.db.prepare("SELECT * FROM agent_failures WHERE id = ?").get(result.lastInsertRowid) as AgentFailure;
  }

  resolveFailure(id: number, resolution: string): AgentFailure | null {
    this.db.prepare(
      "UPDATE agent_failures SET status = 'resolved', resolution = ?, resolved_at = datetime('now') WHERE id = ?",
    ).run(resolution, id);
    return this.db.prepare("SELECT * FROM agent_failures WHERE id = ?").get(id) as AgentFailure | null;
  }

  ignoreFailure(id: number): boolean {
    return this.db.prepare("UPDATE agent_failures SET status = 'ignored' WHERE id = ?").run(id).changes > 0;
  }

  // ── Context Building ───────────────────────────────

  /** Build a prompt section with relevant lessons and open issues for a worker. */
  buildPromptSection(taskTitle: string, taskRole?: string): string {
    const lessons = this.getLessons();
    const issues = this.getIssues("open");

    if (lessons.length === 0 && issues.length === 0) return "";

    let section = "\n\n---\n\n## Agent Memory\n\n";

    if (lessons.length > 0) {
      section += "### Lessons Learned\n";
      // Filter relevant lessons by category matching role or general
      const relevant = lessons.filter((l) =>
        l.category === "general" ||
        l.category === taskRole ||
        taskTitle.toLowerCase().includes(l.category.toLowerCase()),
      ).slice(0, 10);

      for (const l of relevant) {
        const sev = l.severity === "critical" ? "CRITICAL" : l.severity === "warning" ? "WARNING" : "";
        section += `- ${sev ? `**${sev}**: ` : ""}${l.title}: ${l.description}\n`;
      }
      section += "\n";
    }

    if (issues.length > 0) {
      section += "### Known Issues (Open)\n";
      for (const issue of issues.slice(0, 5)) {
        section += `- **${issue.title}** (${issue.severity})`;
        if (issue.workaround) section += ` — Workaround: ${issue.workaround}`;
        section += "\n";
      }
      section += "\n";
    }

    return section;
  }
}
