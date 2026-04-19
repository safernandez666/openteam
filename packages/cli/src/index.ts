import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  VERSION,
  openDatabase,
  TaskStore,
  EventLogger,
  SkillLoader,
  ContextManager,
} from "@openteam/core";
import type { TaskPriority, TaskStatus } from "@openteam/core";

const DATA_DIR = join(homedir(), ".openteam");
const DB_PATH = join(DATA_DIR, "openteam.db");

// ── Helpers ──────────────────────────────────────────────

function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}

function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}

function color(s: string, code: number): string {
  return `\x1b[${code}m${s}\x1b[0m`;
}

const STATUS_COLORS: Record<string, number> = {
  backlog: 90,
  assigned: 35,
  in_progress: 34,
  blocked: 31,
  review: 33,
  done: 32,
  rejected: 91,
};

const PRIORITY_SYMBOLS: Record<string, string> = {
  urgent: color("!!!", 31),
  high: color("!!", 33),
  normal: color("·", 34),
  low: dim("·"),
};

function statusTag(status: string): string {
  const c = STATUS_COLORS[status] ?? 0;
  return color(status.replace("_", " "), c);
}

function printHelp(): void {
  console.log(`
${bold("OpenTeam")} ${dim(`v${VERSION}`)} — AI agent orchestration framework

${bold("USAGE")}
  openteam <command> [options]

${bold("COMMANDS")}
  ${bold("start")}                         Start the server (web UI + orchestrator)
    --port <n>                    Port number ${dim("(default: 4200)")}
    --host <addr>                 Host address ${dim("(default: 127.0.0.1)")}

  ${bold("tasks")}                         List all tasks
    --status <status>             Filter by status
    --assignee <name>             Filter by assignee

  ${bold("task create")} <title>            Create a new task
    --description, -d <text>      Task description
    --priority, -p <priority>     urgent | high | normal | low ${dim("(default: normal)")}
    --assignee, -a <name>         Assign to agent ${dim("(use 'worker' to auto-execute)")}
    --role, -r <role>             Worker skill: developer | tester | reviewer

  ${bold("task get")} <id>                  Show task details

  ${bold("task update")} <id>               Update a task
    --status, -s <status>         New status
    --assignee, -a <name>         New assignee
    --role, -r <role>             New role
    --priority, -p <priority>     New priority

  ${bold("skills")}                        List available skills
  ${bold("skills add")} <url|path>           Install a skill from GitHub or local file
  ${bold("skills remove")} <name>            Remove a user-installed skill

  ${bold("context")}                       Show project context (WORKSPACE.md)
  ${bold("context set")} <file>              Set WORKSPACE.md from a file
  ${bold("context edit")}                   Open WORKSPACE.md in $EDITOR

  ${bold("status")}                        Show system status

  ${bold("help")}                          Show this help

${bold("EXAMPLES")}
  openteam start
  openteam tasks --status backlog
  openteam task create "Fix login bug" -p high -a worker -r developer
  openteam task update T-5 -s done
  openteam skills
  openteam skills add https://github.com/user/my-skill
  openteam skills remove my-skill
`);
}

// ── Arg parser ───────────────────────────────────────────

function parseArgs(argv: string[]): { args: string[]; flags: Record<string, string> } {
  const args: string[] = [];
  const flags: Record<string, string> = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      flags[key] = argv[++i] ?? "";
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      flags[key] = argv[++i] ?? "";
    } else {
      args.push(arg);
    }
    i++;
  }
  return { args, flags };
}

// ── Commands ─────────────────────────────────────────────

function cmdStart(flags: Record<string, string>): void {
  const port = flags.port ? parseInt(flags.port, 10) : 4200;
  const host = flags.host ?? "127.0.0.1";

  console.log(`\n  ${bold("OpenTeam")} ${dim(`v${VERSION}`)}\n`);

  import("@openteam/web").then((mod) => {
    mod.startServer(port, host);
  });
}

function cmdTasks(flags: Record<string, string>): void {
  const db = openDatabase(DB_PATH);
  const store = new TaskStore(db);

  const filter: { status?: TaskStatus; assignee?: string } = {};
  if (flags.status) filter.status = flags.status as TaskStatus;
  if (flags.assignee) filter.assignee = flags.assignee;

  const tasks = store.list(filter);

  if (tasks.length === 0) {
    console.log(dim("\n  No tasks found.\n"));
    db.close();
    return;
  }

  console.log(`\n  ${bold("Tasks")} ${dim(`(${tasks.length})`)}\n`);

  const idWidth = Math.max(...tasks.map((t) => t.id.length), 4);
  const statusWidth = Math.max(...tasks.map((t) => t.status.length), 6);

  console.log(
    `  ${dim("ID".padEnd(idWidth))}  ${dim("Status".padEnd(statusWidth + 4))}  ${dim("Pri")}  ${dim("Title")}`,
  );
  console.log(`  ${dim("─".repeat(idWidth + statusWidth + 50))}`);

  for (const task of tasks) {
    const id = dim(task.id.padEnd(idWidth));
    const st = statusTag(task.status.padEnd(statusWidth));
    const pri = PRIORITY_SYMBOLS[task.priority] ?? "·";
    const assignee = task.assignee ? dim(` → ${task.assignee}`) : "";
    const role = task.role ? dim(` [${task.role}]`) : "";
    console.log(`  ${id}  ${st}  ${pri}   ${task.title}${assignee}${role}`);
  }

  console.log();
  db.close();
}

function cmdTaskCreate(args: string[], flags: Record<string, string>): void {
  const title = args[0];
  if (!title) {
    console.error("  Error: task title required\n  Usage: openteam task create <title>");
    process.exit(1);
  }

  const db = openDatabase(DB_PATH);
  const store = new TaskStore(db);

  const task = store.create({
    title,
    description: flags.description ?? flags.d ?? undefined,
    priority: (flags.priority ?? flags.p ?? "normal") as TaskPriority,
    assignee: flags.assignee ?? flags.a ?? undefined,
    role: flags.role ?? flags.r ?? undefined,
  });

  console.log(`\n  ✅ Task created\n`);
  printTaskDetail(task);
  db.close();
}

function cmdTaskGet(args: string[]): void {
  const id = args[0];
  if (!id) {
    console.error("  Error: task ID required\n  Usage: openteam task get <id>");
    process.exit(1);
  }

  const db = openDatabase(DB_PATH);
  const store = new TaskStore(db);
  const task = store.get(id);

  if (!task) {
    console.error(`  Task ${id} not found.`);
    process.exit(1);
  }

  console.log();
  printTaskDetail(task);
  db.close();
}

function cmdTaskUpdate(args: string[], flags: Record<string, string>): void {
  const id = args[0];
  if (!id) {
    console.error("  Error: task ID required\n  Usage: openteam task update <id> [options]");
    process.exit(1);
  }

  const db = openDatabase(DB_PATH);
  const store = new TaskStore(db);

  const updates: Record<string, string | undefined> = {};
  if (flags.status ?? flags.s) updates.status = flags.status ?? flags.s;
  if (flags.assignee ?? flags.a) updates.assignee = flags.assignee ?? flags.a;
  if (flags.role ?? flags.r) updates.role = flags.role ?? flags.r;
  if (flags.priority ?? flags.p) updates.priority = flags.priority ?? flags.p;
  if (flags.title) updates.title = flags.title;
  if (flags.description ?? flags.d) updates.description = flags.description ?? flags.d;

  if (Object.keys(updates).length === 0) {
    console.error("  Nothing to update. Use --status, --assignee, --role, --priority, --title, or --description.");
    process.exit(1);
  }

  const task = store.update(id, updates);
  if (!task) {
    console.error(`  Task ${id} not found.`);
    process.exit(1);
  }

  console.log(`\n  ✅ Task ${id} updated\n`);
  printTaskDetail(task);
  db.close();
}

function printTaskDetail(task: { id: string; title: string; description: string; status: string; assignee: string | null; role: string | null; priority: string; created_at: string; updated_at: string }): void {
  console.log(`  ${bold(task.id)}  ${task.title}`);
  console.log(`  Status:    ${statusTag(task.status)}`);
  console.log(`  Priority:  ${PRIORITY_SYMBOLS[task.priority] ?? "·"}  ${task.priority}`);
  if (task.assignee) console.log(`  Assignee:  ${task.assignee}`);
  if (task.role) console.log(`  Role:      ${task.role}`);
  if (task.description) console.log(`  Desc:      ${task.description}`);
  console.log(`  Created:   ${dim(task.created_at)}`);
  console.log(`  Updated:   ${dim(task.updated_at)}`);
  console.log();
}

function cmdSkills(): void {
  const userSkillsDir = join(DATA_DIR, "skills");
  const loader = new SkillLoader(userSkillsDir);
  const skills = loader.list();

  if (skills.length === 0) {
    console.log(dim("\n  No skills found.\n"));
    return;
  }

  console.log(`\n  ${bold("Skills")} ${dim(`(${skills.length})`)}\n`);

  for (const skill of skills) {
    const src = skill.source === "built-in" ? dim("built-in") : color("custom", 33);
    const preview = skill.content.split("\n")[0].slice(0, 60);
    console.log(`  ${bold(skill.name.padEnd(14))} ${src.padEnd(20)}  ${dim(preview)}`);
  }
  console.log();
}

function cmdSkillsAdd(args: string[]): void {
  const source = args[0];
  if (!source) {
    console.error("  Error: source required\n  Usage: openteam skills add <github-url|path>");
    process.exit(1);
  }

  const userSkillsDir = join(DATA_DIR, "skills");
  const loader = new SkillLoader(userSkillsDir);

  console.log(`\n  ${dim("Installing skill from")} ${source} ${dim("...")}\n`);

  try {
    const installed = loader.install(source);
    for (const name of installed) {
      console.log(`  ${color("✓", 32)} ${bold(name)}`);
    }
    console.log(`\n  ${color(`${installed.length} skill${installed.length !== 1 ? "s" : ""} installed`, 32)} → ${dim(userSkillsDir)}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ${color("✗", 31)} ${msg}\n`);
    process.exit(1);
  }
}

function cmdSkillsRemove(args: string[]): void {
  const name = args[0];
  if (!name) {
    console.error("  Error: skill name required\n  Usage: openteam skills remove <name>");
    process.exit(1);
  }

  const userSkillsDir = join(DATA_DIR, "skills");
  const loader = new SkillLoader(userSkillsDir);

  // Can't remove built-in skills
  const skill = loader.get(name);
  if (skill && skill.source === "built-in") {
    console.error(`  ${color("✗", 31)} Cannot remove built-in skill "${name}". Only user-installed skills can be removed.\n`);
    process.exit(1);
  }

  const removed = loader.remove(name);
  if (removed) {
    console.log(`\n  ${color("✓", 32)} Skill "${bold(name)}" removed\n`);
  } else {
    console.error(`  ${color("✗", 31)} Skill "${name}" not found in user skills directory\n`);
    process.exit(1);
  }
}

function cmdContext(args: string[]): void {
  const db = openDatabase(DB_PATH);
  const store = new TaskStore(db);
  const ctx = new ContextManager(DATA_DIR, store);

  const sub = args[0];

  if (sub === "set") {
    const filePath = args[1];
    if (!filePath) {
      console.error("  Error: file path required\n  Usage: openteam context set <file>");
      process.exit(1);
    }
    if (!existsSync(filePath)) {
      console.error(`  ${color("✗", 31)} File not found: ${filePath}\n`);
      process.exit(1);
    }
    const content = readFileSync(filePath, "utf-8");
    ctx.setWorkspace(content);
    console.log(`\n  ${color("✓", 32)} WORKSPACE.md updated (${content.length} chars)\n`);
    db.close();
    return;
  }

  if (sub === "edit") {
    const editor = process.env.EDITOR ?? "vim";
    // Ensure the file exists
    if (!ctx.getWorkspace()) {
      ctx.setWorkspace("# Project Context\n\nDescribe your project here: tech stack, file structure, conventions.\n");
    }
    try {
      execSync(`${editor} ${JSON.stringify(ctx.path)}`, { stdio: "inherit" });
      console.log(`\n  ${color("✓", 32)} WORKSPACE.md saved\n`);
    } catch {
      console.error(`  Failed to open editor: ${editor}`);
    }
    db.close();
    return;
  }

  // Default: show current context
  const workspace = ctx.getWorkspace();
  if (!workspace) {
    console.log(`\n  ${dim("No WORKSPACE.md found.")}`);
    console.log(`  ${dim("Create one with:")} openteam context edit`);
    console.log(`  ${dim("Or set from file:")} openteam context set <file>\n`);
    console.log(`  ${dim("This file provides project context to all workers.")}\n`);
  } else {
    console.log(`\n  ${bold("WORKSPACE.md")} ${dim(`(${workspace.length} chars — ${ctx.path})`)}\n`);
    // Indent and print
    for (const line of workspace.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log();
  }
  db.close();
}

function cmdStatus(): void {
  const db = openDatabase(DB_PATH);
  const store = new TaskStore(db);
  const tasks = store.list();

  const byStatus: Record<string, number> = {};
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }

  const loader = new SkillLoader(join(DATA_DIR, "skills"));
  const skills = loader.list();

  const ctx = new ContextManager(DATA_DIR, store);
  const workspace = ctx.getWorkspace();

  console.log(`\n  ${bold("OpenTeam Status")} ${dim(`v${VERSION}`)}\n`);
  console.log(`  Data:      ${dim(DATA_DIR)}`);
  console.log(`  Database:  ${dim(DB_PATH)}`);
  console.log(`  Skills:    ${skills.map((s) => s.name).join(", ") || dim("none")}`);
  console.log(`  Workspace: ${workspace ? color(`${workspace.length} chars`, 32) : dim("not set")}`);
  console.log();

  console.log(`  ${bold("Tasks")} ${dim(`(${tasks.length} total)`)}`);
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`    ${statusTag(status.padEnd(12))} ${count}`);
  }

  console.log();
  db.close();
}

// ── Main ─────────────────────────────────────────────────

const { args, flags } = parseArgs(process.argv.slice(2));
const command = args[0];

switch (command) {
  case "start":
    cmdStart(flags);
    break;

  case "tasks":
    cmdTasks(flags);
    break;

  case "task": {
    const sub = args[1];
    const rest = args.slice(2);
    switch (sub) {
      case "create":
        cmdTaskCreate(rest, flags);
        break;
      case "get":
        cmdTaskGet(rest);
        break;
      case "update":
        cmdTaskUpdate(rest, flags);
        break;
      default:
        if (sub && sub.startsWith("T-")) {
          // Shorthand: `openteam task T-5` → get
          cmdTaskGet([sub]);
        } else {
          console.error(`  Unknown subcommand: task ${sub ?? ""}`);
          console.log("  Try: openteam task create | get | update");
          process.exit(1);
        }
    }
    break;
  }

  case "skills": {
    const skillSub = args[1];
    const skillRest = args.slice(2);
    switch (skillSub) {
      case "add":
        cmdSkillsAdd(skillRest);
        break;
      case "remove":
        cmdSkillsRemove(skillRest);
        break;
      default:
        cmdSkills();
    }
    break;
  }

  case "context":
    cmdContext(args.slice(1));
    break;

  case "status":
    cmdStatus();
    break;

  case "help":
  case "--help":
  case "-h":
  case undefined:
    printHelp();
    break;

  default:
    console.error(`  Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
