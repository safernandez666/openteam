import type BetterSqlite3 from "better-sqlite3";

export type DecisionStatus = "proposed" | "accepted" | "deprecated" | "superseded";

export interface Decision {
  id: number;
  title: string;
  context: string;
  decision: string;
  consequences: string;
  status: DecisionStatus;
  superseded_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDecisionInput {
  title: string;
  context?: string;
  decision?: string;
  consequences?: string;
  status?: DecisionStatus;
}

export class DecisionStore {
  constructor(private db: BetterSqlite3.Database) {}

  list(status?: DecisionStatus): Decision[] {
    if (status) {
      return this.db
        .prepare("SELECT * FROM decisions WHERE status = ? ORDER BY created_at DESC")
        .all(status) as Decision[];
    }
    return this.db
      .prepare("SELECT * FROM decisions ORDER BY created_at DESC")
      .all() as Decision[];
  }

  get(id: number): Decision | null {
    return (this.db.prepare("SELECT * FROM decisions WHERE id = ?").get(id) as Decision) ?? null;
  }

  create(input: CreateDecisionInput): Decision {
    const stmt = this.db.prepare(
      `INSERT INTO decisions (title, context, decision, consequences, status)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const result = stmt.run(
      input.title,
      input.context ?? "",
      input.decision ?? "",
      input.consequences ?? "",
      input.status ?? "accepted",
    );
    return this.get(result.lastInsertRowid as number)!;
  }

  update(id: number, updates: Partial<Pick<Decision, "title" | "context" | "decision" | "consequences" | "status">>): Decision | null {
    const fields: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];

    if (updates.title !== undefined) { fields.push("title = ?"); params.push(updates.title); }
    if (updates.context !== undefined) { fields.push("context = ?"); params.push(updates.context); }
    if (updates.decision !== undefined) { fields.push("decision = ?"); params.push(updates.decision); }
    if (updates.consequences !== undefined) { fields.push("consequences = ?"); params.push(updates.consequences); }
    if (updates.status !== undefined) { fields.push("status = ?"); params.push(updates.status); }

    params.push(id);
    this.db.prepare(`UPDATE decisions SET ${fields.join(", ")} WHERE id = ?`).run(...params);
    return this.get(id);
  }

  supersede(id: number, newDecisionId: number): Decision | null {
    this.db.prepare(
      "UPDATE decisions SET status = 'superseded', superseded_by = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(newDecisionId, id);
    return this.get(id);
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM decisions WHERE id = ?").run(id).changes > 0;
  }

  /** Build a prompt section with accepted ADRs for agent context. */
  buildPromptSection(): string {
    const accepted = this.list("accepted");
    if (accepted.length === 0) return "";

    let section = "\n\n---\n\n## Architectural Decisions (ADRs)\n\n";
    section += "These decisions have been accepted for this project. Follow them:\n\n";

    for (const adr of accepted) {
      section += `### ADR-${adr.id}: ${adr.title}\n`;
      if (adr.decision) section += `**Decision**: ${adr.decision}\n`;
      if (adr.consequences) section += `**Consequences**: ${adr.consequences}\n`;
      section += "\n";
    }

    return section;
  }
}
