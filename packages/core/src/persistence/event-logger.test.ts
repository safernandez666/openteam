import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventLogger } from "./event-logger.js";

const testLogPath = join(tmpdir(), `openteam-test-${Date.now()}.ndjson`);

afterEach(() => {
  if (existsSync(testLogPath)) {
    unlinkSync(testLogPath);
  }
});

describe("EventLogger", () => {
  it("should create log file and append entries", () => {
    const logger = new EventLogger(testLogPath);
    logger.log({ agent: "test", type: "test_event", detail: "hello" });

    const content = readFileSync(testLogPath, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.agent).toBe("test");
    expect(entry.type).toBe("test_event");
    expect(entry.detail).toBe("hello");
    expect(entry.ts).toBeDefined();
  });

  it("should append multiple entries as NDJSON", () => {
    const logger = new EventLogger(testLogPath);
    logger.log({ agent: "a", type: "first" });
    logger.log({ agent: "b", type: "second" });

    const lines = readFileSync(testLogPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).type).toBe("first");
    expect(JSON.parse(lines[1]).type).toBe("second");
  });
});
