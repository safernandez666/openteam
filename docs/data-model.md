# Data Model

OpenTeam uses **SQLite** with WAL mode (`better-sqlite3`). Schema version: **v15**.

## Entity Relationship Diagram

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│     tasks       │◄──────┤ task_dependencies │──────►│     tasks       │
│  (primary)      │       │   (junction)     │       │  (depends_on)   │
└────────┬────────┘       └──────────────────┘       └─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  task_updates   │       │ task_compactions│       │task_tier_assign.│
└─────────────────┘       └─────────────────┘       └─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐       ┌─────────────────┐
│ gate_executions │       │workflow_instances│
└─────────────────┘       └────────┬────────┘
                                   │
                                   │ N:1
                                   ▼
                          ┌─────────────────┐
                          │workflow_templates│
                          └─────────────────┘

┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│lessons_learned  │       │  known_issues   │       │ agent_failures  │
└─────────────────┘       └─────────────────┘       └─────────────────┘

┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│performance_events│      │ session_checkpts│       │    decisions    │
└─────────────────┘       └─────────────────┘       └─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│  chat_messages  │       │   team_updates  │
└─────────────────┘       └─────────────────┘
```

## Tables

### `tasks` — Core task entity
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | Unique task ID (e.g., `T-42`) |
| `title` | TEXT | Task title |
| `description` | TEXT | Detailed description |
| `status` | TEXT | `backlog`, `assigned`, `in_progress`, `blocked`, `review`, `done`, `rejected` |
| `assignee` | TEXT | Who is assigned (usually `worker`) |
| `role` | TEXT | Agent role: `developer`, `tester`, etc. |
| `priority` | TEXT | `urgent`, `high`, `normal`, `low` |
| `depends_on` | TEXT | FK to another task (soft reference) |
| `parent_id` | TEXT | FK for subtasks |
| `result` | TEXT | Raw worker output |
| `retry_count` | INTEGER | Current retry attempt |
| `max_retries` | INTEGER | Configurable max (default 3) |
| `last_error` | TEXT | Last error message |
| `input_tokens` | INTEGER | Input tokens used |
| `output_tokens` | INTEGER | Output tokens used |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

### `task_dependencies` — Many-to-many task dependencies
| Column | Type | Notes |
|--------|------|-------|
| `task_id` | TEXT FK | The task that depends |
| `depends_on_id` | TEXT FK | The task it depends on |
| `created_at` | TEXT | Timestamp |

### `task_compactions` — Structured worker output summaries
| Column | Type | Notes |
|--------|------|-------|
| `task_id` | TEXT PK FK | References tasks |
| `files_changed` | TEXT JSON | Array of file paths |
| `decisions` | TEXT JSON | Array of key decisions |
| `verification` | TEXT JSON | `{lint, types, tests, build}` booleans |
| `blockers` | TEXT JSON | Array of blocker descriptions |
| `compact_text` | TEXT | Full compact markdown |
| `created_at` | TEXT | Timestamp |

### `task_tier_assignments` — Tier per task
| Column | Type | Notes |
|--------|------|-------|
| `task_id` | TEXT PK FK | References tasks |
| `assigned_tier` | TEXT | `economy`, `fast`, `standard`, `quality`, `premium` |
| `inferred_score` | INTEGER | Fibonacci complexity score (1,2,3,5,8,13) |
| `override_reason` | TEXT | Why this tier was chosen |
| `created_at` | TEXT | Timestamp |

### `workflow_templates` — Workflow definitions
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `bug_fix`, `feature`, `refactor`, etc. |
| `name` | TEXT | Human-readable name |
| `description` | TEXT | What this workflow does |
| `category` | TEXT | Classification |
| `phases` | TEXT JSON | Array of phase objects |
| `is_builtin` | INTEGER | 1 = protected, 0 = custom |
| `is_editable` | INTEGER | 1 = can edit |
| `created_at` | TEXT | Timestamp |
| `updated_at` | TEXT | Timestamp |

**Phase object schema:**
```json
{
  "index": 0,
  "name": "Triage & Reproduce",
  "role": "pm",
  "description": "...",
  "exit_criteria": ["Bug confirmed", "Severity assessed"],
  "task_title_template": "[Triage] {description}"
}
```

### `workflow_instances` — Running workflow state
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | Auto-generated (e.g., `WF-1`) |
| `template_id` | TEXT FK | References workflow_templates |
| `root_task_id` | TEXT | Original task that triggered workflow |
| `status` | TEXT | `running`, `paused`, `completed`, `failed` |
| `current_phase` | INTEGER | Index of active phase |
| `phase_data` | TEXT JSON | Per-phase state: `{ "0": { "startedAt": "...", "taskId": "T-1" } }` |
| `created_at` | TEXT | Timestamp |
| `updated_at` | TEXT | Timestamp |

### `gate_definitions` — Validation gate configs
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `secret-scan`, `lint-test-build`, etc. |
| `name` | TEXT | Machine name |
| `display_name` | TEXT | Human name |
| `description` | TEXT | What it checks |
| `category` | TEXT | `security`, `quality`, `testing`, `review` |
| `is_builtin` | INTEGER | 1 = system gate |
| `is_enabled` | INTEGER | Can toggle on/off |
| `config` | TEXT JSON | Thresholds, commands, overrides |
| `created_at` | TEXT | Timestamp |

### `gate_executions` — Gate run history
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `task_id` | TEXT FK | References tasks |
| `gate_id` | TEXT FK | References gate_definitions |
| `phase_index` | INTEGER | Which workflow phase (null = standalone) |
| `status` | TEXT | `pending`, `running`, `passed`, `failed`, `skipped`, `blocked` |
| `output` | TEXT | stdout/stderr from gate |
| `duration_ms` | INTEGER | How long it took |
| `triggered_at` | TEXT | Start timestamp |
| `completed_at` | TEXT | End timestamp |

### `performance_events` — Analytics data
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `type` | TEXT | `task`, `gate`, `workflow`, `session` |
| `agent_role` | TEXT | Which role performed |
| `agent_name` | TEXT | Named agent instance |
| `task_id` | TEXT FK | Related task |
| `task_category` | TEXT | Workflow category or custom |
| `outcome` | TEXT | `success`, `failure`, `retry` |
| `duration_ms` | INTEGER | Wall-clock time |
| `input_tokens` | INTEGER | LLM input tokens |
| `output_tokens` | INTEGER | LLM output tokens |
| `retries` | INTEGER | Retry count |
| `created_at` | TEXT | Timestamp |

### `session_checkpoints` — Session state snapshots
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `workspace_id` | TEXT | Which workspace |
| `summary` | TEXT | Human-readable session summary |
| `files_touched` | TEXT JSON | Array of `{path, action, timestamp}` |
| `task_status` | TEXT JSON | Array of `{taskId, title, status, role}` |
| `active_workers` | TEXT JSON | Array of `{taskId, role, name, startedAt}` |
| `workflow_state` | TEXT JSON | Active workflow instance data |
| `resume_instructions` | TEXT | How to resume |
| `pending_questions` | TEXT JSON | User questions awaiting answers |
| `chat_summary` | TEXT | Condensed conversation |
| `context_version` | INTEGER | Schema version |
| `is_active` | INTEGER | 1 = current session |
| `created_at` | TEXT | Timestamp |
| `updated_at` | TEXT | Timestamp |

### `worker_tiers` — Model tier per role per workspace
| Column | Type | Notes |
|--------|------|-------|
| `workspace_id` | TEXT | Part of PK |
| `role_id` | TEXT | Part of PK |
| `tier` | TEXT | `economy`, `fast`, `standard`, `quality`, `premium` |
| `provider` | TEXT | Override provider (null = inherit) |
| `created_at` | TEXT | Timestamp |
| `updated_at` | TEXT | Timestamp |

### `decisions` — Architecture Decision Records
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `title` | TEXT | Decision title |
| `context` | TEXT | Problem being solved |
| `decision` | TEXT | What was chosen |
| `consequences` | TEXT | Trade-offs |
| `status` | TEXT | `proposed`, `accepted`, `deprecated`, `superseded` |
| `superseded_by` | INTEGER FK | Newer decision that replaces this |
| `created_at` | TEXT | Timestamp |
| `updated_at` | TEXT | Timestamp |

### `lessons_learned` — Agent memory: successes
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `category` | TEXT | `general`, `framework`, `testing`, etc. |
| `title` | TEXT | Short description |
| `description` | TEXT | Full lesson |
| `severity` | TEXT | `info`, `warning`, `critical` |
| `source_task` | TEXT | Which task taught this |
| `created_at` | TEXT | Timestamp |

### `known_issues` — Agent memory: tracked problems
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `title` | TEXT | Issue summary |
| `description` | TEXT | Details |
| `severity` | TEXT | `low`, `medium`, `high`, `critical` |
| `status` | TEXT | `open`, `resolved`, `wont_fix` |
| `root_cause` | TEXT | Why it happens |
| `workaround` | TEXT | How to avoid it |
| `created_at` | TEXT | Timestamp |
| `updated_at` | TEXT | Timestamp |

### `agent_failures` — Dead Letter Queue
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `task_id` | TEXT | Failed task |
| `agent_role` | TEXT | Which role failed |
| `agent_name` | TEXT | Named instance |
| `error` | TEXT | Error message |
| `output` | TEXT | Full output at failure |
| `status` | TEXT | `unresolved`, `resolved`, `ignored` |
| `resolution` | TEXT | How it was fixed |
| `created_at` | TEXT | Timestamp |
| `resolved_at` | TEXT | Timestamp |

### `chat_messages` — PM conversation history
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `role` | TEXT | `user` or `assistant` |
| `content` | TEXT | Message content |
| `created_at` | TEXT | Timestamp |

## Indexes

```sql
-- Performance
CREATE INDEX idx_perf_role ON performance_events(agent_role);
CREATE INDEX idx_perf_outcome ON performance_events(outcome);
CREATE INDEX idx_task_deps_task ON task_dependencies(task_id);
CREATE INDEX idx_task_deps_dep ON task_dependencies(depends_on_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_checkpoints_workspace ON session_checkpoints(workspace_id);
CREATE INDEX idx_checkpoints_active ON session_checkpoints(is_active);
```

## Schema Migrations

Migrations are sequential and cumulative in `packages/core/src/persistence/database.ts`:

| Version | What was added |
|---------|---------------|
| v1 | tasks, task_updates, team_updates |
| v2 | tasks.role |
| v3 | tasks.result |
| v4 | tasks.parent_id, task_dependencies |
| v5 | tasks.retry_count, max_retries, last_error |
| v6 | chat_messages |
| v7 | tasks.input_tokens, output_tokens |
| v8 | lessons_learned, known_issues, agent_failures |
| v9 | performance_events |
| v10 | decisions |
| v11 | workflow_templates, workflow_instances |
| v12 | gate_definitions, workflow_phase_gates, gate_executions |
| v13 | session_checkpoints |
| v14 | worker_tiers, task_tier_assignments |
| v15 | task_compactions |
