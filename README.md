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
  <a href="#cli">CLI</a>
</p>

---

## What is OpenTeam?

OpenTeam is an **AI agent orchestration framework** that gives you a virtual development team. Each agent is a real CLI session (Claude Code or Kimi Code) with role-specific expertise, modular skills, and MCP tool access.

You talk to **Clara** (the PM). She creates tasks, assigns them to the right agent, and they execute autonomously — with real-time output streaming to your browser.

No prompting. No copy-pasting. Just describe what you need and watch your team build it.

## Quick Start

```bash
# Clone and install
git clone https://github.com/safernandez666/openteam.git
cd openteam && pnpm install

# Build and run
pnpm build && pnpm start
```

Open **http://localhost:4200** and start chatting with Clara.

### Requirements

- Node.js >= 20
- pnpm >= 9
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Kimi Code](https://kimi.ai) CLI installed

## Features

### Kanban Board with Live Dashboard

Full-width kanban with drag & drop, search, and filters. The dashboard shows completion percentage, tasks by role with progress bars, active workers, and recent activity — all updating in real-time.

<p align="center">
  <img src="screenshots/board.png" alt="Board" width="90%" />
</p>

### AI Agent Team

Five agents with unique avatars, editable names, and independent AI provider selection. Each agent can run on Claude or Kimi — mix providers for cross-model verification.

<p align="center">
  <img src="screenshots/workers.png" alt="Workers" width="90%" />
</p>

Double-click any name to edit it. Toggle between Claude and Kimi per agent with one click.

### Modular Skills

Install skills from GitHub or create them inline. Assign any combination of skills to any agent — give your designer Tailwind + Figma knowledge, your developer React + Prisma expertise.

<p align="center">
  <img src="screenshots/skills.png" alt="Skills" width="90%" />
</p>

8 built-in skills: React, Tailwind, Next.js, Figma, Vitest, Prisma, Docker, PostgreSQL.

### MCP Integration

Connect your agents to external tools — Chrome DevTools for UI testing, databases, APIs, and more. Each workspace has its own MCP configuration.

<p align="center">
  <img src="screenshots/mcp.png" alt="MCP" width="90%" />
</p>

### Chat with Clara

Natural conversation with your PM. She creates tasks, checks status, manages the workspace context, and coordinates the team — all in your language.

<p align="center">
  <img src="screenshots/chat.png" alt="Chat" width="90%" />
</p>

### Multi-Workspace

Each client or project gets its own isolated workspace with separate database, skills, MCP servers, and team configuration. Switch between projects instantly.

### And more...

- **Task dependencies & subtasks** with cycle detection
- **Error handling with automatic retry** (configurable max attempts)
- **Worker output streaming** in real-time
- **Knowledge base** with keyword-triggered document injection
- **Auto-updating WORKSPACE.md** — workers learn from each other
- **Session persistence** — chat survives server restarts
- **Drag & drop** kanban with toast notifications

## The Team

| Avatar | Name | Role | What they do |
|--------|------|------|-------------|
| Clara | PM | Project Manager | Coordinates the team, manages tasks, talks to you |
| Lucas | Developer | Code & Features | Writes code, implements features, fixes bugs |
| Sofia | Designer | UI/UX | Designs interfaces, components, visual polish |
| Max | Tester | Quality | Writes tests, validates behavior, ensures quality |
| Ana | Reviewer | Code Review | Reviews for security, performance, correctness |

All names are customizable. Each agent can independently use Claude Code or Kimi Code.

## Architecture

```
You <-> Clara (PM Chat) <-> MCP Tools <-> TaskStore (SQLite)
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
  core/     SQLite, TaskStore, Orchestrator, SkillLoader, McpManager, KnowledgeBase
  web/      Express + WebSocket server
  ui/       React + Vite (Board, Workers, Skills, MCP, Chat)
  cli/      CLI entry point
```

## Configuration

Each workspace stores its config in `~/.openteam/workspaces/<name>/`:

| File | Purpose |
|------|---------|
| `openteam.db` | Tasks, chat history, updates |
| `WORKSPACE.md` | Project context for all workers |
| `project-config.json` | Working directory, repo, branch, provider |
| `agent-config.json` | Agent names and per-agent provider |
| `skills/` | User-installed role prompts |
| `skills/modules/` | Modular skills |
| `skills/role-skills.json` | Skill-to-role assignments |
| `knowledge/` | Docs with `read_when` keyword injection |
| `mcp-servers.json` | MCP server configurations |

## Skills System

**Roles** are base agent prompts. **Modules** are reusable knowledge blocks.

```bash
# Install from GitHub
openteam skills add https://github.com/user/skill-repo

# Or from the UI: Skills > "+ From GitHub"
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
openteam task create "title"      # Create a task
openteam skills                   # List skills
openteam skills add <url>         # Install from GitHub
openteam status                   # System status
```

## Multi-Provider Support

OpenTeam supports both **Claude Code** and **Kimi Code** as AI providers. You can:

- Set a default provider per workspace (Settings)
- Override per agent (Workers panel)
- Mix providers for cross-model verification

This means Lucas can write code with Claude while Ana reviews it with Kimi — diversity of perspective built into your workflow.

## Deployment

```bash
# npm (after publishing)
npm install -g @openteam/cli && openteam start

# Docker
docker build -t openteam . && docker run -p 4200:4200 openteam

# From source
pnpm install && pnpm build && pnpm start
```

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Database:** SQLite (better-sqlite3, WAL mode)
- **Server:** Express + WebSocket (ws)
- **UI:** React + Vite
- **AI:** Claude Code CLI / Kimi Code CLI via PTY
- **Build:** tsup + Vite, pnpm workspaces
- **Tests:** Vitest (64 tests)

## License

MIT

---

<p align="center">
  Built with Claude Code + Kimi Code
</p>
