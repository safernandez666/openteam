import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export function resolveDbPath(baseDir: string): string {
  // Try new project hierarchy first
  const activeProjectFile = join(baseDir, "active-project.json");
  if (existsSync(activeProjectFile)) {
    try {
      const active = JSON.parse(readFileSync(activeProjectFile, "utf-8")) as { projectId?: string; workspaceId?: string };
      if (active.projectId && active.workspaceId) {
        const modernPath = join(baseDir, "projects", active.projectId, "workspaces", active.workspaceId, "openteam.db");
        if (existsSync(modernPath)) return modernPath;
      }
    } catch { /* fallback */ }
  }
  // Try legacy workspace hierarchy
  const activeWsFile = join(baseDir, "active-workspace.json");
  if (existsSync(activeWsFile)) {
    try {
      const active = JSON.parse(readFileSync(activeWsFile, "utf-8")) as { active?: string };
      if (active.active) {
        const legacyWsPath = join(baseDir, "workspaces", active.active, "openteam.db");
        if (existsSync(legacyWsPath)) return legacyWsPath;
      }
    } catch { /* fallback */ }
  }
  return join(baseDir, "openteam.db");
}
