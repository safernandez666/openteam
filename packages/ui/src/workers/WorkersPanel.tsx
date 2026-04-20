import { useState, useEffect } from "react";
import type { WorkerInfo, SkillInfo, ModuleInfo, AgentNamesMap, TeamMember, RoleDef } from "./useWorkers";
import { getRoleMeta, getAvatarUrl } from "./useWorkers";
import { SkillEditor } from "./SkillEditor";
import { ConfirmDialog } from "../ConfirmDialog";
import { CloseIcon, CheckmarkIcon } from "../icons";

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
  onRemove,
  isPM,
  initialAvatarSeed,
  onAvatarSeedChange,
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
  onRemove?: (role: string) => void;
  isPM?: boolean;
  initialAvatarSeed?: number;
  onAvatarSeedChange?: (role: string, seed: number) => void;
}) {
  const meta = getRoleMeta(role, agentNames);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(meta.displayName);
  const [avatarSeed, setAvatarSeed] = useState(initialAvatarSeed ?? 0);
  const avatarUrl = getAvatarUrl(meta.displayName + (avatarSeed ? `-${avatarSeed}` : ""));

  const handleNameSave = () => {
    if (nameInput.trim() && nameInput.trim() !== meta.displayName) {
      onNameChange(role, nameInput.trim());
    }
    setEditingName(false);
  };

  const handleAvatarClick = () => {
    const newSeed = avatarSeed + 1;
    setAvatarSeed(newSeed);
    onAvatarSeedChange?.(role, newSeed);
  };

  return (
    <div className="agent-card">
      <div className="agent-card-avatar" onClick={handleAvatarClick} title="Click to change avatar">
        <img src={avatarUrl} alt={meta.displayName} className="agent-avatar" />
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
          {onRemove && !isPM && (
            <button
              className="agent-card-remove"
              onClick={(e) => { e.stopPropagation(); onRemove(role); }}
              title="Remove from team"
            >
              <CloseIcon size={14} />
            </button>
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
  team: TeamMember[];
  roleCatalog: RoleDef[];
  onAddTeamMember: (roleId: string, name?: string) => void;
  onRemoveTeamMember: (roleId: string) => void;
  onUpdateTeamMember: (roleId: string, updates: { name?: string; provider?: string }) => void;
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
  team,
  roleCatalog,
  onAddTeamMember,
  onRemoveTeamMember,
  onUpdateTeamMember,
}: WorkersPanelProps) {
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [avatarSeeds, setAvatarSeeds] = useState<Record<string, number>>({});
  const [removingRole, setRemovingRole] = useState<string | null>(null);

  const handleNameChange = (role: string, name: string) => {
    onUpdateTeamMember(role, { name });
  };

  const handleAvatarSeedChange = (role: string, seed: number) => {
    setAvatarSeeds((prev) => ({ ...prev, [role]: seed }));
    fetch(`/api/avatar-seeds/${role}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed }),
    }).catch(() => {});
  };

  const [pmProvider, setPmProvider] = useState<"claude" | "kimi">("claude");

  // Load PM provider + avatar seeds
  useEffect(() => {
    fetch("/api/project").then((r) => r.json()).then((d) => {
      setPmProvider(d.provider ?? "claude");
    }).catch(() => {});
    fetch("/api/avatar-seeds").then((r) => r.json()).then((seeds) => {
      setAvatarSeeds(seeds);
    }).catch(() => {});
  }, []);

  const handleProviderChange = async (role: string, provider: "claude" | "kimi") => {
    if (role === "pm") {
      setPmProvider(provider);
      await fetch("/api/project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      return;
    }
    onUpdateTeamMember(role, { provider });
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
          <div className="workers-section-header">
            <div className="workers-section-label">Team</div>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowCatalog(!showCatalog)}>
              {showCatalog ? "Done" : "+ Add Agent"}
            </button>
          </div>

          {/* Role catalog — add agents */}
          {showCatalog && (
            <div className="role-catalog">
              <div className="role-catalog-hint">Select roles to add to your team</div>
              <div className="role-catalog-grid">
                {roleCatalog.map((role) => {
                  const inTeam = team.some((m) => m.roleId === role.id);
                  return (
                    <button
                      key={role.id}
                      className={`role-catalog-item ${inTeam ? "role-catalog-item--active" : ""}`}
                      onClick={() => {
                        if (inTeam) {
                          onRemoveTeamMember(role.id);
                        } else {
                          onAddTeamMember(role.id, role.defaultName);
                        }
                      }}
                    >
                      <span className="role-catalog-name">{role.name}</span>
                      <span className="role-catalog-desc">{role.description}</span>
                      {inTeam && <span className="role-catalog-check"><CheckmarkIcon /></span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="agent-grid">
            {/* PM card — always present, cannot be removed */}
            <AgentCard
              role="pm"
              activeCount={1}
              assignedModules={[]}
              agentNames={{ ...agentNames, pm: agentNames.pm ?? "Facu" }}
              provider={pmProvider}
              onNameChange={handleNameChange}
              onProviderChange={handleProviderChange}
              onEditSkill={() => {}}
              isPM
              initialAvatarSeed={avatarSeeds.pm ?? 0}
              onAvatarSeedChange={handleAvatarSeedChange}
            />

            {/* Team member cards */}
            {team.map((member) => (
              <AgentCard
                key={member.roleId}
                role={member.roleId}
                skill={skills.find((s) => s.name === member.roleId)}
                activeCount={activeByRole[member.roleId] ?? 0}
                assignedModules={roleSkillsMap[member.roleId] ?? []}
                agentNames={{ ...agentNames, [member.roleId]: member.name }}
                provider={member.provider}
                onNameChange={handleNameChange}
                onProviderChange={handleProviderChange}
                onEditSkill={setEditingSkill}
                onRemove={(roleId) => setRemovingRole(roleId)}
                initialAvatarSeed={avatarSeeds[member.roleId] ?? 0}
                onAvatarSeedChange={handleAvatarSeedChange}
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

      {removingRole && (
        <ConfirmDialog
          title="Remove Agent"
          message={`Remove "${team.find((m) => m.roleId === removingRole)?.name ?? removingRole}" from the team?`}
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            onRemoveTeamMember(removingRole);
            setRemovingRole(null);
          }}
          onCancel={() => setRemovingRole(null)}
        />
      )}
    </>
  );
}
