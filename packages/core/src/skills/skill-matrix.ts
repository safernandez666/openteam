import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface SlotEntry {
  name: string;
  skill: string;
}

export interface Slot {
  description: string;
  entries: SlotEntry[];
}

export type SkillMatrixConfig = Record<string, Slot>;

const DEFAULT_SLOTS: SkillMatrixConfig = {
  framework: {
    description: "Frontend/backend framework (Next.js, React, Express, etc.)",
    entries: [],
  },
  database: {
    description: "Database and ORM (PostgreSQL, Prisma, Supabase, etc.)",
    entries: [],
  },
  styling: {
    description: "CSS framework (Tailwind, styled-components, etc.)",
    entries: [],
  },
  testing: {
    description: "Testing framework (Vitest, Jest, Playwright, etc.)",
    entries: [],
  },
  deployment: {
    description: "Deployment platform (Vercel, Docker, AWS, etc.)",
    entries: [],
  },
  cms: {
    description: "Content management system (Sanity, Contentful, etc.)",
    entries: [],
  },
};

/**
 * Manages the skill matrix for a workspace.
 * Maps capability slots (framework, database, etc.) to concrete skill modules.
 * Stored as skill-matrix.json in the skills directory.
 */
export class SkillMatrix {
  private config: SkillMatrixConfig;
  private configPath: string;

  constructor(skillsDir: string) {
    this.configPath = join(skillsDir, "skill-matrix.json");
    this.config = { ...DEFAULT_SLOTS };
    this.load();
  }

  private load(): void {
    if (!existsSync(this.configPath)) return;
    try {
      const data = JSON.parse(readFileSync(this.configPath, "utf-8"));
      // Merge with defaults to keep new slots
      this.config = { ...DEFAULT_SLOTS };
      for (const [key, slot] of Object.entries(data)) {
        if (this.config[key]) {
          this.config[key] = slot as Slot;
        } else {
          this.config[key] = slot as Slot;
        }
      }
    } catch { /* ignore corrupt file */ }
  }

  private save(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
  }

  /** Get the full matrix. */
  getAll(): SkillMatrixConfig {
    return { ...this.config };
  }

  /** Get a specific slot. */
  getSlot(slotName: string): Slot | null {
    return this.config[slotName] ?? null;
  }

  /** Get all skill names bound to a slot. */
  getSlotSkills(slotName: string): string[] {
    return (this.config[slotName]?.entries ?? []).map((e) => e.skill);
  }

  /** Get all skill names across all slots. */
  getAllBoundSkills(): string[] {
    const skills: string[] = [];
    for (const slot of Object.values(this.config)) {
      for (const entry of slot.entries) {
        if (!skills.includes(entry.skill)) skills.push(entry.skill);
      }
    }
    return skills;
  }

  /** Bind a skill to a slot. */
  bindSkill(slotName: string, name: string, skill: string): void {
    if (!this.config[slotName]) {
      this.config[slotName] = { description: slotName, entries: [] };
    }
    // Replace if same skill exists, otherwise add
    const entries = this.config[slotName].entries;
    const idx = entries.findIndex((e) => e.skill === skill);
    if (idx >= 0) {
      entries[idx] = { name, skill };
    } else {
      entries.push({ name, skill });
    }
    this.save();
  }

  /** Unbind a skill from a slot. */
  unbindSkill(slotName: string, skill: string): boolean {
    const slot = this.config[slotName];
    if (!slot) return false;
    const before = slot.entries.length;
    slot.entries = slot.entries.filter((e) => e.skill !== skill);
    if (slot.entries.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  /** Add a new custom slot. */
  addSlot(name: string, description: string): void {
    if (this.config[name]) return;
    this.config[name] = { description, entries: [] };
    this.save();
  }

  /** Remove a slot. */
  removeSlot(name: string): boolean {
    if (!this.config[name]) return false;
    delete this.config[name];
    this.save();
    return true;
  }

  /** Set the entire matrix at once (for bulk updates). */
  setAll(matrix: SkillMatrixConfig): void {
    this.config = matrix;
    this.save();
  }

  /** Get a summary of the current stack for prompts. */
  buildPromptSection(): string {
    const filled = Object.entries(this.config).filter(([, slot]) => slot.entries.length > 0);
    if (filled.length === 0) return "";

    let section = "\n\n## Tech Stack\n";
    for (const [slotName, slot] of filled) {
      const techs = slot.entries.map((e) => e.name).join(", ");
      section += `- **${slotName}**: ${techs}\n`;
    }
    return section;
  }
}
