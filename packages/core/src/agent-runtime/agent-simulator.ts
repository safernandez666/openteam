import { EventEmitter } from "node:events";
import type {
  AgentConfig,
  AgentState,
  AgentStatus,
  CLIAdapter,
  TypedAgentEmitter,
} from "./types.js";

export interface SimulatorOptions {
  startupDelayMs?: number;
  responseDelayMs?: number;
  responses?: Map<string, string>;
  autoIdle?: boolean;
  autoIdleDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<SimulatorOptions> = {
  startupDelayMs: 100,
  responseDelayMs: 200,
  responses: new Map(),
  autoIdle: true,
  autoIdleDelayMs: 500,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulates a Claude Code agent session for testing.
 * No real PTY or LLM involved.
 */
export class AgentSimulator {
  readonly config: AgentConfig;
  readonly emitter: TypedAgentEmitter;

  private options: Required<SimulatorOptions>;
  private _status: AgentStatus = "stopped";
  private _pid = 0;
  private startedAt: Date | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: AgentConfig, options: SimulatorOptions = {}) {
    this.config = config;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.emitter = new EventEmitter() as TypedAgentEmitter;
  }

  get status(): AgentStatus {
    return this._status;
  }

  get state(): AgentState {
    return {
      name: this.config.name,
      status: this._status,
      pid: this._status === "stopped" ? null : this._pid,
      sessionId: "sim-session-001",
      startedAt: this.startedAt,
      lastActivityAt: new Date(),
      idleSince: this._status === "idle" ? new Date() : null,
    };
  }

  get pid(): number | null {
    return this._status === "stopped" ? null : this._pid;
  }

  async start(): Promise<void> {
    this._pid = Math.floor(Math.random() * 90000) + 10000;
    this.startedAt = new Date();
    this.setStatus("starting");

    await sleep(this.options.startupDelayMs);
    this.emitter.emit("output", {
      data: `[Simulator] Agent "${this.config.name}" started\n`,
      timestamp: new Date(),
    });

    this.setStatus("working");
    this.scheduleIdle();
  }

  async sendInput(input: string): Promise<void> {
    if (this._status === "stopped") {
      throw new Error("Simulator is not running");
    }

    this.setStatus("working");

    await sleep(this.options.responseDelayMs);

    const response =
      this.options.responses.get(input.trim()) ??
      `[Simulator] Received: "${input.trim()}"`;

    this.emitter.emit("output", {
      data: response + "\n",
      timestamp: new Date(),
    });

    this.scheduleIdle();
  }

  async stop(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.emitter.emit("exit", 0);
    this.setStatus("stopped");
  }

  resize(_cols: number, _rows: number): void {
    // No-op for simulator
  }

  getOutputBuffer(): string {
    return "";
  }

  private setStatus(status: AgentStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.emitter.emit("status-change", this.state);
  }

  private scheduleIdle(): void {
    if (!this.options.autoIdle) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.setStatus("idle");
    }, this.options.autoIdleDelayMs);
  }
}

/** A CLI adapter that does nothing — used with AgentSimulator */
export const simulatorAdapter: CLIAdapter = {
  name: "simulator",
  buildSpawnArgs(config: AgentConfig) {
    return { command: "echo", args: [config.name] };
  },
  getTranscriptPath() {
    return null;
  },
  parseIdleSignal() {
    return null;
  },
};
