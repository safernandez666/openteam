import { COLUMNS, type Task } from "./useKanban";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f59e0b",
  normal: "#3b82f6",
  low: "#6b7280",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function TaskCard({ task }: { task: Task }) {
  return (
    <div
      style={{
        backgroundColor: "#1e293b",
        borderRadius: "0.5rem",
        padding: "0.75rem",
        borderLeft: `3px solid ${PRIORITY_COLORS[task.priority] ?? "#3b82f6"}`,
        marginBottom: "0.5rem",
        cursor: "default",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "0.35rem",
        }}
      >
        <span style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 600 }}>
          {task.id}
        </span>
        <span style={{ fontSize: "0.65rem", color: "#475569" }}>
          {timeAgo(task.updated_at)}
        </span>
      </div>
      <div
        style={{
          fontSize: "0.85rem",
          color: "#e2e8f0",
          fontWeight: 500,
          marginBottom: "0.35rem",
          lineHeight: 1.3,
        }}
      >
        {task.title}
      </div>
      {task.assignee && (
        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
          {task.assignee}
        </div>
      )}
    </div>
  );
}

function Column({
  label,
  tasks,
  columnKey,
}: {
  label: string;
  tasks: Task[];
  columnKey: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: "160px",
        maxWidth: "280px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "0.5rem 0.75rem",
          marginBottom: "0.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <span
          style={{
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </span>
        {tasks.length > 0 && (
          <span
            style={{
              fontSize: "0.7rem",
              backgroundColor: "#334155",
              color: "#94a3b8",
              borderRadius: "9999px",
              padding: "0.1rem 0.45rem",
              fontWeight: 600,
            }}
          >
            {tasks.length}
          </span>
        )}
      </div>
      <div
        style={{
          flex: 1,
          backgroundColor:
            columnKey === "done" ? "rgba(34, 197, 94, 0.05)" : "#0f172a",
          borderRadius: "0.5rem",
          padding: "0.5rem",
          overflowY: "auto",
          minHeight: "100px",
        }}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({
  tasksByColumn,
}: {
  tasksByColumn: Record<string, Task[]>;
}) {
  const totalTasks = Object.values(tasksByColumn).reduce(
    (sum, tasks) => sum + tasks.length,
    0,
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#0f172a",
      }}
    >
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontWeight: 600, color: "#e2e8f0" }}>Kanban</span>
        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
          {totalTasks} task{totalTasks !== 1 ? "s" : ""}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: "0.5rem",
          padding: "0.75rem",
          overflowX: "auto",
        }}
      >
        {COLUMNS.map((col) => (
          <Column
            key={col.key}
            label={col.label}
            columnKey={col.key}
            tasks={tasksByColumn[col.key] ?? []}
          />
        ))}
      </div>
    </div>
  );
}
