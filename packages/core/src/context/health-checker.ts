import { existsSync } from "node:fs";
import { join } from "node:path";
import type BetterSqlite3 from "better-sqlite3";

export interface HealthCheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: string;
}

export class HealthChecker {
  constructor(
    private db: BetterSqlite3.Database,
    private cwd: string,
    private dataDir: string,
  ) {}

  async runAllChecks(): Promise<HealthCheckResult[]> {
    return [
      this.checkDatabase(),
      this.checkNode(),
      this.checkWorkspace(),
      this.checkTeam(),
      this.checkTiers(),
      this.checkSkills(),
      this.checkGit(),
      this.checkDependencies(),
    ];
  }

  checkDatabase(): HealthCheckResult {
    try {
      const version = this.db.pragma("user_version", { simple: true }) as number;
      if (version >= 14) {
        return { name: "Database", status: "pass", message: `Schema v${version}` };
      }
      return { name: "Database", status: "warn", message: `Schema v${version} — latest is v14`, fix: "Restart server to auto-migrate" };
    } catch {
      return { name: "Database", status: "fail", message: "Cannot read database", fix: "Check ~/.openteam/ permissions" };
    }
  }

  checkNode(): HealthCheckResult {
    const version = parseInt(process.version.slice(1), 10);
    if (version >= 22) {
      return { name: "Node.js", status: "pass", message: `${process.version}` };
    }
    if (version >= 20) {
      return { name: "Node.js", status: "warn", message: `${process.version} — recommend >= 22`, fix: "nvm install 22" };
    }
    return { name: "Node.js", status: "fail", message: `${process.version} — requires >= 20`, fix: "nvm install 22" };
  }

  checkWorkspace(): HealthCheckResult {
    const wsPath = join(this.dataDir, "WORKSPACE.md");
    if (existsSync(wsPath)) {
      return { name: "Workspace Context", status: "pass", message: "WORKSPACE.md exists" };
    }
    return { name: "Workspace Context", status: "warn", message: "No WORKSPACE.md — workers run without project context", fix: "Chat with Facu to set project context" };
  }

  checkTeam(): HealthCheckResult {
    try {
      const teamPath = join(this.dataDir, "team.json");
      if (!existsSync(teamPath)) {
        return { name: "Team", status: "warn", message: "No team configured — only PM available", fix: "Add agents in Workers → + Add Agent" };
      }
      const data = JSON.parse(require("fs").readFileSync(teamPath, "utf-8"));
      const count = (data.members ?? []).length;
      if (count >= 1) {
        return { name: "Team", status: "pass", message: `${count} agent${count !== 1 ? "s" : ""} + PM` };
      }
      return { name: "Team", status: "warn", message: "No agents in team", fix: "Add agents in Workers → + Add Agent" };
    } catch {
      return { name: "Team", status: "warn", message: "Cannot read team config" };
    }
  }

  checkTiers(): HealthCheckResult {
    try {
      const count = (this.db.prepare("SELECT COUNT(*) as c FROM worker_tiers").get() as { c: number }).c;
      if (count > 0) {
        return { name: "Tiers", status: "pass", message: `${count} roles configured` };
      }
      return { name: "Tiers", status: "warn", message: "No tiers configured", fix: "Tiers auto-seed on next restart" };
    } catch {
      return { name: "Tiers", status: "warn", message: "Tiers table not found" };
    }
  }

  checkSkills(): HealthCheckResult {
    const skillsDir = join(this.dataDir, "skills");
    if (existsSync(skillsDir)) {
      return { name: "Skills", status: "pass", message: "Skills directory exists" };
    }
    return { name: "Skills", status: "pass", message: "Using built-in skills" };
  }

  checkGit(): HealthCheckResult {
    if (existsSync(join(this.cwd, ".git"))) {
      return { name: "Git", status: "pass", message: "Git repository detected" };
    }
    return { name: "Git", status: "warn", message: "Not a git repository", fix: "git init" };
  }

  checkDependencies(): HealthCheckResult {
    if (existsSync(join(this.cwd, "node_modules"))) {
      return { name: "Dependencies", status: "pass", message: "node_modules present" };
    }
    return { name: "Dependencies", status: "warn", message: "No node_modules found", fix: "npm install" };
  }

  /** Get overall status. */
  getOverallStatus(results: HealthCheckResult[]): "pass" | "warn" | "fail" {
    if (results.some((r) => r.status === "fail")) return "fail";
    if (results.some((r) => r.status === "warn")) return "warn";
    return "pass";
  }
}
