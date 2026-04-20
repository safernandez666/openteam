import { useState } from "react";
import { CloseIcon, CheckmarkIcon } from "../icons";

interface OnboardingData {
  projectName: string;
  projectDesc: string;
  workspaceName: string;
  workDir: string;
  techStack: { framework: string; database: string; styling: string; testing: string };
  teamRoles: string[];
}

const TECH_OPTIONS = {
  framework: ["Next.js", "React", "Vue", "Express", "Astro", "None"],
  database: ["PostgreSQL", "Prisma", "Supabase", "MongoDB", "SQLite", "None"],
  styling: ["Tailwind", "CSS Modules", "Styled Components", "Sass", "None"],
  testing: ["Vitest", "Jest", "Playwright", "Cypress", "None"],
};

const ROLE_OPTIONS = [
  { id: "developer", name: "Developer", desc: "Code, features, bugs" },
  { id: "designer", name: "Designer", desc: "UI/UX, components" },
  { id: "tester", name: "Tester", desc: "Tests, QA" },
  { id: "reviewer", name: "Reviewer", desc: "Code review" },
  { id: "architect", name: "Architect", desc: "System design" },
  { id: "devops", name: "DevOps", desc: "CI/CD, deploy" },
  { id: "security", name: "Security", desc: "Auth, vulnerabilities" },
];

export function OnboardingWizard({
  onComplete,
  onClose,
}: {
  onComplete: (data: OnboardingData) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    projectName: "",
    projectDesc: "",
    workspaceName: "Main",
    workDir: "",
    techStack: { framework: "", database: "", styling: "", testing: "" },
    teamRoles: ["developer"],
  });

  const steps = [
    { title: "Project", subtitle: "Name your project" },
    { title: "Workspace", subtitle: "Where will the team work?" },
    { title: "Tech Stack", subtitle: "What are you building with?" },
    { title: "Team", subtitle: "Who do you need?" },
  ];

  const canNext = () => {
    if (step === 0) return data.projectName.trim().length > 0;
    if (step === 1) return data.workspaceName.trim().length > 0;
    if (step === 2) return true;
    if (step === 3) return data.teamRoles.length > 0;
    return true;
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete(data);
    }
  };

  const toggleRole = (roleId: string) => {
    setData((d) => ({
      ...d,
      teamRoles: d.teamRoles.includes(roleId)
        ? d.teamRoles.filter((r) => r !== roleId)
        : [...d.teamRoles, roleId],
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal onboarding-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="onboarding-header">
          <div>
            <div className="onboarding-step-label">Step {step + 1} of {steps.length}</div>
            <div className="onboarding-step-title">{steps[step].title}</div>
            <div className="onboarding-step-subtitle">{steps[step].subtitle}</div>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Progress bar */}
        <div className="onboarding-progress">
          {steps.map((_, i) => (
            <div key={i} className={`onboarding-progress-dot ${i <= step ? "onboarding-progress-dot--active" : ""}`} />
          ))}
        </div>

        {/* Step content */}
        <div className="onboarding-body">
          {step === 0 && (
            <div className="onboarding-fields">
              <label className="onboarding-label">Project name</label>
              <input
                className="onboarding-input"
                placeholder="e.g. My SaaS, E-commerce, Personal Site"
                value={data.projectName}
                onChange={(e) => setData({ ...data, projectName: e.target.value })}
                autoFocus
              />
              <label className="onboarding-label">Description (optional)</label>
              <input
                className="onboarding-input"
                placeholder="What is this project about?"
                value={data.projectDesc}
                onChange={(e) => setData({ ...data, projectDesc: e.target.value })}
              />
            </div>
          )}

          {step === 1 && (
            <div className="onboarding-fields">
              <label className="onboarding-label">Workspace name</label>
              <input
                className="onboarding-input"
                placeholder="e.g. Main, Frontend, API, SIEM"
                value={data.workspaceName}
                onChange={(e) => setData({ ...data, workspaceName: e.target.value })}
                autoFocus
              />
              <label className="onboarding-label">Working directory</label>
              <input
                className="onboarding-input onboarding-input--mono"
                placeholder="/path/to/your/project (where code lives)"
                value={data.workDir}
                onChange={(e) => setData({ ...data, workDir: e.target.value })}
              />
              <span className="onboarding-hint">Workers will execute code here. Leave empty to use the server's current directory.</span>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-fields">
              {(Object.keys(TECH_OPTIONS) as Array<keyof typeof TECH_OPTIONS>).map((slot) => (
                <div key={slot} className="onboarding-tech-row">
                  <label className="onboarding-label">{slot.charAt(0).toUpperCase() + slot.slice(1)}</label>
                  <div className="onboarding-chips">
                    {TECH_OPTIONS[slot].map((opt) => (
                      <button
                        key={opt}
                        className={`onboarding-chip ${data.techStack[slot] === opt ? "onboarding-chip--active" : ""}`}
                        onClick={() => setData({ ...data, techStack: { ...data.techStack, [slot]: opt === "None" ? "" : opt } })}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <span className="onboarding-hint">This configures the Skill Matrix. Workers will know your tech stack.</span>
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-fields">
              <span className="onboarding-hint">Facu (PM) is always included. Select the roles you need:</span>
              <div className="onboarding-roles">
                {ROLE_OPTIONS.map((role) => (
                  <button
                    key={role.id}
                    className={`onboarding-role ${data.teamRoles.includes(role.id) ? "onboarding-role--active" : ""}`}
                    onClick={() => toggleRole(role.id)}
                  >
                    <div className="onboarding-role-check">
                      {data.teamRoles.includes(role.id) && <CheckmarkIcon size={12} />}
                    </div>
                    <div className="onboarding-role-info">
                      <span className="onboarding-role-name">{role.name}</span>
                      <span className="onboarding-role-desc">{role.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="onboarding-footer">
          {step > 0 && (
            <button className="btn btn--ghost" onClick={() => setStep(step - 1)}>Back</button>
          )}
          <div style={{ flex: 1 }} />
          {step < steps.length - 1 ? (
            <button className="btn btn--primary" onClick={handleNext} disabled={!canNext()}>
              Next
            </button>
          ) : (
            <button className="btn btn--primary" onClick={handleNext} disabled={!canNext()}>
              Create Project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
