import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import type { TypedAgentEmitter, PtyOutput } from "./types.js";

const require = createRequire(import.meta.url);
const pty = require("node-pty") as typeof import("node-pty");

const INPUT_CHUNK_SIZE = 512;
const INPUT_CHUNK_DELAY_MS = 80;

export interface PtyManagerOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PtyManager {
  private ptyProcess: ReturnType<typeof pty.spawn> | null = null;
  private outputBuffer: PtyOutput[] = [];
  private maxBufferSize = 1000;
  private _isRunning = false;
  private emitter: TypedAgentEmitter;

  constructor(emitter: TypedAgentEmitter) {
    this.emitter = emitter;
  }

  get pid(): number | null {
    return this.ptyProcess?.pid ?? null;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get buffer(): readonly PtyOutput[] {
    return this.outputBuffer;
  }

  spawn(options: PtyManagerOptions): void {
    if (this.ptyProcess) {
      throw new Error("PTY already spawned. Kill it first.");
    }

    const env: Record<string, string> = { TERM: "xterm-256color" };
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }
    if (options.env) {
      for (const [k, v] of Object.entries(options.env)) {
        env[k] = v;
      }
    }

    this.ptyProcess = pty.spawn(options.command, options.args, {
      name: "xterm-256color",
      cols: options.cols ?? 120,
      rows: options.rows ?? 40,
      cwd: options.cwd,
      env,
    });

    this._isRunning = true;

    this.ptyProcess.onData((data: string) => {
      const output: PtyOutput = { data, timestamp: new Date() };
      this.outputBuffer.push(output);
      if (this.outputBuffer.length > this.maxBufferSize) {
        this.outputBuffer.shift();
      }
      this.emitter.emit("output", output);
    });

    this.ptyProcess.onExit(
      ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
        this._isRunning = false;
        this.ptyProcess = null;
        this.emitter.emit("exit", exitCode, signal);
      },
    );
  }

  async writeInput(data: string): Promise<void> {
    if (!this.ptyProcess) {
      throw new Error("No PTY process running");
    }

    if (data.length <= INPUT_CHUNK_SIZE) {
      this.ptyProcess.write(data);
      return;
    }

    for (let i = 0; i < data.length; i += INPUT_CHUNK_SIZE) {
      const chunk = data.slice(i, i + INPUT_CHUNK_SIZE);
      this.ptyProcess.write(chunk);
      if (i + INPUT_CHUNK_SIZE < data.length) {
        await sleep(INPUT_CHUNK_DELAY_MS);
      }
    }
  }

  async sendCommand(command: string): Promise<void> {
    await this.writeInput(command + "\r");
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess?.resize(cols, rows);
  }

  kill(signal = "SIGTERM"): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill(signal);
    }
  }

  clearBuffer(): void {
    this.outputBuffer = [];
  }
}

export function createEmitter(): TypedAgentEmitter {
  return new EventEmitter() as TypedAgentEmitter;
}
