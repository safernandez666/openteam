import { useState, useEffect } from "react";
import type { AgentNamesMap } from "./useWorkers";

const ROLES = [
  { key: "pm", emoji: "📋", label: "Project Manager" },
  { key: "developer", emoji: "🔧", label: "Developer" },
  { key: "designer", emoji: "🎨", label: "Designer" },
  { key: "tester", emoji: "🧪", label: "Tester" },
  { key: "reviewer", emoji: "🔍", label: "Reviewer" },
];

type ProvidersMap = Record<string, "claude" | "kimi">;

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
  const [providers, setProviders] = useState<ProvidersMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agent-providers")
      .then((r) => r.json())
      .then((data) => { setProviders(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = async () => {
    onSave(names);
    await fetch("/api/agent-providers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(providers),
    });
    onClose();
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-title">Team Configuration</div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="skill-editor-hint">
            Customize names and AI provider for each agent.
          </div>
          <div className="name-editor-grid">
            {ROLES.map((role) => (
              <div key={role.key} className="name-editor-row">
                <span className="name-editor-emoji">{role.emoji}</span>
                <input
                  className="name-editor-input"
                  value={names[role.key] ?? ""}
                  onChange={(e) =>
                    setNames((prev) => ({ ...prev, [role.key]: e.target.value }))
                  }
                  placeholder={role.label}
                />
                <div className="name-editor-provider">
                  <button
                    className={`provider-toggle ${(!providers[role.key] || providers[role.key] === "claude") ? "provider-toggle--active" : ""}`}
                    onClick={() => setProviders((prev) => ({ ...prev, [role.key]: "claude" }))}
                    title="Claude Code"
                  >
                    C
                  </button>
                  <button
                    className={`provider-toggle ${providers[role.key] === "kimi" ? "provider-toggle--active provider-toggle--kimi" : ""}`}
                    onClick={() => setProviders((prev) => ({ ...prev, [role.key]: "kimi" }))}
                    title="Kimi Code"
                  >
                    K
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <div className="modal-actions">
            <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
