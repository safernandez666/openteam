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

  return db;
}
