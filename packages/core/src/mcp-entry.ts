/**
 * MCP Server entry point — spawned by Claude Code as a stdio process.
 *
 * Usage: node packages/core/dist/mcp-entry.js [--agent-name <name>] [--db-path <path>] [--log-path <path>]
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { startMcpServer } from "./mcp-server/index.js";
import { openDatabase } from "./persistence/database.js";
import { TaskStore } from "./persistence/task-store.js";
import { EventLogger } from "./persistence/event-logger.js";

function parseArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const args = process.argv.slice(2);

const agentName = parseArg(args, "--agent-name") ?? "agent";
const dataDir = join(homedir(), ".openteam");
const dbPath = parseArg(args, "--db-path") ?? join(dataDir, "openteam.db");
const logPath =
  parseArg(args, "--log-path") ?? join(dataDir, "logs", "events.ndjson");

const db = openDatabase(dbPath);
const taskStore = new TaskStore(db);
const eventLogger = new EventLogger(logPath);

eventLogger.log({
  agent: agentName,
  type: "mcp_server_started",
  detail: `MCP server started for agent "${agentName}"`,
});

startMcpServer({ taskStore, eventLogger, agentName }).catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
