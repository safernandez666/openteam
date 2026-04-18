import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type ProviderType = "claude" | "kimi";

export interface CliProviderConfig {
  type: ProviderType;
}

interface BuildArgsOptions {
  prompt: string;
  systemPrompt: string;
  sessionId?: string | null;
  mcpConfigJson?: string | null;
  cwd: string;
}

interface ProviderResult {
  command: string;
  args: string[];
}

/**
 * Abstracts CLI differences between Claude Code and Kimi Code.
 */
export function buildCliArgs(provider: ProviderType, options: BuildArgsOptions): ProviderResult {
  if (provider === "kimi") {
    return buildKimiArgs(options);
  }
  return buildClaudeArgs(options);
}

function buildClaudeArgs(options: BuildArgsOptions): ProviderResult {
  const args = [
    "--print",
    "--verbose",
    "--output-format", "stream-json",
    "--append-system-prompt", options.systemPrompt,
  ];

  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }

  if (options.mcpConfigJson) {
    args.push("--mcp-config", options.mcpConfigJson);
  }

  args.push(options.prompt);

  return { command: "claude", args };
}

function buildKimiArgs(options: BuildArgsOptions): ProviderResult {
  // Kimi needs system prompt in a YAML agent file
  const agentDir = join(options.cwd, ".openteam-agents");
  mkdirSync(agentDir, { recursive: true });

  const promptFileName = `system-${Date.now()}.md`;
  const promptPath = join(agentDir, promptFileName);
  writeFileSync(promptPath, options.systemPrompt, "utf-8");

  const agentYaml = `version: 1\nagent:\n  extend: default\n  system_prompt_path: ${promptPath}\n`;
  const agentPath = join(agentDir, `agent-${Date.now()}.yaml`);
  writeFileSync(agentPath, agentYaml, "utf-8");

  const args = [
    "--print",
    "--output-format", "stream-json",
    "--agent-file", agentPath,
    "-p", options.prompt,
  ];

  if (options.sessionId) {
    args.push("--session", options.sessionId);
  }

  if (options.mcpConfigJson) {
    args.push("--mcp-config", options.mcpConfigJson);
  }

  return { command: "kimi", args };
}

/**
 * Parse a stream-json line from either provider.
 * Returns extracted text chunk or null.
 */
export function parseStreamEvent(provider: ProviderType, event: Record<string, unknown>): string | null {
  if (provider === "kimi") {
    // Kimi uses {"role":"assistant","content":[{"type":"text","text":"..."},{"type":"think",...}]}
    if (event.role === "assistant" && event.content) {
      if (typeof event.content === "string") {
        return event.content;
      }
      if (Array.isArray(event.content)) {
        return (event.content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === "text" && b.text)
          .map((b) => b.text!)
          .join("");
      }
    }
    return null;
  }

  // Claude uses content_block_delta and assistant message formats
  if (event.type === "content_block_delta") {
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta && typeof delta.text === "string") {
      return delta.text;
    }
  }

  if (event.type === "assistant") {
    const message = event.message as Record<string, unknown> | undefined;
    const content = message?.content as Array<{ type: string; text?: string }> | undefined;
    if (content) {
      return content
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!)
        .join("");
    }
  }

  return null;
}
