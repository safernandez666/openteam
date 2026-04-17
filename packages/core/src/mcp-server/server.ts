import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { TaskStore } from "../persistence/task-store.js";
import type { EventLogger } from "../persistence/event-logger.js";

export interface McpServerOptions {
  taskStore: TaskStore;
  eventLogger: EventLogger;
  agentName: string;
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const { taskStore, eventLogger, agentName } = options;

  const server = new McpServer({
    name: "openteam",
    version: "0.1.0",
  });

  server.tool(
    "create_task",
    "Create a new task on the Kanban board",
    {
      title: z.string().describe("Task title"),
      description: z.string().optional().describe("Task description"),
      assignee: z.string().optional().describe("Agent name to assign to"),
      priority: z
        .enum(["urgent", "high", "normal", "low"])
        .optional()
        .describe("Task priority"),
      depends_on: z
        .string()
        .optional()
        .describe("Task ID this depends on (e.g. T-1)"),
    },
    async (input) => {
      const task = taskStore.create(input);
      eventLogger.log({
        agent: agentName,
        type: "task_created",
        task_id: task.id,
        detail: `Created "${task.title}" assigned to ${task.assignee ?? "unassigned"}`,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(task, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "list_tasks",
    "List all tasks, optionally filtered by status or assignee",
    {
      status: z
        .enum([
          "backlog",
          "assigned",
          "in_progress",
          "blocked",
          "review",
          "done",
          "rejected",
        ])
        .optional()
        .describe("Filter by task status"),
      assignee: z
        .string()
        .optional()
        .describe("Filter by assigned agent name"),
    },
    async (input) => {
      const tasks = taskStore.list(input);
      eventLogger.log({
        agent: agentName,
        type: "tool_call",
        tool: "list_tasks",
        detail: `Listed ${tasks.length} tasks`,
      });
      return {
        content: [
          {
            type: "text",
            text:
              tasks.length === 0
                ? "No tasks found."
                : JSON.stringify(tasks, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "update_task",
    "Update a task's status, assignee, or other fields",
    {
      task_id: z.string().describe("Task ID (e.g. T-1)"),
      status: z
        .enum([
          "backlog",
          "assigned",
          "in_progress",
          "blocked",
          "review",
          "done",
          "rejected",
        ])
        .optional()
        .describe("New status"),
      assignee: z.string().optional().describe("New assignee"),
      title: z.string().optional().describe("Updated title"),
      description: z.string().optional().describe("Updated description"),
      priority: z
        .enum(["urgent", "high", "normal", "low"])
        .optional()
        .describe("Updated priority"),
    },
    async (input) => {
      const { task_id, ...updates } = input;
      const task = taskStore.update(task_id, updates);
      if (!task) {
        return {
          content: [{ type: "text" as const, text: `Task ${task_id} not found.` }],
          isError: true,
        };
      }
      eventLogger.log({
        agent: agentName,
        type: "task_updated",
        task_id: task.id,
        detail: `Updated: ${Object.keys(updates).join(", ")}`,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(task, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "post_update",
    "Post a status update visible to all team members",
    {
      message: z.string().describe("Update message"),
    },
    async (input) => {
      const { db } = taskStore;
      db.prepare(
        "INSERT INTO team_updates (agent, message) VALUES (?, ?)",
      ).run(agentName, input.message);

      eventLogger.log({
        agent: agentName,
        type: "team_update",
        detail: input.message,
      });

      return {
        content: [
          {
            type: "text",
            text: `Update posted: "${input.message}"`,
          },
        ],
      };
    },
  );

  server.tool(
    "get_updates",
    "Get recent team updates",
    {
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Max number of updates to return"),
    },
    async (input) => {
      const { db } = taskStore;
      const updates = db
        .prepare(
          "SELECT * FROM team_updates ORDER BY created_at DESC LIMIT ?",
        )
        .all(input.limit) as Array<{
        id: number;
        agent: string;
        message: string;
        created_at: string;
      }>;

      return {
        content: [
          {
            type: "text",
            text:
              updates.length === 0
                ? "No updates yet."
                : JSON.stringify(updates, null, 2),
          },
        ],
      };
    },
  );

  return server;
}

export async function startMcpServer(
  options: McpServerOptions,
): Promise<void> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
