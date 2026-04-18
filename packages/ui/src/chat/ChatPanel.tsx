import { useState, useRef, useEffect } from "react";
import type { Message } from "./useChat";
import { Markdown } from "./Markdown";

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className={`message message--${message.role}`}>
      <div className={`message-bubble message-bubble--${message.role}`}>
        <div className="message-content">
          {message.role === "user" ? (
            message.content
          ) : (
            <Markdown text={message.content} />
          )}
        </div>
        <div className="message-time">{formatTime(message.timestamp)}</div>
      </div>
    </div>
  );
}

function StreamingBubble({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div className="streaming-bubble">
      <div className="streaming-content">
        <Markdown text={content} />
        <span className="streaming-cursor" />
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
  onClearChat?: () => void;
  pmName?: string;
}

export function ChatPanel({
  messages,
  streamingContent,
  pmStatus,
  isConnected,
  onSendMessage,
  onClearChat,
  pmName = "Clara",
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

  const statusDotClass = !isConnected
    ? "chat-status-dot--disconnected"
    : pmStatus === "working"
      ? "chat-status-dot--working"
      : "chat-status-dot--idle";

  const statusLabel = !isConnected ? "disconnected" : pmStatus;

  return (
    <>
      <div className="chat-header">
        <span className="chat-header-label">{pmName}</span>
        <span className="chat-header-role">PM</span>
        {onClearChat && messages.length > 0 && (
          <button className="chat-clear-btn" onClick={onClearChat} title="Clear chat">
            Clear
          </button>
        )}
        <span className="chat-status">
          <span className={`chat-status-dot ${statusDotClass}`} />
          {statusLabel}
        </span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !streamingContent && (
          <div className="chat-empty">
            <div className="chat-empty-title">Chat with {pmName}</div>
            <div className="chat-empty-subtitle">
              Send a message to get started
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        <StreamingBubble content={streamingContent} />
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <form onSubmit={handleSubmit} className="chat-input-form">
          <input
            type="text"
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              pmStatus === "working" ? "PM is thinking..." : "Message..."
            }
            disabled={!isConnected || pmStatus === "working"}
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={
              !isConnected || pmStatus === "working" || !input.trim()
            }
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}
