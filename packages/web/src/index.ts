import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { VERSION, openDatabase, TaskStore } from "@openteam/core";
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
  const dataDir = join(homedir(), ".openteam");
  const dbPath = join(dataDir, "openteam.db");

  const db = openDatabase(dbPath);
  const taskStore = new TaskStore(db);

  // Task API
  app.get("/api/tasks", (_req, res) => {
    const tasks = taskStore.list();
    res.json(tasks);
  });

  // WebSocket handler
  const wsHandler = createWsHandler(httpServer, cwd, taskStore);

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
