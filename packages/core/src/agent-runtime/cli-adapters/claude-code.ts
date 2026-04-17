import { homedir } from "node:os";
import { join } from "node:path";
import { readdirSync, statSync } from "node:fs";
import type { CLIAdapter, AgentConfig } from "../types.js";
import { IdleDetector } from "../idle-detector.js";

function encodeProjectPath(absolutePath: string): string {
  return absolutePath.replace(/\//g, "-");
}

function findLatestTranscript(projectDir: string): string | null {
  try {
    const files = readdirSync(projectDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({
        name: f,
        path: join(projectDir, f),
        mtime: statSync(join(projectDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    return files[0]?.path ?? null;
  } catch {
    return null;
  }
}

/**
 * Claude Code adapter for interactive sessions.
 * Spawns an interactive Claude Code session where input is injected via PTY.
 * Used for long-lived agents (PM, workers).
 */
export const claudeCodeAdapter: CLIAdapter = {
  name: "claude-code",

  buildSpawnArgs(config: AgentConfig) {
    const args: string[] = [];

    if (config.systemPrompt) {
      args.push("--append-system-prompt", config.systemPrompt);
    }

    if (config.allowedDirs) {
      for (const dir of config.allowedDirs) {
        args.push("--add-dir", dir);
      }
    }

    return { command: "claude", args };
  },

  getTranscriptPath(config: AgentConfig): string | null {
    const encoded = encodeProjectPath(config.cwd);
    const projectDir = join(homedir(), ".claude", "projects", encoded);
    return findLatestTranscript(projectDir);
  },

  parseIdleSignal(
    line: string,
  ): { idle: boolean; timestamp: string } | null {
    const event = IdleDetector.parseTranscriptLine(line);
    if (!event) return null;

    if (
      event.type === "system" &&
      event.subtype === "turn_duration" &&
      event.timestamp
    ) {
      return { idle: true, timestamp: event.timestamp };
    }

    if (
      event.type === "assistant" &&
      event.message?.stop_reason === "end_turn" &&
      event.timestamp
    ) {
      return { idle: true, timestamp: event.timestamp };
    }

    if (
      event.type === "assistant" &&
      (event.message?.stop_reason === "tool_use" ||
        event.message?.stop_reason === null) &&
      event.timestamp
    ) {
      return { idle: false, timestamp: event.timestamp };
    }

    if (event.type === "progress" && event.timestamp) {
      return { idle: false, timestamp: event.timestamp };
    }

    return null;
  },

  getInitialInput() {
    return null;
  },
};

/**
 * Claude Code adapter for one-shot (--print) mode.
 * Runs a single prompt and exits. Used for demos and quick tasks.
 */
export const claudeCodePrintAdapter: CLIAdapter = {
  name: "claude-code-print",

  buildSpawnArgs(config: AgentConfig) {
    const args = ["--print", "--verbose", "--output-format", "stream-json"];

    if (config.systemPrompt) {
      args.push("--append-system-prompt", config.systemPrompt);
    }

    if (config.allowedDirs) {
      for (const dir of config.allowedDirs) {
        args.push("--add-dir", dir);
      }
    }

    return { command: "claude", args };
  },

  getTranscriptPath: claudeCodeAdapter.getTranscriptPath,
  parseIdleSignal: claudeCodeAdapter.parseIdleSignal,

  getInitialInput() {
    return null;
  },
};
