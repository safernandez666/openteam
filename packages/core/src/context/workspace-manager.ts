import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface WorkspaceInfo {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * Manages multiple workspaces.
 * Each workspace is a subdirectory in ~/.openteam/workspaces/ with its own
 * database, config, skills, knowledge, etc.
 *
 * Structure:
 *   ~/.openteam/
 *     active-workspace.json
 *     workspaces/
 *       my-project/       <- workspace "my-project"
 *         openteam.db
 *         WORKSPACE.md
 *         project-config.json
 *         agent-names.json
 *         skills/
 *         knowledge/
 *         mcp-servers.json
 */
export class WorkspaceManager {
  private baseDir: string;
  private workspacesDir: string;
  private activeFilePath: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.workspacesDir = join(baseDir, "workspaces");
    this.activeFilePath = join(baseDir, "active-workspace.json");
    mkdirSync(this.workspacesDir, { recursive: true });
  }

  /** List all workspaces. */
  list(): WorkspaceInfo[] {
    if (!existsSync(this.workspacesDir)) return [];

    const dirs = readdirSync(this.workspacesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    return dirs.map((id) => {
      const metaPath = join(this.workspacesDir, id, "workspace.json");
      let name = id;
      let createdAt = "";
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
          name = meta.name ?? id;
          createdAt = meta.createdAt ?? "";
        } catch { /* ignore */ }
      }
      return { id, name, createdAt };
    });
  }

  /** Get the active workspace ID. Returns null if none set. */
  getActive(): string | null {
    if (!existsSync(this.activeFilePath)) {
      // Migrate: if data exists in baseDir (legacy), return "default"
      const legacyDb = join(this.baseDir, "openteam.db");
      if (existsSync(legacyDb)) {
        return "__legacy__";
      }
      return null;
    }
    try {
      const data = JSON.parse(readFileSync(this.activeFilePath, "utf-8"));
      return data.active ?? null;
    } catch {
      return null;
    }
  }

  /** Set the active workspace. */
  setActive(id: string): void {
    writeFileSync(this.activeFilePath, JSON.stringify({ active: id }), "utf-8");
  }

  /** Get the data directory for a workspace. */
  getWorkspaceDir(id: string): string {
    if (id === "__legacy__") return this.baseDir;
    return join(this.workspacesDir, id);
  }

  /** Create a new workspace. Returns the workspace info. */
  create(id: string, name?: string): WorkspaceInfo {
    const sanitizedId = id.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    const dir = join(this.workspacesDir, sanitizedId);

    if (existsSync(dir)) {
      throw new Error(`Workspace "${sanitizedId}" already exists`);
    }

    mkdirSync(dir, { recursive: true });

    const info: WorkspaceInfo = {
      id: sanitizedId,
      name: name ?? sanitizedId,
      createdAt: new Date().toISOString(),
    };

    writeFileSync(join(dir, "workspace.json"), JSON.stringify(info, null, 2), "utf-8");

    return info;
  }

  /** Delete a workspace. */
  remove(id: string): boolean {
    if (id === "__legacy__") return false;
    const dir = join(this.workspacesDir, id);
    if (!existsSync(dir)) return false;

    rmSync(dir, { recursive: true, force: true });

    // If this was the active workspace, clear it
    const active = this.getActive();
    if (active === id) {
      writeFileSync(this.activeFilePath, JSON.stringify({ active: null }), "utf-8");
    }

    return true;
  }
}
