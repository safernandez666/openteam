# Contributing to OpenTeam

Thank you for your interest in OpenTeam! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js** >= 22
- **pnpm** >= 9
- **Claude Code** or **Kimi Code** CLI installed (for local testing with real agents)

### Install Dependencies

```bash
git clone https://github.com/safernandez666/openteam.git
cd openteam
pnpm install
```

### Build All Packages

```bash
pnpm build
```

### Run Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Specific package
cd packages/core && pnpm test
```

### Start Development Server

```bash
# Start all packages in watch mode
pnpm dev

# Or start just the web server
pnpm start
```

Open http://localhost:4200

## Monorepo Structure

```
packages/
  core/       Business logic, SQLite, orchestration
              ├── src/persistence/    Database, stores
              ├── src/context/        Context managers (workflows, tiers, gates, checkpoints)
              ├── src/orchestrator/   Worker spawning, CLI adapters
              ├── src/chat/           PM chat session
              ├── src/skills/         Skill loader, marketplace, matrix
              └── src/mcp-server/     MCP integration

  web/        Express + WebSocket server
              ├── src/index.ts        API routes
              └── src/ws-handler.ts   Real-time events

  ui/         React + Vite SPA
              ├── src/App.tsx         Router
              ├── src/kanban/         Board, task detail
              ├── src/chat/           Chat panel
              ├── src/workflows/      Workflow UI
              ├── src/workers/        Team config
              └── src/dashboard/      Stats & doctor

  cli/        CLI entry point
              └── src/index.ts        Command parsing

  desktop/    Electron wrapper
              └── (scaffold)
```

**Rule of thumb:**
- `core` has zero dependencies on `web`, `ui`, or `cli`
- `web` depends on `core`
- `ui` depends on `web` APIs (HTTP + WS), never on `core` directly
- `cli` depends on `core` and `web`

## Adding a New Feature

### 1. Database Changes

If your feature needs new tables or columns:

1. Add migration in `packages/core/src/persistence/database.ts`
2. Increment `user_version` pragma
3. Add store methods in `packages/core/src/persistence/` (new file or existing)
4. Export from `packages/core/src/persistence/index.ts`
5. Re-export from `packages/core/src/index.ts`

Example:
```typescript
const MIGRATION_V16 = `
  CREATE TABLE IF NOT EXISTS new_feature (...);
`;

// In openDatabase():
if (version < 16) {
  db.exec(MIGRATION_V16);
  db.pragma("user_version = 16");
}
```

### 2. Core Logic

Add your engine/manager in `packages/core/src/context/` or `packages/core/src/orchestrator/`.

- Use TypeScript with explicit types
- Keep classes focused (single responsibility)
- Accept dependencies via constructor (dependency injection)
- Emit events via `EventEmitter` for async operations

### 3. API Endpoints

Add routes in `packages/web/src/index.ts`.

- Use RESTful patterns
- Return JSON with consistent error shapes: `{ error: "message" }`
- Validate inputs (prefer Zod if complex)

### 4. UI Components

Add React components in `packages/ui/src/`.

- Use functional components + hooks
- Keep business logic out of components — use custom hooks or API calls
- Follow existing CSS patterns (no new CSS framework)
- Dark theme only

### 5. Tests

Add tests in `*.test.ts` files next to the source.

- Use Vitest
- Mock external dependencies (CLI calls, filesystem)
- Test edge cases and error paths

## Code Style

- **TypeScript:** Strict mode enabled. No `any` without comment.
- **Formatting:** No Prettier config yet — follow existing patterns
- **Linting:** `pnpm lint` runs ESLint
- **Naming:**
  - Classes: `PascalCase`
  - Functions/variables: `camelCase`
  - Files: `kebab-case.ts`
  - Constants: `UPPER_SNAKE_CASE`

## Commit Messages

Follow conventional commits:

```
feat: add session checkpoint compaction
fix: resolve worker hang on SIGTERM
docs: update API reference for tiers
refactor: extract gate strategies into separate files
test: add coverage for workflow auto-advance
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes with tests
4. Ensure `pnpm lint` and `pnpm test` pass
5. Update relevant documentation (`README.md`, `docs/`, `CHANGELOG.md`)
6. Open a PR with clear description and screenshots if UI changes

## Debugging

### Facu (PM) not responding
- Check `~/.openteam/projects/<project>/workspaces/<ws>/chat_messages` table
- Verify Claude/Kimi CLI is installed: `which claude` / `which kimi`
- Check server logs for MCP errors

### Worker stuck
- Workers run in PTY sessions — they may hang on interactive prompts
- Check active processes: `ps aux | grep claude`
- Kill stale processes: `pkill -f "claude --print"`
- Retry the task via UI or API

### Database issues
- SQLite file: `~/.openteam/projects/<project>/workspaces/<ws>/openteam.db`
- Check schema version: `sqlite3 openteam.db "PRAGMA user_version;"`
- Backup before manual edits

### WebSocket not connecting
- Ensure server is running on port 4200
- Check browser console for WS errors
- Try hard refresh (Cmd+Shift+R)

## Architecture Decisions

When proposing changes that affect architecture:

1. Open an issue describing the problem
2. Discuss approach with maintainers
3. Document the decision in `docs/architecture.md` or as an ADR via the decisions API

## Questions?

- Open a GitHub issue for bugs or feature requests
- Check `docs/troubleshooting.md` for common problems
- Review existing code in the same area for patterns
