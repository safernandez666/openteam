import { describe, it, expect } from "vitest";
import {
  claudeCodeAdapter,
  claudeCodePrintAdapter,
} from "./cli-adapters/claude-code.js";
import type { AgentConfig } from "./types.js";

const testConfig: AgentConfig = {
  name: "test-agent",
  cwd: "/Users/test/project",
  cli: "claude-code",
  systemPrompt: "You are a helpful assistant",
  allowedDirs: ["/Users/test/shared"],
};

describe("claudeCodeAdapter (interactive)", () => {
  it("should have the correct name", () => {
    expect(claudeCodeAdapter.name).toBe("claude-code");
  });

  it("should build interactive spawn args with system prompt", () => {
    const { command, args } = claudeCodeAdapter.buildSpawnArgs(testConfig);
    expect(command).toBe("claude");
    expect(args).not.toContain("--print");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("You are a helpful assistant");
  });

  it("should include --add-dir for allowed dirs", () => {
    const { args } = claudeCodeAdapter.buildSpawnArgs(testConfig);
    expect(args).toContain("--add-dir");
    expect(args).toContain("/Users/test/shared");
  });

  it("should build minimal args without optional config", () => {
    const minimal: AgentConfig = {
      name: "minimal",
      cwd: "/tmp",
      cli: "claude-code",
    };
    const { command, args } = claudeCodeAdapter.buildSpawnArgs(minimal);
    expect(command).toBe("claude");
    expect(args).toEqual([]);
  });
});

describe("claudeCodePrintAdapter (one-shot)", () => {
  it("should have the correct name", () => {
    expect(claudeCodePrintAdapter.name).toBe("claude-code-print");
  });

  it("should include --print and stream-json flags", () => {
    const { command, args } = claudeCodePrintAdapter.buildSpawnArgs(testConfig);
    expect(command).toBe("claude");
    expect(args).toContain("--print");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--append-system-prompt");
  });

  it("should build minimal print args", () => {
    const minimal: AgentConfig = {
      name: "minimal",
      cwd: "/tmp",
      cli: "claude-code",
    };
    const { args } = claudeCodePrintAdapter.buildSpawnArgs(minimal);
    expect(args).toEqual(["--print", "--verbose", "--output-format", "stream-json"]);
  });
});

describe("parseIdleSignal (shared)", () => {
  it("should parse turn_duration as idle", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "turn_duration",
      timestamp: "2026-04-17T14:00:00Z",
      durationMs: 5000,
    });
    const result = claudeCodeAdapter.parseIdleSignal(line);
    expect(result).toEqual({ idle: true, timestamp: "2026-04-17T14:00:00Z" });
  });

  it("should parse end_turn as idle", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-17T14:00:00Z",
      message: { stop_reason: "end_turn" },
    });
    const result = claudeCodeAdapter.parseIdleSignal(line);
    expect(result).toEqual({ idle: true, timestamp: "2026-04-17T14:00:00Z" });
  });

  it("should parse tool_use as working", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-17T14:00:00Z",
      message: { stop_reason: "tool_use" },
    });
    const result = claudeCodeAdapter.parseIdleSignal(line);
    expect(result).toEqual({
      idle: false,
      timestamp: "2026-04-17T14:00:00Z",
    });
  });

  it("should parse progress as working", () => {
    const line = JSON.stringify({
      type: "progress",
      timestamp: "2026-04-17T14:00:00Z",
      data: { type: "bash_progress" },
    });
    const result = claudeCodeAdapter.parseIdleSignal(line);
    expect(result).toEqual({
      idle: false,
      timestamp: "2026-04-17T14:00:00Z",
    });
  });

  it("should return null for unrecognized events", () => {
    const line = JSON.stringify({
      type: "user",
      timestamp: "2026-04-17T14:00:00Z",
    });
    expect(claudeCodeAdapter.parseIdleSignal(line)).toBeNull();
  });

  it("should return null for invalid JSON", () => {
    expect(claudeCodeAdapter.parseIdleSignal("garbage")).toBeNull();
  });
});
