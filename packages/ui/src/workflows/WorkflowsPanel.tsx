import { useState, useEffect, useCallback } from "react";

interface WorkflowPhase {
  index: number;
  name: string;
  role: string;
  description: string;
  exit_criteria: string[];
  task_title_template: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  phases: WorkflowPhase[];
  is_builtin: number;
}

interface WorkflowInstance {
  id: string;
  template_id: string;
  root_task_id: string;
  status: string;
  current_phase: number;
  phase_data: Record<string, { startedAt?: string; completedAt?: string; notes?: string }>;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  bug_fix: "\uD83D\uDC1B",
  feature: "\u2728",
  quick_refinement: "\u26A1",
  refactor: "\uD83D\uDD27",
  security_audit: "\uD83D\uDD12",
  custom: "\uD83D\uDCCB",
};

function PhaseTimeline({ phases, currentPhase, status, phaseData }: {
  phases: WorkflowPhase[];
  currentPhase: number;
  status: string;
  phaseData: Record<string, { completedAt?: string }>;
}) {
  return (
    <div className="wf-timeline">
      {phases.map((phase, i) => {
        const completed = !!phaseData[String(i)]?.completedAt;
        const isCurrent = i === currentPhase && status === "running";
        const isPending = i > currentPhase;
        const cls = completed ? "wf-phase--done" : isCurrent ? "wf-phase--active" : isPending ? "wf-phase--pending" : "";
        return (
          <div key={i} className={`wf-phase ${cls}`}>
            <div className="wf-phase-dot" />
            {i < phases.length - 1 && <div className="wf-phase-line" />}
            <div className="wf-phase-info">
              <span className="wf-phase-name">{phase.name}</span>
              <span className="wf-phase-role">{phase.role}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WorkflowsPanel() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);

  const refresh = useCallback(async () => {
    const [tRes, iRes] = await Promise.all([
      fetch("/api/workflows/templates").then((r) => r.json()),
      fetch("/api/workflows/instances").then((r) => r.json()),
    ]);
    setTemplates(tRes);
    setInstances(iRes);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const activeInstances = instances.filter((i) => i.status === "running");
  const completedInstances = instances.filter((i) => i.status === "completed");

  return (
    <>
      <div className="wf-header">
        <span className="wf-title">Workflows</span>
        <span className="wf-count">
          {activeInstances.length > 0
            ? `${activeInstances.length} active`
            : `${templates.length} templates`}
        </span>
      </div>

      <div className="wf-body">
        {/* Active instances */}
        {activeInstances.length > 0 && (
          <div className="wf-section">
            <div className="wf-section-label">Active</div>
            {activeInstances.map((inst) => {
              const tmpl = templates.find((t) => t.id === inst.template_id);
              if (!tmpl) return null;
              const icon = CATEGORY_ICONS[tmpl.category] ?? "";
              return (
                <div key={inst.id} className="wf-instance-card">
                  <div className="wf-instance-header">
                    <span className="wf-instance-icon">{icon}</span>
                    <span className="wf-instance-name">{tmpl.name}</span>
                    <span className="wf-instance-id">{inst.id}</span>
                    <span className="wf-instance-phase">
                      Phase {inst.current_phase + 1}/{tmpl.phases.length}
                    </span>
                  </div>
                  <PhaseTimeline
                    phases={tmpl.phases}
                    currentPhase={inst.current_phase}
                    status={inst.status}
                    phaseData={inst.phase_data}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Templates */}
        <div className="wf-section">
          <div className="wf-section-label">Templates</div>
          <div className="wf-template-grid">
            {templates.map((tmpl) => {
              const icon = CATEGORY_ICONS[tmpl.category] ?? "";
              const isSelected = selectedTemplate?.id === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  className={`wf-template-card ${isSelected ? "wf-template-card--selected" : ""}`}
                  onClick={() => setSelectedTemplate(isSelected ? null : tmpl)}
                >
                  <div className="wf-template-top">
                    <span className="wf-template-icon">{icon}</span>
                    <span className="wf-template-name">{tmpl.name}</span>
                    {tmpl.is_builtin ? (
                      <span className="wf-template-badge">Built-in</span>
                    ) : (
                      <span className="wf-template-badge wf-template-badge--custom">Custom</span>
                    )}
                  </div>
                  <div className="wf-template-desc">{tmpl.description}</div>
                  <div className="wf-template-meta">{tmpl.phases.length} phases</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected template detail */}
        {selectedTemplate && (
          <div className="wf-section">
            <div className="wf-section-label">{selectedTemplate.name} — Phases</div>
            <div className="wf-detail-phases">
              {selectedTemplate.phases.map((phase, i) => (
                <div key={i} className="wf-detail-phase">
                  <div className="wf-detail-phase-num">{i + 1}</div>
                  <div className="wf-detail-phase-body">
                    <div className="wf-detail-phase-name">{phase.name}</div>
                    <div className="wf-detail-phase-role">{phase.role}</div>
                    <div className="wf-detail-phase-desc">{phase.description}</div>
                    {phase.exit_criteria.length > 0 && (
                      <div className="wf-detail-phase-criteria">
                        {phase.exit_criteria.map((c, j) => (
                          <span key={j} className="wf-criteria-chip">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed history */}
        {completedInstances.length > 0 && (
          <div className="wf-section">
            <div className="wf-section-label">Completed</div>
            {completedInstances.map((inst) => {
              const tmpl = templates.find((t) => t.id === inst.template_id);
              const icon = tmpl ? CATEGORY_ICONS[tmpl.category] ?? "" : "";
              return (
                <div key={inst.id} className="wf-instance-card wf-instance-card--done">
                  <div className="wf-instance-header">
                    <span className="wf-instance-icon">{icon}</span>
                    <span className="wf-instance-name">{tmpl?.name ?? inst.template_id}</span>
                    <span className="wf-instance-id">{inst.id}</span>
                    <span className="wf-instance-status">Completed</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
