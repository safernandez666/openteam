import type BetterSqlite3 from "better-sqlite3";

export interface WorkflowPhase {
  index: number;
  name: string;
  role: string;
  description: string;
  exit_criteria: string[];
  task_title_template: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  phases: WorkflowPhase[];
  is_builtin: number;
  is_editable: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowInstance {
  id: string;
  template_id: string;
  root_task_id: string;
  status: "running" | "paused" | "completed" | "failed";
  current_phase: number;
  phase_data: Record<string, { startedAt?: string; completedAt?: string; taskId?: string; notes?: string }>;
  created_at: string;
  updated_at: string;
}

const BUILTIN_TEMPLATES: Array<Omit<WorkflowTemplate, "created_at" | "updated_at" | "is_builtin" | "is_editable">> = [
  {
    id: "bug_fix",
    name: "Bug Fix",
    description: "Structured bug fix: triage, root cause, fix, verify, deliver",
    category: "bug_fix",
    phases: [
      { index: 0, name: "Triage & Reproduce", role: "pm", description: "Confirm bug, assess severity, document reproduction steps", exit_criteria: ["Bug confirmed", "Severity assessed"], task_title_template: "[Triage] {description}" },
      { index: 1, name: "Root Cause Analysis", role: "developer", description: "Find the root cause of the bug", exit_criteria: ["Root cause identified", "Affected files listed"], task_title_template: "[RCA] {description}" },
      { index: 2, name: "Fix Implementation", role: "developer", description: "Code the fix", exit_criteria: ["Fix implemented", "No regressions"], task_title_template: "[Fix] {description}" },
      { index: 3, name: "Verification", role: "tester", description: "Test the fix, verify no regressions", exit_criteria: ["Tests pass", "Bug no longer reproduces"], task_title_template: "[Test] {description}" },
      { index: 4, name: "Delivery", role: "reviewer", description: "Code review and close", exit_criteria: ["Code reviewed", "PR approved"], task_title_template: "[Review] {description}" },
    ],
  },
  {
    id: "feature",
    name: "Feature Implementation",
    description: "Full feature workflow: brainstorm, research, build, test, deliver",
    category: "feature",
    phases: [
      { index: 0, name: "Brainstorm", role: "pm", description: "Explore alternatives, define requirements", exit_criteria: ["Requirements defined", "Approach selected"], task_title_template: "[Plan] {description}" },
      { index: 1, name: "Research", role: "developer", description: "Search codebase, check dependencies, evaluate approach", exit_criteria: ["Approach validated", "Dependencies identified"], task_title_template: "[Research] {description}" },
      { index: 2, name: "Foundation", role: "developer", description: "Scaffold, setup, create base components", exit_criteria: ["Base structure created", "Build passes"], task_title_template: "[Build] {description}" },
      { index: 3, name: "Integration", role: "developer", description: "Wire components, connect APIs, implement logic", exit_criteria: ["Feature functional", "Build passes"], task_title_template: "[Integrate] {description}" },
      { index: 4, name: "Validation", role: "tester", description: "Tests, lint, build verification", exit_criteria: ["Tests pass", "No lint errors"], task_title_template: "[Test] {description}" },
      { index: 5, name: "Delivery", role: "reviewer", description: "Final review and close", exit_criteria: ["Code reviewed", "Ready to merge"], task_title_template: "[Review] {description}" },
    ],
  },
  {
    id: "quick_refinement",
    name: "Quick Refinement",
    description: "Fast tweak: triage, implement, verify",
    category: "quick_refinement",
    phases: [
      { index: 0, name: "Triage", role: "pm", description: "Assess scope and approach", exit_criteria: ["Scope defined"], task_title_template: "[Triage] {description}" },
      { index: 1, name: "Implementation", role: "developer", description: "Make the change", exit_criteria: ["Change implemented", "Build passes"], task_title_template: "[Tweak] {description}" },
      { index: 2, name: "Verification", role: "pm", description: "Quick check and close", exit_criteria: ["Change verified"], task_title_template: "[Verify] {description}" },
    ],
  },
  {
    id: "refactor",
    name: "Refactoring",
    description: "Safe refactoring: scope, test first, refactor, verify, deliver",
    category: "refactor",
    phases: [
      { index: 0, name: "Scope & Baseline", role: "pm", description: "Define files to refactor, document current state", exit_criteria: ["File list defined", "Baseline documented"], task_title_template: "[Scope] {description}" },
      { index: 1, name: "Test Coverage Gap", role: "tester", description: "Write missing tests BEFORE refactoring", exit_criteria: ["Tests written for current behavior"], task_title_template: "[Test First] {description}" },
      { index: 2, name: "Refactor Implementation", role: "developer", description: "Refactor the code", exit_criteria: ["Code refactored", "All tests pass"], task_title_template: "[Refactor] {description}" },
      { index: 3, name: "Verification", role: "tester", description: "Verify no behavior change", exit_criteria: ["All tests pass", "No regressions"], task_title_template: "[Verify] {description}" },
      { index: 4, name: "Delivery", role: "reviewer", description: "Review and close", exit_criteria: ["Code reviewed"], task_title_template: "[Review] {description}" },
    ],
  },
  {
    id: "security_audit",
    name: "Security Audit",
    description: "Security review: scope, scan, review, fix, verify",
    category: "security_audit",
    phases: [
      { index: 0, name: "Scope", role: "pm", description: "Define audit boundaries", exit_criteria: ["Scope defined", "Boundaries set"], task_title_template: "[Scope] Security: {description}" },
      { index: 1, name: "Automated Scan", role: "security", description: "Run automated security tools", exit_criteria: ["Scan completed", "Findings documented"], task_title_template: "[Scan] Security: {description}" },
      { index: 2, name: "Manual Review", role: "reviewer", description: "Deep manual inspection", exit_criteria: ["Review completed", "Findings prioritized"], task_title_template: "[Review] Security: {description}" },
      { index: 3, name: "Remediation", role: "developer", description: "Fix security findings", exit_criteria: ["Findings addressed"], task_title_template: "[Fix] Security: {description}" },
      { index: 4, name: "Verification", role: "tester", description: "Verify fixes, re-scan", exit_criteria: ["Fixes verified", "No new findings"], task_title_template: "[Verify] Security: {description}" },
    ],
  },
];

const DETECTION_RULES: Array<{ keywords: string[]; templateId: string }> = [
  { keywords: ["bug", "fix", "broken", "error", "crash", "issue", "falla", "rompe", "no funciona", "no anda"], templateId: "bug_fix" },
  { keywords: ["feature", "add", "implement", "build", "create", "nueva", "agregar", "implementar", "construir"], templateId: "feature" },
  { keywords: ["refactor", "rewrite", "clean up", "reorganize", "refactorizar", "reescribir", "limpiar"], templateId: "refactor" },
  { keywords: ["security", "audit", "vulnerability", "auth", "seguridad", "auditoría", "vulnerabilidad"], templateId: "security_audit" },
  { keywords: ["tweak", "adjust", "polish", "update", "small", "ajustar", "pulir", "actualizar", "cambio chico"], templateId: "quick_refinement" },
];

let instanceCounter = 0;

function generateInstanceId(): string {
  instanceCounter++;
  return `WF-${instanceCounter}`;
}

export class WorkflowEngine {
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
    this.seedBuiltins();
    // Init counter
    const maxRow = this.db.prepare(
      "SELECT id FROM workflow_instances ORDER BY ROWID DESC LIMIT 1",
    ).get() as { id: string } | undefined;
    if (maxRow) {
      const num = parseInt(maxRow.id.replace("WF-", ""), 10);
      if (!isNaN(num)) instanceCounter = num;
    }
  }

  private seedBuiltins(): void {
    const existing = this.db.prepare("SELECT COUNT(*) as c FROM workflow_templates WHERE is_builtin = 1").get() as { c: number };
    if (existing.c > 0) return;

    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO workflow_templates (id, name, description, category, phases, is_builtin, is_editable) VALUES (?, ?, ?, ?, ?, 1, 0)",
    );

    for (const t of BUILTIN_TEMPLATES) {
      stmt.run(t.id, t.name, t.description, t.category, JSON.stringify(t.phases));
    }
  }

  // ── Templates ──────────────────────────────────────

  listTemplates(): WorkflowTemplate[] {
    const rows = this.db.prepare("SELECT * FROM workflow_templates ORDER BY is_builtin DESC, name ASC").all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({ ...r, phases: JSON.parse(r.phases as string) }) as unknown as WorkflowTemplate);
  }

  getTemplate(id: string): WorkflowTemplate | null {
    const row = this.db.prepare("SELECT * FROM workflow_templates WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...row, phases: JSON.parse(row.phases as string) } as unknown as WorkflowTemplate;
  }

  createTemplate(input: { id: string; name: string; description: string; category: string; phases: WorkflowPhase[] }): WorkflowTemplate {
    this.db.prepare(
      "INSERT INTO workflow_templates (id, name, description, category, phases, is_builtin, is_editable) VALUES (?, ?, ?, ?, ?, 0, 1)",
    ).run(input.id, input.name, input.description, input.category, JSON.stringify(input.phases));
    return this.getTemplate(input.id)!;
  }

  updateTemplate(id: string, updates: { name?: string; description?: string; phases?: WorkflowPhase[] }): WorkflowTemplate | null {
    const fields: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];
    if (updates.name) { fields.push("name = ?"); params.push(updates.name); }
    if (updates.description) { fields.push("description = ?"); params.push(updates.description); }
    if (updates.phases) { fields.push("phases = ?"); params.push(JSON.stringify(updates.phases)); }
    params.push(id);
    this.db.prepare(`UPDATE workflow_templates SET ${fields.join(", ")} WHERE id = ? AND is_editable = 1`).run(...params);
    return this.getTemplate(id);
  }

  deleteTemplate(id: string): boolean {
    return this.db.prepare("DELETE FROM workflow_templates WHERE id = ? AND is_builtin = 0").run(id).changes > 0;
  }

  /** Get all unique roles required by a template (excluding 'pm'). */
  getRequiredRoles(templateId: string): string[] {
    const template = this.getTemplate(templateId);
    if (!template) return [];
    const roles = new Set<string>();
    for (const phase of template.phases) {
      if (phase.role !== "pm") roles.add(phase.role);
    }
    return Array.from(roles);
  }

  /** Check if a team has all roles needed for a workflow. Returns missing roles. */
  validateTeam(templateId: string, teamRoles: string[]): string[] {
    const required = this.getRequiredRoles(templateId);
    return required.filter((r) => !teamRoles.includes(r));
  }

  /** Find any workflow instance that has a specific task (by checking phase_data taskIds). */
  getInstanceByPhaseTask(taskId: string): WorkflowInstance | null {
    const all = this.listInstances();
    for (const inst of all) {
      if (inst.root_task_id === taskId) return inst;
      for (const pd of Object.values(inst.phase_data)) {
        if ((pd as Record<string, unknown>).taskId === taskId) return inst;
      }
    }
    return null;
  }

  // ── Instances ──────────────────────────────────────

  startWorkflow(rootTaskId: string, templateId: string): WorkflowInstance | null {
    const template = this.getTemplate(templateId);
    if (!template) return null;

    const id = generateInstanceId();
    const phaseData: Record<string, unknown> = {};
    phaseData["0"] = { startedAt: new Date().toISOString() };

    this.db.prepare(
      "INSERT INTO workflow_instances (id, template_id, root_task_id, status, current_phase, phase_data) VALUES (?, ?, ?, 'running', 0, ?)",
    ).run(id, templateId, rootTaskId, JSON.stringify(phaseData));

    return this.getInstance(id);
  }

  getInstance(id: string): WorkflowInstance | null {
    const row = this.db.prepare("SELECT * FROM workflow_instances WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...row, phase_data: JSON.parse(row.phase_data as string) } as unknown as WorkflowInstance;
  }

  getInstanceByTask(taskId: string): WorkflowInstance | null {
    const row = this.db.prepare("SELECT * FROM workflow_instances WHERE root_task_id = ?").get(taskId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...row, phase_data: JSON.parse(row.phase_data as string) } as unknown as WorkflowInstance;
  }

  listInstances(status?: string): WorkflowInstance[] {
    const query = status
      ? "SELECT * FROM workflow_instances WHERE status = ? ORDER BY created_at DESC"
      : "SELECT * FROM workflow_instances ORDER BY created_at DESC";
    const rows = (status
      ? this.db.prepare(query).all(status)
      : this.db.prepare(query).all()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ ...r, phase_data: JSON.parse(r.phase_data as string) }) as unknown as WorkflowInstance);
  }

  advancePhase(instanceId: string, notes?: string, nextTaskId?: string): WorkflowInstance | null {
    const instance = this.getInstance(instanceId);
    if (!instance || instance.status !== "running") return null;

    const template = this.getTemplate(instance.template_id);
    if (!template) return null;

    const now = new Date().toISOString();
    const phaseData = { ...instance.phase_data };

    // Mark current phase as completed
    const currentKey = String(instance.current_phase);
    phaseData[currentKey] = { ...phaseData[currentKey], completedAt: now, notes };

    const nextPhase = instance.current_phase + 1;

    if (nextPhase >= template.phases.length) {
      // Workflow complete
      this.db.prepare(
        "UPDATE workflow_instances SET status = 'completed', current_phase = ?, phase_data = ?, updated_at = ? WHERE id = ?",
      ).run(nextPhase, JSON.stringify(phaseData), now, instanceId);
    } else {
      // Advance to next phase
      phaseData[String(nextPhase)] = { startedAt: now, taskId: nextTaskId ?? undefined };
      this.db.prepare(
        "UPDATE workflow_instances SET current_phase = ?, phase_data = ?, updated_at = ? WHERE id = ?",
      ).run(nextPhase, JSON.stringify(phaseData), now, instanceId);
    }

    return this.getInstance(instanceId);
  }

  getCurrentPhase(instanceId: string): WorkflowPhase | null {
    const instance = this.getInstance(instanceId);
    if (!instance) return null;
    const template = this.getTemplate(instance.template_id);
    if (!template || instance.current_phase >= template.phases.length) return null;
    return template.phases[instance.current_phase];
  }

  // ── Detection ──────────────────────────────────────

  detectWorkflow(input: string): string | null {
    const lower = input.toLowerCase();
    for (const rule of DETECTION_RULES) {
      for (const kw of rule.keywords) {
        if (lower.includes(kw)) return rule.templateId;
      }
    }
    return null;
  }

  /** Build a status block for chat responses. */
  buildStatusBlock(instanceId: string): string {
    const instance = this.getInstance(instanceId);
    if (!instance) return "";
    const template = this.getTemplate(instance.template_id);
    if (!template) return "";

    const total = template.phases.length;
    const current = instance.current_phase;
    const phase = current < total ? template.phases[current] : null;
    const completedCount = Object.values(instance.phase_data).filter((p) => (p as Record<string, unknown>).completedAt).length;

    let block = `\n\n📍 Phase ${current + 1}/${total}`;
    if (phase) block += ` — ${phase.name}`;
    block += ` | Progress: ${completedCount}/${total} phases`;

    if (current > 0 && template.phases[current - 1]) {
      block += `\nLast: ✅ ${template.phases[current - 1].name} complete`;
    }
    if (phase) {
      block += `\nNext: ${phase.name} (${phase.role})`;
    }
    if (instance.status === "completed") {
      block = `\n\n✅ Workflow complete — all ${total} phases done`;
    }

    return block;
  }
}
