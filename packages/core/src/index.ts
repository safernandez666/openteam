export const VERSION = "0.1.0";

// Agent Runtime
export {
  Agent,
  AgentSimulator,
  simulatorAdapter,
  IdleDetector,
  PtyManager,
  createEmitter,
  claudeCodeAdapter,
  claudeCodePrintAdapter,
} from "./agent-runtime/index.js";

export type {
  AgentConfig,
  AgentState,
  AgentStatus,
  AgentEvents,
  CLIAdapter,
  PtyOutput,
  TypedAgentEmitter,
} from "./agent-runtime/index.js";

// Persistence
export {
  openDatabase,
  TaskStore,
  EventLogger,
} from "./persistence/index.js";

export type {
  Task,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  UpdateTaskInput,
  EventEntry,
} from "./persistence/index.js";

// Chat
export { ChatSession } from "./chat/index.js";
export type { ChatMessage, ChatEvents } from "./chat/index.js";

// MCP Server
export { createMcpServer, startMcpServer } from "./mcp-server/index.js";
export type { McpServerOptions } from "./mcp-server/index.js";
