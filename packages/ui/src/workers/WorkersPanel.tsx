import { useState } from "react";
import type { WorkerInfo, SkillInfo, ModuleInfo, AgentNamesMap } from "./useWorkers";
import { getRoleMeta } from "./useWorkers";
import { SkillEditor } from "./SkillEditor";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

/* ── Skill roster card ── */
function SkillCard({
  skill,
  activeCount,
  assignedModules,
  onEdit,
  agentNames,
}: {
  skill: SkillInfo;
  activeCount: number;
  assignedModules: string[];
  onEdit: (name: string) => void;
  agentNames: AgentNamesMap;
}) {
  const meta = getRoleMeta(skill.name, agentNames);
  return (
    <div className="skill-card skill-card--clickable" onClick={() => onEdit(skill.name)}>
      <div className="skill-card-avatar">{meta.emoji}</div>
      <div className="skill-card-info">
        <div className="skill-card-name">
          {meta.displayName}
          <span className="skill-card-role">{skill.name}</span>
          {skill.source === "user" && (
            <span className="skill-card-custom">custom</span>
          )}
        </div>
        <div className="skill-card-desc">{meta.description}</div>
        {assignedModules.length > 0 && (
          <div className="skill-card-modules">
            {assignedModules.map((m) => (
              <span key={m} className="skill-card-module-chip">{m}</span>
            ))}
          </div>
        )}
      </div>
      {activeCount > 0 ? (
        <span className="skill-card-active">
          <span className="skill-card-active-dot" />
          {activeCount}
        </span>
      ) : (
        <span className="skill-card-idle">idle</span>
      )}
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

  // Show last N chars of output for a compact live view
  const liveOutput = output ? output.slice(-500) : "";

  return (
    <div className="worker-card">
      <div className="worker-card-header">
        <div className="worker-avatar">{meta.emoji}</div>
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
      {liveOutput && worker.status === "running" && (
        <div className="worker-output">
          <pre className="worker-output-text">{liveOutput}</pre>
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
            : `${skills.length} roles`}
        </span>
      </div>

      <div className="workers-body">
        {/* Team roster — always visible */}
        <div className="workers-section">
          <div className="workers-section-label">Team</div>
          <div className="workers-section-subtitle">
            Available worker roles. Assign a task with role to spawn one.
          </div>
          {skills.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              activeCount={activeByRole[skill.name] ?? 0}
              assignedModules={roleSkillsMap[skill.name] ?? []}
              onEdit={setEditingSkill}
              agentNames={agentNames}
            />
          ))}

          {/* PM is always part of the team */}
          <div className="skill-card skill-card--pm">
            <div className="skill-card-avatar">📋</div>
            <div className="skill-card-info">
              <div className="skill-card-name">
                {agentNames.pm ?? "Clara"}
                <span className="skill-card-role">PM</span>
              </div>
              <div className="skill-card-desc">
                Project manager, coordination, chat
              </div>
            </div>
            <span className="skill-card-active">
              <span className="skill-card-active-dot skill-card-active-dot--pm" />
              on
            </span>
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
