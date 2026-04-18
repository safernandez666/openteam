import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import type BetterSqlite3 from "better-sqlite3";
import { ChatSession, type Task, type TaskStore, type SkillLoader } from "@openteam/core";

interface ClientMessage {
  type: string;
  content?: string;
}

interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export interface WorkerInfo {
  taskId: string;
  taskTitle: string;
  role: string | null;
  name: string;
  status: "running" | "completed" | "error";
  startedAt: string;
}

export interface WsHandler {
  broadcastTasks: (tasks: Task[]) => void;
  broadcastWorkers: (workers: WorkerInfo[]) => void;
  broadcastWorkerOutput: (taskId: string, chunk: string) => void;
  broadcastWorkerDone: (taskId: string) => void;
  broadcastSkills: (skills: Array<{ name: string; source: string }>) => void;
  setProvider: (provider: string) => void;
  resetChat: () => void;
}

export function createWsHandler(
  server: Server,
  cwd: string,
  taskStore: TaskStore,
  skillLoader?: SkillLoader,
  db?: BetterSqlite3.Database,
  activeWs?: string,
  provider?: string,
): WsHandler {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const chatSession = new ChatSession(cwd, undefined, db, (provider as "claude" | "kimi") ?? "claude");

  chatSession.on("stream", (chunk: string) => {
    for (const client of wss.clients) {
      send(client, { type: "chat_stream", content: chunk, done: false });
    }
  });

  chatSession.on("status", (status: string) => {
    for (const client of wss.clients) {
      send(client, { type: "status", status });
    }
  });

  wss.on("connection", (ws) => {
    // Send chat history
    send(ws, {
      type: "chat_history",
      messages: chatSession.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
    });

    send(ws, {
      type: "status",
      status: chatSession.isProcessing ? "working" : "idle",
    });

    // Send current tasks
    const tasks = taskStore.list();
    send(ws, { type: "tasks_updated", tasks });

    // Send workspace info
    send(ws, { type: "workspace_info", workspace: activeWs });

    // Send available skills (team roster) + modules + role-skills
    if (skillLoader) {
      const skills = skillLoader.list().map((s) => ({
        name: s.name,
        source: s.source,
      }));
      send(ws, { type: "skills_roster", skills });
      send(ws, {
        type: "modules_roster",
        modules: skillLoader.listModules().map((m) => ({ name: m.name, source: m.source })),
      });
      send(ws, {
        type: "role_skills_map",
        map: skillLoader.getAllRoleSkills(),
      });
    }

    // Workers state will be pushed by the orchestrator via broadcastWorkers

    ws.on("message", async (raw: import("ws").RawData) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        send(ws, { type: "error", content: "Invalid JSON" });
        return;
      }

      if (msg.type === "clear_chat") {
        chatSession.clearHistory();
        for (const client of wss.clients) {
          send(client, { type: "chat_cleared" });
        }
        return;
      }

      if (msg.type === "chat_message" && msg.content) {
        const sanitized = msg.content.trim().slice(0, 10000);
        if (!sanitized) return;

        try {
          const response = await chatSession.sendMessage(sanitized);
          for (const client of wss.clients) {
            send(client, { type: "chat_stream", content: "", done: true });
            send(client, {
              type: "chat_response",
              role: "assistant",
              content: response.content,
              timestamp: response.timestamp,
            });
          }

          // After PM responds, push updated tasks (PM may have created tasks via MCP)
          const updatedTasks = taskStore.list();
          for (const client of wss.clients) {
            send(client, { type: "tasks_updated", tasks: updatedTasks });
          }
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Unknown error";
          send(ws, { type: "error", content: errorMsg });
          for (const client of wss.clients) {
            send(client, { type: "chat_stream", content: "", done: true });
          }
        }
      }
    });
  });

  return {
    broadcastTasks(tasks: Task[]) {
      for (const client of wss.clients) {
        send(client, { type: "tasks_updated", tasks });
      }
    },
    broadcastWorkers(workers: WorkerInfo[]) {
      for (const client of wss.clients) {
        send(client, { type: "workers_updated", workers });
      }
    },
    broadcastWorkerDone(taskId: string) {
      for (const client of wss.clients) {
        send(client, { type: "worker_done", taskId });
      }
    },
    broadcastWorkerOutput(taskId: string, chunk: string) {
      for (const client of wss.clients) {
        send(client, { type: "worker_output", taskId, chunk });
      }
    },
    resetChat() {
      chatSession.clearHistory();
      for (const client of wss.clients) {
        send(client, { type: "chat_cleared" });
      }
    },
    broadcastSkills(skills: Array<{ name: string; source: string }>) {
      for (const client of wss.clients) {
        send(client, { type: "skills_roster", skills });
      }
    },
    setProvider(provider: string) {
      chatSession.setProvider(provider as "claude" | "kimi");
    },
  };
}
