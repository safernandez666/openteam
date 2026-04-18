import { useState, useEffect } from "react";

export function NewWorkspaceModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (id: string, name: string) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const id = name.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(id, name.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div className="modal-title">New Workspace</div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="ws-settings-field">
              <label className="ws-settings-label">Workspace Name</label>
              <input
                className="ws-settings-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                autoFocus
              />
            </div>
            {name && (
              <div className="ws-settings-field" style={{ marginTop: 8 }}>
                <label className="ws-settings-label">ID</label>
                <span className="ws-settings-hint" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
                  {id || "..."}
                </span>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <div className="modal-actions">
              <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
                Create
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
