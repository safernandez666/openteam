import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { VERSION, openDatabase, TaskStore, EventLogger, Orchestrator, SkillLoader, ContextManager, McpManager, AgentNames, KnowledgeBase, ProjectConfigManager, WorkspaceManager } from "@openteam/core";
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

  // Workspace management
  const workspaceManager = new WorkspaceManager(baseDir);
  let activeWs = workspaceManager.getActive();
  if (!activeWs) {
    // First run — create default workspace
    workspaceManager.create("default", "Default Workspace");
    workspaceManager.setActive("default");
    activeWs = "default";
  }
  const dataDir = workspaceManager.getWorkspaceDir(activeWs);
  console.log(`Active workspace: ${activeWs} (${dataDir})`);

  const dbPath = join(dataDir, "openteam.db");

  const db = openDatabase(dbPath);
  const taskStore = new TaskStore(db);
  const eventLogger = new EventLogger(join(dataDir, "events.ndjson"));

  // Task API
  app.get("/api/tasks", (_req, res) => {
    const tasks = taskStore.list();
    res.json(tasks);
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const updates = req.body as Record<string, unknown>;
    const task = taskStore.update(req.params.id, updates as import("@openteam/core").UpdateTaskInput);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    wsHandler.broadcastTasks(taskStore.list());
    res.json(task);
  });

  // Skills API
  app.get("/api/skills", (_req, res) => {
    const skills = skillLoader.list().map((s) => ({
      name: s.name,
      content: s.content,
      source: s.source,
    }));
    res.json(skills);
  });

  app.get("/api/skills/:name", (req, res) => {
    const skill = skillLoader.get(req.params.name);
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
      skillLoader.save(req.params.name, content);
      const skill = skillLoader.get(req.params.name)!;
      // Broadcast updated roster
      const skills = skillLoader.list().map((s) => ({ name: s.name, source: s.source }));
      wsHandler.broadcastSkills(skills);
      res.json({ name: skill.name, content: skill.content, source: skill.source });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/skills/:name", (req, res) => {
    const removed = skillLoader.remove(req.params.name);
    if (!removed) {
      res.status(404).json({ error: "Skill not found or is built-in" });
      return;
    }
    const skills = skillLoader.list().map((s) => ({ name: s.name, source: s.source }));
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
      const installed = skillLoader.installModules(source, name);
      const modules = skillLoader.listModules().map((m) => ({ name: m.name, source: m.source }));
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
      skillLoader.saveModule(name, content);
      const modules = skillLoader.listModules().map((m) => ({ name: m.name, source: m.source }));
      res.json({ name, modules });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/modules/:name", (req, res) => {
    const removed = skillLoader.removeModule(req.params.name);
    if (!removed) {
      res.status(404).json({ error: "Module not found or is built-in" });
      return;
    }
    const modules = skillLoader.listModules().map((m) => ({ name: m.name, source: m.source }));
    res.json({ ok: true, modules });
  });

  app.get("/api/modules", (_req, res) => {
    const modules = skillLoader.listModules().map((m) => ({
      name: m.name,
      content: m.content,
      source: m.source,
    }));
    res.json(modules);
  });

  // Workspace API
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

  // Project Config API
  app.get("/api/project", (_req, res) => {
    res.json(projectConfig.get());
  });

  app.put("/api/project", (req, res) => {
    const updates = req.body as Record<string, unknown>;
    const result = projectConfig.update(updates as Partial<import("@openteam/core").ProjectConfig>);
    res.json(result);
  });

  // Agent Names API
  app.get("/api/agent-names", (_req, res) => {
    res.json(agentNames.getAll());
  });

  app.put("/api/agent-names", (req, res) => {
    const updates = req.body as Record<string, string>;
    const result = agentNames.update(updates);
    res.json(result);
  });

  // Knowledge Base API
  app.get("/api/knowledge", (_req, res) => {
    res.json(knowledgeBase.list());
  });

  app.post("/api/knowledge", (req, res) => {
    const { name, content, read_when } = req.body as { name?: string; content?: string; read_when?: string[] };
    if (!name || !content) {
      res.status(400).json({ error: "name and content are required" });
      return;
    }
    knowledgeBase.save(name, content, read_when ?? []);
    res.json(knowledgeBase.get(name));
  });

  app.delete("/api/knowledge/:name", (req, res) => {
    const removed = knowledgeBase.remove(req.params.name);
    if (!removed) {
      res.status(404).json({ error: "Knowledge doc not found" });
      return;
    }
    res.json({ ok: true });
  });

  // MCP Servers API
  app.get("/api/mcp-servers", (_req, res) => {
    res.json(mcpManager.list());
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
    const entry = mcpManager.set(name, config as import("@openteam/core").McpServerConfig, enabled ?? true);
    res.json(entry);
  });

  app.put("/api/mcp-servers/:name/toggle", (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    if (enabled === undefined) {
      res.status(400).json({ error: "enabled is required" });
      return;
    }
    const entry = mcpManager.toggle(req.params.name, enabled);
    if (!entry) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }
    res.json(entry);
  });

  app.delete("/api/mcp-servers/:name", (req, res) => {
    const removed = mcpManager.remove(req.params.name);
    if (!removed) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }
    res.json({ ok: true });
  });

  // Role-skills mapping API
  app.get("/api/roles/:name/skills", (req, res) => {
    const assigned = skillLoader.getRoleSkills(req.params.name);
    const allModules = skillLoader.listModules().map((m) => ({
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
    skillLoader.setRoleSkills(req.params.name, moduleNames);
    res.json({ role: req.params.name, skills: moduleNames });
  });

  // Skill loader — loads role-specific system prompts for workers
  const userSkillsDir = join(dataDir, "skills");
  const skillLoader = new SkillLoader(userSkillsDir);
  const skills = skillLoader.list();
  console.log(`Loaded ${skills.length} skills: ${skills.map(s => s.name).join(", ")}`);

  // Context manager — project context + worker result memory
  const contextManager = new ContextManager(dataDir, taskStore);
  const workspace = contextManager.getWorkspace();
  if (workspace) {
    console.log(`Loaded WORKSPACE.md (${workspace.length} chars)`);
  } else {
    console.log("No WORKSPACE.md found — workers will run without project context");
  }

  // Project Config
  const projectConfig = new ProjectConfigManager(dataDir);
  const project = projectConfig.get();
  if (project.name) {
    console.log(`Project: ${project.name} (${project.workDir})`);
  }

  // Agent Names
  const agentNames = new AgentNames(dataDir);

  // Knowledge Base
  const knowledgeBase = new KnowledgeBase(dataDir);
  const kbDocs = knowledgeBase.list();
  if (kbDocs.length > 0) {
    console.log(`Loaded ${kbDocs.length} knowledge docs: ${kbDocs.map(d => d.name).join(", ")}`);
  }

  // MCP Manager
  const mcpManager = new McpManager(dataDir);
  const mcpServers = mcpManager.list();
  if (mcpServers.length > 0) {
    console.log(`Loaded ${mcpServers.length} MCP servers: ${mcpServers.map(s => s.name).join(", ")}`);
  }

  // WebSocket handler
  const wsHandler = createWsHandler(httpServer, cwd, taskStore, skillLoader, db, activeWs, project.provider);

  // Orchestrator — picks up "assigned" tasks and spawns workers
  const orchestrator = new Orchestrator({
    taskStore,
    eventLogger,
    cwd,
    skillLoader,
    contextManager,
    mcpManager,
    agentNames,
    knowledgeBase,
    provider: project.provider as "claude" | "kimi",
    maxConcurrentWorkers: 3,
    pollIntervalMs: 3000,
  });

  orchestrator.on("task_updated", () => {
    const tasks = taskStore.list();
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
    const tasks = taskStore.list();
    const hash = JSON.stringify(tasks);
    if (hash !== lastTaskHash) {
      lastTaskHash = hash;
      wsHandler.broadcastTasks(tasks);
    }
  }, 2000);

  return httpServer;
}

export { app, httpServer };
