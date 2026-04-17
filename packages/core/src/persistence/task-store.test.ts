import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDatabase } from "./database.js";
import { TaskStore } from "./task-store.js";
import type BetterSqlite3 from "better-sqlite3";

let db: BetterSqlite3.Database;
let store: TaskStore;

beforeEach(() => {
  db = openDatabase(":memory:");
  store = new TaskStore(db);
});

afterEach(() => {
  db.close();
});

describe("TaskStore", () => {
  it("should create a task with auto-generated ID", () => {
    const task = store.create({ title: "Test task" });
    expect(task.id).toMatch(/^T-\d+$/);
    expect(task.title).toBe("Test task");
    expect(task.status).toBe("backlog");
    expect(task.assignee).toBeNull();
    expect(task.priority).toBe("normal");
  });

  it("should auto-assign status when assignee is provided", () => {
    const task = store.create({ title: "Assigned task", assignee: "dev" });
    expect(task.status).toBe("assigned");
    expect(task.assignee).toBe("dev");
  });

  it("should get a task by ID", () => {
    const created = store.create({ title: "Fetch me" });
    const fetched = store.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe("Fetch me");
  });

  it("should return null for non-existent task", () => {
    expect(store.get("T-999")).toBeNull();
  });

  it("should list all tasks", () => {
    store.create({ title: "Task 1" });
    store.create({ title: "Task 2" });
    store.create({ title: "Task 3" });
    const tasks = store.list();
    expect(tasks).toHaveLength(3);
  });

  it("should filter tasks by status", () => {
    store.create({ title: "Backlog task" });
    store.create({ title: "Assigned task", assignee: "dev" });
    expect(store.list({ status: "backlog" })).toHaveLength(1);
    expect(store.list({ status: "assigned" })).toHaveLength(1);
  });

  it("should filter tasks by assignee", () => {
    store.create({ title: "Dev task", assignee: "dev" });
    store.create({ title: "Test task", assignee: "tester" });
    expect(store.list({ assignee: "dev" })).toHaveLength(1);
    expect(store.list({ assignee: "tester" })).toHaveLength(1);
  });

  it("should update a task", () => {
    const task = store.create({ title: "Original" });
    const updated = store.update(task.id, {
      status: "in_progress",
      title: "Updated",
    });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("in_progress");
    expect(updated!.title).toBe("Updated");
  });

  it("should return null when updating non-existent task", () => {
    expect(store.update("T-999", { status: "done" })).toBeNull();
  });

  it("should increment task IDs", () => {
    const t1 = store.create({ title: "First" });
    const t2 = store.create({ title: "Second" });
    const id1 = parseInt(t1.id.slice(2), 10);
    const id2 = parseInt(t2.id.slice(2), 10);
    expect(id2).toBe(id1 + 1);
  });
});
