export const VERSION = "0.1.2";

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
  AgentMemory,
  PerformanceTracker,
  DecisionStore,
  GateEngine,
} from "./persistence/index.js";

export type {
  Task,
  TaskDependency,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  UpdateTaskInput,
  EventEntry,
  LessonLearned,
  KnownIssue,
  AgentFailure,
  PerformanceEvent,
  AgentStats,
  Decision,
  DecisionStatus,
  CreateDecisionInput,
  GateDefinition,
  PhaseGate,
  GateExecution,
} from "./persistence/index.js";

// Chat
export { ChatSession } from "./chat/index.js";
export type { ChatMessage, ChatEvents } from "./chat/index.js";

// Orchestrator
export { Orchestrator, WorkerRunner, AgentNames, TeamConfigManager, ROLE_CATALOG, CATEGORIES, getRole, getRolesByCategory } from "./orchestrator/index.js";
export type { OrchestratorOptions, WorkerInfo, AgentNamesConfig, TeamMember, TeamConfig, RoleDefinition } from "./orchestrator/index.js";

// Skills
export { SkillLoader, SkillMatrix, MARKETPLACE_CATEGORIES, MarketplaceCatalog, autoCategorize } from "./skills/index.js";
export type { Skill, MarketplaceSkill, SkillMatrixConfig, Slot, SlotEntry } from "./skills/index.js";

// Context
export { ContextManager, KnowledgeBase, ProjectConfigManager, WorkspaceManager, ProjectManager, WorkflowEngine, CheckpointManager, TierEngine, HealthChecker, CompactionEngine } from "./context/index.js";
export type { KnowledgeDoc, ProjectConfig, WorkspaceInfo, ProjectInfo, ActiveSelection, WorkflowTemplate, WorkflowInstance, WorkflowPhase, CheckpointData, Tier, TierConfig } from "./context/index.js";

// MCP Server
export { createMcpServer, startMcpServer, McpManager } from "./mcp-server/index.js";
export type { McpServerOptions, McpServerConfig, McpServerEntry } from "./mcp-server/index.js";
