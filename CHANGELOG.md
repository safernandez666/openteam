# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-19

### Added

- **Desktop app scaffold** (`packages/desktop/`): Electron wrapper that embeds `@openteam/web` server and opens a BrowserWindow to `localhost:4200`. Includes `electron-builder.yml` for mac/win/linux packaging, secure preload with `contextIsolation: true`, and `electron-rebuild` script for native modules (`better-sqlite3`, `node-pty`).
- **Runtime workspace hot-swap**: `PUT /api/active` and `PUT /api/workspaces/active` now recreate the orchestrator with fresh `state.*` references after switching workspaces, eliminating the need for server restarts.
- **Orchestrator listener extraction**: Orchestrator event subscriptions (`task_updated`, `workers_changed`, `worker_output`, `worker_done`) extracted into `attachOrchestratorListeners()` for reuse during hot-swap.
- **Graceful shutdown**: `SIGTERM` and `SIGINT` handlers stop the orchestrator and close the HTTP server before exiting.
- **Orchestrator `setProvider()` method**: Public method to update the orchestrator's provider at runtime without recreating it.
- **CLI `resolveDbPath()` module** (`packages/cli/src/resolve-db-path.ts`): Extracted as a standalone, testable function that resolves the active workspace DB path.
- **Test suite expansion**: Added tests for web endpoints (health, project config, hot-swap), orchestrator lifecycle (`setProvider`, `stop` idempotency, timer cleanup), and CLI DB path resolution (modern, legacy, fallback, malformed JSON, priority). Total: 81 tests across 9 files.

### Changed

- **WS handler uses getter deps**: `createWsHandler()` now receives a `deps` object with getter functions (`getTaskStore`, `getSkillLoader`, `getDb`, `getActiveWs`, `getProvider`) instead of captured values, ensuring it always reads current workspace state after hot-swap.
- **CLI workspace resolution**: CLI commands (`tasks`, `skills`, `context`, `status`) now resolve the DB path through the project hierarchy (`active-project.json` -> modern path, `active-workspace.json` -> legacy path, fallback to `~/.openteam/openteam.db`). Skills and context directories are derived from `dirname(DB_PATH)` instead of the global `DATA_DIR`.
- **Marketplace AI analysis is non-blocking**: Replaced `execSync` with async `exec` from `node:child_process` in `POST /api/marketplace/add`, preventing the server from blocking during AI skill categorization.
- **Provider propagation to orchestrator**: `PUT /api/project` now calls `orchestrator.setProvider()` in addition to `wsHandler.setProvider()`, ensuring new workers use the updated provider.
- **UI workspace switching without reload**: `handleSwitchWorkspace` and `handleCreateWorkspace` in `App.tsx` replaced `window.location.reload()` with `await refreshWorkspaces()`.

### Fixed

- **Memory leak in `workerInfoMap`**: Completed and errored worker entries are now automatically removed from `workerInfoMap` after 60 seconds via `setTimeout`.
- **Map iteration bug in `Orchestrator.stop()`**: Replaced direct iteration + deletion on `this.activeWorkers` with iteration over a copy (`new Map(...)`) followed by `.clear()`, preventing skipped entries during shutdown.
- **Stale provider reference in marketplace**: `POST /api/marketplace/add` was reading from a `const project` captured at startup. Now reads `state.projectConfig.get().provider` for the current value.
- **Redundant 2-second polling removed**: Eliminated the `setInterval` that polled `taskStore.list()` every 2 seconds and diffed via `JSON.stringify`. Task updates are now driven solely by orchestrator `task_updated` events.
