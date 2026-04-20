# OpenTeam Architecture

## End-to-End Task Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   User      │────▶│  ChatSession │────▶│   Facu (PM)     │
│  (Browser)  │     │  (WebSocket) │     │  Claude/Kimi    │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                  │
                    ┌─────────────────────────────┘
                    ▼
           ┌─────────────────┐
           │  MCP Tools      │
           │  create_task    │
           │  list_tasks     │
           │  update_task    │
           └─────────────────┘
                    │
                    ▼
           ┌─────────────────┐
           │   TaskStore     │
           │   (SQLite)      │
           └─────────────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  Orchestrator   │
           │  (polls 3s)     │
           └─────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ Worker  │ │ Worker  │ │ Worker  │
   │Runner   │ │Runner   │ │Runner   │
   │(Claude) │ │(Kimi)   │ │(Claude) │
   └────┬────┘ └────┬────┘ └────┬────┘
        │           │           │
        └───────────┴───────────┘
                    │
                    ▼
           ┌─────────────────┐
           │ CompactionEngine│
           │ (extract key    │
           │  info from raw) │
           └─────────────────┘
                    │
                    ▼
           ┌─────────────────┐
           │   GateEngine    │
           │ (9 validation   │
           │  gates)         │
           └─────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
   ┌─────────┐           ┌─────────────┐
   │ PASS    │           │    FAIL     │
   │Advance  │           │ Return to   │
   │phase    │           │ worker      │
   └────┬────┘           └─────────────┘
        │
        ▼
 ┌──────────────┐
 │WorkflowEngine│
 │(next phase)  │
 └──────────────┘
        │
        ▼
 ┌──────────────┐
 │CheckpointMgr │
 │(save state)  │
 └──────────────┘
```

## Core Components

### 1. ChatSession (`packages/core/src/chat/chat-session.ts`)
- Manages Facu (PM) conversation via `claude --print` or `kimi --print`
- Restores history from SQLite on startup
- Injects checkpoint context if available
- Emits WebSocket events for real-time UI updates

### 2. Orchestrator (`packages/core/src/orchestrator/orchestrator.ts`)
- Polls TaskStore every 3 seconds for tasks in `assigned` status
- Spawns WorkerRunner instances (max 3 concurrent by default)
- Handles retries with exponential backoff
- Emits `worker_done`, `worker_error`, `worker_output` events

### 3. WorkerRunner (`packages/core/src/orchestrator/worker-runner.ts`)
- Spawns actual CLI process (Claude Code or Kimi Code) via node-pty
- Builds system prompt from: skill + knowledge base + agent memory + decisions + MCP + context
- Streams stdout via JSON lines to WebSocket
- Reports completion with raw output + token usage

### 4. ContextManager (`packages/core/src/context/context-manager.ts`)
- Reads `WORKSPACE.md` for project-level context
- Builds worker context from compacted previous task results
- Limits to 5 most relevant results, max 2000 chars each (or compacted version)

### 5. CompactionEngine (`packages/core/src/context/compaction-engine.ts`)
- Runs when worker completes
- Extracts: files changed, decisions, verification status, blockers
- Discards: raw tool output, reasoning traces, failed attempts
- Stores structured compact result in `task_compactions` table

### 6. GateEngine (`packages/core/src/persistence/gate-engine.ts`)
- 9 built-in gates: secret-scan, lint-test-build, blast-radius, dependency-audit, fast-review, browser-test, regression-test, panel-review, smoke-test
- Runs after task completion (or per workflow phase)
- Blocks advancement if required gate fails
- Auto-fix attempts for lint/test/build gates

### 7. WorkflowEngine (`packages/core/src/context/workflow-engine.ts`)
- 5 built-in templates: bug_fix, feature, quick_refinement, refactor, security_audit
- Auto-detects workflow type from user message keywords
- Auto-advances phases when current phase task completes
- Phase data stored in `workflow_instances.phase_data` JSON

### 8. TierEngine (`packages/core/src/context/tier-engine.ts`)
- Assigns Economy/Fast/Standard/Quality/Premium tier per role
- Infers tier from task complexity (Fibonacci scoring)
- Maps tier to provider: Economy/Fast → Kimi, Standard/Quality/Premium → Claude
- Tracks tier efficiency in performance metrics

### 9. CheckpointManager (`packages/core/src/context/checkpoint-manager.ts`)
- Saves workspace state every 30 seconds (debounced)
- Captures: summary, files touched, task status, active workers, workflow state, pending questions
- Restores context on server restart or workspace switch
- Exports markdown fallback to `.openteam/checkpoints/`

### 10. AgentMemory (`packages/core/src/persistence/agent-memory.ts`)
- Lessons Learned: what worked, what didn't
- Known Issues: tracked problems with severity and status
- Agent Failures: DLQ for failed delegations
- Injected into worker prompts before task execution

## Data Flow

```
User Message
    │
    ▼
ChatSession.sendMessage()
    │
    ├──▶ Facu (LLM) with system prompt + checkpoint context
    │
    ├──▶ MCP: create_task("Fix login bug")
    │
    ▼
TaskStore.create({ status: "backlog" })
    │
    ▼
Orchestrator.poll() detects status="assigned"
    │
    ▼
WorkerRunner.start()
    ├──▶ build system prompt (skill + knowledge + memory + decisions + MCP)
    ├──▶ build context (workspace + compacted previous results)
    ├──▶ spawn claude/kimi process
    ├──▶ stream output via WebSocket
    └──▶ on complete: save result, compact, run gates
    │
    ▼
GateEngine.runGates(taskId)
    ├──▶ lint-test-build ✅
    ├──▶ blast-radius ✅
    └──▶ fast-review ✅
    │
    ▼
WorkflowEngine.advancePhase()
    ├──▶ mark current phase done
    └──▶ create next phase task
    │
    ▼
CheckpointManager.saveCheckpoint()
    └──▶ persist state to SQLite
```

## Monorepo Structure

```
packages/
  core/       Business logic, persistence, orchestration
              No HTTP, no UI — pure TypeScript modules
  web/        Express server + WebSocket handler
              Thin layer: routes, middleware, WS events
  ui/         React + Vite SPA
              No business logic — calls APIs, renders state
  cli/        CLI entry point
              Parses args, starts server
  desktop/    Electron wrapper (scaffold)
```

## Key Design Decisions

1. **SQLite over PostgreSQL** — Single-file, zero-config, WAL mode for concurrency
2. **PTY over spawn** — Real terminal sessions preserve ANSI colors and interactive prompts
3. **Provider abstraction** — Claude and Kimi have different CLI flags but same interface
4. **Compaction over truncation** — Structured summaries instead of raw output limits
5. **Workspace isolation** — Each workspace has its own DB, config, and MCP servers
