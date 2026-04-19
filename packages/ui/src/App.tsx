import { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { useChat } from "./chat/useChat";
import { ChatPanel } from "./chat/ChatPanel";
import { useKanban } from "./kanban/useKanban";
import { KanbanBoard } from "./kanban/KanbanBoard";
import { useWorkers } from "./workers/useWorkers";
import { WorkersPanel } from "./workers/WorkersPanel";
import { Sidebar, type View } from "./Sidebar";
import { SkillsPanel } from "./skills/SkillsPanel";
import { McpPanel } from "./mcp/McpPanel";
import { WorkspaceSettings } from "./WorkspaceSettings";
import { useToasts, ToastContainer } from "./Toasts";
import { NewWorkspaceModal } from "./NewWorkspaceModal";
import { ConfirmDialog } from "./ConfirmDialog";
import "./styles.css";

interface WorkspaceInfo {
  id: string;
  name: string;
  createdAt: string;
}

export function App() {
  const [activeView, setActiveView] = useState<View>("board");
  const { isConnected, subscribe, send } = useWebSocket();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showWsSettings, setShowWsSettings] = useState(false);
  const [showNewWs, setShowNewWs] = useState(false);
  const [deletingWs, setDeletingWs] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    try {
      // Try new projects API
      const projRes = await fetch("/api/projects");
      const projData = await projRes.json();
      setProjects(projData.projects ?? []);
      if (projData.active) {
        setActiveProject(projData.active.projectId);
        setActiveWorkspace(projData.active.workspaceId);
        // Load workspaces for active project
        const wsRes = await fetch(`/api/projects/${projData.active.projectId}/workspaces`);
        const wsData = await wsRes.json();
        setWorkspaces(wsData);
      } else {
        // Fallback to legacy
        const res = await fetch("/api/workspaces");
        const data = await res.json();
        setWorkspaces(data.workspaces ?? []);
        setActiveWorkspace(data.active);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshWorkspaces(); }, [refreshWorkspaces]);

  const handleCreateWorkspace = async (id: string, name: string) => {
    await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    await fetch("/api/workspaces/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    window.location.reload();
  };

  const handleDeleteWorkspace = async (id: string) => {
    if (id === activeWorkspace) return;
    setDeletingWs(id);
  };

  const confirmDeleteWorkspace = async () => {
    if (!deletingWs) return;
    await fetch(`/api/workspaces/${encodeURIComponent(deletingWs)}`, { method: "DELETE" });
    setDeletingWs(null);
    refreshWorkspaces();
  };

  const handleSwitchWorkspace = async (id: string) => {
    await fetch("/api/workspaces/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    window.location.reload();
  };
  const { messages, streamingContent, pmStatus, sendMessage, clearChat } = useChat(
    subscribe,
    send,
    isConnected,
  );
  const { tasks, tasksByColumn, getSubtasks } = useKanban(subscribe);
  const { toasts } = useToasts(subscribe);
  const { workers, activeWorkers, completedWorkers, skills, modules, roleSkillsMap, setRoleSkillsMap, getWorkerOutput, refreshModules, agentNames, updateAgentNames, team, roleCatalog, addTeamMember, removeTeamMember, updateTeamMember } = useWorkers(subscribe);

  return (
    <div className="app">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        taskCount={tasks.length}
        activeWorkerCount={activeWorkers.length}
        pmStatus={pmStatus}
        isConnected={isConnected}
      />

      <div className="app-main">
        {/* Top bar */}
        <header className="header">
          <div className="header-left">
            <span className="header-logo">OpenTeam</span>
            <span className="header-version">v0.1.0</span>
            <button
              className="header-settings-btn"
              onClick={() => setShowWsSettings(true)}
              title="Workspace settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.68 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            <div
              className="workspace-selector"
              onClick={() => setShowWsMenu(!showWsMenu)}
            >
              <span className="workspace-name">
                {activeProject && activeWorkspace
                  ? `${projects.find((p) => p.id === activeProject)?.name ?? activeProject} / ${workspaces.find((w) => w.id === activeWorkspace)?.name ?? activeWorkspace}`
                  : workspaces.find((w) => w.id === activeWorkspace)?.name ?? "..."
                }
              </span>
              <span className="workspace-arrow">&#9662;</span>
              {showWsMenu && (
                <div className="workspace-menu" onClick={(e) => e.stopPropagation()}>
                  {workspaces.map((ws) => (
                    <div key={ws.id} className="workspace-menu-row">
                      <button
                        className={`workspace-menu-item ${ws.id === activeWorkspace ? "workspace-menu-item--active" : ""}`}
                        onClick={() => { setShowWsMenu(false); handleSwitchWorkspace(ws.id); }}
                      >
                        {ws.name}
                        {ws.id === activeWorkspace && <span className="workspace-check">&#10003;</span>}
                      </button>
                      {ws.id !== activeWorkspace && (
                        <button
                          className="workspace-delete"
                          onClick={(e) => { e.stopPropagation(); handleDeleteWorkspace(ws.id); }}
                          title="Delete workspace"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="workspace-menu-divider" />
                  <button className="workspace-menu-item" onClick={() => { setShowWsMenu(false); setShowWsSettings(true); }}>
                    Settings
                  </button>
                  <button className="workspace-menu-item workspace-menu-item--new" onClick={() => { setShowWsMenu(false); setShowNewWs(true); }}>

                    + New Workspace
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="header-right">
            <span className="header-stat">
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </span>
            {activeWorkers.length > 0 && (
              <span className="header-stat header-stat--workers">
                {activeWorkers.length} worker{activeWorkers.length !== 1 ? "s" : ""}
              </span>
            )}
            <span className="header-stat">
              <span
                className={`status-dot ${isConnected ? "status-dot--connected" : "status-dot--disconnected"}`}
              />
              {isConnected ? "connected" : "disconnected"}
            </span>
          </div>
        </header>

        {/* Content area */}
        <div className="main-content">
          {activeView === "board" && (
            <div className="view-panel view-panel--board view-panel--full">
              <KanbanBoard
                tasksByColumn={tasksByColumn()}
                getSubtasks={getSubtasks}
                activeWorkers={activeWorkers}
                completedWorkers={completedWorkers}
                tasks={tasks}
              />
            </div>
          )}

          {activeView === "workers" && (
            <div className="view-panel view-panel--workers">
              <WorkersPanel
                workers={workers}
                activeWorkers={activeWorkers}
                completedWorkers={completedWorkers}
                skills={skills}
                modules={modules}
                roleSkillsMap={roleSkillsMap}
                onRoleSkillsChange={(role, newSkills) => {
                  setRoleSkillsMap((prev) => ({ ...prev, [role]: newSkills }));
                }}
                getWorkerOutput={getWorkerOutput}
                agentNames={agentNames}
                onUpdateAgentNames={updateAgentNames}
                team={team}
                roleCatalog={roleCatalog}
                onAddTeamMember={addTeamMember}
                onRemoveTeamMember={removeTeamMember}
                onUpdateTeamMember={updateTeamMember}
              />
            </div>
          )}

          {activeView === "skills" && (
            <div className="view-panel view-panel--skills">
              <SkillsPanel modules={modules} onRefresh={refreshModules} />
            </div>
          )}

          {activeView === "mcp" && (
            <div className="view-panel view-panel--mcp">
              <McpPanel />
            </div>
          )}

          {activeView === "chat" && (
            <div className="view-panel view-panel--chat-full">
              <ChatPanel
                messages={messages}
                streamingContent={streamingContent}
                pmStatus={pmStatus}
                isConnected={isConnected}
                onSendMessage={sendMessage}
                onClearChat={clearChat}
                pmName={agentNames.pm ?? "Facu"}
              />
            </div>
          )}

          {/* Persistent chat sidebar — visible on all views except chat full */}
          {activeView !== "chat" && (
            <div className="chat-sidebar">
              <ChatPanel
                messages={messages}
                streamingContent={streamingContent}
                pmStatus={pmStatus}
                isConnected={isConnected}
                onSendMessage={sendMessage}
                onClearChat={clearChat}
                pmName={agentNames.pm ?? "Facu"}
              />
            </div>
          )}
        </div>
      </div>

      {showWsSettings && (
        <WorkspaceSettings onClose={() => setShowWsSettings(false)} />
      )}

      {showNewWs && (
        <NewWorkspaceModal
          onClose={() => setShowNewWs(false)}
          onCreate={(id, name) => { setShowNewWs(false); handleCreateWorkspace(id, name); }}
        />
      )}

      {deletingWs && (
        <ConfirmDialog
          title="Delete Workspace"
          message={`Delete workspace "${deletingWs}"? All data will be permanently lost.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteWorkspace}
          onCancel={() => setDeletingWs(null)}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
