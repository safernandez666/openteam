import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";

const DEBOUNCE_MS = 3000;

interface TranscriptEvent {
  type: string;
  subtype?: string;
  timestamp?: string;
  message?: {
    stop_reason?: string | null;
  };
}

export class IdleDetector extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private transcriptPath: string | null = null;
  private lastFileSize = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _isIdle = false;
  private parseLine: (line: string) => { idle: boolean; timestamp: string } | null;

  constructor(
    parseLine: (line: string) => { idle: boolean; timestamp: string } | null,
  ) {
    super();
    this.parseLine = parseLine;
  }

  get isIdle(): boolean {
    return this._isIdle;
  }

  async start(transcriptPath: string): Promise<void> {
    this.stop();
    this.transcriptPath = transcriptPath;
    this.lastFileSize = 0;
    this._isIdle = false;

    try {
      const content = await readFile(transcriptPath, "utf-8");
      this.lastFileSize = Buffer.byteLength(content, "utf-8");
    } catch {
      // File may not exist yet, that's fine
    }

    this.watcher = watch(transcriptPath, { persistent: false }, () => {
      this.onFileChange();
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.transcriptPath = null;
  }

  private async onFileChange(): Promise<void> {
    if (!this.transcriptPath) return;

    try {
      const content = await readFile(this.transcriptPath, "utf-8");
      const currentSize = Buffer.byteLength(content, "utf-8");

      if (currentSize <= this.lastFileSize) return;

      const newContent = content.slice(
        content.length - (currentSize - this.lastFileSize),
      );
      this.lastFileSize = currentSize;

      const lines = newContent.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        this.processLine(line);
      }
    } catch {
      // File may be temporarily unavailable during write
    }
  }

  private processLine(line: string): void {
    const result = this.parseLine(line);
    if (!result) return;

    if (result.idle && !this._isIdle) {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this._isIdle = true;
        this.emit("idle", { timestamp: result.timestamp });
      }, DEBOUNCE_MS);
    } else if (!result.idle && this._isIdle) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this._isIdle = false;
      this.emit("working", { timestamp: result.timestamp });
    } else if (!result.idle && this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /** Parse a raw JSONL line into a transcript event. Returns null on invalid JSON. */
  static parseTranscriptLine(line: string): TranscriptEvent | null {
    try {
      return JSON.parse(line) as TranscriptEvent;
    } catch {
      return null;
    }
  }
}
