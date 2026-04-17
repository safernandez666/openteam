import { useState, useEffect, useCallback } from "react";
import type { WsEvent } from "../useWebSocket";

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export function useChat(
  subscribe: (type: string, handler: (e: WsEvent) => void) => () => void,
  send: (msg: Record<string, unknown>) => void,
  isConnected: boolean,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [pmStatus, setPmStatus] = useState<"idle" | "working">("idle");

  useEffect(() => {
    const unsubs = [
      subscribe("chat_history", (e) => {
        if (Array.isArray(e.messages)) {
          setMessages(e.messages as Message[]);
        }
      }),
      subscribe("chat_stream", (e) => {
        if (e.done) {
          setStreamingContent("");
        } else if (typeof e.content === "string") {
          setStreamingContent((prev) => prev + e.content);
        }
      }),
      subscribe("chat_response", (e) => {
        if (typeof e.content === "string" && typeof e.timestamp === "string") {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: e.content as string, timestamp: e.timestamp as string },
          ]);
          setStreamingContent("");
        }
      }),
      subscribe("status", (e) => {
        if (e.status === "idle" || e.status === "working") {
          setPmStatus(e.status as "idle" | "working");
        }
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!isConnected) return;
      setMessages((prev) => [
        ...prev,
        { role: "user", content, timestamp: new Date().toISOString() },
      ]);
      send({ type: "chat_message", content });
    },
    [isConnected, send],
  );

  return { messages, streamingContent, pmStatus, sendMessage };
}
