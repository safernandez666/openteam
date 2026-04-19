import { useState, useEffect, useCallback } from "react";
import type { WsEvent } from "../useWebSocket";

export interface WorkerInfo {
  taskId: string;
  taskTitle: string;
  role: string | null;
  name: string;
  status: "running" | "completed" | "error";
  startedAt: string;
}

export type WorkerOutputMap = Record<string, string>;

export interface SkillInfo {
  name: string;
  source: "built-in" | "user";
}

export interface ModuleInfo {
  name: string;
  source: "built-in" | "user";
}

const ROLE_STATIC: Record<string, { emoji: string; description: string }> = {
  developer: { emoji: "🔧", description: "Code, features, bug fixes" },
  designer: { emoji: "🎨", description: "UI/UX, components, visual polish" },
  tester: { emoji: "🧪", description: "Tests, validation, quality" },
  reviewer: { emoji: "🔍", description: "Code review, security, performance" },
};

export type AgentNamesMap = Record<string, string>;

/** Generate a DiceBear avatar URL for an agent */
export function getAvatarUrl(name: string): string {
  return `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(name)}&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

export function getRoleMeta(role: string, agentNames?: AgentNamesMap) {
  const s = ROLE_STATIC[role] ?? { emoji: "⚙️", description: "Custom worker skill" };
  const displayName = agentNames?.[role] ?? role;
  const avatarUrl = getAvatarUrl(displayName);
  return { ...s, displayName, avatarUrl };
}

export function useWorkers(
  subscribe: (type: string, handler: (e: WsEvent) => void) => () => void,
) {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [roleSkillsMap, setRoleSkillsMap] = useState<Record<string, string[]>>({});
  const [workerOutput, setWorkerOutput] = useState<WorkerOutputMap>({});
  const [agentNames, setAgentNames] = useState<AgentNamesMap>({});

  useEffect(() => {
    const unsubs = [
      subscribe("workers_updated", (e) => {
        if (Array.isArray(e.workers)) {
          setWorkers(e.workers as WorkerInfo[]);
        }
      }),
      subscribe("skills_roster", (e) => {
        if (Array.isArray(e.skills)) {
          setSkills(e.skills as SkillInfo[]);
        }
      }),
      subscribe("modules_roster", (e) => {
        if (Array.isArray(e.modules)) {
          setModules(e.modules as ModuleInfo[]);
        }
      }),
      subscribe("role_skills_map", (e) => {
        if (e.map && typeof e.map === "object") {
          setRoleSkillsMap(e.map as Record<string, string[]>);
        }
      }),
      subscribe("worker_output", (e) => {
        const taskId = e.taskId as string;
        const chunk = e.chunk as string;
        if (taskId && chunk) {
          setWorkerOutput((prev) => ({
            ...prev,
            [taskId]: (prev[taskId] ?? "") + chunk,
          }));
        }
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe]);

  const activeWorkers = workers.filter((w) => w.status === "running");
  const completedWorkers = workers.filter((w) => w.status !== "running");

  const getWorkerOutput = useCallback(
    (taskId: string): string => workerOutput[taskId] ?? "",
    [workerOutput],
  );

  // Fetch agent names on mount
  useEffect(() => {
    fetch("/api/agent-names")
      .then((r) => r.json())
      .then((data) => setAgentNames(data))
      .catch(() => {});
  }, []);

  const refreshModules = useCallback(async () => {
    try {
      const res = await fetch("/api/modules");
      const data = await res.json();
      if (Array.isArray(data)) setModules(data as ModuleInfo[]);
    } catch { /* ignore */ }
  }, []);

  const updateAgentNames = useCallback(async (updates: AgentNamesMap) => {
    try {
      const res = await fetch("/api/agent-names", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      setAgentNames(data);
    } catch { /* ignore */ }
  }, []);

  return { workers, activeWorkers, completedWorkers, skills, modules, roleSkillsMap, setRoleSkillsMap, getWorkerOutput, refreshModules, agentNames, updateAgentNames };
}
