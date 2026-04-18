import { useState, useEffect } from "react";

interface ProjectConfig {
  workDir: string;
  repoUrl: string | null;
  branch: string;
  name: string;
  description: string;
}

export function WorkspaceSettings({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/project")
      .then((r) => r.json())
      .then((data) => setConfig(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
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
          <div className="modal-title">Workspace Settings</div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="ws-settings-grid">
            <div className="ws-settings-field">
              <label className="ws-settings-label">Project Name</label>
              <input
                className="ws-settings-input"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
                placeholder="My Project"
              />
            </div>

            <div className="ws-settings-field">
              <label className="ws-settings-label">Description</label>
              <input
                className="ws-settings-input"
                value={config.description}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                placeholder="What this project is about"
              />
            </div>

            <div className="ws-settings-field">
              <label className="ws-settings-label">Working Directory</label>
              <input
                className="ws-settings-input ws-settings-input--mono"
                value={config.workDir}
                onChange={(e) => setConfig({ ...config, workDir: e.target.value })}
                placeholder="/path/to/project"
              />
              <span className="ws-settings-hint">Where workers execute code</span>
            </div>

            <div className="ws-settings-field">
              <label className="ws-settings-label">Git Repository</label>
              <input
                className="ws-settings-input ws-settings-input--mono"
                value={config.repoUrl ?? ""}
                onChange={(e) => setConfig({ ...config, repoUrl: e.target.value || null })}
                placeholder="https://github.com/user/repo"
              />
              <span className="ws-settings-hint">Optional — repo URL for workers to push to</span>
            </div>

            <div className="ws-settings-field">
              <label className="ws-settings-label">Branch</label>
              <input
                className="ws-settings-input ws-settings-input--mono"
                value={config.branch}
                onChange={(e) => setConfig({ ...config, branch: e.target.value })}
                placeholder="main"
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {error && <span className="modal-error">{error}</span>}
          {saved && <span className="modal-saved">Saved</span>}
          <div className="modal-actions">
            <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
