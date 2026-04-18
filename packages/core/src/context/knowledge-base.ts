import { readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join, basename, extname } from "node:path";

export interface KnowledgeDoc {
  name: string;
  content: string;
  readWhen: string[];
}

/**
 * Knowledge Base with selective injection.
 * Each .md file in ~/.openteam/knowledge/ can have a frontmatter:
 *
 *   ---
 *   read_when: auth, login, session, jwt
 *   ---
 *   Content here...
 *
 * When a task matches any keyword, the doc content is injected into the worker prompt.
 */
export class KnowledgeBase {
  private docs = new Map<string, KnowledgeDoc>();
  private knowledgeDir: string;

  constructor(dataDir: string) {
    this.knowledgeDir = join(dataDir, "knowledge");
    this.reload();
  }

  reload(): void {
    this.docs.clear();
    if (!existsSync(this.knowledgeDir)) return;

    for (const file of readdirSync(this.knowledgeDir)) {
      if (extname(file) !== ".md") continue;
      const name = basename(file, ".md");
      const raw = readFileSync(join(this.knowledgeDir, file), "utf-8");
      const { content, readWhen } = this.parseFrontmatter(raw);
      this.docs.set(name, { name, content: content.trim(), readWhen });
    }
  }

  /** List all knowledge docs. */
  list(): KnowledgeDoc[] {
    return Array.from(this.docs.values());
  }

  /** Get a doc by name. */
  get(name: string): KnowledgeDoc | null {
    return this.docs.get(name) ?? null;
  }

  /** Save a knowledge doc. */
  save(name: string, content: string, readWhen: string[]): void {
    mkdirSync(this.knowledgeDir, { recursive: true });
    const frontmatter = `---\nread_when: ${readWhen.join(", ")}\n---\n\n`;
    writeFileSync(join(this.knowledgeDir, `${name}.md`), frontmatter + content.trim(), "utf-8");
    this.reload();
  }

  /** Remove a knowledge doc. */
  remove(name: string): boolean {
    const filePath = join(this.knowledgeDir, `${name}.md`);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    this.reload();
    return true;
  }

  /**
   * Find docs relevant to a task based on keyword matching.
   * Matches against task title, description, and role.
   */
  findRelevant(taskTitle: string, taskDescription?: string, taskRole?: string): KnowledgeDoc[] {
    const searchText = `${taskTitle} ${taskDescription ?? ""} ${taskRole ?? ""}`.toLowerCase();
    const matches: KnowledgeDoc[] = [];

    for (const doc of this.docs.values()) {
      if (doc.readWhen.length === 0) {
        // No keywords = always inject
        matches.push(doc);
        continue;
      }
      for (const keyword of doc.readWhen) {
        if (searchText.includes(keyword.toLowerCase())) {
          matches.push(doc);
          break;
        }
      }
    }

    return matches;
  }

  /**
   * Build a prompt section with relevant knowledge for a task.
   */
  buildPromptSection(taskTitle: string, taskDescription?: string, taskRole?: string): string {
    const relevant = this.findRelevant(taskTitle, taskDescription, taskRole);
    if (relevant.length === 0) return "";

    let section = "\n\n---\n\n## Project Knowledge\n\n";
    for (const doc of relevant) {
      section += `### ${doc.name}\n\n${doc.content}\n\n`;
    }
    return section;
  }

  private parseFrontmatter(raw: string): { content: string; readWhen: string[] } {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) {
      return { content: raw, readWhen: [] };
    }

    const frontmatter = match[1];
    const content = match[2];
    let readWhen: string[] = [];

    const kwLine = frontmatter.match(/read_when:\s*(.*)/);
    if (kwLine) {
      readWhen = kwLine[1].split(",").map((k) => k.trim()).filter(Boolean);
    }

    return { content, readWhen };
  }
}
