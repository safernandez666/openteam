import { useState } from "react";
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
import "./styles.css";

export function App() {
  const [activeView, setActiveView] = useState<View>("board");
  const { isConnected, subscribe, send } = useWebSocket();
  const { messages, streamingContent, pmStatus, sendMessage } = useChat(
    subscribe,
    send,
    isConnected,
  );
  const { tasks, tasksByColumn, getSubtasks } = useKanban(subscribe);
  const { workers, activeWorkers, completedWorkers, skills, modules, roleSkillsMap, setRoleSkillsMap, getWorkerOutput, refreshModules, agentNames, updateAgentNames } = useWorkers(subscribe);

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
                pmName={agentNames.pm ?? "Clara"}
              />
            </div>
          )}

          {/* Persistent chat sidebar — visible on workers view */}
          {activeView !== "chat" && activeView !== "board" && (
            <div className="chat-sidebar">
              <ChatPanel
                messages={messages}
                streamingContent={streamingContent}
                pmStatus={pmStatus}
                isConnected={isConnected}
                onSendMessage={sendMessage}
                pmName={agentNames.pm ?? "Clara"}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
