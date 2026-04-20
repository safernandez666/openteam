import { useState } from "react";
import type { WsEvent } from "../useWebSocket";

interface WorkerInfo {
  taskId: string;
  taskTitle: string;
  role: string | null;
  name: string;
  status: "running" | "completed" | "error";
  startedAt: string;
}

interface CompactionData {
  taskId: string;
  filesChanged: string[];
  decisions: string[];
  verification: Record<string, boolean>;
  blockers: string[];
  compactText: string;
}

type Tab = "live" | "history" | "context";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function LogsPanel({
  activeWorkers,
  completedWorkers,
  getWorkerOutput,
}: {
  activeWorkers: WorkerInfo[];
  completedWorkers: WorkerInfo[];
  getWorkerOutput: (taskId: string) => string;
}) {
  const [tab, setTab] = useState<Tab>("live");
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [compactions, setCompactions] = useState<CompactionData[]>([]);
  const [compactionsLoaded, setCompactionsLoaded] = useState(false);

  // Load compactions on context tab
  const loadCompactions = () => {
    if (compactionsLoaded) return;
    const taskIds = completedWorkers.map((w) => w.taskId);
    Promise.all(
      taskIds.slice(0, 10).map((id) =>
        fetch(`/api/tasks/${id}`).then((r) => r.json()).then((task) => {
          if (!task.result) return null;
          // Try to get compaction from result heuristics
          return {
            taskId: task.id,
            title: task.title,
            role: task.role,
            result: task.result,
          };
        }).catch(() => null)
      )
    ).then((results) => {
      const valid = results.filter(Boolean);
      setCompactions(valid as CompactionData[]);
      setCompactionsLoaded(true);
    });
  };

  const allWorkers = [...activeWorkers, ...completedWorkers];
  const selected = selectedWorker ? allWorkers.find((w) => w.taskId === selectedWorker) : null;
  const selectedOutput = selectedWorker ? getWorkerOutput(selectedWorker) : "";

  return (
    <>
      <div className="logs-header">
        <span className="logs-title">Logs</span>
        <div className="logs-tabs">
          <button
            className={`logs-tab ${tab === "live" ? "logs-tab--active" : ""}`}
            onClick={() => setTab("live")}
          >
            Live ({activeWorkers.length})
          </button>
          <button
            className={`logs-tab ${tab === "history" ? "logs-tab--active" : ""}`}
            onClick={() => setTab("history")}
          >
            History ({completedWorkers.length})
          </button>
          <button
            className={`logs-tab ${tab === "context" ? "logs-tab--active" : ""}`}
            onClick={() => { setTab("context"); loadCompactions(); }}
          >
            Context Flow
          </button>
        </div>
      </div>

      <div className="logs-body">
        {/* Live tab — streaming output from active workers */}
        {tab === "live" && (
          <div className="logs-content">
            {activeWorkers.length === 0 && (
              <div className="logs-empty">No workers running. Assign a task to see live output.</div>
            )}
            {activeWorkers.map((w) => {
              const output = getWorkerOutput(w.taskId);
              return (
                <div key={w.taskId} className="logs-worker-card">
                  <div className="logs-worker-header">
                    <span className="logs-worker-dot logs-worker-dot--running" />
                    <span className="logs-worker-name">{w.name}</span>
                    <span className="logs-worker-role">{w.role}</span>
                    <span className="logs-worker-task">{w.taskId}: {w.taskTitle}</span>
                    <span className="logs-worker-time">{timeAgo(w.startedAt)}</span>
                  </div>
                  <pre className="logs-output">{output || "(waiting for output...)"}</pre>
                </div>
              );
            })}
          </div>
        )}

        {/* History tab — completed worker outputs */}
        {tab === "history" && (
          <div className="logs-split">
            <div className="logs-list">
              {completedWorkers.length === 0 && (
                <div className="logs-empty">No completed workers yet.</div>
              )}
              {completedWorkers.map((w) => (
                <button
                  key={w.taskId}
                  className={`logs-list-item ${selectedWorker === w.taskId ? "logs-list-item--active" : ""}`}
                  onClick={() => setSelectedWorker(w.taskId)}
                >
                  <span className={`logs-worker-dot logs-worker-dot--${w.status}`} />
                  <div className="logs-list-item-info">
                    <span className="logs-list-item-name">{w.name}</span>
                    <span className="logs-list-item-task">{w.taskId}: {w.taskTitle}</span>
                  </div>
                  <span className="logs-list-item-time">{timeAgo(w.startedAt)}</span>
                </button>
              ))}
            </div>
            <div className="logs-detail">
              {selected ? (
                <>
                  <div className="logs-detail-header">
                    <span className="logs-detail-name">{selected.name}</span>
                    <span className="logs-detail-role">{selected.role}</span>
                    <span className="logs-detail-task">{selected.taskId}: {selected.taskTitle}</span>
                    <span className={`logs-detail-status logs-detail-status--${selected.status}`}>
                      {selected.status}
                    </span>
                  </div>
                  <pre className="logs-output logs-output--full">{selectedOutput || "(no output captured)"}</pre>
                </>
              ) : (
                <div className="logs-empty">Select a worker to view output</div>
              )}
            </div>
          </div>
        )}

        {/* Context flow tab — what each worker passed to the next */}
        {tab === "context" && (
          <div className="logs-context">
            {compactions.length === 0 && (
              <div className="logs-empty">No completed tasks with context data yet.</div>
            )}
            {(compactions as Array<{ taskId: string; title: string; role: string; result: string }>).map((c, i) => (
              <div key={c.taskId} className="logs-context-card">
                <div className="logs-context-header">
                  <span className="logs-context-num">{i + 1}</span>
                  <span className="logs-context-task">{c.taskId}: {c.title}</span>
                  <span className="logs-context-role">{c.role}</span>
                </div>
                {i < (compactions as unknown[]).length - 1 && (
                  <div className="logs-context-arrow">
                    <svg width="16" height="24" viewBox="0 0 16 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M8 0v20M3 16l5 5 5-5" />
                    </svg>
                    <span className="logs-context-arrow-label">passed context to</span>
                  </div>
                )}
                <pre className="logs-context-output">{c.result?.slice(0, 500) ?? "(no output)"}{(c.result?.length ?? 0) > 500 ? "..." : ""}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
