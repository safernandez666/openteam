import { EventEmitter } from "node:events";

export type AgentStatus = "starting" | "idle" | "working" | "stopped" | "error";

export interface AgentConfig {
  name: string;
  cwd: string;
  cli: string;
  systemPrompt?: string;
  allowedDirs?: string[];
  maxSessionDurationMs?: number;
  env?: Record<string, string>;
}

export interface AgentState {
  name: string;
  status: AgentStatus;
  pid: number | null;
  sessionId: string | null;
  startedAt: Date | null;
  lastActivityAt: Date | null;
  idleSince: Date | null;
}

export interface PtyOutput {
  data: string;
  timestamp: Date;
}

export interface AgentEvents {
  "status-change": (state: AgentState) => void;
  output: (output: PtyOutput) => void;
  exit: (code: number, signal?: number) => void;
  error: (error: Error) => void;
}

export interface TypedAgentEmitter extends EventEmitter {
  emit<K extends keyof AgentEvents>(
    event: K,
    ...args: Parameters<AgentEvents[K]>
  ): boolean;
  on<K extends keyof AgentEvents>(
    event: K,
    listener: AgentEvents[K],
  ): this;
  once<K extends keyof AgentEvents>(
    event: K,
    listener: AgentEvents[K],
  ): this;
  off<K extends keyof AgentEvents>(
    event: K,
    listener: AgentEvents[K],
  ): this;
}

export interface CLIAdapter {
  name: string;
  buildSpawnArgs(config: AgentConfig): { command: string; args: string[] };
  getTranscriptPath(config: AgentConfig): string | null;
  parseIdleSignal(line: string): { idle: boolean; timestamp: string } | null;
  getInitialInput?(config: AgentConfig): string | null;
}
