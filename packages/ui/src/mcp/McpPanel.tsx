import { useState, useEffect, useCallback } from "react";
import { CloseIcon } from "../icons";

interface McpServerConfig {
  command?: string;
  args?: string[];
  type?: string;
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  enabled: boolean;
}

function parseInput(input: string): { name: string; config: McpServerConfig } {
  const trimmed = input.trim();

  // GitHub URL → npx @org/repo@latest
  const ghMatch = trimmed.match(/github\.com\/([\w-]+)\/([\w.-]+)/);
  if (ghMatch) {
    const org = ghMatch[1].toLowerCase();
    const repo = ghMatch[2].replace(/\.git$/, "");
    const name = repo.replace(/-mcp$/, "");
    return { name, config: { command: "npx", args: [`@${org}/${repo}@latest`] } };
  }

  // HTTP/HTTPS URL → http type
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const urlObj = new URL(trimmed);
    const name = urlObj.hostname.split(".")[0];
    return { name, config: { type: "http", url: trimmed } };
  }

  // npm scoped package (@org/name)
  if (trimmed.startsWith("@")) {
    const name = trimmed.replace(/@.*$/, "").replace(/^@[\w-]+\//, "").replace(/-mcp$/, "") || trimmed.split("/")[1]?.replace(/-mcp$/, "") || "mcp-server";
    const pkg = trimmed.includes("@", 1) ? trimmed : `${trimmed}@latest`;
    return { name, config: { command: "npx", args: [pkg] } };
  }

  // Plain name → assume npx package
  const name = trimmed.replace(/-mcp$/, "");
  return { name, config: { command: "npx", args: [`${trimmed}@latest`] } };
}

export function McpPanel() {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview what will be installed
  const preview = input.trim() ? parseInput(input) : null;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp-servers");
      const data = await res.json();
      setServers(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const reset = () => {
    setShowAdd(false);
    setInput("");
    setError(null);
  };

  const handleAdd = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: preview.name, config: preview.config }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await refresh();
      reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (serverName: string, enabled: boolean) => {
    await fetch(`/api/mcp-servers/${encodeURIComponent(serverName)}/toggle`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await refresh();
  };

  const handleDelete = async (serverName: string) => {
    await fetch(`/api/mcp-servers/${encodeURIComponent(serverName)}`, {
      method: "DELETE",
    });
    await refresh();
  };

  return (
    <>
      <div className="mcp-panel-header">
        <span className="mcp-panel-title">MCP Servers</span>
        <span className="mcp-panel-count">
          {servers.filter((s) => s.enabled).length}/{servers.length} active
        </span>
      </div>

      <div className="mcp-panel-body">
        <div className="mcp-panel-hint">
          MCP servers provide tools to your workers — browser testing, databases, APIs, and more.
        </div>

        <div className="skills-panel-actions">
          <button
            className={`btn btn--ghost btn--sm ${showAdd ? "btn--active" : ""}`}
            onClick={() => setShowAdd(!showAdd)}
          >
            + Add Server
          </button>
        </div>

        {showAdd && (
          <div className="skills-panel-form">
            <div className="skills-panel-form-label">Add MCP Server</div>
            <input
              className="skill-installer-input"
              placeholder="GitHub URL, npm package, or HTTP endpoint"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              autoFocus
            />
            {preview && (
              <div className="mcp-preview">
                <span className="mcp-preview-name">{preview.name}</span>
                <code className="mcp-preview-cmd">
                  {preview.config.command
                    ? `${preview.config.command} ${(preview.config.args ?? []).join(" ")}`
                    : preview.config.url ?? ""}
                </code>
              </div>
            )}
            <div className="skill-installer-row">
              <button
                className="btn btn--primary btn--sm"
                onClick={handleAdd}
                disabled={loading || !input.trim()}
              >
                {loading ? "Adding..." : "Add"}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={reset}>Cancel</button>
            </div>
            {error && <div className="skill-installer-error">{error}</div>}
          </div>
        )}

        {servers.length > 0 && (
          <div className="mcp-server-list">
            {servers.map((server) => (
              <div
                key={server.name}
                className={`mcp-server-card ${!server.enabled ? "mcp-server-card--disabled" : ""}`}
              >
                <div className="mcp-server-card-header">
                  <div className="mcp-server-info">
                    <span className={`mcp-server-dot ${server.enabled ? "mcp-server-dot--on" : ""}`} />
                    <span className="mcp-server-name">{server.name}</span>
                  </div>
                  <div className="mcp-server-actions">
                    <button
                      className={`btn btn--ghost btn--sm ${server.enabled ? "" : "btn--active"}`}
                      onClick={() => handleToggle(server.name, !server.enabled)}
                    >
                      {server.enabled ? "Disable" : "Enable"}
                    </button>
                    <button className="module-card-delete" aria-label="Delete"
                      onClick={() => handleDelete(server.name)}
                      title="Remove"
                    >
                      <CloseIcon size={14} />
                    </button>
                  </div>
                </div>
                <div className="mcp-server-detail">
                  {server.config.command ? (
                    <code>
                      {server.config.command} {(server.config.args ?? []).join(" ")}
                    </code>
                  ) : server.config.url ? (
                    <code>{server.config.url}</code>
                  ) : (
                    <code>{JSON.stringify(server.config)}</code>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {servers.length === 0 && !showAdd && (
          <div className="mcp-empty">
            No MCP servers configured. Add one to give your workers superpowers.
          </div>
        )}
      </div>
    </>
  );
}
