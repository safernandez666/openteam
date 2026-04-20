import { useState, useEffect, useCallback } from "react";
import { ConfirmDialog } from "../ConfirmDialog";

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
  onRefresh,
  onOpenSettings,
}: {
  activeProjectId: string | null;
  activeWorkspaceId: string | null;
  onSwitch: (projectId: string, workspaceId: string) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspacesByProject, setWorkspacesByProject] = useState<Record<string, Workspace[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newWsName, setNewWsName] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingWs, setAddingWs] = useState<string | null>(null);
  const [addWsName, setAddWsName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const [deletingWs, setDeletingWs] = useState<{ projectId: string; wsId: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
    const wsMap: Record<string, Workspace[]> = {};
    for (const proj of data.projects ?? []) {
      const wsRes = await fetch(`/api/projects/${proj.id}/workspaces`);
      wsMap[proj.id] = await wsRes.json();
    }
    setWorkspacesByProject(wsMap);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!newName.trim() || !newWsName.trim()) return;
    setCreating(true);
    const projId = newName.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-");
    const wsId = newWsName.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-");

    // Create project
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projId, name: newName.trim(), description: newDesc.trim() }),
    });

    // Create the first workspace with user's name
    await fetch(`/api/projects/${projId}/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: wsId, name: newWsName.trim() }),
    });

    setNewName("");
    setNewDesc("");
    setNewWsName("");
    setShowCreate(false);
    setCreating(false);
    await refresh();
    onSwitch(projId, wsId !== "main" ? wsId : "main");
  };

  const handleAddWorkspace = async (projectId: string) => {
    if (!addWsName.trim()) return;
    const id = addWsName.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-");
    await fetch(`/api/projects/${projectId}/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: addWsName.trim() }),
    });
    setAddWsName("");
    setAddingWs(null);
    await refresh();
  };

  const handleDeleteProject = async () => {
    if (!deletingProject) return;
    await fetch(`/api/projects/${deletingProject}`, { method: "DELETE" });
    setDeletingProject(null);
    await refresh();
    onRefresh();
  };

  const confirmDeleteWorkspace = async () => {
    if (!deletingWs) return;
    await fetch(`/api/projects/${deletingWs.projectId}/workspaces/${deletingWs.wsId}`, { method: "DELETE" });
    setDeletingWs(null);
    await refresh();
  };

  const startEdit = (proj: Project) => {
    setEditing(proj.id);
    setEditName(proj.name);
    setEditDesc(proj.description);
  };

  const saveEdit = async (projId: string) => {
    // For now we don't have a PUT endpoint for projects — save via re-creation would be destructive
    // Just update the project.json directly via a new endpoint
    await fetch(`/api/projects/${projId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() }),
    });
    setEditing(null);
    await refresh();
    onRefresh();
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
              placeholder="Project name"
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
            <input
              className="skill-installer-input"
              placeholder="First workspace name (e.g. SIEM, Frontend)"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
            />
            <div className="skill-installer-row">
              <button className="btn btn--primary btn--sm" onClick={handleCreate} disabled={creating || !newName.trim() || !newWsName.trim()}>
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
            const isEditing = editing === proj.id;
            return (
              <div
                key={proj.id}
                className={`project-card ${isActive ? "project-card--active" : ""}`}
                onClick={() => {
                  if (!isActive && !isEditing && wsList.length > 0) {
                    onSwitch(proj.id, wsList[0].id);
                  }
                }}
                style={!isActive && !isEditing && wsList.length > 0 ? { cursor: "pointer" } : undefined}
              >
                <div className="project-card-header">
                  {isEditing ? (
                    <input
                      className="skill-installer-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      style={{ flex: 1, fontSize: 15, fontWeight: 700 }}
                    />
                  ) : (
                    <span className="project-card-name" onDoubleClick={() => startEdit(proj)} title="Double-click to edit">
                      {proj.name}
                    </span>
                  )}
                  <div className="project-card-actions">
                    {isActive && <span className="project-card-badge">Active</span>}
                    {isEditing ? (
                      <button className="btn btn--primary btn--sm" onClick={() => saveEdit(proj.id)}>Save</button>
                    ) : (
                      <button className="module-card-delete" aria-label="Delete"
                      onClick={() => setDeletingProject(proj.id)}
                        title="Delete project"
                      >&times;</button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <input
                    className="skill-installer-input"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Description"
                    style={{ fontSize: 12 }}
                  />
                ) : (
                  proj.description && <div className="project-card-desc">{proj.description}</div>
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
                      <div key={ws.id} className="project-ws-row">
                        <button
                          className={`project-ws-item ${isWsActive ? "project-ws-item--active" : ""}`}
                          onClick={(e) => { e.stopPropagation(); onSwitch(proj.id, ws.id); }}
                        >
                          {ws.name}
                          {isWsActive && <span className="sidebar-ws-check">&#10003;</span>}
                        </button>
                        {isWsActive && (
                          <button
                            className="project-ws-settings"
                            onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
                            title="Workspace settings"
                          >&#9881;</button>
                        )}
                        {!isWsActive && (
                          <button
                            className="project-ws-delete"
                            onClick={(e) => { e.stopPropagation(); setDeletingWs({ projectId: proj.id, wsId: ws.id }); }}
                            title="Delete workspace"
                          >&times;</button>
                        )}
                      </div>
                    );
                  })}
                  {addingWs === proj.id && (
                    <div className="skill-installer-row" style={{ marginTop: 6 }}>
                      <input
                        className="skill-installer-input"
                        placeholder="Workspace name"
                        value={addWsName}
                        onChange={(e) => setAddWsName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddWorkspace(proj.id)}
                        autoFocus
                      />
                      <button className="btn btn--primary btn--sm" onClick={() => handleAddWorkspace(proj.id)} disabled={!addWsName.trim()}>
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

      {deletingProject && (
        <ConfirmDialog
          title="Delete Project"
          message="This will permanently delete the project and all its workspaces, tasks, and chat history."
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteProject}
          onCancel={() => setDeletingProject(null)}
        />
      )}

      {deletingWs && (
        <ConfirmDialog
          title="Delete Workspace"
          message={`Delete workspace "${deletingWs.wsId}"? All tasks, chat history, and configuration will be permanently lost.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteWorkspace}
          onCancel={() => setDeletingWs(null)}
        />
      )}
    </>
  );
}
