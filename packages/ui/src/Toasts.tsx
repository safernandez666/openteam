import { useState, useEffect, useCallback, useRef } from "react";
import type { WsEvent } from "./useWebSocket";
import { CloseIcon, ToastIcon } from "./icons";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning";
  dismissing?: boolean;
}

let toastId = 0;

export function useToasts(
  subscribe: (type: string, handler: (e: WsEvent) => void) => () => void,
) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prevWorkerIds = useRef<Set<string>>(new Set());

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, dismissing: true } : t));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 5000);

    // Browser notification
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      new Notification("OpenTeam", { body: message, icon: "/favicon.ico" });
    }
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, dismissing: true } : t));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  useEffect(() => {
    const unsubs = [
      // Worker completed
      subscribe("worker_done", (e) => {
        const taskId = e.taskId as string;
        addToast(`Task ${taskId} completed`, "success");
      }),

      // Worker started (detect new workers)
      subscribe("workers_updated", (e) => {
        const workers = (e.workers ?? []) as Array<{ taskId: string; name: string; status: string }>;
        const currentIds = new Set(workers.filter((w) => w.status === "running").map((w) => w.taskId));
        for (const w of workers) {
          if (w.status === "running" && !prevWorkerIds.current.has(w.taskId)) {
            addToast(`${w.name} started working`, "info");
          }
        }
        prevWorkerIds.current = currentIds;
      }),

      // Task status changes
      subscribe("tasks_updated", (e) => {
        // tasks_updated sends all tasks — we can't detect individual changes here
        // Individual notifications handled by worker_done and workers_updated
      }),

      // Task rejected
      subscribe("task_updated", (e) => {
        const task = e as Record<string, unknown>;
        if (task.status === "rejected") {
          addToast(`Task ${task.id} failed — ${(task.last_error as string)?.slice(0, 60) ?? "max retries reached"}`, "error");
        }
      }),

      // Workspace switched
      subscribe("workspace_info", (e) => {
        const ws = e.workspace as string | undefined;
        if (ws) {
          addToast(`Workspace: ${ws}`, "info");
        }
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe, addToast]);

  // Request browser notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  return { toasts, dismissToast };
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss?: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.type} ${toast.dismissing ? "toast--dismissing" : ""}`}
        >
          <span className="toast-icon">
            <ToastIcon type={toast.type} />
          </span>
          <span className="toast-message">{toast.message}</span>
          {onDismiss && (
            <button className="toast-dismiss" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
              <CloseIcon size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
