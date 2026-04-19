import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";

export interface ProjectInfo {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
}

export interface ActiveSelection {
  projectId: string;
  workspaceId: string;
}

/**
 * Manages the Project > Workspace hierarchy.
 *
 * Structure:
 *   ~/.openteam/
 *     active.json                    # { projectId, workspaceId }
 *     projects/
 *       my-client/
 *         project.json               # { id, name, description, createdAt }
 *         team-config.json            # shared team for all workspaces
 *         agent-config.json           # shared agent names/providers
 *         mcp-servers.json            # shared MCP servers
 *         skills/                     # shared skills
 *         workspaces/
 *           api-python/
 *             workspace.json
 *             openteam.db
 *             WORKSPACE.md
 *             knowledge/
 *             project-config.json     # workDir, repo, branch
 *           frontend-react/
 *             ...
 */
export class ProjectManager {
  private baseDir: string;
  private projectsDir: string;
  private activeFilePath: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.projectsDir = join(baseDir, "projects");
    this.activeFilePath = join(baseDir, "active.json");
    mkdirSync(this.projectsDir, { recursive: true });
  }

  // ── Projects ──────────────────────────────

  listProjects(): ProjectInfo[] {
    if (!existsSync(this.projectsDir)) return [];
    return readdirSync(this.projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const metaPath = join(this.projectsDir, d.name, "project.json");
        if (!existsSync(metaPath)) return null;
        try {
          return JSON.parse(readFileSync(metaPath, "utf-8")) as ProjectInfo;
        } catch { return null; }
      })
      .filter(Boolean) as ProjectInfo[];
  }

  createProject(id: string, name: string, description = ""): ProjectInfo {
    const sanitized = id.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-");
    const dir = join(this.projectsDir, sanitized);
    if (existsSync(dir)) throw new Error(`Project "${sanitized}" already exists`);

    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "workspaces"), { recursive: true });
    mkdirSync(join(dir, "skills"), { recursive: true });

    const info: ProjectInfo = { id: sanitized, name, description, createdAt: new Date().toISOString() };
    writeFileSync(join(dir, "project.json"), JSON.stringify(info, null, 2), "utf-8");
    return info;
  }

  getProject(id: string): ProjectInfo | null {
    const metaPath = join(this.projectsDir, id, "project.json");
    if (!existsSync(metaPath)) return null;
    try { return JSON.parse(readFileSync(metaPath, "utf-8")); } catch { return null; }
  }

  deleteProject(id: string): boolean {
    const dir = join(this.projectsDir, id);
    if (!existsSync(dir)) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
  }

  /** Get the directory for a project's shared config (team, MCP, skills). */
  getProjectDir(id: string): string {
    return join(this.projectsDir, id);
  }

  // ── Workspaces ────────────────────────────

  listWorkspaces(projectId: string): WorkspaceInfo[] {
    const wsDir = join(this.projectsDir, projectId, "workspaces");
    if (!existsSync(wsDir)) return [];
    return readdirSync(wsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const metaPath = join(wsDir, d.name, "workspace.json");
        if (!existsSync(metaPath)) {
          return { id: d.name, name: d.name, projectId, createdAt: "" };
        }
        try {
          return { ...JSON.parse(readFileSync(metaPath, "utf-8")), projectId } as WorkspaceInfo;
        } catch {
          return { id: d.name, name: d.name, projectId, createdAt: "" };
        }
      });
  }

  createWorkspace(projectId: string, id: string, name?: string): WorkspaceInfo {
    const sanitized = id.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-");
    const dir = join(this.projectsDir, projectId, "workspaces", sanitized);
    if (existsSync(dir)) throw new Error(`Workspace "${sanitized}" already exists in project "${projectId}"`);

    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "knowledge"), { recursive: true });

    const info: WorkspaceInfo = {
      id: sanitized,
      name: name ?? sanitized,
      projectId,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(join(dir, "workspace.json"), JSON.stringify(info, null, 2), "utf-8");
    return info;
  }

  deleteWorkspace(projectId: string, workspaceId: string): boolean {
    const dir = join(this.projectsDir, projectId, "workspaces", workspaceId);
    if (!existsSync(dir)) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
  }

  /** Get the data directory for a workspace (DB, chat, tasks). */
  getWorkspaceDir(projectId: string, workspaceId: string): string {
    return join(this.projectsDir, projectId, "workspaces", workspaceId);
  }

  // ── Active selection ──────────────────────

  getActive(): ActiveSelection | null {
    if (!existsSync(this.activeFilePath)) return null;
    try {
      return JSON.parse(readFileSync(this.activeFilePath, "utf-8"));
    } catch { return null; }
  }

  setActive(projectId: string, workspaceId: string): void {
    writeFileSync(this.activeFilePath, JSON.stringify({ projectId, workspaceId }, null, 2), "utf-8");
  }

  // ── Migration from old structure ──────────

  /** Migrate old flat workspaces to new project hierarchy. */
  migrateFromLegacy(): boolean {
    const oldWsDir = join(this.baseDir, "workspaces");
    const oldActiveFile = join(this.baseDir, "active-workspace.json");

    if (!existsSync(oldWsDir)) return false;

    // Create a "legacy" project
    let project: ProjectInfo;
    try {
      project = this.createProject("legacy", "Legacy Project", "Migrated from v0.1");
    } catch {
      // Already migrated
      return false;
    }

    // Move each old workspace into the legacy project
    for (const entry of readdirSync(oldWsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = join(oldWsDir, entry.name);
      const dest = join(this.projectsDir, "legacy", "workspaces", entry.name);
      cpSync(src, dest, { recursive: true });

      // Create workspace.json if missing
      const wsMeta = join(dest, "workspace.json");
      if (!existsSync(wsMeta)) {
        writeFileSync(wsMeta, JSON.stringify({
          id: entry.name,
          name: entry.name,
          projectId: "legacy",
          createdAt: new Date().toISOString(),
        }, null, 2), "utf-8");
      }
    }

    // Copy shared config to project level
    const sharedFiles = ["agent-config.json", "agent-names.json", "mcp-servers.json", "team-config.json"];
    for (const file of sharedFiles) {
      const src = join(this.baseDir, file);
      if (existsSync(src)) {
        const dest = join(this.projectsDir, "legacy", file);
        cpSync(src, dest);
      }
    }

    // Copy skills
    const oldSkillsDir = join(this.baseDir, "skills");
    if (existsSync(oldSkillsDir)) {
      const destSkills = join(this.projectsDir, "legacy", "skills");
      cpSync(oldSkillsDir, destSkills, { recursive: true });
    }

    // Set active
    let activeWs = "default";
    if (existsSync(oldActiveFile)) {
      try {
        const data = JSON.parse(readFileSync(oldActiveFile, "utf-8"));
        activeWs = data.active ?? "default";
      } catch { /* ignore */ }
    }

    const workspaces = this.listWorkspaces("legacy");
    if (workspaces.length > 0) {
      const ws = workspaces.find((w) => w.id === activeWs) ?? workspaces[0];
      this.setActive("legacy", ws.id);
    }

    return true;
  }
}
