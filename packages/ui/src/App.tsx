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
import { ProjectsPanel } from "./projects/ProjectsPanel";
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

  const handleSwitchWorkspace = async (projectId: string, workspaceId: string) => {
    await fetch("/api/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, workspaceId }),
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
        onOpenSettings={() => setShowWsSettings(true)}
      />

      <div className="app-main">
        {/* Top bar */}
        <header className="header">
          <div className="header-left">
            <span className="header-logo">OpenTeam</span>
            <span className="header-version">v0.1.0</span>
            {activeProject && (
              <span className="header-breadcrumb">
                <span className="header-breadcrumb-project">{projects.find((p) => p.id === activeProject)?.name ?? activeProject}</span>
                {activeWorkspace && (
                  <>
                    <span className="header-breadcrumb-sep">/</span>
                    <span className="header-breadcrumb-ws">{workspaces.find((w) => w.id === activeWorkspace)?.name ?? activeWorkspace}</span>
                  </>
                )}
              </span>
            )}
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
          {activeView === "projects" && (
            <div className="view-panel view-panel--projects">
              <ProjectsPanel
                activeProjectId={activeProject}
                activeWorkspaceId={activeWorkspace}
                onSwitch={(projId, wsId) => handleSwitchWorkspace(projId, wsId)}
                onRefresh={refreshWorkspaces}
              />
            </div>
          )}

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
