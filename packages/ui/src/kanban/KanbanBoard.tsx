import { useState } from "react";
import { COLUMNS, type Task } from "./useKanban";
import { TaskDetail } from "./TaskDetail";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SubtaskRow({ task }: { task: Task }) {
  return (
    <div className="subtask-row">
      <span className={`subtask-status subtask-status--${task.status}`} />
      <span className="subtask-id">{task.id}</span>
      <span className="subtask-title">{task.title}</span>
    </div>
  );
}

function TaskCard({
  task,
  subtasks,
  onClick,
}: {
  task: Task;
  subtasks: Task[];
  onClick: (task: Task) => void;
}) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    (e.currentTarget as HTMLElement).classList.add("task-card--dragging");
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove("task-card--dragging");
  };

  return (
    <div
      className="task-card"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => onClick(task)}
    >
      <div className="task-card-top">
        <span className="task-id">{task.id}</span>
        <span className="task-time">{timeAgo(task.updated_at)}</span>
      </div>
      <div className="task-title">{task.title}</div>
      <div className="task-tags">
        <span className={`task-priority task-priority--${task.priority}`}>
          {task.priority}
        </span>
        {task.role && <span className="task-role">{task.role}</span>}
        {task.depends_on && (
          <span className="task-dep-badge" title={`Depends on ${task.depends_on}`}>
            ← {task.depends_on}
          </span>
        )}
        {task.retry_count > 0 && (
          <span className="task-retry-badge" title={task.last_error ?? ""}>
            retry {task.retry_count}/{task.max_retries}
          </span>
        )}
      </div>
      {task.last_error && task.status === "rejected" && (
        <div className="task-error">{task.last_error}</div>
      )}
      {task.assignee && (
        <div className="task-assignee-row">
          <span className="task-assignee-dot">
            {task.assignee[0]}
          </span>
          <span className="task-assignee-name">{task.assignee}</span>
        </div>
      )}
      {subtasks.length > 0 && (
        <div className="task-subtasks">
          <div className="subtask-header">
            {subtasks.filter((s) => s.status === "done").length}/{subtasks.length} subtasks
          </div>
          <div className="subtask-progress">
            <div
              className="subtask-progress-fill"
              style={{
                width: `${(subtasks.filter((s) => s.status === "done").length / subtasks.length) * 100}%`,
              }}
            />
          </div>
          {subtasks.map((sub) => (
            <SubtaskRow key={sub.id} task={sub} />
          ))}
        </div>
      )}
    </div>
  );
}

function Column({
  label,
  tasks,
  columnKey,
  getSubtasks,
  onTaskClick,
  onDrop,
}: {
  label: string;
  tasks: Task[];
  columnKey: string;
  getSubtasks: (parentId: string) => Task[];
  onTaskClick: (task: Task) => void;
  onDrop: (taskId: string, newStatus: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) onDrop(taskId, columnKey);
  };

  return (
    <div
      className={`kanban-column ${dragOver ? "kanban-column--drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="column-header">
        <span className={`column-dot column-dot--${columnKey}`} />
        <span className="column-label">{label}</span>
        {tasks.length > 0 && (
          <span className="column-badge">{tasks.length}</span>
        )}
      </div>
      <div className="column-body">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            subtasks={getSubtasks(task.id)}
            onClick={onTaskClick}
          />
        ))}
      </div>
    </div>
  );
}

interface WorkerInfo {
  taskId: string;
  taskTitle: string;
  role: string | null;
  name: string;
  status: "running" | "completed" | "error";
  startedAt: string;
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function KanbanBoard({
  tasksByColumn,
  getSubtasks,
  activeWorkers,
  completedWorkers,
  tasks,
}: {
  tasksByColumn: Record<string, Task[]>;
  getSubtasks: (parentId: string) => Task[];
  activeWorkers: WorkerInfo[];
  completedWorkers: WorkerInfo[];
  tasks: Task[];
}) {
  const totalTasks = Object.values(tasksByColumn).reduce(
    (sum, t) => sum + t.length,
    0,
  );

  const doneTasks = (tasksByColumn["done"] ?? []).length;
  const inProgress = (tasksByColumn["in_progress"] ?? []).length;
  const blockedTasks = (tasksByColumn["blocked"] ?? []).length;
  const rejectedTasks = tasks.filter((t) => t.status === "rejected").length;
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const totalTokens = tasks.reduce((sum, t) => sum + (t.input_tokens ?? 0) + (t.output_tokens ?? 0), 0);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);

  const handleDropTask = async (taskId: string, newStatus: string) => {
    try {
      await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch { /* ignore — WS will push update */ }
  };

  const assignees = Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean)));

  const matchesFilter = (task: Task) => {
    if (!query.trim() && !filterAssignee) return true;
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      task.title.toLowerCase().includes(q) ||
      task.id.toLowerCase().includes(q) ||
      (task.description ?? "").toLowerCase().includes(q) ||
      (task.assignee ?? "").toLowerCase().includes(q);
    const matchesAssignee = !filterAssignee || task.assignee === filterAssignee;
    return matchesQuery && matchesAssignee;
  };

  return (
    <>
      <div className="kanban-header">
        <span className="kanban-title">Board</span>
        <div className="kanban-header-right">
          {assignees.length > 0 && (
            <select
              className="kanban-filter-select"
              value={filterAssignee ?? ""}
              onChange={(e) => setFilterAssignee(e.target.value || null)}
            >
              <option value="">All assignees</option>
              {assignees.map((a) => (
                <option key={a} value={a!}>
                  {a}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            className="kanban-search"
            placeholder="Search tasks..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="kanban-count">
            {totalTasks} task{totalTasks !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Project stats */}
      <div className="board-stats">
        <StatCard label="Total" value={totalTasks} />
        <StatCard label="Done" value={doneTasks} />
        <StatCard label="In Progress" value={inProgress} />
        <StatCard label="Blocked" value={blockedTasks + rejectedTasks} accent={blockedTasks + rejectedTasks > 0 ? "var(--red)" : undefined} />
        <StatCard label="Workers" value={activeWorkers.length} />
        {totalTokens > 0 && (
          <StatCard
            label="Tokens"
            value={totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens}
          />
        )}
        <div className="stat-card stat-card--progress">
          <div className="stat-value">{completionPct}%</div>
          <div className="stat-label">Complete</div>
          <div className="stat-progress-bar">
            <div className="stat-progress-fill" style={{ width: `${completionPct}%` }} />
          </div>
        </div>
      </div>

      {/* Dashboard summary row */}
      {(activeWorkers.length > 0 || completedWorkers.length > 0 || totalTasks > 0) && (
        <div className="board-dashboard">
          {/* Active workers */}
          {activeWorkers.length > 0 && (
            <div className="dashboard-card">
              <div className="dashboard-card-title">Active Workers</div>
              {activeWorkers.map((w) => (
                <div key={w.taskId} className="dashboard-worker">
                  <span className="dashboard-worker-dot" />
                  <span className="dashboard-worker-name">{w.name}</span>
                  <span className="dashboard-worker-task">{w.taskId}: {w.taskTitle}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent completions */}
          {completedWorkers.length > 0 && (
            <div className="dashboard-card">
              <div className="dashboard-card-title">Recent Activity</div>
              {completedWorkers.slice(0, 5).map((w) => (
                <div key={w.taskId} className="dashboard-activity">
                  <span className={`dashboard-activity-dot dashboard-activity-dot--${w.status}`} />
                  <span className="dashboard-activity-name">{w.name}</span>
                  <span className="dashboard-activity-task">{w.taskTitle}</span>
                  <span className={`dashboard-activity-status dashboard-activity-status--${w.status}`}>
                    {w.status === "completed" ? "done" : "error"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Agent summary */}
          {totalTasks > 0 && (
            <div className="dashboard-card">
              <div className="dashboard-card-title">By Role</div>
              {["developer", "designer", "tester", "reviewer"].map((role) => {
                const roleTasks = tasks.filter((t) => t.role === role);
                if (roleTasks.length === 0) return null;
                const done = roleTasks.filter((t) => t.status === "done").length;
                return (
                  <div key={role} className="dashboard-role">
                    <span className="dashboard-role-name">{role}</span>
                    <div className="dashboard-role-bar">
                      <div
                        className="dashboard-role-fill"
                        style={{ width: `${(done / roleTasks.length) * 100}%` }}
                      />
                    </div>
                    <span className="dashboard-role-count">{done}/{roleTasks.length}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {totalTasks === 0 && (
        <div className="board-empty">
          <div className="board-empty-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="6" width="14" height="36" rx="2" opacity="0.3" />
              <rect x="24" y="6" width="14" height="20" rx="2" opacity="0.2" />
              <rect x="24" y="30" width="14" height="12" rx="2" opacity="0.15" />
              <path d="M13 18l-2 2 2 2" strokeWidth="2" opacity="0.5" />
              <path d="M31 14l2 2-2 2" strokeWidth="2" opacity="0.4" />
            </svg>
          </div>
          <div className="board-empty-title">No tasks yet</div>
          <div className="board-empty-subtitle">
            Go to Chat and tell Facu what you want to build. He'll create the tasks.
          </div>
          <div className="board-empty-hint">
            Or use the CLI: <code>openteam task create "My first task"</code>
          </div>
        </div>
      )}

      <div className="kanban-columns" style={totalTasks === 0 ? { display: "none" } : undefined}>
        {COLUMNS.map((col) => (
          <Column
            key={col.key}
            label={col.label}
            columnKey={col.key}
            tasks={(tasksByColumn[col.key] ?? []).filter(matchesFilter)}
            getSubtasks={getSubtasks}
            onTaskClick={setSelectedTask}
            onDrop={handleDropTask}
          />
        ))}
      </div>

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          subtasks={getSubtasks(selectedTask.id)}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}
