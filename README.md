# OpenTeam

AI-powered development team orchestrator. OpenTeam spawns a team of AI agents — each a real Claude Code CLI session — that collaborate to build your project.

You talk to **Clara** (the PM), she creates tasks, assigns them to specialized workers (**Lucas** the developer, **Sofia** the designer, **Max** the tester, **Ana** the reviewer), and they execute autonomously with real-time output streaming.

## Features

- **Kanban Board** — visual task management with stats dashboard
- **AI Workers** — autonomous Claude Code sessions with role-specific prompts
- **Skills System** — modular skills (React, Tailwind, Prisma, etc.) assignable to any agent
- **MCP Integration** — connect workers to Chrome DevTools, databases, APIs
- **Knowledge Base** — docs with selective keyword injection into worker prompts
- **Subtasks & Dependencies** — task hierarchies with cycle detection and auto-unblock
- **Error Handling** — automatic retry with configurable max attempts
- **Session Persistence** — chat history survives server restarts
- **Live Streaming** — watch worker output in real-time

## Requirements

- **Node.js** >= 20
- **pnpm** >= 9
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- **Anthropic API key** — set `ANTHROPIC_API_KEY` in your environment

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/openteam.git
cd openteam

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the server
pnpm start
```

Open http://localhost:4200 in your browser.

## Quick Start

1. **Start the server** with `pnpm start`
2. **Open the UI** at http://localhost:4200
3. **Chat with Clara** — describe your project, she'll set up the WORKSPACE.md
4. **Ask Clara to create tasks** — "Create a task for Lucas to build a REST API for users"
5. **Watch the board** — tasks move through Backlog > Assigned > In Progress > Done
6. **See live output** — go to Workers tab to watch agents work in real-time

### Example conversation

```
You: "We're building a Next.js app with Prisma and PostgreSQL. 
      Create a task for Lucas to set up the project structure."

Clara: "Got it! I've set up the workspace context and created a task:
        T-1: Set up Next.js project structure (assigned to Lucas, developer)
        Lucas will get started right away!"
```

## Project Structure

```
openteam/
  packages/
    core/          # Database, TaskStore, Orchestrator, SkillLoader, MCP, Context
    web/           # Express + WebSocket server
    ui/            # React (Vite) — Board, Workers, Skills, MCP, Chat
    cli/           # CLI tool
```

## Architecture

```
User <-> Chat (Clara/PM) <-> MCP Tools <-> TaskStore (SQLite)
                                              |
                                    Orchestrator (polls every 3s)
                                              |
                                    WorkerRunner (Claude CLI)
                                              |
                                    PTY (pseudo-terminal)
```

- **Clara (PM)** receives messages via chat, creates/manages tasks using MCP tools
- **Orchestrator** picks up assigned tasks, checks dependencies, spawns workers
- **Workers** are Claude Code CLI sessions with role prompts + skills + knowledge + MCP config
- **Results** flow back through WebSocket to the UI in real-time

## Configuration

All config is stored in `~/.openteam/`:

| File | Purpose |
|------|---------|
| `openteam.db` | SQLite database (tasks, chat, updates) |
| `WORKSPACE.md` | Project context injected into all workers |
| `skills/` | User-installed role prompts |
| `skills/modules/` | Modular skills assignable to agents |
| `skills/role-skills.json` | Which modules are assigned to which role |
| `knowledge/` | Knowledge docs with `read_when` keyword injection |
| `mcp-servers.json` | MCP server configurations |
| `agent-names.json` | Custom names for agents |
| `project-config.json` | Project directory and repo settings |
| `events.ndjson` | Event log |

## UI Views

### Board
Full-width Kanban with stats bar showing total tasks, completion percentage, active workers, and blocked items.

### Workers
Team roster showing all agents (Sofia, Lucas, Ana, Max, Clara) with their status. Click any agent to edit their system prompt and assign modular skills.

### Skills
Library of modular skills. Install from GitHub or create inline. Assign to any agent.

### MCP
Manage MCP servers (Chrome DevTools, databases, APIs). Workers automatically receive MCP tools.

### Chat
Full conversation with Clara. Messages persist across restarts.

## Skills System

**Roles** are the base agent prompts (developer, designer, tester, reviewer).

**Modules** are reusable knowledge blocks assignable to any role:
- Built-in: react, tailwind, nextjs, figma, vitest, prisma, docker, postgresql
- Custom: install from GitHub or create inline

Install a skill from GitHub:
```bash
# Via CLI
openteam skills add https://github.com/user/skill-repo

# Via UI
Skills > "+ From GitHub" > paste URL > name it > Install
```

## Knowledge Base

Create `.md` files in `~/.openteam/knowledge/` with a `read_when` frontmatter:

```markdown
---
read_when: auth, login, session, jwt
---

Our auth uses NextAuth.js v5 with JWT strategy.
Session tokens expire after 24h.
Always use the `auth()` helper, never read cookies directly.
```

When a task title/description matches any keyword, the doc is automatically injected into the worker's prompt.

## CLI

```bash
openteam start              # Start the server
openteam tasks              # List all tasks
openteam task create "title" --role developer
openteam skills             # List skills
openteam skills add <url>   # Install from GitHub
openteam status             # Show system status
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests (64 tests)
pnpm test

# Development mode (rebuild on changes)
pnpm -r run build --watch   # In one terminal
pnpm start                  # In another
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Database**: SQLite (better-sqlite3) with WAL mode
- **Server**: Express + WebSocket (ws)
- **UI**: React + Vite
- **AI**: Claude Code CLI (`claude --print`)
- **Build**: tsup (core/web/cli), Vite (ui)
- **Tests**: Vitest
- **Package Manager**: pnpm workspaces

## Agent Names

Default names (configurable via UI or `~/.openteam/agent-names.json`):

| Role | Name | Emoji |
|------|------|-------|
| PM | Clara | :clipboard: |
| Developer | Lucas | :wrench: |
| Designer | Sofia | :art: |
| Tester | Max | :test_tube: |
| Reviewer | Ana | :mag: |

## License

MIT
