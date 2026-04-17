import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface EventEntry {
  ts: string;
  agent: string;
  type: string;
  task_id?: string;
  tool?: string;
  detail?: string;
}

export type LogInput = Omit<EventEntry, "ts"> & Record<string, unknown>;

export class EventLogger {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
  }

  log(entry: LogInput): void {
    const full = {
      ts: new Date().toISOString(),
      ...entry,
    };
    appendFileSync(this.filePath, JSON.stringify(full) + "\n");
  }
}
