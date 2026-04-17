import { useState, useRef, useEffect } from "react";
import type { Message } from "./useChat";

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "0.75rem",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          padding: "0.75rem 1rem",
          borderRadius: "1rem",
          backgroundColor: isUser ? "#2563eb" : "#1e293b",
          color: isUser ? "#fff" : "#e2e8f0",
          fontSize: "0.9rem",
          lineHeight: "1.5",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <div>{message.content}</div>
        <div
          style={{
            fontSize: "0.7rem",
            opacity: 0.6,
            marginTop: "0.25rem",
            textAlign: "right",
          }}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

function StreamingBubble({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "0.75rem" }}>
      <div
        style={{
          maxWidth: "85%",
          padding: "0.75rem 1rem",
          borderRadius: "1rem",
          backgroundColor: "#1e293b",
          color: "#e2e8f0",
          fontSize: "0.9rem",
          lineHeight: "1.5",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          opacity: 0.8,
        }}
      >
        {content}
        <span style={{ animation: "blink 1s infinite" }}>|</span>
      </div>
    </div>
  );
}

interface ChatPanelProps {
  messages: Message[];
  streamingContent: string;
  pmStatus: "idle" | "working";
  isConnected: boolean;
  onSendMessage: (content: string) => void;
}

export function ChatPanel({
  messages,
  streamingContent,
  pmStatus,
  isConnected,
  onSendMessage,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || pmStatus === "working") return;
    onSendMessage(trimmed);
    setInput("");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#0f172a",
        color: "#e2e8f0",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontWeight: 600 }}>PM</span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor:
              !isConnected ? "#64748b" : pmStatus === "working" ? "#3b82f6" : "#22c55e",
            display: "inline-block",
          }}
        />
        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
          {!isConnected ? "disconnected" : pmStatus}
        </span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
        {messages.length === 0 && !streamingContent && (
          <div style={{ textAlign: "center", color: "#475569", marginTop: "2rem" }}>
            <p style={{ fontSize: "1.1rem" }}>Chat with your PM</p>
            <p style={{ fontSize: "0.85rem" }}>Send a message to get started</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        <StreamingBubble content={streamingContent} />
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: "0.75rem 1rem",
          borderTop: "1px solid #1e293b",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pmStatus === "working" ? "PM is thinking..." : "Type a message..."}
          disabled={!isConnected || pmStatus === "working"}
          style={{
            flex: 1,
            padding: "0.6rem 1rem",
            borderRadius: "0.5rem",
            border: "1px solid #334155",
            backgroundColor: "#1e293b",
            color: "#e2e8f0",
            fontSize: "0.9rem",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!isConnected || pmStatus === "working" || !input.trim()}
          style={{
            padding: "0.6rem 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            backgroundColor: "#2563eb",
            color: "#fff",
            fontSize: "0.9rem",
            cursor:
              !isConnected || pmStatus === "working" || !input.trim()
                ? "not-allowed"
                : "pointer",
            opacity:
              !isConnected || pmStatus === "working" || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
