import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { VERSION, openDatabase, TaskStore, EventLogger, Orchestrator, SkillLoader, ContextManager, McpManager, AgentNames, KnowledgeBase, ProjectConfigManager, WorkspaceManager, TeamConfigManager, ROLE_CATALOG, CATEGORIES, MARKETPLACE_CATEGORIES, MarketplaceCatalog, autoCategorize, ProjectManager } from "@openteam/core";
import { createWsHandler } from "./ws-handler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app: Express = express();
const PORT = 4200;
const HOST = "127.0.0.1";

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: VERSION });
});

const httpServer: Server = createServer(app);

export function startServer(port = PORT, host = HOST): Server {
  const cwd = process.cwd();
  const baseDir = join(homedir(), ".openteam");

  // Project > Workspace management
  const projectManager = new ProjectManager(baseDir);
  // Keep old WorkspaceManager for backward compat during transition
  const workspaceManager = new WorkspaceManager(baseDir);

  // Try new hierarchy first, fall back to legacy
  let active = projectManager.getActive();
  let projectDir: string;
  let dataDir: string;

  if (active) {
    projectDir = projectManager.getProjectDir(active.projectId);
    dataDir = projectManager.getWorkspaceDir(active.projectId, active.workspaceId);
    console.log(`Project: ${active.projectId} | Workspace: ${active.workspaceId}`);
  } else {
    // Try legacy migration
    const migrated = projectManager.migrateFromLegacy();
    if (migrated) {
      active = projectManager.getActive();
      if (active) {
        projectDir = projectManager.getProjectDir(active.projectId);
        dataDir = projectManager.getWorkspaceDir(active.projectId, active.workspaceId);
        console.log(`Migrated! Project: ${active.projectId} | Workspace: ${active.workspaceId}`);
      } else {
        // Migration failed to set active — create default
        projectManager.createProject("default", "Default Project");
        projectManager.createWorkspace("default", "main", "Main");
        projectManager.setActive("default", "main");
        projectDir = projectManager.getProjectDir("default");
        dataDir = projectManager.getWorkspaceDir("default", "main");
      }
    } else {
      // No legacy data — first run
      let activeWs = workspaceManager.getActive();
      if (activeWs && activeWs !== "__legacy__") {
        // Old workspace system still active — use it for now
        dataDir = workspaceManager.getWorkspaceDir(activeWs);
        projectDir = dataDir; // Same dir for legacy
        console.log(`Legacy workspace: ${activeWs} (${dataDir})`);
      } else {
        // Brand new install
        projectManager.createProject("default", "Default Project");
        projectManager.createWorkspace("default", "main", "Main");
        projectManager.setActive("default", "main");
        projectDir = projectManager.getProjectDir("default");
        dataDir = projectManager.getWorkspaceDir("default", "main");
        console.log(`New install — Project: default | Workspace: main`);
      }
    }
  }

  // Mutable state — swapped on workspace change
  const state = {
    dataDir,
    db: openDatabase(join(dataDir, "openteam.db")),
    taskStore: null as unknown as TaskStore,
    eventLogger: null as unknown as EventLogger,
    skillLoader: null as unknown as SkillLoader,
    contextManager: null as unknown as ContextManager,
    projectConfig: null as unknown as ProjectConfigManager,
    teamConfig: null as unknown as TeamConfigManager,
    agentNames: null as unknown as AgentNames,
    knowledgeBase: null as unknown as KnowledgeBase,
    mcpManager: null as unknown as McpManager,
  };

  function loadWorkspace(dir: string) {
    state.dataDir = dir;
    state.db = openDatabase(join(dir, "openteam.db"));
    state.taskStore = new TaskStore(state.db);
    state.eventLogger = new EventLogger(join(dir, "events.ndjson"));
    state.skillLoader = new SkillLoader(join(dir, "skills"));
    state.contextManager = new ContextManager(dir, state.taskStore);
    state.projectConfig = new ProjectConfigManager(dir);
    state.teamConfig = new TeamConfigManager(dir);
    state.agentNames = new AgentNames(dir);
    state.knowledgeBase = new KnowledgeBase(dir);
    state.mcpManager = new McpManager(dir);
  }

  loadWorkspace(dataDir);

  // All route handlers must use state.X to read current workspace data

  // Task API
  app.get("/api/tasks", (_req, res) => {
    const tasks = state.taskStore.list();
    res.json(tasks);
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const updates = req.body as Record<string, unknown>;
    const task = state.taskStore.update(req.params.id, updates as import("@openteam/core").UpdateTaskInput);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    wsHandler.broadcastTasks(state.taskStore.list());
    res.json(task);
  });

  // Skills API
  app.get("/api/skills", (_req, res) => {
    const skills = state.skillLoader.list().map((s) => ({
      name: s.name,
      content: s.content,
      source: s.source,
    }));
    res.json(skills);
  });

  app.get("/api/skills/:name", (req, res) => {
    const skill = state.skillLoader.get(req.params.name);
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    res.json({ name: skill.name, content: skill.content, source: skill.source });
  });

  app.put("/api/skills/:name", (req, res) => {
    const { content } = req.body as { content?: string };
    if (!content || typeof content !== "string") {
      res.status(400).json({ error: "content is required" });
      return;
    }
    try {
      state.skillLoader.save(req.params.name, content);
      const skill = state.skillLoader.get(req.params.name)!;
      // Broadcast updated roster
      const skills = state.skillLoader.list().map((s) => ({ name: s.name, source: s.source }));
      wsHandler.broadcastSkills(skills);
      res.json({ name: skill.name, content: skill.content, source: skill.source });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/skills/:name", (req, res) => {
    const removed = state.skillLoader.remove(req.params.name);
    if (!removed) {
      res.status(404).json({ error: "Skill not found or is built-in" });
      return;
    }
    const skills = state.skillLoader.list().map((s) => ({ name: s.name, source: s.source }));
    wsHandler.broadcastSkills(skills);
    res.json({ ok: true });
  });

  // Modules API (modular skills assignable to roles)
  app.post("/api/modules/install", async (req, res) => {
    const { source, name } = req.body as { source?: string; name?: string };
    if (!source || typeof source !== "string") {
      res.status(400).json({ error: "source is required (GitHub URL)" });
      return;
    }
    try {
      const installed = state.skillLoader.installModules(source, name);
      const modules = state.skillLoader.listModules().map((m) => ({ name: m.name, source: m.source }));
      res.json({ installed, modules });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/api/modules/create", (req, res) => {
    const { name, content } = req.body as { name?: string; content?: string };
    if (!name || !content) {
      res.status(400).json({ error: "name and content are required" });
      return;
    }
    try {
      state.skillLoader.saveModule(name, content);
      const modules = state.skillLoader.listModules().map((m) => ({ name: m.name, source: m.source }));
      res.json({ name, modules });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/modules/:name", (req, res) => {
    const removed = state.skillLoader.removeModule(req.params.name);
    if (!removed) {
      res.status(404).json({ error: "Module not found or is built-in" });
      return;
    }
    const modules = state.skillLoader.listModules().map((m) => ({ name: m.name, source: m.source }));
    res.json({ ok: true, modules });
  });

  app.get("/api/modules", (_req, res) => {
    const modules = state.skillLoader.listModules().map((m) => ({
      name: m.name,
      content: m.content,
      source: m.source,
    }));
    res.json(modules);
  });

  // Projects API
  app.get("/api/projects", (_req, res) => {
    res.json({
      active: projectManager.getActive(),
      projects: projectManager.listProjects(),
    });
  });

  app.post("/api/projects", (req, res) => {
    const { id, name, description } = req.body as { id?: string; name?: string; description?: string };
    if (!id || !name) {
      res.status(400).json({ error: "id and name are required" });
      return;
    }
    try {
      const proj = projectManager.createProject(id, name, description);
      // No auto-create — user names the first workspace in the UI
      res.json(proj);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.put("/api/projects/:id", (req, res) => {
    const { name, description } = req.body as { name?: string; description?: string };
    const projDir = projectManager.getProjectDir(req.params.id);
    const metaPath = join(projDir, "project.json");
    try {
      const existing = JSON.parse(readFileSync(metaPath, "utf-8"));
      if (name) existing.name = name;
      if (description !== undefined) existing.description = description;
      writeFileSync(metaPath, JSON.stringify(existing, null, 2), "utf-8");
      res.json(existing);
    } catch {
      res.status(404).json({ error: "Project not found" });
    }
  });

  app.delete("/api/projects/:id", (req, res) => {
    const removed = projectManager.deleteProject(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json({ ok: true });
  });

  app.get("/api/projects/:projectId/workspaces", (req, res) => {
    res.json(projectManager.listWorkspaces(req.params.projectId));
  });

  app.post("/api/projects/:projectId/workspaces", (req, res) => {
    const { id, name } = req.body as { id?: string; name?: string };
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }
    try {
      const ws = projectManager.createWorkspace(req.params.projectId, id, name);
      res.json(ws);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.put("/api/active", (req, res) => {
    const { projectId, workspaceId } = req.body as { projectId?: string; workspaceId?: string };
    if (!projectId || !workspaceId) {
      res.status(400).json({ error: "projectId and workspaceId are required" });
      return;
    }
    projectManager.setActive(projectId, workspaceId);

    // Hot-swap: reload all managers with new workspace data
    const newDataDir = projectManager.getWorkspaceDir(projectId, workspaceId);
    loadWorkspace(newDataDir);

    // Update chat session provider
    const newProject = state.projectConfig.get();
    wsHandler.setProvider(newProject.provider);
    wsHandler.setTeamInfo(state.teamConfig.getMembers());
    wsHandler.resetChat();
    wsHandler.broadcastTasks(state.taskStore.list());

    console.log(`Hot-swapped to ${projectId}/${workspaceId} (${newDataDir})`);
    res.json({ active: { projectId, workspaceId }, switched: true });
  });

  // Legacy Workspace API (backward compat)
  app.get("/api/workspaces", (_req, res) => {
    res.json({
      active: workspaceManager.getActive(),
      workspaces: workspaceManager.list(),
    });
  });

  app.post("/api/workspaces", (req, res) => {
    const { id, name } = req.body as { id?: string; name?: string };
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }
    try {
      const ws = workspaceManager.create(id, name);
      res.json(ws);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.put("/api/workspaces/active", (req, res) => {
    const { id } = req.body as { id?: string };
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }
    workspaceManager.setActive(id);
    res.json({ active: id, restart: true, message: "Restart the server to apply workspace change" });
  });

  app.delete("/api/workspaces/:id", (req, res) => {
    const removed = workspaceManager.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    res.json({ ok: true });
  });

  // Workspace Reset
  app.post("/api/workspace/reset", (_req, res) => {
    state.db.exec("DELETE FROM task_dependencies");
    state.db.exec("DELETE FROM task_updates");
    state.db.exec("DELETE FROM tasks");
    state.db.exec("DELETE FROM team_updates");
    state.db.exec("DELETE FROM chat_messages");
    wsHandler.resetChat();
    wsHandler.broadcastTasks([]);
    res.json({ ok: true });
  });

  // Delete current workspace and switch to another
  app.post("/api/workspace/delete-current", (_req, res) => {
    const current = workspaceManager.getActive();
    if (!current || current === "__legacy__") {
      res.status(400).json({ error: "Cannot delete this workspace" });
      return;
    }

    const all = workspaceManager.list();
    let switchTo: string;
    if (all.length <= 1) {
      // Create a fresh workspace to land on
      const ts = Date.now().toString(36);
      const newWs = workspaceManager.create(`project-${ts}`, "New Project");
      switchTo = newWs.id;
    } else {
      // Switch to the most recent other workspace
      const others = all.filter((w) => w.id !== current);
      switchTo = others[others.length - 1].id;
    }

    workspaceManager.setActive(switchTo);
    workspaceManager.remove(current);
    // Clear chat memory so new workspace starts clean
    wsHandler.resetChat();
    res.json({ ok: true, switchedTo: switchTo, restart: true });
  });

  // Project Config API
  app.get("/api/project", (_req, res) => {
    res.json(state.projectConfig.get());
  });

  app.put("/api/project", (req, res) => {
    const updates = req.body as Record<string, unknown>;
    const result = state.projectConfig.update(updates as Partial<import("@openteam/core").ProjectConfig>);
    // Hot-reload provider if changed
    if (updates.provider && typeof updates.provider === "string") {
      wsHandler.setProvider(updates.provider);
    }
    res.json(result);
  });

  // Marketplace API
  const marketplaceCatalog = new MarketplaceCatalog(baseDir);

  app.get("/api/marketplace", (_req, res) => {
    const installed = state.skillLoader.listModules().map((m) => m.name);
    const allSkills = marketplaceCatalog.getAll();
    const skills = allSkills.map((s) => ({
      ...s,
      installed: s.source === "built-in" || installed.includes(s.id),
    }));
    res.json({ skills, categories: MARKETPLACE_CATEGORIES });
  });

  app.post("/api/marketplace/add", async (req, res) => {
    const { url, name } = req.body as { url?: string; name?: string };
    if (!url) {
      res.status(400).json({ error: "url is required" });
      return;
    }
    try {
      // Install the skill from GitHub as modules
      const installedNames = state.skillLoader.installModules(url, name);
      if (installedNames.length === 0) {
        res.status(400).json({ error: "No .md files found in repository" });
        return;
      }

      // Extract repo name from URL for the catalog entry
      const repoMatch = url.match(/github\.com\/[\w-]+\/([\w.-]+)/);
      const repoName = name ?? repoMatch?.[1]?.replace(/\.git$/, "") ?? installedNames[0];

      // Combine all installed files into ONE module
      const allContent = installedNames.map((n) => {
        const mod = state.skillLoader.getModule(n);
        return mod?.content ?? "";
      }).join("\n\n---\n\n");

      // Remove individual modules, create one combined
      for (const n of installedNames) {
        if (n !== repoName) state.skillLoader.removeModule(n);
      }
      state.skillLoader.saveModule(repoName, allContent);

      // AI analysis for the combined skill
      const providerCmd = project.provider === "kimi" ? "kimi" : "claude";
      // Name from repo/skill — capitalize properly
      const aiName = repoName.split(/[-_]/).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
      let aiDesc = "";
      let aiCategory = autoCategorize(repoName, allContent);

      try {
        const { execSync: exec } = await import("node:child_process");
        const prompt = `This skill pack is called "${repoName}". It contains ${installedNames.length} files. Write a short description and pick a category.

Respond with ONLY JSON: {"description": "max 60 chars describing what this skill does", "category": "one of: Frontend, Backend, Database, Testing, DevOps, Design, Security, Custom"}

Content preview:
${allContent.replace(/---[\s\S]*?---/g, "").slice(0, 1500)}`;

        const quietFlag = providerCmd === "kimi" ? "--quiet" : "--print";
        const result = exec(
          `${providerCmd} ${quietFlag} -p ${JSON.stringify(prompt)}`,
          { timeout: 30000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
        );

        const jsonMatch = result.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          // Don't override the name — keep repo/skill name
          if (parsed.description && parsed.description !== "---" && parsed.description.length > 5) {
            let d = parsed.description;
            // Strip YAML-style prefix: "name: xxx description: "
            d = d.replace(/^name:\s*[\w:.-]+\s*description:\s*/i, "");
            // Strip quotes
            d = d.replace(/^["']|["']$/g, "").trim();
            if (d.length > 5) aiDesc = d.slice(0, 80);
          }
          if (parsed.category) aiCategory = parsed.category;
        }
      } catch { /* fallback */ }

      if (!aiDesc) {
        const lines = allContent.split("\n")
          .filter((l) => {
            const t = l.trim();
            return t && !t.startsWith("#") && !t.startsWith("---") && !t.startsWith("name:") && !t.startsWith("description:") && t.length > 15;
          })
          .map((l) => l.replace(/[*_`]/g, "").trim());
        aiDesc = lines.slice(0, 1).join(" ").slice(0, 80) || `${aiName} skill pack`;
      }
      // Final safety: clean any remaining YAML-like content
      aiDesc = aiDesc.replace(/^name:\s*[\w:.-]+\s*/i, "").replace(/^description:\s*/i, "").replace(/^["']|["']$/g, "").trim();
      if (aiDesc.length < 5) aiDesc = `${aiName} skill pack`;

      const entry = marketplaceCatalog.add({
        id: repoName,
        name: aiName,
        description: aiDesc,
        source: url,
        category: aiCategory,
        content: allContent,
      });

      res.json({ added: [entry], installed: [repoName] });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/marketplace/:id", (req, res) => {
    const removed = marketplaceCatalog.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "Not found or is built-in" });
      return;
    }
    res.json({ ok: true });
  });

  // Role Catalog API
  app.get("/api/role-catalog", (_req, res) => {
    res.json({ roles: ROLE_CATALOG, categories: CATEGORIES });
  });

  // Team API
  app.get("/api/team", (_req, res) => {
    res.json({ members: state.teamConfig.getMembers() });
  });

  app.post("/api/team/members", (req, res) => {
    const { roleId, name, provider } = req.body as { roleId: string; name?: string; provider?: string };
    if (!roleId) {
      res.status(400).json({ error: "roleId is required" });
      return;
    }
    const role = ROLE_CATALOG.find((r) => r.id === roleId);
    const member = state.teamConfig.addMember(
      roleId,
      name ?? role?.defaultName ?? roleId,
      (provider as "claude" | "kimi") ?? "claude",
    );
    wsHandler.setTeamInfo(state.teamConfig.getMembers());
    res.json(member);
  });

  app.delete("/api/team/members/:roleId", (req, res) => {
    const removed = state.teamConfig.removeMember(req.params.roleId);
    if (!removed) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    wsHandler.setTeamInfo(state.teamConfig.getMembers());
    res.json({ ok: true });
  });

  app.put("/api/team/members/:roleId", (req, res) => {
    const updates = req.body as { name?: string; provider?: string };
    const member = state.teamConfig.updateMember(req.params.roleId, {
      name: updates.name,
      provider: updates.provider as "claude" | "kimi",
    });
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    wsHandler.setTeamInfo(state.teamConfig.getMembers());
    res.json(member);
  });

  // Agent Names API
  app.get("/api/agent-names", (_req, res) => {
    res.json(state.agentNames.getAll());
  });

  app.put("/api/agent-names", (req, res) => {
    const updates = req.body as Record<string, string>;
    const result = state.agentNames.update(updates);
    res.json(result);
  });

  app.get("/api/agent-providers", (_req, res) => {
    res.json(state.agentNames.getAllProviders());
  });

  app.put("/api/agent-providers", (req, res) => {
    const updates = req.body as Record<string, string>;
    const result = state.agentNames.updateProviders(updates as Record<string, "claude" | "kimi">);
    res.json(result);
  });

  // Knowledge Base API
  app.get("/api/knowledge", (_req, res) => {
    res.json(state.knowledgeBase.list());
  });

  app.post("/api/knowledge", (req, res) => {
    const { name, content, read_when } = req.body as { name?: string; content?: string; read_when?: string[] };
    if (!name || !content) {
      res.status(400).json({ error: "name and content are required" });
      return;
    }
    state.knowledgeBase.save(name, content, read_when ?? []);
    res.json(state.knowledgeBase.get(name));
  });

  app.delete("/api/knowledge/:name", (req, res) => {
    const removed = state.knowledgeBase.remove(req.params.name);
    if (!removed) {
      res.status(404).json({ error: "Knowledge doc not found" });
      return;
    }
    res.json({ ok: true });
  });

  // MCP Servers API
  app.get("/api/mcp-servers", (_req, res) => {
    res.json(state.mcpManager.list());
  });

  app.post("/api/mcp-servers", (req, res) => {
    const { name, config, enabled } = req.body as {
      name?: string;
      config?: Record<string, unknown>;
      enabled?: boolean;
    };
    if (!name || !config) {
      res.status(400).json({ error: "name and config are required" });
      return;
    }
    const entry = state.mcpManager.set(name, config as import("@openteam/core").McpServerConfig, enabled ?? true);
    res.json(entry);
  });

  app.put("/api/mcp-servers/:name/toggle", (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    if (enabled === undefined) {
      res.status(400).json({ error: "enabled is required" });
      return;
    }
    const entry = state.mcpManager.toggle(req.params.name, enabled);
    if (!entry) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }
    res.json(entry);
  });

  app.delete("/api/mcp-servers/:name", (req, res) => {
    const removed = state.mcpManager.remove(req.params.name);
    if (!removed) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }
    res.json({ ok: true });
  });

  // Role-skills mapping API
  app.get("/api/roles/:name/skills", (req, res) => {
    const assigned = state.skillLoader.getRoleSkills(req.params.name);
    const allModules = state.skillLoader.listModules().map((m) => ({
      name: m.name,
      source: m.source,
      assigned: assigned.includes(m.name),
    }));
    res.json({ role: req.params.name, assigned, modules: allModules });
  });

  app.put("/api/roles/:name/skills", (req, res) => {
    const { skills: moduleNames } = req.body as { skills?: string[] };
    if (!Array.isArray(moduleNames)) {
      res.status(400).json({ error: "skills must be an array of module names" });
      return;
    }
    state.skillLoader.setRoleSkills(req.params.name, moduleNames);
    res.json({ role: req.params.name, skills: moduleNames });
  });

  // Skill loader — loaded by loadWorkspace()
  const skills = state.skillLoader.list();
  console.log(`Loaded ${skills.length} skills: ${skills.map(s => s.name).join(", ")}`);

  // Context manager — loaded by loadWorkspace()
  const workspace = state.contextManager.getWorkspace();
  if (workspace) {
    console.log(`Loaded WORKSPACE.md (${workspace.length} chars)`);
  } else {
    console.log("No WORKSPACE.md found — workers will run without project context");
  }

  // Project Config — loaded by loadWorkspace()
  const initProject = state.projectConfig.get();
  if (initProject.name) {
    console.log(`Project: ${initProject.name} (${initProject.workDir})`);
  }

  // Team Config + Agent Names — loaded by loadWorkspace()
  const team = state.teamConfig.getMembers();
  console.log(`Team: ${team.map(m => m.name).join(", ")} + PM`);

  // Knowledge Base — loaded by loadWorkspace()
  const kbDocs = state.knowledgeBase.list();
  if (kbDocs.length > 0) {
    console.log(`Loaded ${kbDocs.length} knowledge docs: ${kbDocs.map(d => d.name).join(", ")}`);
  }

  // MCP Manager — loaded by loadWorkspace()
  const mcpServers = state.mcpManager.list();
  if (mcpServers.length > 0) {
    console.log(`Loaded ${mcpServers.length} MCP servers: ${mcpServers.map(s => s.name).join(", ")}`);
  }

  // WebSocket handler
  const activeLabel = active ? `${active.projectId}/${active.workspaceId}` : "default";
  const wsHandler = createWsHandler(httpServer, cwd, state.taskStore, state.skillLoader, state.db, activeLabel, state.projectConfig.get().provider);

  // Orchestrator — picks up "assigned" tasks and spawns workers
  const project = state.projectConfig.get();
  const orchestrator = new Orchestrator({
    taskStore: state.taskStore,
    eventLogger: state.eventLogger,
    cwd,
    skillLoader: state.skillLoader,
    contextManager: state.contextManager,
    mcpManager: state.mcpManager,
    agentNames: state.agentNames,
    knowledgeBase: state.knowledgeBase,
    provider: project.provider as "claude" | "kimi",
    maxConcurrentWorkers: 3,
    pollIntervalMs: 3000,
  });

  orchestrator.on("task_updated", () => {
    const tasks = state.taskStore.list();
    wsHandler.broadcastTasks(tasks);
  });

  orchestrator.on("workers_changed", (workers: unknown[]) => {
    wsHandler.broadcastWorkers(workers as import("./ws-handler.js").WorkerInfo[]);
  });

  orchestrator.on("worker_output", ({ taskId, chunk }: { taskId: string; chunk: string }) => {
    wsHandler.broadcastWorkerOutput(taskId, chunk);
  });

  orchestrator.on("worker_done", ({ taskId, result }: { taskId: string; result: string }) => {
    console.log(`Worker completed task ${taskId}: ${result.slice(0, 100)}`);
    wsHandler.broadcastWorkerDone(taskId);
  });

  // Update Clara's team knowledge
  wsHandler.setTeamInfo(state.teamConfig.getMembers());

  orchestrator.start();
  console.log("Orchestrator started — watching for assigned tasks");

  // Serve UI static files in production
  const uiDistPath = join(__dirname, "../../ui/dist");
  if (existsSync(uiDistPath)) {
    app.use(express.static(uiDistPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(join(uiDistPath, "index.html"));
    });
  }

  httpServer.listen(port, host, () => {
    console.log(`OpenTeam server listening on http://${host}:${port}`);
  });

  // Poll for task changes every 2s and push to clients
  let lastTaskHash = "";
  setInterval(() => {
    const tasks = state.taskStore.list();
    const hash = JSON.stringify(tasks);
    if (hash !== lastTaskHash) {
      lastTaskHash = hash;
      wsHandler.broadcastTasks(tasks);
    }
  }, 2000);

  return httpServer;
}

export { app, httpServer };
