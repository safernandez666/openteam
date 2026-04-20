import { useState, useEffect } from "react";

export type View = "projects" | "board" | "workers" | "workflows" | "dashboard" | "skills" | "mcp" | "chat";

const NAV_ITEMS: { key: View; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "projects", label: "Projects", icon: "projects" },
  { key: "board", label: "Board", icon: "board" },
  { key: "workers", label: "Workers", icon: "workers" },
  { key: "workflows", label: "Workflows", icon: "workflows" },
  { key: "skills", label: "Skills", icon: "skills" },
  { key: "mcp", label: "MCP", icon: "mcp" },
  { key: "chat", label: "Chat", icon: "chat" },
];

function NavIcon({ type }: { type: string }) {
  if (type === "projects") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 4h5l2 2h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      </svg>
    );
  }
  if (type === "board") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="4.5" height="14" rx="1" />
        <rect x="8.5" y="2" width="4.5" height="8" rx="1" />
        <rect x="8.5" y="12" width="4.5" height="4" rx="1" />
      </svg>
    );
  }
  if (type === "workers") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="5" r="2.5" />
        <circle cx="13" cy="5" r="2" />
        <path d="M1 15c0-3 2.5-5 5-5s5 2 5 5" />
        <path d="M11 15c0-2.5 1.5-4 3-4s2.5 1.5 2.5 4" />
      </svg>
    );
  }
  if (type === "dashboard") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="10" width="3" height="6" rx="0.5" />
        <rect x="7.5" y="6" width="3" height="10" rx="0.5" />
        <rect x="13" y="2" width="3" height="14" rx="0.5" />
      </svg>
    );
  }
  if (type === "skills") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2l1.5 3.5L14 7l-3.5 1.5L9 12l-1.5-3.5L4 7l3.5-1.5z" />
        <path d="M14 12l.75 1.75L16.5 14.5l-1.75.75L14 17l-.75-1.75-1.75-.75 1.75-.75z" />
      </svg>
    );
  }
  if (type === "workflows") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="4" cy="4" r="2" />
        <circle cx="14" cy="4" r="2" />
        <circle cx="9" cy="14" r="2" />
        <path d="M6 4h6" />
        <path d="M4 6v4l5 4" />
        <path d="M14 6v4l-5 4" />
      </svg>
    );
  }
  if (type === "mcp") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="4" height="4" rx="0.5" />
        <rect x="12" y="3" width="4" height="4" rx="0.5" />
        <rect x="12" y="11" width="4" height="4" rx="0.5" />
        <path d="M6 9h3" />
        <path d="M9 5V13" />
        <path d="M9 5h3" />
        <path d="M9 13h3" />
      </svg>
    );
  }
  if (type === "chat") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6l-3 3V4a1 1 0 0 1 1-1z" />
        <line x1="6" y1="7" x2="12" y2="7" />
        <line x1="6" y1="10" x2="10" y2="10" />
      </svg>
    );
  }
  return null;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  projectId: string;
}

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  taskCount: number;
  activeWorkerCount: number;
  pmStatus: "idle" | "working";
  isConnected: boolean;
  onOpenSettings: () => void;
}

export function Sidebar({
  activeView,
  onViewChange,
  taskCount,
  activeWorkerCount,
  pmStatus,
  isConnected,
  onOpenSettings,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : "sidebar--expanded"}`}>
      {/* Logo */}
      <div className="sidebar-logo" onClick={() => setCollapsed(!collapsed)}>
        <span className="sidebar-logo-mark">O</span>
        {!collapsed && <span className="sidebar-logo-text">OpenTeam</span>}
      </div>

      {/* No workspaces in sidebar — breadcrumb in header is enough */}

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`sidebar-nav-item ${activeView === item.key ? "sidebar-nav-item--active" : ""}`}
            onClick={() => onViewChange(item.key)}
            title={item.label}
          >
            <NavIcon type={item.icon} />
            {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
            {item.key === "board" && taskCount > 0 && (
              <span className="sidebar-badge">{taskCount}</span>
            )}
            {item.key === "workers" && activeWorkerCount > 0 && (
              <span className="sidebar-badge sidebar-badge--workers">{activeWorkerCount}</span>
            )}
            {item.key === "chat" && isConnected && pmStatus === "working" && (
              <span className="sidebar-badge sidebar-badge--active" />
            )}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="sidebar-bottom">
        {!collapsed && (
          <button className="sidebar-settings-btn" onClick={onOpenSettings} title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.68 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        )}
        <div className={`sidebar-connection ${isConnected ? "sidebar-connection--on" : ""}`}>
          <span className={`status-dot ${isConnected ? "status-dot--connected" : "status-dot--disconnected"}`} />
        </div>
      </div>
    </aside>
  );
}
