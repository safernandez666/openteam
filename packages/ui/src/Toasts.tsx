import { useState, useEffect, useCallback } from "react";
import type { WsEvent } from "./useWebSocket";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let toastId = 0;

export function useToasts(
  subscribe: (type: string, handler: (e: WsEvent) => void) => () => void,
) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    const unsubs = [
      subscribe("worker_done", (e) => {
        const taskId = e.taskId as string;
        addToast(`Task ${taskId} completed`, "success");
      }),
      subscribe("task_updated", (e) => {
        const task = e as Record<string, unknown>;
        if (task.status === "rejected") {
          addToast(`Task ${task.id} rejected — ${(task.last_error as string)?.slice(0, 60) ?? "max retries"}`, "error");
        }
        if (task.status === "blocked" && task.last_error) {
          addToast(`Task ${task.id} blocked — ${(task.last_error as string)?.slice(0, 60)}`, "error");
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

  return { toasts };
}

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          <span className="toast-icon">
            {toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
