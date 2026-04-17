/**
 * Demo: Test MCP tools by creating tasks and querying them via SQLite.
 *
 * This doesn't use the MCP protocol — it directly tests the persistence
 * layer to verify tasks work before wiring up the MCP server.
 *
 * Usage: npx tsx packages/core/src/demo-mcp.ts
 */
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "./persistence/database.js";
import { TaskStore } from "./persistence/task-store.js";
import { EventLogger } from "./persistence/event-logger.js";

const dbPath = join(tmpdir(), `openteam-demo-${Date.now()}.db`);
const logPath = join(tmpdir(), `openteam-demo-${Date.now()}.ndjson`);

console.log("=== OpenTeam MCP Demo (persistence layer) ===");
console.log(`DB: ${dbPath}`);
console.log(`Log: ${logPath}`);
console.log("");

const db = openDatabase(dbPath);
const store = new TaskStore(db);
const logger = new EventLogger(logPath);

// Simulate what agents would do via MCP tools
console.log("1. PM creates task...");
const t1 = store.create({
  title: "Build API endpoints",
  description: "Create REST API for user management",
  assignee: "dev",
  priority: "high",
});
logger.log({ agent: "pm", type: "task_created", task_id: t1.id });
console.log(`   Created: ${t1.id} "${t1.title}" [${t1.status}] → ${t1.assignee}`);

console.log("\n2. PM creates another task...");
const t2 = store.create({
  title: "Write tests for API",
  depends_on: t1.id,
});
logger.log({ agent: "pm", type: "task_created", task_id: t2.id });
console.log(`   Created: ${t2.id} "${t2.title}" [${t2.status}] depends on ${t2.depends_on}`);

console.log("\n3. Dev starts working on T-1...");
const t1updated = store.update(t1.id, { status: "in_progress" });
logger.log({ agent: "dev", type: "task_updated", task_id: t1.id, detail: "Started work" });
console.log(`   ${t1updated!.id} → status: ${t1updated!.status}`);

console.log("\n4. Dev completes T-1...");
store.update(t1.id, { status: "done" });
logger.log({ agent: "dev", type: "task_updated", task_id: t1.id, detail: "Completed" });
console.log(`   ${t1.id} → status: done`);

console.log("\n5. Listing all tasks:");
const allTasks = store.list();
for (const t of allTasks) {
  console.log(`   ${t.id} | ${t.status.padEnd(11)} | ${t.assignee ?? "unassigned"} | ${t.title}`);
}

console.log("\n6. Listing only backlog:");
const backlog = store.list({ status: "backlog" });
for (const t of backlog) {
  console.log(`   ${t.id} | ${t.title}`);
}

// Post team update
db.prepare("INSERT INTO team_updates (agent, message) VALUES (?, ?)").run(
  "dev",
  "API endpoints are ready for review",
);

console.log("\n7. Team updates:");
const updates = db
  .prepare("SELECT * FROM team_updates ORDER BY created_at DESC")
  .all() as Array<{ agent: string; message: string; created_at: string }>;
for (const u of updates) {
  console.log(`   [${u.agent}] ${u.message}`);
}

db.close();
console.log("\n=== Demo complete ===");
