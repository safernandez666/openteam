import { useWebSocket } from "./useWebSocket";
import { useChat } from "./chat/useChat";
import { ChatPanel } from "./chat/ChatPanel";
import { useKanban } from "./kanban/useKanban";
import { KanbanBoard } from "./kanban/KanbanBoard";

export function App() {
  const { isConnected, subscribe, send } = useWebSocket();
  const { messages, streamingContent, pmStatus, sendMessage } = useChat(
    subscribe,
    send,
    isConnected,
  );
  const { tasks, tasksByColumn } = useKanban(subscribe);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0f172a",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          padding: "0.5rem 1rem",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#020617",
          color: "#e2e8f0",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>OpenTeam</span>
          <span style={{ color: "#475569", fontSize: "0.8rem" }}>v0.1.0</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              color: isConnected ? "#22c55e" : "#ef4444",
            }}
          >
            {isConnected ? "connected" : "disconnected"}
          </span>
        </div>
      </header>

      {/* Main content: Kanban (60%) + Chat (40%) */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div
          style={{
            flex: "3 1 0",
            borderRight: "1px solid #1e293b",
            overflow: "hidden",
          }}
        >
          <KanbanBoard tasksByColumn={tasksByColumn()} />
        </div>
        <div style={{ flex: "2 1 0", minWidth: "320px", overflow: "hidden" }}>
          <ChatPanel
            messages={messages}
            streamingContent={streamingContent}
            pmStatus={pmStatus}
            isConnected={isConnected}
            onSendMessage={sendMessage}
          />
        </div>
      </div>
    </div>
  );
}
