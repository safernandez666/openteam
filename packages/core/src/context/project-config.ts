import { readFileSync, writeFileSync, existsSync, mkdirSync, accessSync, constants } from "node:fs";
import { join, dirname } from "node:path";

export interface ProjectConfig {
  /** Working directory where workers execute code */
  workDir: string;
  /** Git repository URL (optional) */
  repoUrl: string | null;
  /** Git branch to work on */
  branch: string;
  /** Project name */
  name: string;
  /** Project description */
  description: string;
  /** CLI provider for workers: "claude" or "kimi" */
  provider: "claude" | "kimi";
}

const DEFAULTS: ProjectConfig = {
  workDir: process.cwd(),
  repoUrl: null,
  branch: "main",
  name: "",
  description: "",
  provider: "claude",
};

export class ProjectConfigManager {
  private config: ProjectConfig;
  private configPath: string;

  constructor(dataDir: string) {
    this.configPath = join(dataDir, "project-config.json");
    this.config = { ...DEFAULTS };
    this.load();
  }

  private load(): void {
    if (!existsSync(this.configPath)) return;
    try {
      const data = JSON.parse(readFileSync(this.configPath, "utf-8"));
      this.config = { ...DEFAULTS, ...data };
    } catch {
      // ignore
    }
  }

  private save(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
  }

  get(): ProjectConfig {
    return { ...this.config };
  }

  update(updates: Partial<ProjectConfig>): ProjectConfig {
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && key in this.config) {
        (this.config as unknown as Record<string, unknown>)[key] = value;
      }
    }
    this.save();
    return this.get();
  }

  /** Check if workDir exists and is readable/writable */
  checkWorkDir(): { ok: boolean; error?: string } {
    const dir = this.config.workDir;
    if (!dir) return { ok: false, error: "No working directory configured" };
    if (!existsSync(dir)) return { ok: false, error: `Directory does not exist: ${dir}` };
    try {
      accessSync(dir, constants.R_OK | constants.W_OK);
      return { ok: true };
    } catch {
      return { ok: false, error: `No read/write permission on: ${dir}` };
    }
  }

  /** Build a summary for worker/PM prompts */
  buildPromptSection(): string {
    const parts: string[] = [];
    if (this.config.name) parts.push(`Project: ${this.config.name}`);
    if (this.config.description) parts.push(`Description: ${this.config.description}`);
    parts.push(`Working directory: ${this.config.workDir}`);
    if (this.config.repoUrl) {
      parts.push(`Repository: ${this.config.repoUrl}`);
      parts.push(`Branch: ${this.config.branch}`);
    }
    return parts.join("\n");
  }
}
