import type BetterSqlite3 from "better-sqlite3";

export interface PerformanceEvent {
  id: number;
  type: string;
  agent_role: string;
  agent_name: string | null;
  task_id: string | null;
  task_category: string | null;
  outcome: "success" | "failure" | "retry";
  duration_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  retries: number;
  created_at: string;
}

export interface AgentStats {
  role: string;
  totalTasks: number;
  successes: number;
  failures: number;
  successRate: number;
  avgDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  categories: Record<string, { total: number; successes: number; rate: number }>;
}

export class PerformanceTracker {
  constructor(private db: BetterSqlite3.Database) {}

  /** Log a performance event (task completion or failure). */
  logEvent(input: {
    type: string;
    agent_role: string;
    agent_name?: string;
    task_id?: string;
    task_category?: string;
    outcome: "success" | "failure" | "retry";
    duration_ms?: number;
    input_tokens?: number;
    output_tokens?: number;
    retries?: number;
  }): PerformanceEvent {
    const stmt = this.db.prepare(
      `INSERT INTO performance_events (type, agent_role, agent_name, task_id, task_category, outcome, duration_ms, input_tokens, output_tokens, retries)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const result = stmt.run(
      input.type,
      input.agent_role,
      input.agent_name ?? null,
      input.task_id ?? null,
      input.task_category ?? null,
      input.outcome,
      input.duration_ms ?? null,
      input.input_tokens ?? 0,
      input.output_tokens ?? 0,
      input.retries ?? 0,
    );
    return this.db.prepare("SELECT * FROM performance_events WHERE id = ?").get(result.lastInsertRowid) as PerformanceEvent;
  }

  /** Get aggregated stats for all agents. */
  getAllStats(): AgentStats[] {
    const roles = this.db.prepare(
      "SELECT DISTINCT agent_role FROM performance_events",
    ).all() as Array<{ agent_role: string }>;

    return roles.map((r) => this.getAgentStats(r.agent_role));
  }

  /** Get stats for a specific agent role. */
  getAgentStats(role: string): AgentStats {
    const rows = this.db.prepare(
      "SELECT * FROM performance_events WHERE agent_role = ? ORDER BY created_at DESC",
    ).all(role) as PerformanceEvent[];

    const successes = rows.filter((r) => r.outcome === "success").length;
    const failures = rows.filter((r) => r.outcome === "failure").length;
    const total = successes + failures;
    const durations = rows.filter((r) => r.duration_ms != null).map((r) => r.duration_ms!);

    // Category breakdown
    const categories: Record<string, { total: number; successes: number; rate: number }> = {};
    for (const row of rows) {
      const cat = row.task_category ?? "uncategorized";
      if (!categories[cat]) categories[cat] = { total: 0, successes: 0, rate: 0 };
      if (row.outcome !== "retry") categories[cat].total++;
      if (row.outcome === "success") categories[cat].successes++;
    }
    for (const cat of Object.values(categories)) {
      cat.rate = cat.total > 0 ? Math.round((cat.successes / cat.total) * 100) : 0;
    }

    return {
      role,
      totalTasks: total,
      successes,
      failures,
      successRate: total > 0 ? Math.round((successes / total) * 100) : 0,
      avgDurationMs: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      totalInputTokens: rows.reduce((s, r) => s + r.input_tokens, 0),
      totalOutputTokens: rows.reduce((s, r) => s + r.output_tokens, 0),
      categories,
    };
  }

  /** Get the best agent for a task category based on success rate. */
  getBestAgentForCategory(category: string): string | null {
    const stats = this.getAllStats();
    let best: { role: string; rate: number; total: number } | null = null;

    for (const agent of stats) {
      const cat = agent.categories[category];
      if (!cat || cat.total < 2) continue; // Need at least 2 tasks for meaningful data
      if (!best || cat.rate > best.rate || (cat.rate === best.rate && cat.total > best.total)) {
        best = { role: agent.role, rate: cat.rate, total: cat.total };
      }
    }

    return best?.role ?? null;
  }

  /** Get recent events. */
  getRecentEvents(limit = 50): PerformanceEvent[] {
    return this.db.prepare(
      "SELECT * FROM performance_events ORDER BY created_at DESC LIMIT ?",
    ).all(limit) as PerformanceEvent[];
  }
}
