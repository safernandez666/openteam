import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface TeamMember {
  roleId: string;
  name: string;
  provider: "claude" | "kimi";
}

export interface TeamConfig {
  members: TeamMember[];
}

const DEFAULT_TEAM: TeamMember[] = [
  { roleId: "developer", name: "Lucas", provider: "claude" },
  { roleId: "designer", name: "Sofia", provider: "claude" },
  { roleId: "tester", name: "Max", provider: "claude" },
  { roleId: "reviewer", name: "Ana", provider: "claude" },
];

/**
 * Manages the team composition for a workspace.
 * PM is always present (not stored here — it's implicit).
 * Users can add/remove roles from the catalog.
 */
export class TeamConfigManager {
  private config: TeamConfig;
  private configPath: string;

  constructor(dataDir: string) {
    this.configPath = join(dataDir, "team-config.json");
    this.config = { members: [...DEFAULT_TEAM] };
    this.load();
  }

  private load(): void {
    if (!existsSync(this.configPath)) return;
    try {
      const data = JSON.parse(readFileSync(this.configPath, "utf-8"));
      if (data.members && Array.isArray(data.members)) {
        this.config = data;
      }
    } catch { /* ignore */ }
  }

  private save(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
  }

  /** Get all team members (excluding PM which is always present). */
  getMembers(): TeamMember[] {
    return [...this.config.members];
  }

  /** Add a role to the team. */
  addMember(roleId: string, name: string, provider: "claude" | "kimi" = "claude"): TeamMember {
    // Don't add duplicates
    const existing = this.config.members.find((m) => m.roleId === roleId);
    if (existing) return existing;

    const member: TeamMember = { roleId, name, provider };
    this.config.members.push(member);
    this.save();
    return member;
  }

  /** Remove a role from the team. */
  removeMember(roleId: string): boolean {
    const before = this.config.members.length;
    this.config.members = this.config.members.filter((m) => m.roleId !== roleId);
    if (this.config.members.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  /** Update a team member's name or provider. */
  updateMember(roleId: string, updates: Partial<Pick<TeamMember, "name" | "provider">>): TeamMember | null {
    const member = this.config.members.find((m) => m.roleId === roleId);
    if (!member) return null;
    if (updates.name) member.name = updates.name;
    if (updates.provider) member.provider = updates.provider;
    this.save();
    return member;
  }

  /** Check if a role is in the team. */
  hasMember(roleId: string): boolean {
    return this.config.members.some((m) => m.roleId === roleId);
  }

  /** Get a specific member. */
  getMember(roleId: string): TeamMember | null {
    return this.config.members.find((m) => m.roleId === roleId) ?? null;
  }
}
