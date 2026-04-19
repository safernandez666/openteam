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

export interface TeamMember {
  roleId: string;
  name: string;
  provider: "claude" | "kimi";
}

export interface RoleDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: string;
  defaultName: string;
}

const ROLE_STATIC: Record<string, { emoji: string; description: string }> = {
  pm: { emoji: "clipboard", description: "Project manager, coordination, chat" },
  developer: { emoji: "code", description: "Code, features, bug fixes" },
  designer: { emoji: "palette", description: "UI/UX, components, visual polish" },
  tester: { emoji: "test-tube", description: "Tests, validation, quality" },
  reviewer: { emoji: "search", description: "Code review, security, performance" },
  architect: { emoji: "building", description: "System design, architecture decisions" },
  devops: { emoji: "rocket", description: "CI/CD, Docker, deployments" },
  security: { emoji: "shield", description: "Auth, vulnerabilities, hardening" },
  "data-engineer": { emoji: "database", description: "ETL, data models, migrations" },
  copywriter: { emoji: "pen", description: "UI text, docs, marketing copy" },
  seo: { emoji: "globe", description: "Meta tags, structured data, sitemaps" },
  performance: { emoji: "zap", description: "Core Web Vitals, bundle size, caching" },
  "api-designer": { emoji: "plug", description: "REST/GraphQL API design, schemas" },
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

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [roleCatalog, setRoleCatalog] = useState<RoleDef[]>([]);

  // Fetch agent names + team + catalog on mount
  useEffect(() => {
    fetch("/api/agent-names").then((r) => r.json()).then(setAgentNames).catch(() => {});
    fetch("/api/team").then((r) => r.json()).then((d) => setTeam(d.members ?? [])).catch(() => {});
    fetch("/api/role-catalog").then((r) => r.json()).then((d) => setRoleCatalog(d.roles ?? [])).catch(() => {});
  }, []);

  const refreshModules = useCallback(async () => {
    try {
      const res = await fetch("/api/modules");
      const data = await res.json();
      if (Array.isArray(data)) setModules(data as ModuleInfo[]);
    } catch { /* ignore */ }
  }, []);

  const addTeamMember = useCallback(async (roleId: string, name?: string, provider?: string) => {
    const res = await fetch("/api/team/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId, name, provider }),
    });
    if (res.ok) {
      const d = await fetch("/api/team").then((r) => r.json());
      setTeam(d.members ?? []);
    }
  }, []);

  const removeTeamMember = useCallback(async (roleId: string) => {
    await fetch(`/api/team/members/${encodeURIComponent(roleId)}`, { method: "DELETE" });
    const d = await fetch("/api/team").then((r) => r.json());
    setTeam(d.members ?? []);
  }, []);

  const updateTeamMember = useCallback(async (roleId: string, updates: { name?: string; provider?: string }) => {
    await fetch(`/api/team/members/${encodeURIComponent(roleId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const d = await fetch("/api/team").then((r) => r.json());
    setTeam(d.members ?? []);
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

  return { workers, activeWorkers, completedWorkers, skills, modules, roleSkillsMap, setRoleSkillsMap, getWorkerOutput, refreshModules, agentNames, updateAgentNames, team, roleCatalog, addTeamMember, removeTeamMember, updateTeamMember };
}
