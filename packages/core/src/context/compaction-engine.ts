import type BetterSqlite3 from "better-sqlite3";

export interface CompactionResult {
  taskId: string;
  filesChanged: string[];
  decisions: string[];
  verification: { lint?: boolean; types?: boolean; tests?: boolean; build?: boolean };
  blockers: string[];
  compactText: string;
}

export class CompactionEngine {
  constructor(private db: BetterSqlite3.Database) {}

  /** Compact a raw worker output into structured essentials. */
  compact(taskId: string, rawOutput: string, taskTitle: string, taskRole: string): CompactionResult {
    const extracted = this.extractHeuristically(rawOutput);
    const compactText = this.buildCompactText(taskId, taskTitle, taskRole, extracted);

    const result: CompactionResult = {
      taskId,
      ...extracted,
      compactText,
    };

    // Persist
    this.db.prepare(
      `INSERT OR REPLACE INTO task_compactions (task_id, files_changed, decisions, verification, blockers, compact_text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      taskId,
      JSON.stringify(result.filesChanged),
      JSON.stringify(result.decisions),
      JSON.stringify(result.verification),
      JSON.stringify(result.blockers),
      result.compactText,
    );

    return result;
  }

  /** Get a stored compaction. */
  get(taskId: string): CompactionResult | null {
    const row = this.db.prepare("SELECT * FROM task_compactions WHERE task_id = ?").get(taskId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      taskId: row.task_id as string,
      filesChanged: JSON.parse(row.files_changed as string),
      decisions: JSON.parse(row.decisions as string),
      verification: JSON.parse(row.verification as string),
      blockers: JSON.parse(row.blockers as string),
      compactText: row.compact_text as string,
    };
  }

  /** Get compactions for recently completed tasks. */
  getRecent(limit = 5): CompactionResult[] {
    const rows = this.db.prepare(
      "SELECT * FROM task_compactions ORDER BY created_at DESC LIMIT ?",
    ).all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      taskId: row.task_id as string,
      filesChanged: JSON.parse(row.files_changed as string),
      decisions: JSON.parse(row.decisions as string),
      verification: JSON.parse(row.verification as string),
      blockers: JSON.parse(row.blockers as string),
      compactText: row.compact_text as string,
    }));
  }

  /** Build compact markdown from structured fields. */
  buildCompactText(taskId: string, title: string, role: string, data: Pick<CompactionResult, "filesChanged" | "decisions" | "verification" | "blockers">): string {
    const verifParts: string[] = [];
    if (data.verification.lint !== undefined) verifParts.push(`lint ${data.verification.lint ? "pass" : "FAIL"}`);
    if (data.verification.types !== undefined) verifParts.push(`types ${data.verification.types ? "pass" : "FAIL"}`);
    if (data.verification.tests !== undefined) verifParts.push(`tests ${data.verification.tests ? "pass" : "FAIL"}`);
    if (data.verification.build !== undefined) verifParts.push(`build ${data.verification.build ? "pass" : "FAIL"}`);

    let text = `### ${taskId}: ${title} (${role})\n`;
    if (data.filesChanged.length > 0) text += `- **Files changed:** ${data.filesChanged.join(", ")}\n`;
    if (data.decisions.length > 0) text += `- **Decisions:** ${data.decisions.join("; ")}\n`;
    if (verifParts.length > 0) text += `- **Verification:** ${verifParts.join(" | ")}\n`;
    if (data.blockers.length > 0) text += `- **Blockers:** ${data.blockers.join("; ")}\n`;
    if (data.filesChanged.length === 0 && data.decisions.length === 0 && verifParts.length === 0) {
      text += `- **Result:** Completed successfully\n`;
    }
    return text.trim();
  }

  /** Fast heuristic extraction (no LLM). */
  extractHeuristically(raw: string): Pick<CompactionResult, "filesChanged" | "decisions" | "verification" | "blockers"> {
    const filesChanged: string[] = [];
    const decisions: string[] = [];
    const verification: Record<string, boolean> = {};
    const blockers: string[] = [];

    // Files changed
    const filePatterns = [
      /(?:created|modified|deleted|updated|added|wrote|editing)\s+[`"']?([\w\-/]+\.(?:ts|tsx|js|jsx|css|md|json|yml|yaml|sql|html))/gi,
      /(?:File|Path):\s*[`"']?([\w\-/]+\.(?:ts|tsx|js|jsx|css|md|json))/gi,
    ];
    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(raw)) !== null) {
        filesChanged.push(match[1]);
      }
    }

    // Verification
    if (/lint\s*[:\-]?\s*(?:pass|passed|ok|success)/i.test(raw)) verification.lint = true;
    if (/lint\s*[:\-]?\s*(?:fail|failed|error)/i.test(raw)) verification.lint = false;
    if (/test(?:s)?\s*[:\-]?\s*(?:pass|passed|ok|success|\d+\s*pass)/i.test(raw)) verification.tests = true;
    if (/test(?:s)?\s*[:\-]?\s*(?:fail|failed|error)/i.test(raw)) verification.tests = false;
    if (/build\s*[:\-]?\s*(?:pass|passed|ok|success)/i.test(raw)) verification.build = true;
    if (/build\s*[:\-]?\s*(?:fail|failed|error)/i.test(raw)) verification.build = false;
    if (/type(?:s)?\s*[:\-]?\s*(?:pass|passed|ok|success|zero\s*error)/i.test(raw)) verification.types = true;
    if (/type(?:s)?\s*[:\-]?\s*(?:fail|failed|error)/i.test(raw)) verification.types = false;

    // Decisions
    const decisionPatterns = [
      /(?:decided|chosen|selected|opted)\s+(?:to|for)\s+(.+?)(?:\n|$)/gi,
      /(?:approach|decision|strategy)\s*[:\-]\s*(.+?)(?:\n|$)/gi,
      /(?:will use|using|implemented with)\s+(.+?)(?:\n|$)/gi,
    ];
    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(raw)) !== null) {
        const d = match[1].trim();
        if (d.length > 5 && d.length < 200) decisions.push(d);
      }
    }

    // Blockers
    const blockerPatterns = [
      /(?:blocked by|blocked on|waiting for|cannot proceed)\s*[:\-]?\s*(.+?)(?:\n|$)/gi,
      /(?:blocker|blocking issue)\s*[:\-]\s*(.+?)(?:\n|$)/gi,
    ];
    for (const pattern of blockerPatterns) {
      let match;
      while ((match = pattern.exec(raw)) !== null) {
        blockers.push(match[1].trim());
      }
    }

    return {
      filesChanged: [...new Set(filesChanged)].slice(0, 20),
      decisions: [...new Set(decisions)].slice(0, 10),
      verification,
      blockers: [...new Set(blockers)].slice(0, 5),
    };
  }
}
