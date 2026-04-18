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
  TaskDependency,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  UpdateTaskInput,
  EventEntry,
} from "./persistence/index.js";

// Chat
export { ChatSession } from "./chat/index.js";
export type { ChatMessage, ChatEvents } from "./chat/index.js";

// Orchestrator
export { Orchestrator, WorkerRunner, AgentNames } from "./orchestrator/index.js";
export type { OrchestratorOptions, WorkerInfo, AgentNamesConfig } from "./orchestrator/index.js";

// Skills
export { SkillLoader } from "./skills/index.js";
export type { Skill } from "./skills/index.js";

// Context
export { ContextManager, KnowledgeBase, ProjectConfigManager } from "./context/index.js";
export type { KnowledgeDoc, ProjectConfig } from "./context/index.js";

// MCP Server
export { createMcpServer, startMcpServer, McpManager } from "./mcp-server/index.js";
export type { McpServerOptions, McpServerConfig, McpServerEntry } from "./mcp-server/index.js";
