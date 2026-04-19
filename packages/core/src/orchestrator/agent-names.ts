import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface AgentConfig {
  name: string;
  provider: "claude" | "kimi";
}

export interface AgentNamesConfig {
  developer: string;
  designer: string;
  tester: string;
  reviewer: string;
  pm: string;
  [role: string]: string;
}

export interface AgentProvidersConfig {
  [role: string]: "claude" | "kimi";
}

const DEFAULTS: AgentNamesConfig = {
  developer: "Lucas",
  designer: "Sofia",
  tester: "Max",
  reviewer: "Ana",
  pm: "Facu",
};

export class AgentNames {
  private names: AgentNamesConfig;
  private providers: AgentProvidersConfig;
  private avatarSeeds: Record<string, number>;
  private configPath: string;

  constructor(dataDir: string) {
    this.configPath = join(dataDir, "agent-config.json");
    this.names = { ...DEFAULTS };
    this.providers = {};
    this.avatarSeeds = {};
    this.load();
  }

  private load(): void {
    if (!existsSync(this.configPath)) {
      // Try legacy file
      const legacyPath = join(dirname(this.configPath), "agent-names.json");
      if (existsSync(legacyPath)) {
        try {
          const data = JSON.parse(readFileSync(legacyPath, "utf-8"));
          this.names = { ...DEFAULTS, ...data };
        } catch { /* ignore */ }
      }
      return;
    }
    try {
      const data = JSON.parse(readFileSync(this.configPath, "utf-8"));
      this.names = { ...DEFAULTS, ...data.names };
      this.providers = data.providers ?? {};
      this.avatarSeeds = data.avatarSeeds ?? {};
    } catch {
      // ignore corrupt file
    }
  }

  private save(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify({ names: this.names, providers: this.providers, avatarSeeds: this.avatarSeeds }, null, 2), "utf-8");
  }

  /** Get the human name for a role. */
  get(role: string): string {
    return this.names[role] ?? role;
  }

  /** Get the provider for a role. Falls back to project default. */
  getProvider(role: string): "claude" | "kimi" | null {
    return this.providers[role] ?? null;
  }

  /** Get all name mappings. */
  getAll(): AgentNamesConfig {
    return { ...this.names };
  }

  /** Get all provider mappings. */
  getAllProviders(): AgentProvidersConfig {
    return { ...this.providers };
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

  /** Update provider for one or more roles. */
  updateProviders(updates: AgentProvidersConfig): AgentProvidersConfig {
    for (const [role, provider] of Object.entries(updates)) {
      this.providers[role] = provider;
    }
    this.save();
    return this.getAllProviders();
  }

  /** Get avatar seed for a role. */
  getAvatarSeed(role: string): number {
    return this.avatarSeeds[role] ?? 0;
  }

  /** Get all avatar seeds. */
  getAllAvatarSeeds(): Record<string, number> {
    return { ...this.avatarSeeds };
  }

  /** Update avatar seed for a role. */
  setAvatarSeed(role: string, seed: number): void {
    this.avatarSeeds[role] = seed;
    this.save();
  }

  /** Reset all names to defaults. */
  reset(): AgentNamesConfig {
    this.names = { ...DEFAULTS };
    this.save();
    return this.getAll();
  }
}
