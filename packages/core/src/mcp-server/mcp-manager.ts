import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface McpServerConfig {
  command?: string;
  args?: string[];
  type?: string;
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  enabled: boolean;
}

/**
 * Manages MCP server configurations for OpenTeam workers.
 * Stores config in ~/.openteam/mcp-servers.json
 * Generates --mcp-config JSON for Claude CLI workers.
 */
export class McpManager {
  private servers = new Map<string, McpServerEntry>();
  private configPath: string;

  constructor(dataDir: string) {
    this.configPath = join(dataDir, "mcp-servers.json");
    this.load();
  }

  private load(): void {
    this.servers.clear();
    if (!existsSync(this.configPath)) return;
    try {
      const data = JSON.parse(readFileSync(this.configPath, "utf-8")) as McpServerEntry[];
      for (const entry of data) {
        this.servers.set(entry.name, entry);
      }
    } catch {
      // ignore corrupt file
    }
  }

  private save(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    const data = Array.from(this.servers.values());
    writeFileSync(this.configPath, JSON.stringify(data, null, 2), "utf-8");
  }

  /** List all configured MCP servers. */
  list(): McpServerEntry[] {
    return Array.from(this.servers.values());
  }

  /** Get a server by name. */
  get(name: string): McpServerEntry | null {
    return this.servers.get(name) ?? null;
  }

  /** Add or update an MCP server. */
  set(name: string, config: McpServerConfig, enabled = true): McpServerEntry {
    const entry: McpServerEntry = { name, config, enabled };
    this.servers.set(name, entry);
    this.save();
    return entry;
  }

  /** Remove an MCP server. */
  remove(name: string): boolean {
    const existed = this.servers.delete(name);
    if (existed) this.save();
    return existed;
  }

  /** Toggle a server on/off. */
  toggle(name: string, enabled: boolean): McpServerEntry | null {
    const entry = this.servers.get(name);
    if (!entry) return null;
    entry.enabled = enabled;
    this.save();
    return entry;
  }

  /**
   * Build the MCP config JSON string for --mcp-config flag.
   * Only includes enabled servers.
   */
  buildMcpConfigJson(): string | null {
    const enabled = this.list().filter((s) => s.enabled);
    if (enabled.length === 0) return null;

    const config: Record<string, McpServerConfig> = {};
    for (const entry of enabled) {
      config[entry.name] = entry.config;
    }
    return JSON.stringify(config);
  }

  /**
   * Build a summary of available MCP tools for worker prompts.
   */
  buildPromptSection(): string {
    const enabled = this.list().filter((s) => s.enabled);
    if (enabled.length === 0) return "";

    let section = "\n\n---\n\n## Available MCP Servers\n\n";
    section += "You have access to the following MCP servers and their tools:\n\n";
    for (const entry of enabled) {
      section += `- **${entry.name}**`;
      if (entry.config.command) {
        section += ` (${entry.config.command} ${(entry.config.args ?? []).join(" ")})`;
      } else if (entry.config.url) {
        section += ` (${entry.config.url})`;
      }
      section += "\n";
    }
    section += "\nUse these tools when they help complete your task. Tool names are prefixed with `mcp__servername__`.";
    return section;
  }
}
