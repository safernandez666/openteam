import { useState, useEffect } from "react";
import type { AgentNamesMap } from "./useWorkers";
import { getAvatarUrl } from "./useWorkers";
import { CloseIcon, RoleIcon } from "../icons";

const ROLES = [
  { key: "pm", label: "Project Manager" },
  { key: "developer", label: "Developer" },
  { key: "designer", label: "Designer" },
  { key: "tester", label: "Tester" },
  { key: "reviewer", label: "Reviewer" },
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
    Promise.all([
      fetch("/api/agent-providers").then((r) => r.json()),
      fetch("/api/project").then((r) => r.json()),
    ])
      .then(([agentProviders, projectConfig]) => {
        // Fill in defaults from project config for agents without specific provider
        const defaultProvider = projectConfig.provider ?? "claude";
        const merged: ProvidersMap = {};
        for (const role of ROLES) {
          merged[role.key] = agentProviders[role.key] ?? defaultProvider;
        }
        setProviders(merged);
        setLoading(false);
      })
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
          <button className="modal-close" aria-label="Close" onClick={onClose}><CloseIcon size={14} /></button>
        </div>

        <div className="modal-body">
          <div className="skill-editor-hint">
            Customize names and AI provider for each agent.
          </div>
          <div className="name-editor-grid">
            {ROLES.map((role) => (
              <div key={role.key} className="name-editor-row">
                <img
                  src={getAvatarUrl(names[role.key] ?? role.label)}
                  alt={role.label}
                  className="name-editor-avatar"
                />
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
