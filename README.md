<p align="center">
  <img src="screenshots/board.png" alt="OpenTeam Board" width="100%" />
</p>

<h1 align="center">OpenTeam</h1>

<p align="center">
  <strong>Your AI development team, ready to ship.</strong><br/>
  Spawn autonomous agents that write code, design UI, run tests, and review PRs — all orchestrated from a single dashboard.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#the-team">The Team</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#cli">CLI</a> &bull;
  <a href="#desktop-app">Desktop App</a>
</p>

---

## What is OpenTeam?

OpenTeam is an **AI agent orchestration framework** that gives you a virtual development team. Each agent is a real CLI session (Claude Code or Kimi Code) with role-specific expertise, modular skills, and MCP tool access.

You talk to **Facu** (the PM). He creates tasks, assigns them to the right agent, and they execute autonomously — with real-time output streaming to your browser.

No prompting. No copy-pasting. Just describe what you need and watch your team build it.

## Quick Start

```bash
# Install globally
npm install -g openteam-cli

# Or run directly
npx openteam-cli start
```

```bash
# From source
git clone https://github.com/safernandez666/openteam.git
cd openteam && pnpm install && pnpm build && pnpm start
```

Open **http://localhost:4200** and start chatting with Facu.

### Requirements

- Node.js >= 22
- pnpm >= 9 (for development)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Kimi Code](https://kimi.ai) CLI installed

## Features

### Project & Workspace Hierarchy

Organize your work as **Projects** (one per client or product) containing multiple **Workspaces** (one per area: API, Frontend, SIEM). Each workspace is fully isolated — its own database, team, skills, MCP servers, and chat history. Switch between workspaces at runtime without restarting the server.

### Kanban Board with Live Dashboard

Full-width kanban with drag & drop, search, and filters. Tasks update in real-time as workers complete them.

<p align="center">
  <img src="screenshots/board.png" alt="Board" width="90%" />
</p>

### AI Agent Team

Build your team from a catalog of 12 specialized roles. Each agent gets a unique avatar (DiceBear), an editable name, and an independent AI provider toggle. Mix Claude and Kimi in the same team for cross-model verification.

<p align="center">
  <img src="screenshots/workers.png" alt="Workers" width="90%" />
</p>

Double-click any name to edit. Click the avatar to randomize. Toggle between Claude and Kimi per agent with one click. The PM (Facu) is always present — the rest of the team is yours to compose.

### Skills Marketplace

Install skill packs from GitHub or create them inline. AI auto-categorizes each install. Assign any combination of skills to any agent — give your designer Tailwind + Figma knowledge, your developer React + Prisma expertise.

<p align="center">
  <img src="screenshots/skills.png" alt="Skills" width="90%" />
</p>

12 built-in skills covering all major roles. Add your own from any public GitHub repository.

### MCP Integration

Connect your agents to external tools via Model Context Protocol (MCP) — Chrome DevTools for UI testing, databases, APIs, and more. Quick Add lets you paste a GitHub URL or npm package name and it auto-configures. Each workspace has its own MCP configuration.

<p align="center">
  <img src="screenshots/mcp.png" alt="MCP" width="90%" />
</p>

### Chat with Facu

Natural conversation with your PM in any language. He creates tasks, checks status, manages the workspace context, and coordinates the team.

<p align="center">
  <img src="screenshots/chat.png" alt="Chat" width="90%" />
</p>

### And more...

- **Task dependencies & subtasks** with cycle detection
- **Error handling with automatic retry** (configurable max attempts)
- **Worker output streaming** in real-time
- **Knowledge base** with keyword-triggered document injection
- **Auto-updating WORKSPACE.md** — workers learn from each other
- **Session persistence** — chat survives server restarts
- **Drag & drop** kanban with toast notifications
- **Runtime hot-swap** — switch workspaces without server restart
- **Graceful shutdown** — SIGTERM/SIGINT stop workers cleanly
- **Token tracking** — input/output tokens per task, global counter on board
- **Workspace settings** — configure workDir, git repo, branch, provider per workspace
- **Desktop app** — Electron wrapper (scaffold ready)

## The Team

| Role | Default Name | What they do |
|------|-------------|-------------|
| PM | Facu | Coordinates the team, manages tasks, talks to you |
| Developer | Lucas | Writes code, implements features, fixes bugs |
| Architect | - | System design, ADRs, technology evaluation |
| API Designer | - | Route architecture, endpoint conventions |
| Data Engineer | - | ETL pipelines, scrapers, data processing |
| Designer | Sofia | UI/UX, interfaces, components, visual polish |
| Tester | Max | Tests, validation, quality assurance |
| Reviewer | Ana | Code review, security, performance |
| DevOps | - | CI/CD, Docker, deployments |
| Security | - | Auth, RLS, CSP, vulnerability management |
| Copywriter | - | UI microcopy, marketing text, docs |
| SEO | - | Meta tags, structured data, crawlability |
| Performance | - | Profiling, bundle size, Core Web Vitals |

All names are customizable. Each agent can independently use Claude Code or Kimi Code. New workspaces start with only the PM — you build the team you need.

## Architecture

```
You <-> Facu (PM Chat) <-> MCP Tools <-> TaskStore (SQLite)
                                              |
                                    Orchestrator (polls every 3s)
                                              |
                                    WorkerRunner (Claude/Kimi CLI)
                                              |
                                    PTY (pseudo-terminal)
```

**Monorepo structure:**

```
packages/
  core/       SQLite, TaskStore, Orchestrator, SkillLoader, McpManager, KnowledgeBase
  web/        Express + WebSocket server, all API routes
  ui/         React + Vite (Board, Workers, Skills, MCP, Chat, Projects)
  cli/        CLI entry point (openteam command)
  desktop/    Electron wrapper (scaffold)
```

## Configuration

**Global** (shared across all projects and workspaces) in `~/.openteam/`:

| File | Purpose |
|------|---------|
| `skills/` | Role prompts (built-in + user-installed) |
| `skills/modules/` | Modular skills from marketplace |
| `skills/role-skills.json` | Skill-to-role assignments |
| `marketplace.json` | User-curated skill catalog |

**Per workspace** in `~/.openteam/projects/<project>/workspaces/<workspace>/`:

| File | Purpose |
|------|---------|
| `openteam.db` | Tasks, chat history, updates |
| `WORKSPACE.md` | Project context for all workers |
| `project-config.json` | Working directory, repo, branch, provider |
| `team.json` | Team composition (roles + names + providers) |
| `agent-config.json` | Agent names, providers, avatar seeds |
| `knowledge/` | Docs with `read_when` keyword injection |
| `mcp-servers.json` | MCP server configurations |

## Skills System

**Roles** are base agent prompts. **Modules** are reusable knowledge blocks.

```bash
# Install from GitHub
openteam skills add https://github.com/user/skill-repo

# Or from the UI: Skills Marketplace > "+ From GitHub"
```

### Knowledge Base

Create `.md` files in the workspace's `knowledge/` directory:

```markdown
---
read_when: auth, login, session, jwt
---

Our auth uses NextAuth.js v5 with JWT strategy.
Always use the `auth()` helper, never read cookies directly.
```

When a task matches any keyword, the doc is automatically injected into the worker's prompt.

## CLI

```bash
openteam start                    # Start server on port 4200
openteam tasks                    # List all tasks
openteam tasks --status backlog   # Filter by status
openteam task create "title"      # Create a task
openteam task create "Fix bug" -p high -a worker -r developer
openteam task update T-5 -s done  # Update task status
openteam skills                   # List skills
openteam skills add <url>         # Install from GitHub
openteam skills remove <name>     # Remove a skill
openteam context                  # Show WORKSPACE.md
openteam context set <file>       # Set project context
openteam status                   # System status
```

The CLI automatically resolves the active workspace DB — modern project hierarchy, legacy workspace path, or global fallback.

## Multi-Provider Support

OpenTeam supports both **Claude Code** and **Kimi Code** as AI providers. You can:

- Set a default provider per project (Settings)
- Override per agent (Workers panel)
- Mix providers for cross-model verification

This means Lucas can write code with Claude while Ana reviews it with Kimi — diversity of perspective built into your workflow.

## Desktop App

An Electron-based desktop app is included as a scaffold in `packages/desktop/`. It embeds the web server and opens a native window.

```bash
cd packages/desktop
pnpm install
pnpm approve-builds   # Allow Electron native builds
pnpm rebuild           # Rebuild native modules for Electron
pnpm dev               # Launch the desktop app
```

Package for distribution:

```bash
pnpm dist              # Build .dmg (macOS), .exe (Windows), .AppImage (Linux)
```

## Deployment

```bash
# npm (global install)
npm install -g openteam-cli && openteam start

# Docker
docker build -t openteam . && docker run -p 4200:4200 openteam

# From source
git clone https://github.com/safernandez666/openteam.git
cd openteam && pnpm install && pnpm build && pnpm start
```

## Tech Stack

- **Runtime:** Node.js 22+ / TypeScript
- **Database:** SQLite (better-sqlite3, WAL mode)
- **Server:** Express 5 + WebSocket (ws)
- **UI:** React 19 + Vite 6
- **AI:** Claude Code CLI / Kimi Code CLI via PTY
- **Desktop:** Electron 35
- **Build:** tsup + Vite, pnpm workspaces
- **Tests:** Vitest (81 tests across 9 files)

## License

[MIT](LICENSE)

---

<p align="center">
  Built with Claude Code + Kimi Code
</p>
