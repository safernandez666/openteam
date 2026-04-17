import { randomUUID } from "node:crypto";
import type {
  AgentConfig,
  AgentState,
  AgentStatus,
  CLIAdapter,
  TypedAgentEmitter,
} from "./types.js";
import { PtyManager, createEmitter } from "./pty-manager.js";
import { IdleDetector } from "./idle-detector.js";

const DEFAULT_MAX_SESSION_MS = 30 * 60 * 1000; // 30 minutes

export class Agent {
  readonly config: AgentConfig;
  readonly emitter: TypedAgentEmitter;

  private ptyManager: PtyManager;
  private idleDetector: IdleDetector;
  private adapter: CLIAdapter;
  private sessionId: string;
  private startedAt: Date | null = null;
  private lastActivityAt: Date | null = null;
  private idleSince: Date | null = null;
  private _status: AgentStatus = "stopped";
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private transcriptPollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: AgentConfig, adapter: CLIAdapter) {
    this.config = config;
    this.adapter = adapter;
    this.sessionId = randomUUID();
    this.emitter = createEmitter();
    this.ptyManager = new PtyManager(this.emitter);
    this.idleDetector = new IdleDetector(adapter.parseIdleSignal);

    this.idleDetector.on("idle", () => {
      this.idleSince = new Date();
      this.setStatus("idle");
    });

    this.idleDetector.on("working", () => {
      this.idleSince = null;
      this.lastActivityAt = new Date();
      this.setStatus("working");
    });

    this.emitter.on("output", () => {
      this.lastActivityAt = new Date();
    });

    this.emitter.on("exit", () => {
      this.cleanup();
      this.setStatus("stopped");
    });
  }

  get status(): AgentStatus {
    return this._status;
  }

  get state(): AgentState {
    return {
      name: this.config.name,
      status: this._status,
      pid: this.ptyManager.pid,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      idleSince: this.idleSince,
    };
  }

  get pid(): number | null {
    return this.ptyManager.pid;
  }

  async start(): Promise<void> {
    if (this.ptyManager.isRunning) {
      throw new Error(`Agent "${this.config.name}" is already running`);
    }

    this.sessionId = randomUUID();
    this.startedAt = new Date();
    this.lastActivityAt = new Date();
    this.idleSince = null;
    this.setStatus("starting");

    const { command, args } = this.adapter.buildSpawnArgs(this.config);

    this.ptyManager.spawn({
      command,
      args,
      cwd: this.config.cwd,
      env: this.config.env,
    });

    this.startTranscriptPolling();
    this.startSessionTimer();

    this.setStatus("working");

    const initialInput = this.adapter.getInitialInput?.(this.config);
    if (initialInput) {
      await this.sendInput(initialInput);
    }
  }

  async sendInput(input: string): Promise<void> {
    if (!this.ptyManager.isRunning) {
      throw new Error(`Agent "${this.config.name}" is not running`);
    }
    this.idleSince = null;
    this.setStatus("working");
    await this.ptyManager.sendCommand(input);
  }

  async stop(): Promise<void> {
    if (!this.ptyManager.isRunning) return;
    this.ptyManager.kill();
    this.cleanup();
    this.setStatus("stopped");
  }

  resize(cols: number, rows: number): void {
    this.ptyManager.resize(cols, rows);
  }

  getOutputBuffer(): string {
    return this.ptyManager.buffer.map((o) => o.data).join("");
  }

  private setStatus(status: AgentStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.emitter.emit("status-change", this.state);
  }

  private startTranscriptPolling(): void {
    this.transcriptPollTimer = setInterval(() => {
      const transcriptPath = this.adapter.getTranscriptPath(this.config);
      if (transcriptPath && !this.idleDetector.isIdle) {
        this.idleDetector.start(transcriptPath).catch(() => {});
      }
    }, 2000);
  }

  private startSessionTimer(): void {
    const maxDuration =
      this.config.maxSessionDurationMs ?? DEFAULT_MAX_SESSION_MS;
    this.sessionTimer = setTimeout(() => {
      this.emitter.emit(
        "error",
        new Error(
          `Agent "${this.config.name}" exceeded max session duration (${maxDuration}ms)`,
        ),
      );
      this.stop();
    }, maxDuration);
  }

  private cleanup(): void {
    this.idleDetector.stop();
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
    if (this.transcriptPollTimer) {
      clearInterval(this.transcriptPollTimer);
      this.transcriptPollTimer = null;
    }
  }
}
