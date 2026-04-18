import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface AgentNamesConfig {
  developer: string;
  designer: string;
  tester: string;
  reviewer: string;
  pm: string;
  [role: string]: string;
}

const DEFAULTS: AgentNamesConfig = {
  developer: "Lucas",
  designer: "Sofia",
  tester: "Max",
  reviewer: "Ana",
  pm: "Clara",
};

export class AgentNames {
  private names: AgentNamesConfig;
  private configPath: string;

  constructor(dataDir: string) {
    this.configPath = join(dataDir, "agent-names.json");
    this.names = { ...DEFAULTS };
    this.load();
  }

  private load(): void {
    if (!existsSync(this.configPath)) return;
    try {
      const data = JSON.parse(readFileSync(this.configPath, "utf-8"));
      this.names = { ...DEFAULTS, ...data };
    } catch {
      // ignore corrupt file
    }
  }

  private save(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.names, null, 2), "utf-8");
  }

  /** Get the human name for a role. */
  get(role: string): string {
    return this.names[role] ?? role;
  }

  /** Get all name mappings. */
  getAll(): AgentNamesConfig {
    return { ...this.names };
  }

  /** Update one or more names. */
  update(updates: Partial<AgentNamesConfig>): AgentNamesConfig {
    for (const [role, name] of Object.entries(updates)) {
      if (name && name.trim()) {
        this.names[role] = name.trim();
      }
    }
    this.save();
    return this.getAll();
  }

  /** Reset all names to defaults. */
  reset(): AgentNamesConfig {
    this.names = { ...DEFAULTS };
    this.save();
    return this.getAll();
  }
}
