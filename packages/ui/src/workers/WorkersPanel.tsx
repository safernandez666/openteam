import { useState, useEffect } from "react";
import type { WorkerInfo, SkillInfo, ModuleInfo, AgentNamesMap } from "./useWorkers";
import { getRoleMeta, getAvatarUrl } from "./useWorkers";
import { SkillEditor } from "./SkillEditor";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

/* ── Agent Card — inline editable ── */
function AgentCard({
  role,
  skill,
  activeCount,
  assignedModules,
  agentNames,
  provider,
  onNameChange,
  onProviderChange,
  onEditSkill,
}: {
  role: string;
  skill?: SkillInfo;
  activeCount: number;
  assignedModules: string[];
  agentNames: AgentNamesMap;
  provider: "claude" | "kimi";
  onNameChange: (role: string, name: string) => void;
  onProviderChange: (role: string, provider: "claude" | "kimi") => void;
  onEditSkill: (name: string) => void;
}) {
  const meta = getRoleMeta(role, agentNames);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(meta.displayName);

  const handleNameSave = () => {
    if (nameInput.trim() && nameInput.trim() !== meta.displayName) {
      onNameChange(role, nameInput.trim());
    }
    setEditingName(false);
  };

  return (
    <div className="agent-card">
      <div className="agent-card-avatar">
        <img src={meta.avatarUrl} alt={meta.displayName} className="agent-avatar" />
      </div>
      <div className="agent-card-body">
        <div className="agent-card-top">
          {editingName ? (
            <input
              className="agent-card-name-input"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => { if (e.key === "Enter") handleNameSave(); if (e.key === "Escape") setEditingName(false); }}
              autoFocus
            />
          ) : (
            <span className="agent-card-name" onDoubleClick={() => setEditingName(true)} title="Double-click to edit">
              {meta.displayName}
            </span>
          )}
          <span className="agent-card-role">{role}</span>
          {activeCount > 0 && (
            <span className="agent-card-active">
              <span className="agent-card-active-dot" />
              {activeCount}
            </span>
          )}
        </div>
        <div className="agent-card-desc">{meta.description}</div>
        <div className="agent-card-bottom">
          <div className="agent-card-provider">
            <button
              className={`provider-pill ${provider === "claude" ? "provider-pill--active" : ""}`}
              onClick={() => onProviderChange(role, "claude")}
            >
              Claude
            </button>
            <button
              className={`provider-pill provider-pill--kimi ${provider === "kimi" ? "provider-pill--active" : ""}`}
              onClick={() => onProviderChange(role, "kimi")}
            >
              Kimi
            </button>
          </div>
          {assignedModules.length > 0 && (
            <div className="agent-card-modules">
              {assignedModules.map((m) => (
                <span key={m} className="skill-card-module-chip">{m}</span>
              ))}
            </div>
          )}
          {skill && (
            <button className="agent-card-edit-btn" onClick={() => onEditSkill(role)}>
              Edit Skills
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Active worker card ── */
function WorkerCard({
  worker,
  output,
}: {
  worker: WorkerInfo;
  output?: string;
}) {
  const meta = getRoleMeta(worker.role ?? "");
  const statusClass =
    worker.status === "running"
      ? "worker-status--running"
      : worker.status === "completed"
        ? "worker-status--completed"
        : "worker-status--error";

  const statusLabel =
    worker.status === "running"
      ? "Working"
      : worker.status === "completed"
        ? "Done"
        : "Error";

  const [expanded, setExpanded] = useState(false);
  const hasOutput = !!output && output.length > 0;
  const isTruncated = hasOutput && output.length > 500;
  const liveOutput = hasOutput
    ? expanded
      ? output
      : output.slice(-500)
    : "";

  return (
    <div className="worker-card">
      <div className="worker-card-header">
        <div className="worker-avatar">
          <img src={getAvatarUrl(worker.name)} alt={worker.name} className="agent-avatar agent-avatar--sm" />
        </div>
        <div className="worker-identity">
          <span className="worker-name">{worker.name}</span>
          {worker.role && <span className="worker-role">{worker.role}</span>}
        </div>
        <span className={`worker-status ${statusClass}`}>
          <span className="worker-status-dot" />
          {statusLabel}
        </span>
      </div>
      <div className="worker-task-info">
        <span className="worker-task-id">{worker.taskId}</span>
        <span className="worker-task-title">{worker.taskTitle}</span>
      </div>
      {liveOutput && (
        <div className={`worker-output ${expanded ? "worker-output--expanded" : ""}`}>
          <pre className="worker-output-text">{liveOutput}</pre>
          {isTruncated && (
            <button
              className="worker-output-toggle"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : `Show full output (${(output.length / 1000).toFixed(1)}k chars)`}
            </button>
          )}
        </div>
      )}
      <div className="worker-meta">
        <span className="worker-elapsed">{timeAgo(worker.startedAt)} ago</span>
        {output && (
          <span className="worker-output-size">
            {output.length > 1000
              ? `${(output.length / 1000).toFixed(1)}k chars`
              : `${output.length} chars`}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Panel ── */
interface WorkersPanelProps {
  workers: WorkerInfo[];
  activeWorkers: WorkerInfo[];
  completedWorkers: WorkerInfo[];
  skills: SkillInfo[];
  modules: ModuleInfo[];
  roleSkillsMap: Record<string, string[]>;
  onRoleSkillsChange: (role: string, skills: string[]) => void;
  getWorkerOutput: (taskId: string) => string;
  agentNames: AgentNamesMap;
  onUpdateAgentNames: (updates: AgentNamesMap) => void;
}

export function WorkersPanel({
  activeWorkers,
  completedWorkers,
  skills,
  modules,
  roleSkillsMap,
  onRoleSkillsChange,
  getWorkerOutput,
  agentNames,
  onUpdateAgentNames,
}: WorkersPanelProps) {
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, "claude" | "kimi">>({});

  // Load providers on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/agent-providers").then((r) => r.json()),
      fetch("/api/project").then((r) => r.json()),
    ]).then(([agentP, project]) => {
      const defaultP = project.provider ?? "claude";
      const merged: Record<string, "claude" | "kimi"> = {};
      for (const role of ["pm", "developer", "designer", "tester", "reviewer"]) {
        merged[role] = agentP[role] ?? defaultP;
      }
      setProviders(merged);
    }).catch(() => {});
  }, []);

  const handleProviderChange = async (role: string, provider: "claude" | "kimi") => {
    setProviders((prev) => ({ ...prev, [role]: provider }));
    await fetch("/api/agent-providers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [role]: provider }),
    });
  };

  const handleNameChange = (role: string, name: string) => {
    onUpdateAgentNames({ [role]: name });
  };

  // Count active workers per role
  const activeByRole: Record<string, number> = {};
  for (const w of activeWorkers) {
    const role = w.role ?? "unknown";
    activeByRole[role] = (activeByRole[role] ?? 0) + 1;
  }

  return (
    <>
      <div className="workers-header">
        <span className="workers-title">Workers</span>
        <span className="workers-count">
          {activeWorkers.length > 0
            ? `${activeWorkers.length} active`
            : `${skills.length + 1} agents`}
        </span>
      </div>

      <div className="workers-body">
        {/* Team grid */}
        <div className="workers-section">
          <div className="workers-section-label">Team</div>
          <div className="agent-grid">
            {/* PM card */}
            <AgentCard
              role="pm"
              activeCount={1}
              assignedModules={[]}
              agentNames={agentNames}
              provider={providers.pm ?? "claude"}
              onNameChange={handleNameChange}
              onProviderChange={handleProviderChange}
              onEditSkill={() => {}}
            />

            {/* Worker cards */}
            {skills.map((skill) => (
              <AgentCard
                key={skill.name}
                role={skill.name}
                skill={skill}
                activeCount={activeByRole[skill.name] ?? 0}
                assignedModules={roleSkillsMap[skill.name] ?? []}
                agentNames={agentNames}
                provider={providers[skill.name] ?? "claude"}
                onNameChange={handleNameChange}
                onProviderChange={handleProviderChange}
                onEditSkill={setEditingSkill}
              />
            ))}
          </div>
        </div>

        {/* Active workers */}
        {activeWorkers.length > 0 && (
          <div className="workers-section">
            <div className="workers-section-label">Active</div>
            {activeWorkers.map((w) => (
              <WorkerCard key={w.taskId} worker={w} output={getWorkerOutput(w.taskId)} />
            ))}
          </div>
        )}

        {/* History */}
        {completedWorkers.length > 0 && (
          <div className="workers-section">
            <div className="workers-section-label">History</div>
            {completedWorkers.map((w) => (
              <WorkerCard key={w.taskId} worker={w} output={getWorkerOutput(w.taskId)} />
            ))}
          </div>
        )}
      </div>

      {editingSkill && (
        <SkillEditor
          skillName={editingSkill}
          modules={modules}
          assignedSkills={roleSkillsMap[editingSkill] ?? []}
          onSkillsChange={onRoleSkillsChange}
          onClose={() => setEditingSkill(null)}
        />
      )}
    </>
  );
}
