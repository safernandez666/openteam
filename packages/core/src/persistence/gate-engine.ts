import type BetterSqlite3 from "better-sqlite3";

export interface GateDefinition {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: "security" | "quality" | "testing" | "review";
  is_builtin: number;
  is_enabled: number;
  config: Record<string, unknown>;
  created_at: string;
}

export interface PhaseGate {
  id: number;
  template_id: string;
  phase_index: number;
  gate_id: string;
  is_required: number;
  config_override: Record<string, unknown> | null;
  execution_order: number;
}

export interface GateExecution {
  id: number;
  task_id: string;
  gate_id: string;
  phase_index: number | null;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  output: string | null;
  duration_ms: number | null;
  triggered_at: string;
  completed_at: string | null;
}

const BUILTIN_GATES: Array<Omit<GateDefinition, "created_at" | "is_builtin" | "is_enabled" | "config">> = [
  { id: "secret-scan", name: "secret-scan", display_name: "Secret Scanning", description: "Scan diff for leaked secrets, API keys, tokens", category: "security" },
  { id: "lint-test-build", name: "lint-test-build", display_name: "Lint, Test & Build", description: "Run lint, test suite, and build to ensure no breakage", category: "quality" },
  { id: "blast-radius", name: "blast-radius", display_name: "Blast Radius Check", description: "Check lines/files changed stay within expected bounds", category: "quality" },
  { id: "dependency-audit", name: "dependency-audit", display_name: "Dependency Audit", description: "Check for vulnerable dependencies and bundle size", category: "security" },
  { id: "fast-review", name: "fast-review", display_name: "Fast Review", description: "Quick automated code review for common issues", category: "review" },
  { id: "browser-test", name: "browser-test", display_name: "Browser Testing", description: "Visual verification with Chrome DevTools screenshots", category: "testing" },
  { id: "regression-test", name: "regression-test", display_name: "Regression Testing", description: "Test adjacent pages and consuming components", category: "testing" },
  { id: "panel-review", name: "panel-review", display_name: "Panel Review", description: "3 isolated reviewers for high-stakes changes", category: "review" },
  { id: "smoke-test", name: "smoke-test", display_name: "Smoke Test", description: "Full build + E2E after all tasks complete", category: "testing" },
];

export class GateEngine {
  constructor(private db: BetterSqlite3.Database) {
    this.seedBuiltins();
  }

  private seedBuiltins(): void {
    const existing = this.db.prepare("SELECT COUNT(*) as c FROM gate_definitions WHERE is_builtin = 1").get() as { c: number };
    if (existing.c > 0) return;

    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO gate_definitions (id, name, display_name, description, category, is_builtin, is_enabled, config) VALUES (?, ?, ?, ?, ?, 1, 1, '{}')",
    );
    for (const g of BUILTIN_GATES) {
      stmt.run(g.id, g.name, g.display_name, g.description, g.category);
    }
  }

  // ── Gate Definitions ────────────────────────────────

  listGates(): GateDefinition[] {
    const rows = this.db.prepare("SELECT * FROM gate_definitions ORDER BY category, name").all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({ ...r, config: JSON.parse((r.config as string) || "{}") }) as unknown as GateDefinition);
  }

  getGate(id: string): GateDefinition | null {
    const row = this.db.prepare("SELECT * FROM gate_definitions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...row, config: JSON.parse((row.config as string) || "{}") } as unknown as GateDefinition;
  }

  toggleGate(id: string, enabled: boolean): boolean {
    return this.db.prepare("UPDATE gate_definitions SET is_enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id).changes > 0;
  }

  updateGateConfig(id: string, config: Record<string, unknown>): GateDefinition | null {
    this.db.prepare("UPDATE gate_definitions SET config = ? WHERE id = ?").run(JSON.stringify(config), id);
    return this.getGate(id);
  }

  // ── Phase Gates ─────────────────────────────────────

  getPhaseGates(templateId: string, phaseIndex: number): PhaseGate[] {
    const rows = this.db.prepare(
      "SELECT * FROM workflow_phase_gates WHERE template_id = ? AND phase_index = ? ORDER BY execution_order",
    ).all(templateId, phaseIndex) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      ...r,
      config_override: r.config_override ? JSON.parse(r.config_override as string) : null,
    }) as unknown as PhaseGate);
  }

  addPhaseGate(templateId: string, phaseIndex: number, gateId: string, isRequired = true, order = 0): void {
    this.db.prepare(
      "INSERT INTO workflow_phase_gates (template_id, phase_index, gate_id, is_required, execution_order) VALUES (?, ?, ?, ?, ?)",
    ).run(templateId, phaseIndex, gateId, isRequired ? 1 : 0, order);
  }

  removePhaseGate(id: number): boolean {
    return this.db.prepare("DELETE FROM workflow_phase_gates WHERE id = ?").run(id).changes > 0;
  }

  // ── Executions ──────────────────────────────────────

  triggerGate(taskId: string, gateId: string, phaseIndex?: number): GateExecution {
    const stmt = this.db.prepare(
      "INSERT INTO gate_executions (task_id, gate_id, phase_index, status) VALUES (?, ?, ?, 'pending')",
    );
    const result = stmt.run(taskId, gateId, phaseIndex ?? null);
    return this.db.prepare("SELECT * FROM gate_executions WHERE id = ?").get(result.lastInsertRowid) as GateExecution;
  }

  updateExecution(id: number, status: GateExecution["status"], output?: string, durationMs?: number): GateExecution | null {
    const completedAt = ["passed", "failed", "skipped"].includes(status) ? new Date().toISOString() : null;
    this.db.prepare(
      "UPDATE gate_executions SET status = ?, output = ?, duration_ms = ?, completed_at = ? WHERE id = ?",
    ).run(status, output ?? null, durationMs ?? null, completedAt, id);
    return this.db.prepare("SELECT * FROM gate_executions WHERE id = ?").get(id) as GateExecution | null;
  }

  getExecutionsForTask(taskId: string): GateExecution[] {
    return this.db.prepare(
      "SELECT * FROM gate_executions WHERE task_id = ? ORDER BY triggered_at DESC",
    ).all(taskId) as GateExecution[];
  }

  /** Check if all required gates for a phase have passed. */
  arePhaseGatesPassed(templateId: string, phaseIndex: number, taskId: string): { passed: boolean; pending: string[]; failed: string[] } {
    const phaseGates = this.getPhaseGates(templateId, phaseIndex);
    const executions = this.getExecutionsForTask(taskId);
    const pending: string[] = [];
    const failed: string[] = [];

    for (const pg of phaseGates) {
      if (!pg.is_required) continue;
      const exec = executions.find((e) => e.gate_id === pg.gate_id && e.phase_index === phaseIndex);
      if (!exec || exec.status === "pending" || exec.status === "running") {
        pending.push(pg.gate_id);
      } else if (exec.status === "failed") {
        failed.push(pg.gate_id);
      }
    }

    return { passed: pending.length === 0 && failed.length === 0, pending, failed };
  }

  /** Get summary stats. */
  getStats(): { totalExecutions: number; passed: number; failed: number; passRate: number } {
    const total = (this.db.prepare("SELECT COUNT(*) as c FROM gate_executions").get() as { c: number }).c;
    const passed = (this.db.prepare("SELECT COUNT(*) as c FROM gate_executions WHERE status = 'passed'").get() as { c: number }).c;
    const failedCount = (this.db.prepare("SELECT COUNT(*) as c FROM gate_executions WHERE status = 'failed'").get() as { c: number }).c;
    return {
      totalExecutions: total,
      passed,
      failed: failedCount,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
    };
  }
}
