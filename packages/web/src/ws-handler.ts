import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import { ChatSession, type Task, type TaskStore } from "@openteam/core";

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

export interface WsHandler {
  broadcastTasks: (tasks: Task[]) => void;
}

export function createWsHandler(
  server: Server,
  cwd: string,
  taskStore: TaskStore,
): WsHandler {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const chatSession = new ChatSession(cwd);

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

    ws.on("message", async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        send(ws, { type: "error", content: "Invalid JSON" });
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
  };
}
