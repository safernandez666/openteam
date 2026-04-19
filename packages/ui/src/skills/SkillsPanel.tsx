import { useState, useEffect } from "react";
import type { ModuleInfo } from "../workers/useWorkers";

interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  source: string;
  installed: boolean;
  custom?: boolean;
}

export function SkillsPanel({
  modules,
  onRefresh,
}: {
  modules: ModuleInfo[];
  onRefresh: () => void;
}) {
  const [marketplace, setMarketplace] = useState<MarketplaceSkill[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addName, setAddName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refreshAll = () => {
    fetch("/api/marketplace")
      .then((r) => r.json())
      .then((d) => {
        setMarketplace(d.skills ?? []);
        setCategories(d.categories ?? []);
      })
      .catch(() => {});
  };

  useEffect(() => { refreshAll(); }, [modules]);

  const handleAdd = async () => {
    if (!addUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: addUrl.trim(), name: addName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAddUrl("");
      setAddName("");
      setShowAdd(false);
      onRefresh();
      refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/modules/${encodeURIComponent(id)}`, { method: "DELETE" });
    await fetch(`/api/marketplace/${encodeURIComponent(id)}`, { method: "DELETE" });
    onRefresh();
    refreshAll();
  };

  const handleInstall = async (skill: MarketplaceSkill) => {
    await fetch("/api/modules/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: skill.id, content: `Use ${skill.name} best practices and patterns.` }),
    });
    onRefresh();
    refreshAll();
  };

  // Merge: installed modules + marketplace catalog
  const allSkills: Array<MarketplaceSkill & { installedModule?: boolean }> = [];
  const seen = new Set<string>();

  // Add marketplace items
  for (const s of marketplace) {
    seen.add(s.id);
    allSkills.push({ ...s });
  }

  // Add installed modules not in marketplace
  for (const mod of modules) {
    if (!seen.has(mod.name)) {
      allSkills.push({
        id: mod.name,
        name: mod.name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
        description: "",
        category: "Custom",
        source: mod.source,
        installed: true,
        installedModule: true,
      });
    }
  }

  const q = search.toLowerCase();
  const filtered = allSkills
    .filter((s) => !filter || s.category === filter)
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  const installedCount = modules.length;

  return (
    <>
      <div className="skills-panel-header">
        <span className="skills-panel-title">Skills</span>
        <span className="skills-panel-count">{installedCount} installed</span>
      </div>

      <div className="skills-panel-body">
        {/* Search + Add */}
        <div className="mp-top-row">
          <input
            type="text"
            className="kanban-search"
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className={`btn btn--ghost btn--sm ${showAdd ? "btn--active" : ""}`}
            onClick={() => setShowAdd(!showAdd)}
          >
            + Add from GitHub
          </button>
        </div>

        {showAdd && (
          <div className="skills-panel-form">
            <div className="skills-panel-form-label">Add skill from GitHub</div>
            <div className="skills-panel-form-hint">
              Paste a repo URL. OpenTeam downloads, installs, and auto-categorizes it.
            </div>
            <input
              className="skill-installer-input"
              placeholder="Skill name (optional)"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              autoFocus
            />
            <div className="skill-installer-row">
              <input
                className="skill-installer-input"
                placeholder="https://github.com/user/skill-repo"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <button
                className="btn btn--primary btn--sm"
                onClick={handleAdd}
                disabled={loading || !addUrl.trim()}
              >
                {loading ? "Analyzing with AI..." : "Add"}
              </button>
            </div>
            {error && <div className="skill-installer-error">{error}</div>}
          </div>
        )}

        {/* Category filters */}
        <div className="mp-filters">
          <button
            className={`mp-filter ${!filter ? "mp-filter--active" : ""}`}
            onClick={() => setFilter(null)}
          >
            All ({allSkills.length})
          </button>
          {categories.map((cat) => {
            const count = allSkills.filter((s) => s.category === cat).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                className={`mp-filter ${filter === cat ? "mp-filter--active" : ""}`}
                onClick={() => setFilter(filter === cat ? null : cat)}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Skills grid */}
        <div className="mp-grid">
          {filtered.map((skill) => (
            <div key={skill.id} className={`mp-card ${skill.installed ? "mp-card--installed" : ""}`}>
              <div className="mp-card-top">
                <span className="mp-card-name">{skill.name}</span>
                <span className="mp-card-category">{skill.category}</span>
              </div>
              {skill.description && (
                <div className="mp-card-desc">{skill.description}</div>
              )}
              <div className="mp-card-bottom">
                {skill.installed ? (
                  <div className="mp-card-actions">
                    <span className="mp-card-installed">Installed</span>
                    {skill.source !== "built-in" && (
                      <button
                        className="module-card-delete"
                        onClick={() => handleDelete(skill.id)}
                        title="Remove"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => handleInstall(skill)}
                  >
                    Install
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
