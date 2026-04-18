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

describe("Subtasks", () => {
  it("should create a subtask with parent_id", () => {
    const parent = store.create({ title: "Parent" });
    const child = store.create({ title: "Child", parent_id: parent.id });
    expect(child.parent_id).toBe(parent.id);
  });

  it("should reject subtask with non-existent parent", () => {
    expect(() =>
      store.create({ title: "Orphan", parent_id: "T-999" }),
    ).toThrow("Parent task T-999 not found");
  });

  it("should list subtasks of a parent", () => {
    const parent = store.create({ title: "Parent" });
    store.create({ title: "Child 1", parent_id: parent.id });
    store.create({ title: "Child 2", parent_id: parent.id });
    store.create({ title: "Unrelated" });

    const subtasks = store.listSubtasks(parent.id);
    expect(subtasks).toHaveLength(2);
    expect(subtasks[0].title).toBe("Child 1");
    expect(subtasks[1].title).toBe("Child 2");
  });
});

describe("Dependencies", () => {
  it("should add and retrieve dependencies", () => {
    const t1 = store.create({ title: "First" });
    const t2 = store.create({ title: "Second" });
    store.addDependency(t2.id, t1.id);

    const deps = store.getDependencies(t2.id);
    expect(deps).toHaveLength(1);
    expect(deps[0].id).toBe(t1.id);
  });

  it("should get dependents of a task", () => {
    const t1 = store.create({ title: "First" });
    const t2 = store.create({ title: "Second" });
    const t3 = store.create({ title: "Third" });
    store.addDependency(t2.id, t1.id);
    store.addDependency(t3.id, t1.id);

    const dependents = store.getDependents(t1.id);
    expect(dependents).toHaveLength(2);
  });

  it("should reject self-dependency", () => {
    const t1 = store.create({ title: "Task" });
    expect(() => store.addDependency(t1.id, t1.id)).toThrow(
      "cannot depend on itself",
    );
  });

  it("should reject non-existent task dependency", () => {
    const t1 = store.create({ title: "Task" });
    expect(() => store.addDependency(t1.id, "T-999")).toThrow(
      "Dependency task T-999 not found",
    );
  });

  it("should detect cycles", () => {
    const t1 = store.create({ title: "A" });
    const t2 = store.create({ title: "B" });
    const t3 = store.create({ title: "C" });
    store.addDependency(t2.id, t1.id); // B depends on A
    store.addDependency(t3.id, t2.id); // C depends on B

    // A depending on C would create A -> C -> B -> A cycle
    expect(() => store.addDependency(t1.id, t3.id)).toThrow("cycle");
  });

  it("should remove a dependency", () => {
    const t1 = store.create({ title: "First" });
    const t2 = store.create({ title: "Second" });
    store.addDependency(t2.id, t1.id);
    expect(store.getDependencies(t2.id)).toHaveLength(1);

    store.removeDependency(t2.id, t1.id);
    expect(store.getDependencies(t2.id)).toHaveLength(0);
  });

  it("should check if dependencies are met", () => {
    const t1 = store.create({ title: "First" });
    const t2 = store.create({ title: "Second" });
    store.addDependency(t2.id, t1.id);

    expect(store.areDependenciesMet(t2.id)).toBe(false);

    store.update(t1.id, { status: "done" });
    expect(store.areDependenciesMet(t2.id)).toBe(true);
  });

  it("should support multiple dependencies", () => {
    const t1 = store.create({ title: "A" });
    const t2 = store.create({ title: "B" });
    const t3 = store.create({ title: "C" });
    store.addDependency(t3.id, t1.id);
    store.addDependency(t3.id, t2.id);

    expect(store.areDependenciesMet(t3.id)).toBe(false);

    store.update(t1.id, { status: "done" });
    expect(store.areDependenciesMet(t3.id)).toBe(false);

    store.update(t2.id, { status: "done" });
    expect(store.areDependenciesMet(t3.id)).toBe(true);
  });

  it("should migrate legacy depends_on to task_dependencies on create", () => {
    const t1 = store.create({ title: "First" });
    const t2 = store.create({ title: "Second", depends_on: t1.id });

    const deps = store.getDependencies(t2.id);
    expect(deps).toHaveLength(1);
    expect(deps[0].id).toBe(t1.id);
  });
});

describe("Retry", () => {
  it("should initialize with retry_count 0 and max_retries 3", () => {
    const task = store.create({ title: "Test" });
    expect(task.retry_count).toBe(0);
    expect(task.max_retries).toBe(3);
    expect(task.last_error).toBeNull();
  });

  it("should increment retry_count and store error on failure", () => {
    const task = store.create({ title: "Failing task", assignee: "worker" });
    const canRetry = store.recordFailure(task.id, "Something broke");

    expect(canRetry).toBe(true);
    const updated = store.get(task.id)!;
    expect(updated.retry_count).toBe(1);
    expect(updated.last_error).toBe("Something broke");
    expect(updated.status).toBe("assigned"); // re-assigned for retry
  });

  it("should reject after max retries", () => {
    const task = store.create({ title: "Doomed task", assignee: "worker" });

    expect(store.recordFailure(task.id, "fail 1")).toBe(true);
    expect(store.recordFailure(task.id, "fail 2")).toBe(true);
    expect(store.recordFailure(task.id, "fail 3")).toBe(false);

    const final = store.get(task.id)!;
    expect(final.retry_count).toBe(3);
    expect(final.status).toBe("rejected");
    expect(final.last_error).toBe("fail 3");
  });

  it("should return false for non-existent task", () => {
    expect(store.recordFailure("T-999", "error")).toBe(false);
  });
});
