import { useState, useEffect } from "react";
import type { AgentNamesMap } from "./useWorkers";

const ROLES = [
  { key: "pm", emoji: "📋", label: "Project Manager" },
  { key: "developer", emoji: "🔧", label: "Developer" },
  { key: "designer", emoji: "🎨", label: "Designer" },
  { key: "tester", emoji: "🧪", label: "Tester" },
  { key: "reviewer", emoji: "🔍", label: "Reviewer" },
];

export function NameEditor({
  agentNames,
  onSave,
  onClose,
}: {
  agentNames: AgentNamesMap;
  onSave: (updates: AgentNamesMap) => void;
  onClose: () => void;
}) {
  const [names, setNames] = useState<AgentNamesMap>({ ...agentNames });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = () => {
    onSave(names);
    onClose();
  };

  const isModified = JSON.stringify(names) !== JSON.stringify(agentNames);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div className="modal-title">Team Names</div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="skill-editor-hint">
            Customize the names of your AI team members.
          </div>
          <div className="name-editor-grid">
            {ROLES.map((role) => (
              <div key={role.key} className="name-editor-row">
                <span className="name-editor-emoji">{role.emoji}</span>
                <span className="name-editor-role">{role.label}</span>
                <input
                  className="name-editor-input"
                  value={names[role.key] ?? ""}
                  onChange={(e) =>
                    setNames((prev) => ({ ...prev, [role.key]: e.target.value }))
                  }
                  placeholder={role.label}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <div className="modal-actions">
            <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn btn--primary"
              onClick={handleSave}
              disabled={!isModified}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
