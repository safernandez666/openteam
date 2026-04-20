import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { VERSION, openDatabase, TaskStore, EventLogger, Orchestrator, SkillLoader, ContextManager, McpManager, AgentNames, KnowledgeBase, ProjectConfigManager, WorkspaceManager, TeamConfigManager, ROLE_CATALOG, CATEGORIES, MARKETPLACE_CATEGORIES, MarketplaceCatalog, autoCategorize, ProjectManager, AgentMemory, PerformanceTracker, DecisionStore, WorkflowEngine, GateEngine, CheckpointManager, TierEngine, HealthChecker, CompactionEngine } from "openteam-core";
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

  // Validate active pointer — clear if project was deleted
  if (active) {
    const activeProjectId = active.projectId;
    if (!projectManager.listProjects().some((p) => p.id === activeProjectId)) {
      console.log(`Active project "${activeProjectId}" no longer exists — clearing`);
      projectManager.clearActive();
      active = null;
    }
  }

  if (active) {
    projectDir = projectManager.getProjectDir(active.projectId);
    dataDir = projectManager.getWorkspaceDir(active.projectId, active.workspaceId);
    console.log(`Project: ${active.projectId} | Workspace: ${active.workspaceId}`);
  } else {
    // No active pointer — check if projects already exist
    const existingProjects = projectManager.listProjects();
    if (existingProjects.length > 0) {
      // Pick the first existing project and its first workspace
      const firstProj = existingProjects[0];
      const workspaces = projectManager.listWorkspaces(firstProj.id);
      const firstWs = workspaces[0];
      if (firstWs) {
        projectManager.setActive(firstProj.id, firstWs.id);
        projectDir = projectManager.getProjectDir(firstProj.id);
        dataDir = projectManager.getWorkspaceDir(firstProj.id, firstWs.id);
        console.log(`Resumed: ${firstProj.id}/${firstWs.id}`);
      } else {
        // Project exists but no workspaces — create one
        projectManager.createWorkspace(firstProj.id, "main", "Main");
        projectManager.setActive(firstProj.id, "main");
        projectDir = projectManager.getProjectDir(firstProj.id);
        dataDir = projectManager.getWorkspaceDir(firstProj.id, "main");
      }
    } else {
      // No projects at all — create default
      try { projectManager.createProject("default", "Default Project"); } catch { /* already exists */ }
      try { projectManager.createWorkspace("default", "main", "Main"); } catch { /* already exists */ }
      projectManager.setActive("default", "main");
      projectDir = projectManager.getProjectDir("default");
      dataDir = projectManager.getWorkspaceDir("default", "main");
      console.log(`New install — Project: default | Workspace: main`);
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
    agentMemory: null as unknown as AgentMemory,
    performanceTracker: null as unknown as PerformanceTracker,
    decisionStore: null as unknown as DecisionStore,
    workflowEngine: null as unknown as WorkflowEngine,
    gateEngine: null as unknown as GateEngine,
    checkpointManager: null as unknown as CheckpointManager,
    tierEngine: null as unknown as TierEngine,
    compactionEngine: null as unknown as CompactionEngine,
  };

  // Global skills directory — shared across all workspaces
  const globalSkillsDir = join(baseDir, "skills");

  function loadWorkspace(dir: string) {
    state.dataDir = dir;
    state.db = openDatabase(join(dir, "openteam.db"));
    state.taskStore = new TaskStore(state.db);
    state.eventLogger = new EventLogger(join(dir, "events.ndjson"));
    state.skillLoader = new SkillLoader(globalSkillsDir);
    state.contextManager = new ContextManager(dir, state.taskStore);
    state.projectConfig = new ProjectConfigManager(dir);
    state.teamConfig = new TeamConfigManager(dir);
    state.agentNames = new AgentNames(dir);
    state.knowledgeBase = new KnowledgeBase(dir);
    state.mcpManager = new McpManager(dir);
    state.agentMemory = new AgentMemory(state.db);
    state.performanceTracker = new PerformanceTracker(state.db);
    state.decisionStore = new DecisionStore(state.db);
    state.workflowEngine = new WorkflowEngine(state.db);
    state.gateEngine = new GateEngine(state.db);
    state.checkpointManager = new CheckpointManager(state.db);
    state.tierEngine = new TierEngine(state.db);
    state.compactionEngine = new CompactionEngine(state.db);
  }

  loadWorkspace(dataDir);

  // All route handlers must use state.X to read current workspace data

  // Task API
  app.get("/api/tasks", (_req, res) => {
    const tasks = state.taskStore.list();
    res.json(tasks);
  });

  app.post("/api/tasks", (req, res) => {
    const input = req.body as import("openteam-core").CreateTaskInput;
    if (!input.title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const task = state.taskStore.create(input);
    wsHandler.broadcastTasks(state.taskStore.list());
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const updates = req.body as Record<string, unknown>;
    const task = state.taskStore.update(req.params.id, updates as import("openteam-core").UpdateTaskInput);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    wsHandler.broadcastTasks(state.taskStore.list());
    res.json(task);
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const removed = state.taskStore.delete(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    wsHandler.broadcastTasks(state.taskStore.list());
    res.status(204).send();
  });

  app.post("/api/tasks/:id/retry", (req, res) => {
    const task = state.taskStore.retry(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    wsHandler.broadcastTasks(state.taskStore.list());
    res.json({ taskId: task.id, status: task.status });
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

  // Skill Matrix API
  app.get("/api/skill-matrix", (_req, res) => {
    const matrix = state.skillLoader.skillMatrix;
    if (!matrix) { res.json({}); return; }
    res.json(matrix.getAll());
  });

  app.put("/api/skill-matrix", (req, res) => {
    const matrix = state.skillLoader.skillMatrix;
    if (!matrix) { res.status(400).json({ error: "No skill matrix available" }); return; }
    matrix.setAll(req.body as Record<string, unknown> as import("openteam-core").SkillMatrixConfig);
    res.json(matrix.getAll());
  });

  app.post("/api/skill-matrix/:slot/bind", (req, res) => {
    const matrix = state.skillLoader.skillMatrix;
    if (!matrix) { res.status(400).json({ error: "No skill matrix available" }); return; }
    const { name, skill } = req.body as { name?: string; skill?: string };
    if (!name || !skill) { res.status(400).json({ error: "name and skill are required" }); return; }
    matrix.bindSkill(req.params.slot, name, skill);
    res.json(matrix.getSlot(req.params.slot));
  });

  app.delete("/api/skill-matrix/:slot/:skill", (req, res) => {
    const matrix = state.skillLoader.skillMatrix;
    if (!matrix) { res.status(400).json({ error: "No skill matrix available" }); return; }
    const removed = matrix.unbindSkill(req.params.slot, req.params.skill);
    if (!removed) { res.status(404).json({ error: "Binding not found" }); return; }
    res.json({ ok: true });
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
    const currentActive = projectManager.getActive();
    const removed = projectManager.deleteProject(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    // If we deleted the active project, clear the active pointer
    if (currentActive?.projectId === req.params.id) {
      projectManager.clearActive();
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

  app.delete("/api/projects/:projectId/workspaces/:wsId", (req, res) => {
    const { projectId, wsId } = req.params;
    const currentActive = projectManager.getActive();

    // Prevent deleting the active workspace
    if (currentActive?.projectId === projectId && currentActive?.workspaceId === wsId) {
      res.status(400).json({ error: "Cannot delete the active workspace. Switch to another workspace first." });
      return;
    }

    const removed = projectManager.deleteWorkspace(projectId, wsId);
    if (!removed) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    res.json({ ok: true });
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

    // Recreate orchestrator with new workspace state
    orchestrator.stop();
    orchestrator.removeAllListeners();
    orchestrator = new Orchestrator({
      taskStore: state.taskStore,
      eventLogger: state.eventLogger,
      cwd,
      skillLoader: state.skillLoader,
      contextManager: state.contextManager,
      mcpManager: state.mcpManager,
      agentNames: state.agentNames,
      knowledgeBase: state.knowledgeBase,
      agentMemory: state.agentMemory,
      performanceTracker: state.performanceTracker,
      decisionStore: state.decisionStore,
      tierEngine: state.tierEngine,
      compactionEngine: state.compactionEngine,
      provider: state.projectConfig.get().provider as "claude" | "kimi",
      maxConcurrentWorkers: 3,
      pollIntervalMs: 3000,
    });
    attachOrchestratorListeners(orchestrator);
    orchestrator.start();

    // Update chat session
    wsHandler.setProvider(state.projectConfig.get().provider);
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
    const currentActive = projectManager.getActive();
    const pid = currentActive?.projectId ?? "default";
    const newDataDir = projectManager.getWorkspaceDir(pid, id);
    projectManager.setActive(pid, id);
    loadWorkspace(newDataDir);

    // Recreate orchestrator with new workspace state
    orchestrator.stop();
    orchestrator.removeAllListeners();
    orchestrator = new Orchestrator({
      taskStore: state.taskStore,
      eventLogger: state.eventLogger,
      cwd,
      skillLoader: state.skillLoader,
      contextManager: state.contextManager,
      mcpManager: state.mcpManager,
      agentNames: state.agentNames,
      knowledgeBase: state.knowledgeBase,
      agentMemory: state.agentMemory,
      performanceTracker: state.performanceTracker,
      decisionStore: state.decisionStore,
      tierEngine: state.tierEngine,
      compactionEngine: state.compactionEngine,
      provider: state.projectConfig.get().provider as "claude" | "kimi",
      maxConcurrentWorkers: 3,
      pollIntervalMs: 3000,
    });
    attachOrchestratorListeners(orchestrator);
    orchestrator.start();

    wsHandler.setProvider(state.projectConfig.get().provider);
    wsHandler.setTeamInfo(state.teamConfig.getMembers());
    wsHandler.resetChat();
    wsHandler.broadcastTasks(state.taskStore.list());

    console.log(`Hot-swapped to legacy workspace ${id} (${newDataDir})`);
    res.json({ active: id, switched: true });
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

  app.get("/api/project/check", (_req, res) => {
    const check = state.projectConfig.checkWorkDir();
    res.json(check);
  });

  app.put("/api/project", (req, res) => {
    const updates = req.body as Record<string, unknown>;
    const result = state.projectConfig.update(updates as Partial<import("openteam-core").ProjectConfig>);
    // Hot-reload provider if changed
    if (updates.provider && typeof updates.provider === "string") {
      wsHandler.setProvider(updates.provider);
      orchestrator.setProvider(updates.provider as "claude" | "kimi");
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
      const currentProvider = state.projectConfig.get().provider;
      const providerCmd = currentProvider === "kimi" ? "kimi" : "claude";
      // Name from repo/skill — capitalize properly
      const aiName = repoName.split(/[-_]/).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
      let aiDesc = "";
      let aiCategory = autoCategorize(repoName, allContent);

      try {
        const { exec } = await import("node:child_process");
        const prompt = `This skill pack is called "${repoName}". It contains ${installedNames.length} files. Write a short description and pick a category.

Respond with ONLY JSON: {"description": "max 60 chars describing what this skill does", "category": "one of: Frontend, Backend, Database, Testing, DevOps, Design, Security, Custom"}

Content preview:
${allContent.replace(/---[\s\S]*?---/g, "").slice(0, 1500)}`;

        const quietFlag = providerCmd === "kimi" ? "--quiet" : "--print";
        const result = await new Promise<string>((resolve, reject) => {
          exec(
            `${providerCmd} ${quietFlag} -p ${JSON.stringify(prompt)}`,
            { timeout: 30000, encoding: "utf-8" },
            (error, stdout) => {
              if (error) reject(error);
              else resolve(stdout);
            },
          );
        });

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

  app.get("/api/avatar-seeds", (_req, res) => {
    res.json(state.agentNames.getAllAvatarSeeds());
  });

  app.put("/api/avatar-seeds/:role", (req, res) => {
    const { seed } = req.body as { seed?: number };
    if (typeof seed !== "number") {
      res.status(400).json({ error: "seed (number) is required" });
      return;
    }
    state.agentNames.setAvatarSeed(req.params.role, seed);
    res.json({ role: req.params.role, seed });
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

  // Agent Memory API (Lessons, Issues, Failures)
  app.get("/api/memory/lessons", (_req, res) => {
    res.json(state.agentMemory.getLessons());
  });

  app.post("/api/memory/lessons", (req, res) => {
    const { category, title, description, severity, source_task } = req.body as Record<string, string>;
    if (!title || !description) {
      res.status(400).json({ error: "title and description are required" });
      return;
    }
    const lesson = state.agentMemory.addLesson({ category: category ?? "general", title, description, severity, source_task });
    res.status(201).json(lesson);
  });

  app.delete("/api/memory/lessons/:id", (req, res) => {
    const removed = state.agentMemory.deleteLesson(parseInt(req.params.id, 10));
    if (!removed) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  });

  app.get("/api/memory/issues", (_req, res) => {
    res.json(state.agentMemory.getIssues());
  });

  app.post("/api/memory/issues", (req, res) => {
    const { title, description, severity, root_cause, workaround } = req.body as Record<string, string>;
    if (!title || !description) {
      res.status(400).json({ error: "title and description are required" });
      return;
    }
    const issue = state.agentMemory.addIssue({ title, description, severity, root_cause, workaround });
    res.status(201).json(issue);
  });

  app.patch("/api/memory/issues/:id", (req, res) => {
    const updates = req.body as Record<string, string>;
    const issue = state.agentMemory.updateIssue(parseInt(req.params.id, 10), updates);
    if (!issue) { res.status(404).json({ error: "Not found" }); return; }
    res.json(issue);
  });

  app.delete("/api/memory/issues/:id", (req, res) => {
    const removed = state.agentMemory.deleteIssue(parseInt(req.params.id, 10));
    if (!removed) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  });

  app.get("/api/memory/failures", (_req, res) => {
    res.json(state.agentMemory.getFailures());
  });

  app.patch("/api/memory/failures/:id/resolve", (req, res) => {
    const { resolution } = req.body as { resolution?: string };
    if (!resolution) { res.status(400).json({ error: "resolution is required" }); return; }
    const failure = state.agentMemory.resolveFailure(parseInt(req.params.id, 10), resolution);
    if (!failure) { res.status(404).json({ error: "Not found" }); return; }
    res.json(failure);
  });

  app.patch("/api/memory/failures/:id/ignore", (req, res) => {
    const ignored = state.agentMemory.ignoreFailure(parseInt(req.params.id, 10));
    if (!ignored) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  });

  // Performance API
  app.get("/api/performance", (_req, res) => {
    res.json(state.performanceTracker.getAllStats());
  });

  app.get("/api/performance/:role", (req, res) => {
    const stats = state.performanceTracker.getAgentStats(req.params.role);
    res.json(stats);
  });

  app.get("/api/performance/best/:category", (req, res) => {
    const best = state.performanceTracker.getBestAgentForCategory(req.params.category);
    res.json({ category: req.params.category, bestAgent: best });
  });

  app.get("/api/performance/events/recent", (_req, res) => {
    res.json(state.performanceTracker.getRecentEvents());
  });

  // Decisions (ADR) API
  app.get("/api/decisions", (req, res) => {
    const status = req.query.status as string | undefined;
    res.json(state.decisionStore.list(status as import("openteam-core").DecisionStatus));
  });

  app.post("/api/decisions", (req, res) => {
    const input = req.body as import("openteam-core").CreateDecisionInput;
    if (!input.title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const decision = state.decisionStore.create(input);
    res.status(201).json(decision);
  });

  app.get("/api/decisions/:id", (req, res) => {
    const decision = state.decisionStore.get(parseInt(req.params.id, 10));
    if (!decision) { res.status(404).json({ error: "Not found" }); return; }
    res.json(decision);
  });

  app.patch("/api/decisions/:id", (req, res) => {
    const updates = req.body as Record<string, string>;
    const decision = state.decisionStore.update(parseInt(req.params.id, 10), updates);
    if (!decision) { res.status(404).json({ error: "Not found" }); return; }
    res.json(decision);
  });

  app.delete("/api/decisions/:id", (req, res) => {
    const removed = state.decisionStore.delete(parseInt(req.params.id, 10));
    if (!removed) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  });

  // Workflow API
  app.get("/api/workflows/templates", (_req, res) => {
    res.json(state.workflowEngine.listTemplates());
  });

  app.get("/api/workflows/templates/:id", (req, res) => {
    const t = state.workflowEngine.getTemplate(req.params.id);
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    res.json(t);
  });

  app.post("/api/workflows/templates", (req, res) => {
    const input = req.body as { id: string; name: string; description: string; category: string; phases: unknown[] };
    if (!input.id || !input.name) { res.status(400).json({ error: "id and name required" }); return; }
    const t = state.workflowEngine.createTemplate(input as Parameters<typeof state.workflowEngine.createTemplate>[0]);
    res.status(201).json(t);
  });

  app.put("/api/workflows/templates/:id", (req, res) => {
    const t = state.workflowEngine.updateTemplate(req.params.id, req.body as Record<string, unknown>);
    if (!t) { res.status(404).json({ error: "Not found or not editable" }); return; }
    res.json(t);
  });

  app.delete("/api/workflows/templates/:id", (req, res) => {
    const removed = state.workflowEngine.deleteTemplate(req.params.id);
    if (!removed) { res.status(404).json({ error: "Not found or built-in" }); return; }
    res.json({ ok: true });
  });

  app.get("/api/workflows/instances", (req, res) => {
    const status = req.query.status as string | undefined;
    res.json(state.workflowEngine.listInstances(status));
  });

  app.get("/api/workflows/instances/:id", (req, res) => {
    const i = state.workflowEngine.getInstance(req.params.id);
    if (!i) { res.status(404).json({ error: "Not found" }); return; }
    const template = state.workflowEngine.getTemplate(i.template_id);
    const phase = state.workflowEngine.getCurrentPhase(req.params.id);
    res.json({ ...i, template, currentPhaseDetail: phase });
  });

  app.post("/api/workflows/instances", (req, res) => {
    const { taskId, templateId } = req.body as { taskId?: string; templateId?: string };
    if (!taskId || !templateId) { res.status(400).json({ error: "taskId and templateId required" }); return; }

    // Validate team has required roles
    const teamRoles = state.teamConfig.getMembers().map((m) => m.roleId);
    const missingRoles = state.workflowEngine.validateTeam(templateId, teamRoles);
    if (missingRoles.length > 0) {
      res.status(400).json({
        error: `Team is missing required roles: ${missingRoles.join(", ")}. Add them in Workers → + Add Agent.`,
        missingRoles,
      });
      return;
    }

    const i = state.workflowEngine.startWorkflow(taskId, templateId);
    if (!i) { res.status(404).json({ error: "Template not found" }); return; }

    // Store first phase taskId
    const template = state.workflowEngine.getTemplate(templateId);
    if (template) {
      const phaseData = { ...i.phase_data };
      phaseData["0"] = { ...phaseData["0"], taskId };
      state.workflowEngine.getInstance(i.id); // ensure exists
    }

    res.status(201).json(i);
  });

  app.post("/api/workflows/instances/:id/advance", (req, res) => {
    const { notes } = req.body as { notes?: string };
    const i = state.workflowEngine.advancePhase(req.params.id, notes);
    if (!i) { res.status(404).json({ error: "Not found or not running" }); return; }
    res.json(i);
  });

  app.post("/api/workflows/detect", (req, res) => {
    const { input } = req.body as { input?: string };
    if (!input) { res.status(400).json({ error: "input required" }); return; }
    const templateId = state.workflowEngine.detectWorkflow(input);
    const template = templateId ? state.workflowEngine.getTemplate(templateId) : null;
    res.json({ detected: templateId, template });
  });

  // Validation Gates API
  app.get("/api/gates/definitions", (_req, res) => {
    res.json(state.gateEngine.listGates());
  });

  app.get("/api/gates/definitions/:id", (req, res) => {
    const gate = state.gateEngine.getGate(req.params.id);
    if (!gate) { res.status(404).json({ error: "Not found" }); return; }
    res.json(gate);
  });

  app.put("/api/gates/definitions/:id", (req, res) => {
    const { enabled, config } = req.body as { enabled?: boolean; config?: Record<string, unknown> };
    if (enabled !== undefined) state.gateEngine.toggleGate(req.params.id, enabled);
    if (config) state.gateEngine.updateGateConfig(req.params.id, config);
    const gate = state.gateEngine.getGate(req.params.id);
    if (!gate) { res.status(404).json({ error: "Not found" }); return; }
    res.json(gate);
  });

  app.get("/api/tasks/:id/gates", (req, res) => {
    res.json(state.gateEngine.getExecutionsForTask(req.params.id));
  });

  app.post("/api/tasks/:id/gates/:gateId/trigger", (req, res) => {
    const { phaseIndex } = req.body as { phaseIndex?: number };
    const exec = state.gateEngine.triggerGate(req.params.id, req.params.gateId, phaseIndex);
    res.status(201).json(exec);
  });

  app.patch("/api/gates/executions/:id", (req, res) => {
    const { status, output, durationMs } = req.body as { status?: string; output?: string; durationMs?: number };
    if (!status) { res.status(400).json({ error: "status required" }); return; }
    const exec = state.gateEngine.updateExecution(
      parseInt(req.params.id, 10),
      status as "passed" | "failed" | "skipped",
      output,
      durationMs,
    );
    if (!exec) { res.status(404).json({ error: "Not found" }); return; }
    res.json(exec);
  });

  app.get("/api/gates/stats", (_req, res) => {
    res.json(state.gateEngine.getStats());
  });

  app.get("/api/workflows/templates/:templateId/gates/:phaseIndex", (req, res) => {
    const gates = state.gateEngine.getPhaseGates(req.params.templateId, parseInt(req.params.phaseIndex, 10));
    res.json(gates);
  });

  app.post("/api/workflows/templates/:templateId/gates/:phaseIndex", (req, res) => {
    const { gateId, isRequired, order } = req.body as { gateId?: string; isRequired?: boolean; order?: number };
    if (!gateId) { res.status(400).json({ error: "gateId required" }); return; }
    state.gateEngine.addPhaseGate(req.params.templateId, parseInt(req.params.phaseIndex, 10), gateId, isRequired ?? true, order ?? 0);
    const gates = state.gateEngine.getPhaseGates(req.params.templateId, parseInt(req.params.phaseIndex, 10));
    res.json(gates);
  });

  // Dashboard API
  app.get("/api/dashboard/overview", (_req, res) => {
    const tasks = state.taskStore.list();
    const done = tasks.filter((t) => t.status === "done").length;
    const totalTokens = tasks.reduce((s, t) => s + (t.input_tokens ?? 0) + (t.output_tokens ?? 0), 0);
    const activeWf = state.workflowEngine.listInstances("running").length;
    const agentStats = state.performanceTracker.getAllStats();
    const successRate = agentStats.length > 0
      ? Math.round(agentStats.reduce((s, a) => s + a.successRate, 0) / agentStats.length)
      : 0;

    res.json({
      totalTasks: tasks.length,
      doneTasks: done,
      successRate,
      totalTokens,
      activeWorkflows: activeWf,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      blocked: tasks.filter((t) => t.status === "blocked").length,
    });
  });

  app.get("/api/dashboard/agents", (_req, res) => {
    res.json(state.performanceTracker.getAllStats());
  });

  app.get("/api/dashboard/tiers", (_req, res) => {
    const tiers = state.tierEngine.getAllTiers();
    const stats = state.performanceTracker.getAllStats();
    res.json({ tiers, agentStats: stats });
  });

  app.get("/api/dashboard/gates", (_req, res) => {
    res.json(state.gateEngine.getStats());
  });

  app.get("/api/dashboard/workflows", (_req, res) => {
    const templates = state.workflowEngine.listTemplates();
    const instances = state.workflowEngine.listInstances();
    const running = instances.filter((i) => i.status === "running").length;
    const completed = instances.filter((i) => i.status === "completed").length;
    res.json({ templates: templates.length, instances: instances.length, running, completed });
  });

  app.get("/api/dashboard/memory", (_req, res) => {
    const lessons = state.agentMemory.getLessons().slice(0, 5);
    const issues = state.agentMemory.getIssues("open");
    const failures = state.agentMemory.getFailures("unresolved").slice(0, 5);
    res.json({ lessons, issues, failures });
  });

  // Health Check API
  const healthChecker = new HealthChecker(state.db, cwd, state.dataDir);

  app.get("/api/doctor", async (_req, res) => {
    const results = await healthChecker.runAllChecks();
    const overall = healthChecker.getOverallStatus(results);
    res.json({ overall, checks: results });
  });

  // Tier API
  app.get("/api/tiers", (_req, res) => {
    res.json(state.tierEngine.getAllTiers());
  });

  app.get("/api/tiers/:roleId", (req, res) => {
    res.json(state.tierEngine.getTier(req.params.roleId));
  });

  app.put("/api/tiers/:roleId", (req, res) => {
    const { tier, provider } = req.body as { tier?: string; provider?: string };
    if (!tier) { res.status(400).json({ error: "tier required" }); return; }
    state.tierEngine.setTier(req.params.roleId, tier as import("openteam-core").Tier, provider as "claude" | "kimi" | undefined);
    res.json(state.tierEngine.getTier(req.params.roleId));
  });

  app.post("/api/tiers/reset", (_req, res) => {
    state.tierEngine.resetToDefaults();
    res.json(state.tierEngine.getAllTiers());
  });

  app.post("/api/tiers/score", (req, res) => {
    const { title, description, role } = req.body as { title?: string; description?: string; role?: string };
    if (!title) { res.status(400).json({ error: "title required" }); return; }
    const score = state.tierEngine.scoreTask(title, description, role);
    const roleTier = state.tierEngine.getTier(role ?? "developer").tier;
    const tier = state.tierEngine.inferTier(score, roleTier);
    res.json({ score, tier, roleTier });
  });

  // Checkpoints API
  const getWorkspaceId = () => {
    const a = projectManager.getActive();
    return a ? `${a.projectId}/${a.workspaceId}` : "default";
  };

  const triggerCheckpoint = (force = false) => {
    const wsId = getWorkspaceId();
    const workers = orchestrator.getWorkers().filter((w) => w.status === "running");
    const activeWfInstances = state.workflowEngine.listInstances("running");
    const wfState = activeWfInstances.length > 0 ? {
      instanceId: activeWfInstances[0].id,
      templateId: activeWfInstances[0].template_id,
      currentPhase: activeWfInstances[0].current_phase,
    } : null;

    const checkpoint = state.checkpointManager.buildFromState(
      wsId,
      state.taskStore,
      workers,
      wfState,
      wsHandler.getChatMessages(),
    );
    state.checkpointManager.saveCheckpoint(checkpoint, force);
  };

  app.get("/api/checkpoints", (_req, res) => {
    res.json(state.checkpointManager.listCheckpoints(getWorkspaceId()));
  });

  app.get("/api/checkpoints/active", (_req, res) => {
    const cp = state.checkpointManager.getActiveCheckpoint(getWorkspaceId());
    res.json(cp ?? null);
  });

  app.post("/api/checkpoints", (_req, res) => {
    triggerCheckpoint(true);
    const cp = state.checkpointManager.getActiveCheckpoint(getWorkspaceId());
    res.status(201).json(cp);
  });

  app.get("/api/checkpoints/:id", (req, res) => {
    const cp = state.checkpointManager.getCheckpoint(parseInt(req.params.id, 10));
    if (!cp) { res.status(404).json({ error: "Not found" }); return; }
    res.json(cp);
  });

  app.delete("/api/checkpoints/:id", (req, res) => {
    const removed = state.checkpointManager.deleteCheckpoint(parseInt(req.params.id, 10));
    if (!removed) { res.status(404).json({ error: "Not found" }); return; }
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
    const entry = state.mcpManager.set(name, config as import("openteam-core").McpServerConfig, enabled ?? true);
    wsHandler.setMcpServers(state.mcpManager.list());
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
    wsHandler.setMcpServers(state.mcpManager.list());
    res.json(entry);
  });

  app.delete("/api/mcp-servers/:name", (req, res) => {
    const removed = state.mcpManager.remove(req.params.name);
    if (!removed) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }
    wsHandler.setMcpServers(state.mcpManager.list());
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
  const wsHandler = createWsHandler(httpServer, cwd, {
    getTaskStore: () => state.taskStore,
    getSkillLoader: () => state.skillLoader,
    getDb: () => state.db,
    getActiveWs: () => {
      const a = projectManager.getActive();
      return a ? `${a.projectId}/${a.workspaceId}` : "default";
    },
    getProvider: () => state.projectConfig.get().provider,
    getWorkDir: () => state.projectConfig.get().workDir,
  });

  // Orchestrator — picks up "assigned" tasks and spawns workers
  const project = state.projectConfig.get();
  let orchestrator = new Orchestrator({
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

  function attachOrchestratorListeners(orc: Orchestrator) {
    orc.on("task_updated", () => {
      const tasks = state.taskStore.list();
      wsHandler.broadcastTasks(tasks);
    });

    orc.on("workers_changed", (workers: unknown[]) => {
      wsHandler.broadcastWorkers(workers as import("./ws-handler.js").WorkerInfo[]);
    });

    orc.on("worker_output", ({ taskId, chunk }: { taskId: string; chunk: string }) => {
      wsHandler.broadcastWorkerOutput(taskId, chunk);
    });

    orc.on("worker_done", ({ taskId, result }: { taskId: string; result: string }) => {
      console.log(`Worker completed task ${taskId}: ${result.slice(0, 100)}`);
      wsHandler.broadcastWorkerDone(taskId);
      triggerCheckpoint();

      // Auto-advance workflow if this task belongs to one
      const instance = state.workflowEngine.getInstanceByPhaseTask(taskId);
      if (instance && instance.status === "running") {
        const template = state.workflowEngine.getTemplate(instance.template_id);
        if (template && instance.current_phase < template.phases.length) {
          // Advance to next phase
          const nextPhaseIdx = instance.current_phase + 1;
          if (nextPhaseIdx < template.phases.length) {
            const nextPhase = template.phases[nextPhaseIdx];
            const title = nextPhase.task_title_template.replace("{description}", state.taskStore.get(instance.root_task_id)?.title ?? "");

            // Create next phase task
            const nextTask = state.taskStore.create({
              title,
              description: nextPhase.description,
              role: nextPhase.role === "pm" ? undefined : nextPhase.role,
              assignee: nextPhase.role === "pm" ? undefined : "worker",
              priority: "normal",
            });

            state.workflowEngine.advancePhase(instance.id, `Task ${taskId} completed`, nextTask.id);
            console.log(`Workflow ${instance.id}: advanced to phase ${nextPhaseIdx + 1} → ${nextPhase.name} (${nextTask.id})`);
            wsHandler.broadcastTasks(state.taskStore.list());
          } else {
            // Last phase done — complete workflow
            state.workflowEngine.advancePhase(instance.id, `Task ${taskId} completed — workflow done`);
            console.log(`Workflow ${instance.id}: completed all phases`);
          }
        }
      }
    });
  }

  attachOrchestratorListeners(orchestrator);

  // Update PM's team + MCP + skills knowledge
  wsHandler.setTeamInfo(state.teamConfig.getMembers());
  wsHandler.setMcpServers(state.mcpManager.list());
  wsHandler.setSkillsInfo(
    state.skillLoader.list().map((s) => ({ name: s.name, source: s.source })),
    state.skillLoader.listModules().map((m) => ({ name: m.name, source: m.source })),
  );

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

  // Graceful shutdown
  const shutdown = () => {
    console.log("Shutting down gracefully...");
    triggerCheckpoint(true);
    orchestrator.stop();
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return httpServer;
}

export { app, httpServer };
