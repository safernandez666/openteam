import { useEffect } from "react";
import type { Task } from "./useKanban";

function StatusBadge({ status }: { status: string }) {
  return <span className={`task-detail-status task-detail-status--${status}`}>{status}</span>;
}

export function TaskDetail({
  task,
  subtasks,
  onClose,
}: {
  task: Task;
  subtasks: Task[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--task-detail" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span className="task-detail-id">{task.id}</span>
            <StatusBadge status={task.status} />
            <span className={`task-priority task-priority--${task.priority}`}>{task.priority}</span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <h2 className="task-detail-title">{task.title}</h2>

          {task.description && (
            <div className="task-detail-section">
              <div className="task-detail-label">Description</div>
              <div className="task-detail-text">{task.description}</div>
            </div>
          )}

          <div className="task-detail-meta">
            {task.role && (
              <div className="task-detail-meta-item">
                <span className="task-detail-label">Role</span>
                <span className="task-detail-value">{task.role}</span>
              </div>
            )}
            {task.assignee && (
              <div className="task-detail-meta-item">
                <span className="task-detail-label">Assignee</span>
                <span className="task-detail-value">{task.assignee}</span>
              </div>
            )}
            {task.depends_on && (
              <div className="task-detail-meta-item">
                <span className="task-detail-label">Depends on</span>
                <span className="task-detail-value">{task.depends_on}</span>
              </div>
            )}
            {task.retry_count > 0 && (
              <div className="task-detail-meta-item">
                <span className="task-detail-label">Retries</span>
                <span className="task-detail-value">{task.retry_count}/{task.max_retries}</span>
              </div>
            )}
            <div className="task-detail-meta-item">
              <span className="task-detail-label">Created</span>
              <span className="task-detail-value">{new Date(task.created_at).toLocaleString()}</span>
            </div>
            <div className="task-detail-meta-item">
              <span className="task-detail-label">Updated</span>
              <span className="task-detail-value">{new Date(task.updated_at).toLocaleString()}</span>
            </div>
          </div>

          {task.last_error && (
            <div className="task-detail-section">
              <div className="task-detail-label">Last Error</div>
              <pre className="task-detail-error">{task.last_error}</pre>
            </div>
          )}

          {task.result && (
            <div className="task-detail-section">
              <div className="task-detail-label">Result</div>
              <pre className="task-detail-result">{task.result}</pre>
            </div>
          )}

          {subtasks.length > 0 && (
            <div className="task-detail-section">
              <div className="task-detail-label">
                Subtasks ({subtasks.filter((s) => s.status === "done").length}/{subtasks.length})
              </div>
              <div className="task-detail-subtasks">
                {subtasks.map((sub) => (
                  <div key={sub.id} className="task-detail-subtask">
                    <span className={`subtask-status subtask-status--${sub.status}`} />
                    <span className="task-detail-subtask-id">{sub.id}</span>
                    <span className="task-detail-subtask-title">{sub.title}</span>
                    <StatusBadge status={sub.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
