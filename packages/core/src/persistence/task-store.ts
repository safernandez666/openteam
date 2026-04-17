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
  priority: TaskPriority;
  depends_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assignee?: string;
  priority?: TaskPriority;
  depends_on?: string;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  assignee?: string;
  title?: string;
  description?: string;
  priority?: TaskPriority;
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

    this.db
      .prepare(
        `INSERT INTO tasks (id, title, description, status, assignee, priority, depends_on, created_at, updated_at)
         VALUES (@id, @title, @description, @status, @assignee, @priority, @depends_on, @created_at, @updated_at)`,
      )
      .run({
        id,
        title: input.title,
        description: input.description ?? "",
        status: input.assignee ? "assigned" : "backlog",
        assignee: input.assignee ?? null,
        priority: input.priority ?? "normal",
        depends_on: input.depends_on ?? null,
        created_at: now,
        updated_at: now,
      });

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

    this.db
      .prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = @id`)
      .run(params);

    return this.get(id);
  }
}
