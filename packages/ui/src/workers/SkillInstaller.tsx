import { useState } from "react";

type Mode = "closed" | "github" | "create";

export function SkillInstaller({
  onInstalled,
}: {
  onInstalled: () => void;
}) {
  const [mode, setMode] = useState<Mode>("closed");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => {
    setMode("closed");
    setUrl("");
    setName("");
    setContent("");
    setError(null);
    setSuccess(null);
  };

  const handleInstallGithub = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/modules/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Installed: ${data.installed.join(", ")}`);
      onInstalled();
      setTimeout(reset, 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/modules/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), content: content.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Created: ${name.trim()}`);
      onInstalled();
      setTimeout(reset, 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (mode === "closed") {
    return (
      <div className="skill-installer-actions">
        <button className="btn btn--ghost btn--sm" onClick={() => setMode("github")}>
          + From GitHub
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => setMode("create")}>
          + Create
        </button>
      </div>
    );
  }

  return (
    <div className="skill-installer">
      {mode === "github" && (
        <>
          <div className="skill-installer-label">Install from GitHub</div>
          <div className="skill-installer-row">
            <input
              className="skill-installer-input"
              placeholder="https://github.com/user/skill-repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInstallGithub()}
              autoFocus
            />
            <button
              className="btn btn--primary btn--sm"
              onClick={handleInstallGithub}
              disabled={loading || !url.trim()}
            >
              {loading ? "..." : "Install"}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={reset}>
              Cancel
            </button>
          </div>
        </>
      )}

      {mode === "create" && (
        <>
          <div className="skill-installer-label">Create new skill</div>
          <input
            className="skill-installer-input"
            placeholder="Skill name (e.g. drizzle, supabase)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <textarea
            className="skill-installer-textarea"
            placeholder="Skill content (instructions for the agent)..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="skill-installer-row">
            <button
              className="btn btn--primary btn--sm"
              onClick={handleCreate}
              disabled={loading || !name.trim() || !content.trim()}
            >
              {loading ? "..." : "Create"}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={reset}>
              Cancel
            </button>
          </div>
        </>
      )}

      {error && <div className="skill-installer-error">{error}</div>}
      {success && <div className="skill-installer-success">{success}</div>}
    </div>
  );
}
