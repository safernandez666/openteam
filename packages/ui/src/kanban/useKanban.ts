import { useState, useEffect, useCallback } from "react";
import type { WsEvent } from "../useWebSocket";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  assignee: string | null;
  priority: string;
  depends_on: string | null;
  created_at: string;
  updated_at: string;
}

export const COLUMNS = [
  { key: "backlog", label: "Backlog" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "blocked", label: "Blocked" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
] as const;

export function useKanban(
  subscribe: (type: string, handler: (e: WsEvent) => void) => () => void,
) {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const unsub = subscribe("tasks_updated", (e) => {
      if (Array.isArray(e.tasks)) {
        setTasks(e.tasks as Task[]);
      }
    });
    return unsub;
  }, [subscribe]);

  const tasksByColumn = useCallback(() => {
    const grouped: Record<string, Task[]> = {};
    for (const col of COLUMNS) {
      grouped[col.key] = tasks.filter((t) => t.status === col.key);
    }
    return grouped;
  }, [tasks]);

  return { tasks, tasksByColumn };
}
