import { useState, useEffect } from "react";
import type { ModuleInfo } from "../workers/useWorkers";

function ModuleCard({
  mod,
  onDelete,
}: {
  mod: ModuleInfo;
  onDelete: (name: string) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = async () => {
    if (!expanded && content === null) {
      try {
        const res = await fetch(`/api/modules`);
        const all = await res.json();
        const found = all.find((m: { name: string; content?: string }) => m.name === mod.name);
        setContent(found?.content ?? "(no content)");
      } catch {
        setContent("(failed to load)");
      }
    }
    setExpanded(!expanded);
  };

  return (
    <div className="module-card">
      <div className="module-card-header" onClick={toggleExpand}>
        <span className="module-card-name">{mod.name}</span>
        <div className="module-card-actions">
          <span className={`module-card-source module-card-source--${mod.source}`}>
            {mod.source}
          </span>
          {mod.source === "user" && (
            <button
              className="module-card-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(mod.name);
              }}
              title="Delete"
            >
              &times;
            </button>
          )}
        </div>
      </div>
      {expanded && content !== null && (
        <pre className="module-card-content">{content}</pre>
      )}
    </div>
  );
}

type InstallerMode = "closed" | "github" | "create";

export function SkillsPanel({
  modules,
  onRefresh,
}: {
  modules: ModuleInfo[];
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<"installed" | "marketplace">("installed");
  const [marketplace, setMarketplace] = useState<Array<{ id: string; name: string; description: string; category: string; source: string; installed: boolean }>>([]);
  const [mpCategories, setMpCategories] = useState<string[]>([]);
  const [mpFilter, setMpFilter] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/marketplace")
      .then((r) => r.json())
      .then((d) => { setMarketplace(d.skills ?? []); setMpCategories(d.categories ?? []); })
      .catch(() => {});
  }, [modules]);

  const handleMarketplaceInstall = async (skill: { id: string; name: string }) => {
    setInstalling(skill.id);
    try {
      await fetch("/api/modules/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: skill.id, content: `Use ${skill.name} best practices and patterns.` }),
      });
      onRefresh();
    } catch { /* ignore */ }
    setInstalling(null);
  };

  const [mode, setMode] = useState<InstallerMode>("closed");
  const [url, setUrl] = useState("");
  const [skillName, setSkillName] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => {
    setMode("closed");
    setUrl("");
    setSkillName("");
    setName("");
    setContent("");
    setError(null);
    setSuccess(null);
  };

  const handleInstall = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/modules/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: url.trim(), name: skillName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Installed: ${data.installed.join(", ")}`);
      onRefresh();
      setTimeout(reset, 2500);
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
      onRefresh();
      setTimeout(reset, 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (modName: string) => {
    try {
      const res = await fetch(`/api/modules/${encodeURIComponent(modName)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const builtIn = modules.filter((m) => m.source === "built-in");
  const custom = modules.filter((m) => m.source === "user");

  return (
    <>
      <div className="skills-panel-header">
        <div className="skills-tabs">
          <button
            className={`skills-tab ${tab === "installed" ? "skills-tab--active" : ""}`}
            onClick={() => setTab("installed")}
          >
            Installed ({modules.length})
          </button>
          <button
            className={`skills-tab ${tab === "marketplace" ? "skills-tab--active" : ""}`}
            onClick={() => setTab("marketplace")}
          >
            Marketplace
          </button>
        </div>
      </div>

      <div className="skills-panel-body">
        {/* Marketplace tab */}
        {tab === "marketplace" && (
          <>
            <div className="mp-filters">
              <button
                className={`mp-filter ${!mpFilter ? "mp-filter--active" : ""}`}
                onClick={() => setMpFilter(null)}
              >
                All
              </button>
              {mpCategories.map((cat) => (
                <button
                  key={cat}
                  className={`mp-filter ${mpFilter === cat ? "mp-filter--active" : ""}`}
                  onClick={() => setMpFilter(mpFilter === cat ? null : cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="mp-grid">
              {marketplace
                .filter((s) => !mpFilter || s.category === mpFilter)
                .map((skill) => (
                  <div key={skill.id} className={`mp-card ${skill.installed ? "mp-card--installed" : ""}`}>
                    <div className="mp-card-top">
                      <span className="mp-card-name">{skill.name}</span>
                      <span className="mp-card-category">{skill.category}</span>
                    </div>
                    <div className="mp-card-desc">{skill.description}</div>
                    <div className="mp-card-bottom">
                      {skill.installed ? (
                        <span className="mp-card-installed">Installed</span>
                      ) : (
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => handleMarketplaceInstall(skill)}
                          disabled={installing === skill.id}
                        >
                          {installing === skill.id ? "..." : "Install"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}

        {/* Installed tab */}
        {tab === "installed" && (
        <>
        {/* Actions */}
        <div className="skills-panel-actions">
          <button
            className={`btn btn--ghost btn--sm ${mode === "github" ? "btn--active" : ""}`}
            onClick={() => setMode(mode === "github" ? "closed" : "github")}
          >
            + From GitHub
          </button>
          <button
            className={`btn btn--ghost btn--sm ${mode === "create" ? "btn--active" : ""}`}
            onClick={() => setMode(mode === "create" ? "closed" : "create")}
          >
            + Create
          </button>
        </div>

        {/* Install form */}
        {mode === "github" && (
          <div className="skills-panel-form">
            <div className="skills-panel-form-label">Install from GitHub</div>
            <div className="skills-panel-form-hint">
              Paste a repo URL. All .md files will be installed as skill modules.
            </div>
            <input
              className="skill-installer-input"
              placeholder="Skill name (e.g. ui-ux-pro-max)"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              autoFocus
            />
            <div className="skill-installer-row">
              <input
                className="skill-installer-input"
                placeholder="https://github.com/user/skill-repo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInstall()}
              />
              <button
                className="btn btn--primary btn--sm"
                onClick={handleInstall}
                disabled={loading || !url.trim() || !skillName.trim()}
              >
                {loading ? "Installing..." : "Install"}
              </button>
            </div>
          </div>
        )}

        {/* Create form */}
        {mode === "create" && (
          <div className="skills-panel-form">
            <div className="skills-panel-form-label">Create new skill</div>
            <input
              className="skill-installer-input"
              placeholder="Skill name (e.g. drizzle, supabase)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <textarea
              className="skill-installer-textarea"
              placeholder="Skill content — instructions the agent will follow when this skill is assigned..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="skill-installer-row">
              <button
                className="btn btn--primary btn--sm"
                onClick={handleCreate}
                disabled={loading || !name.trim() || !content.trim()}
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        )}

        {error && <div className="skill-installer-error">{error}</div>}
        {success && <div className="skill-installer-success">{success}</div>}

        {/* Custom modules */}
        {custom.length > 0 && (
          <div className="skills-panel-section">
            <div className="skills-panel-section-label">Custom</div>
            <div className="skills-panel-grid">
              {custom.map((mod) => (
                <ModuleCard key={mod.name} mod={mod} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        {/* Built-in modules */}
        <div className="skills-panel-section">
          <div className="skills-panel-section-label">Built-in</div>
          <div className="skills-panel-grid">
            {builtIn.map((mod) => (
              <ModuleCard key={mod.name} mod={mod} onDelete={handleDelete} />
            ))}
          </div>
        </div>
        </>
        )}
      </div>
    </>
  );
}
