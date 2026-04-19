import { useState, useEffect, useCallback } from "react";

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

interface Workspace {
  id: string;
  name: string;
  projectId: string;
}

export function ProjectsPanel({
  activeProjectId,
  activeWorkspaceId,
  onSwitch,
}: {
  activeProjectId: string | null;
  activeWorkspaceId: string | null;
  onSwitch: (projectId: string, workspaceId: string) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspacesByProject, setWorkspacesByProject] = useState<Record<string, Workspace[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingWs, setAddingWs] = useState<string | null>(null);
  const [newWsName, setNewWsName] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
    // Load workspaces for each project
    const wsMap: Record<string, Workspace[]> = {};
    for (const proj of data.projects ?? []) {
      const wsRes = await fetch(`/api/projects/${proj.id}/workspaces`);
      wsMap[proj.id] = await wsRes.json();
    }
    setWorkspacesByProject(wsMap);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const id = newName.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-");
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: newName.trim(), description: newDesc.trim() }),
    });
    setNewName("");
    setNewDesc("");
    setShowCreate(false);
    setCreating(false);
    await refresh();
    // Auto-switch to the new project
    onSwitch(id, "main");
  };

  const handleAddWorkspace = async (projectId: string) => {
    if (!newWsName.trim()) return;
    const id = newWsName.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-");
    await fetch(`/api/projects/${projectId}/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: newWsName.trim() }),
    });
    setNewWsName("");
    setAddingWs(null);
    await refresh();
  };

  return (
    <>
      <div className="projects-header">
        <span className="projects-title">Projects</span>
        <button className="btn btn--ghost btn--sm" onClick={() => setShowCreate(!showCreate)}>
          + New Project
        </button>
      </div>

      <div className="projects-body">
        {showCreate && (
          <div className="skills-panel-form" style={{ marginBottom: 16 }}>
            <div className="skills-panel-form-label">Create Project</div>
            <input
              className="skill-installer-input"
              placeholder="Project name (e.g. Empresa X)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <input
              className="skill-installer-input"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div className="skill-installer-row">
              <button className="btn btn--primary btn--sm" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? "Creating..." : "Create"}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        )}

        {projects.length === 0 && !showCreate && (
          <div className="board-empty">
            <div className="board-empty-title">No projects yet</div>
            <div className="board-empty-subtitle">Create your first project to get started</div>
          </div>
        )}

        <div className="projects-grid">
          {projects.map((proj) => {
            const wsList = workspacesByProject[proj.id] ?? [];
            const isActive = proj.id === activeProjectId;
            return (
              <div key={proj.id} className={`project-card ${isActive ? "project-card--active" : ""}`}>
                <div className="project-card-header">
                  <span className="project-card-name">{proj.name}</span>
                  {isActive && <span className="project-card-badge">Active</span>}
                </div>
                {proj.description && (
                  <div className="project-card-desc">{proj.description}</div>
                )}
                <div className="project-card-workspaces">
                  <div className="project-card-ws-label">
                    Workspaces ({wsList.length})
                    <button
                      className="btn btn--ghost btn--sm"
                      style={{ padding: "1px 6px", fontSize: 10 }}
                      onClick={() => setAddingWs(addingWs === proj.id ? null : proj.id)}
                    >+ Add</button>
                  </div>
                  {wsList.map((ws) => {
                    const isWsActive = isActive && ws.id === activeWorkspaceId;
                    return (
                      <button
                        key={ws.id}
                        className={`project-ws-item ${isWsActive ? "project-ws-item--active" : ""}`}
                        onClick={() => onSwitch(proj.id, ws.id)}
                      >
                        {ws.name}
                        {isWsActive && <span className="sidebar-ws-check">&#10003;</span>}
                      </button>
                    );
                  })}
                  {addingWs === proj.id && (
                    <div className="skill-installer-row" style={{ marginTop: 6 }}>
                      <input
                        className="skill-installer-input"
                        placeholder="Workspace name"
                        value={newWsName}
                        onChange={(e) => setNewWsName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddWorkspace(proj.id)}
                        autoFocus
                      />
                      <button className="btn btn--primary btn--sm" onClick={() => handleAddWorkspace(proj.id)} disabled={!newWsName.trim()}>
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
