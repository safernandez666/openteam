import type BetterSqlite3 from "better-sqlite3";

export type TaskStatus =
  | "backlog"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "rejected";

export type TaskPriority = "urgent" | "high" | "normal" | "low";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee: string | null;
  role: string | null;
  priority: TaskPriority;
  depends_on: string | null;
  parent_id: string | null;
  result: string | null;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface TaskDependency {
  task_id: string;
  depends_on_id: string;
  created_at: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assignee?: string;
  role?: string;
  priority?: TaskPriority;
  depends_on?: string;
  parent_id?: string;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  assignee?: string;
  role?: string;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  result?: string;
}

let taskCounter = 0;

function generateTaskId(): string {
  taskCounter++;
  return `T-${taskCounter}`;
}

export class TaskStore {
  readonly db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
    const maxRow = this.db
      .prepare(
        "SELECT id FROM tasks ORDER BY CAST(SUBSTR(id, 3) AS INTEGER) DESC LIMIT 1",
      )
      .get() as { id: string } | undefined;
    if (maxRow) {
      taskCounter = parseInt(maxRow.id.slice(2), 10);
    }
  }

  create(input: CreateTaskInput): Task {
    const id = generateTaskId();
    const now = new Date().toISOString();

    if (input.parent_id) {
      const parent = this.get(input.parent_id);
      if (!parent) throw new Error(`Parent task ${input.parent_id} not found`);
    }

    this.db
      .prepare(
        `INSERT INTO tasks (id, title, description, status, assignee, role, priority, depends_on, parent_id, created_at, updated_at)
         VALUES (@id, @title, @description, @status, @assignee, @role, @priority, @depends_on, @parent_id, @created_at, @updated_at)`,
      )
      .run({
        id,
        title: input.title,
        description: input.description ?? "",
        status: input.assignee ? "assigned" : "backlog",
        assignee: input.assignee ?? null,
        role: input.role ?? null,
        priority: input.priority ?? "normal",
        depends_on: input.depends_on ?? null,
        parent_id: input.parent_id ?? null,
        created_at: now,
        updated_at: now,
      });

    // Migrate legacy depends_on to task_dependencies table
    if (input.depends_on) {
      this.addDependency(id, input.depends_on);
    }

    return this.get(id)!;
  }

  get(id: string): Task | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | Task
      | undefined;
    return row ?? null;
  }

  list(filter?: { status?: TaskStatus; assignee?: string }): Task[] {
    let query = "SELECT * FROM tasks";
    const conditions: string[] = [];
    const params: Record<string, string> = {};

    if (filter?.status) {
      conditions.push("status = @status");
      params.status = filter.status;
    }
    if (filter?.assignee) {
      conditions.push("assignee = @assignee");
      params.assignee = filter.assignee;
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY created_at ASC";

    return this.db.prepare(query).all(params) as Task[];
  }

  update(id: string, input: UpdateTaskInput): Task | null {
    const existing = this.get(id);
    if (!existing) return null;

    const fields: string[] = ["updated_at = @updated_at"];
    const params: Record<string, string | null> = {
      id,
      updated_at: new Date().toISOString(),
    };

    if (input.status !== undefined) {
      fields.push("status = @status");
      params.status = input.status;
    }
    if (input.assignee !== undefined) {
      fields.push("assignee = @assignee");
      params.assignee = input.assignee;
    }
    if (input.title !== undefined) {
      fields.push("title = @title");
      params.title = input.title;
    }
    if (input.description !== undefined) {
      fields.push("description = @description");
      params.description = input.description;
    }
    if (input.priority !== undefined) {
      fields.push("priority = @priority");
      params.priority = input.priority;
    }
    if (input.role !== undefined) {
      fields.push("role = @role");
      params.role = input.role;
    }
    if (input.result !== undefined) {
      fields.push("result = @result");
      params.result = input.result;
    }

    this.db
      .prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = @id`)
      .run(params);

    return this.get(id);
  }

  delete(id: string): boolean {
    const task = this.get(id);
    if (!task) return false;
    this.db.prepare("DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_id = ?").run(id, id);
    this.db.prepare("DELETE FROM task_updates WHERE task_id = ?").run(id);
    this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return true;
  }

  retry(id: string): Task | null {
    const task = this.get(id);
    if (!task) return null;
    this.db
      .prepare("UPDATE tasks SET status = 'assigned', retry_count = 0, last_error = NULL, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    return this.get(id);
  }

  updateTokens(id: string, inputTokens: number, outputTokens: number): void {
    this.db
      .prepare("UPDATE tasks SET input_tokens = ?, output_tokens = ?, updated_at = ? WHERE id = ?")
      .run(inputTokens, outputTokens, new Date().toISOString(), id);
  }

  // ── Retry methods ────────────────────────────────────

  /**
   * Record a task failure. Increments retry_count and stores the error.
   * Returns true if the task can be retried (retry_count < max_retries).
   */
  recordFailure(id: string, error: string): boolean {
    const task = this.get(id);
    if (!task) return false;

    const newCount = task.retry_count + 1;
    const canRetry = newCount < task.max_retries;

    this.db
      .prepare(
        `UPDATE tasks SET retry_count = ?, last_error = ?, status = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        newCount,
        error,
        canRetry ? "assigned" : "rejected",
        new Date().toISOString(),
        id,
      );

    return canRetry;
  }

  // ── Subtask methods ──────────────────────────────────

  listSubtasks(parentId: string): Task[] {
    return this.db
      .prepare("SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC")
      .all(parentId) as Task[];
  }

  // ── Dependency methods ───────────────────────────────

  addDependency(taskId: string, dependsOnId: string): void {
    if (taskId === dependsOnId) {
      throw new Error("A task cannot depend on itself");
    }

    const task = this.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const dep = this.get(dependsOnId);
    if (!dep) throw new Error(`Dependency task ${dependsOnId} not found`);

    // Cycle detection: check if dependsOnId (directly or transitively) depends on taskId
    if (this.wouldCreateCycle(taskId, dependsOnId)) {
      throw new Error(`Adding dependency ${taskId} -> ${dependsOnId} would create a cycle`);
    }

    this.db
      .prepare(
        "INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)",
      )
      .run(taskId, dependsOnId);
  }

  removeDependency(taskId: string, dependsOnId: string): void {
    this.db
      .prepare("DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?")
      .run(taskId, dependsOnId);
  }

  getDependencies(taskId: string): Task[] {
    return this.db
      .prepare(
        `SELECT t.* FROM tasks t
         JOIN task_dependencies d ON t.id = d.depends_on_id
         WHERE d.task_id = ?
         ORDER BY t.created_at ASC`,
      )
      .all(taskId) as Task[];
  }

  getDependents(taskId: string): Task[] {
    return this.db
      .prepare(
        `SELECT t.* FROM tasks t
         JOIN task_dependencies d ON t.id = d.task_id
         WHERE d.depends_on_id = ?
         ORDER BY t.created_at ASC`,
      )
      .all(taskId) as Task[];
  }

  /** Returns true if all dependencies of the task are in "done" status. */
  areDependenciesMet(taskId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as pending FROM task_dependencies d
         JOIN tasks t ON t.id = d.depends_on_id
         WHERE d.task_id = ? AND t.status != 'done'`,
      )
      .get(taskId) as { pending: number };
    return row.pending === 0;
  }

  private wouldCreateCycle(taskId: string, dependsOnId: string): boolean {
    // BFS from dependsOnId's dependencies — if we reach taskId, it's a cycle
    const visited = new Set<string>();
    const queue = [dependsOnId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = this.db
        .prepare("SELECT depends_on_id FROM task_dependencies WHERE task_id = ?")
        .all(current) as Array<{ depends_on_id: string }>;

      for (const d of deps) {
        queue.push(d.depends_on_id);
      }
    }

    return false;
  }
}
