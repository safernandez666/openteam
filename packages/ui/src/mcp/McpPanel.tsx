import { useState, useEffect, useCallback } from "react";

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

type AddMode = "closed" | "command" | "url";

export function McpPanel() {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [mode, setMode] = useState<AddMode>("closed");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp-servers");
      const data = await res.json();
      setServers(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const reset = () => {
    setMode("closed");
    setName("");
    setCommand("");
    setArgs("");
    setUrl("");
    setError(null);
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const config: McpServerConfig =
        mode === "command"
          ? { command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [] }
          : { type: "http", url: url.trim() };

      const res = await fetch("/api/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), config }),
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

        {/* Add buttons */}
        <div className="skills-panel-actions">
          <button
            className={`btn btn--ghost btn--sm ${mode === "command" ? "btn--active" : ""}`}
            onClick={() => setMode(mode === "command" ? "closed" : "command")}
          >
            + Command
          </button>
          <button
            className={`btn btn--ghost btn--sm ${mode === "url" ? "btn--active" : ""}`}
            onClick={() => setMode(mode === "url" ? "closed" : "url")}
          >
            + HTTP URL
          </button>
        </div>

        {/* Add form */}
        {mode !== "closed" && (
          <div className="skills-panel-form">
            <div className="skills-panel-form-label">
              {mode === "command" ? "Add Command MCP Server" : "Add HTTP MCP Server"}
            </div>
            <input
              className="skill-installer-input"
              placeholder="Server name (e.g. chrome-devtools)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {mode === "command" ? (
              <>
                <input
                  className="skill-installer-input"
                  placeholder="Command (e.g. npx)"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
                <input
                  className="skill-installer-input"
                  placeholder="Arguments (e.g. @anthropic-ai/chrome-devtools-mcp@latest)"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
              </>
            ) : (
              <input
                className="skill-installer-input"
                placeholder="URL (e.g. https://api.example.com/mcp/)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            )}
            <div className="skill-installer-row">
              <button
                className="btn btn--primary btn--sm"
                onClick={handleAdd}
                disabled={loading || !name.trim() || (mode === "command" ? !command.trim() : !url.trim())}
              >
                {loading ? "Adding..." : "Add"}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={reset}>
                Cancel
              </button>
            </div>
            {error && <div className="skill-installer-error">{error}</div>}
          </div>
        )}

        {/* Server list */}
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
                    <button
                      className="module-card-delete"
                      onClick={() => handleDelete(server.name)}
                      title="Remove"
                    >
                      &times;
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

        {servers.length === 0 && mode === "closed" && (
          <div className="mcp-empty">
            No MCP servers configured. Add one to give your workers superpowers.
          </div>
        )}
      </div>
    </>
  );
}
