import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof import("better-sqlite3");

type BetterSqlite3Database = import("better-sqlite3").Database;

const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'backlog',
    assignee    TEXT DEFAULT NULL,
    priority    TEXT NOT NULL DEFAULT 'normal',
    depends_on  TEXT DEFAULT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_updates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    TEXT NOT NULL REFERENCES tasks(id),
    agent      TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS team_updates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    agent      TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const MIGRATION_V2 = `
  ALTER TABLE tasks ADD COLUMN role TEXT DEFAULT NULL;
`;

const MIGRATION_V3 = `
  ALTER TABLE tasks ADD COLUMN result TEXT DEFAULT NULL;
`;

const MIGRATION_V4 = `
  ALTER TABLE tasks ADD COLUMN parent_id TEXT DEFAULT NULL REFERENCES tasks(id);

  CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id       TEXT NOT NULL REFERENCES tasks(id),
    depends_on_id TEXT NOT NULL REFERENCES tasks(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (task_id, depends_on_id)
  );

  CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
  CREATE INDEX IF NOT EXISTS idx_task_deps_dep ON task_dependencies(depends_on_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
`;

const MIGRATION_V5 = `
  ALTER TABLE tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE tasks ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3;
  ALTER TABLE tasks ADD COLUMN last_error TEXT DEFAULT NULL;
`;

const MIGRATION_V6 = `
  CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const MIGRATION_V7 = `
  ALTER TABLE tasks ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE tasks ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0;
`;

const MIGRATION_V8 = `
  CREATE TABLE IF NOT EXISTS lessons_learned (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT NOT NULL DEFAULT 'general',
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    severity    TEXT NOT NULL DEFAULT 'info',
    source_task TEXT DEFAULT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS known_issues (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    severity    TEXT NOT NULL DEFAULT 'medium',
    status      TEXT NOT NULL DEFAULT 'open',
    root_cause  TEXT DEFAULT NULL,
    workaround  TEXT DEFAULT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_failures (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL,
    agent_role  TEXT DEFAULT NULL,
    agent_name  TEXT DEFAULT NULL,
    error       TEXT NOT NULL,
    output      TEXT DEFAULT NULL,
    status      TEXT NOT NULL DEFAULT 'unresolved',
    resolution  TEXT DEFAULT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT DEFAULT NULL
  );
`;

const MIGRATION_V9 = `
  CREATE TABLE IF NOT EXISTS performance_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT NOT NULL,
    agent_role    TEXT NOT NULL,
    agent_name    TEXT DEFAULT NULL,
    task_id       TEXT DEFAULT NULL,
    task_category TEXT DEFAULT NULL,
    outcome       TEXT NOT NULL DEFAULT 'success',
    duration_ms   INTEGER DEFAULT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    retries       INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_perf_role ON performance_events(agent_role);
  CREATE INDEX IF NOT EXISTS idx_perf_outcome ON performance_events(outcome);
`;

const MIGRATION_V10 = `
  CREATE TABLE IF NOT EXISTS decisions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    context         TEXT NOT NULL DEFAULT '',
    decision        TEXT NOT NULL DEFAULT '',
    consequences    TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'accepted',
    superseded_by   INTEGER DEFAULT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const MIGRATION_V11 = `
  CREATE TABLE IF NOT EXISTS workflow_templates (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    category    TEXT NOT NULL,
    phases      TEXT NOT NULL,
    is_builtin  INTEGER NOT NULL DEFAULT 1,
    is_editable INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workflow_instances (
    id             TEXT PRIMARY KEY,
    template_id    TEXT NOT NULL,
    root_task_id   TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'running',
    current_phase  INTEGER NOT NULL DEFAULT 0,
    phase_data     TEXT NOT NULL DEFAULT '{}',
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const MIGRATION_V12 = `
  CREATE TABLE IF NOT EXISTS gate_definitions (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description  TEXT NOT NULL,
    category     TEXT NOT NULL,
    is_builtin   INTEGER NOT NULL DEFAULT 1,
    is_enabled   INTEGER NOT NULL DEFAULT 1,
    config       TEXT NOT NULL DEFAULT '{}',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workflow_phase_gates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id     TEXT NOT NULL,
    phase_index     INTEGER NOT NULL,
    gate_id         TEXT NOT NULL,
    is_required     INTEGER NOT NULL DEFAULT 1,
    config_override TEXT DEFAULT NULL,
    execution_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS gate_executions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id            TEXT NOT NULL,
    gate_id            TEXT NOT NULL,
    phase_index        INTEGER DEFAULT NULL,
    status             TEXT NOT NULL DEFAULT 'pending',
    output             TEXT DEFAULT NULL,
    duration_ms        INTEGER DEFAULT NULL,
    triggered_at       TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at       TEXT DEFAULT NULL
  );
`;

const MIGRATION_V13 = `
  CREATE TABLE IF NOT EXISTS session_checkpoints (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id        TEXT NOT NULL,
    summary             TEXT NOT NULL DEFAULT '',
    task_status         TEXT NOT NULL DEFAULT '[]',
    active_workers      TEXT NOT NULL DEFAULT '[]',
    workflow_state      TEXT DEFAULT NULL,
    resume_instructions TEXT NOT NULL DEFAULT '',
    chat_summary        TEXT NOT NULL DEFAULT '',
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_checkpoints_workspace ON session_checkpoints(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_checkpoints_active ON session_checkpoints(is_active);
`;

const MIGRATION_V14 = `
  CREATE TABLE IF NOT EXISTS worker_tiers (
    role_id       TEXT PRIMARY KEY,
    tier          TEXT NOT NULL DEFAULT 'standard',
    provider      TEXT DEFAULT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const MIGRATION_V15 = `
  CREATE TABLE IF NOT EXISTS task_compactions (
    task_id       TEXT PRIMARY KEY,
    files_changed TEXT NOT NULL DEFAULT '[]',
    decisions     TEXT NOT NULL DEFAULT '[]',
    verification  TEXT NOT NULL DEFAULT '{}',
    blockers      TEXT NOT NULL DEFAULT '[]',
    compact_text  TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export function openDatabase(dbPath: string): BetterSqlite3Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const version = db.pragma("user_version", { simple: true }) as number;
  if (version < 1) {
    db.exec(SCHEMA_V1);
    db.pragma("user_version = 1");
  }
  if (version < 2) {
    db.exec(MIGRATION_V2);
    db.pragma("user_version = 2");
  }
  if (version < 3) {
    db.exec(MIGRATION_V3);
    db.pragma("user_version = 3");
  }
  if (version < 4) {
    db.exec(MIGRATION_V4);
    db.pragma("user_version = 4");
  }
  if (version < 5) {
    db.exec(MIGRATION_V5);
    db.pragma("user_version = 5");
  }
  if (version < 6) {
    db.exec(MIGRATION_V6);
    db.pragma("user_version = 6");
  }
  if (version < 7) {
    db.exec(MIGRATION_V7);
    db.pragma("user_version = 7");
  }
  if (version < 8) {
    db.exec(MIGRATION_V8);
    db.pragma("user_version = 8");
  }
  if (version < 9) {
    db.exec(MIGRATION_V9);
    db.pragma("user_version = 9");
  }
  if (version < 10) {
    db.exec(MIGRATION_V10);
    db.pragma("user_version = 10");
  }
  if (version < 11) {
    db.exec(MIGRATION_V11);
    db.pragma("user_version = 11");
  }
  if (version < 12) {
    db.exec(MIGRATION_V12);
    db.pragma("user_version = 12");
  }
  if (version < 13) {
    db.exec(MIGRATION_V13);
    db.pragma("user_version = 13");
  }
  if (version < 14) {
    db.exec(MIGRATION_V14);
    db.pragma("user_version = 14");
  }
  if (version < 15) {
    db.exec(MIGRATION_V15);
    db.pragma("user_version = 15");
  }

  return db;
}
