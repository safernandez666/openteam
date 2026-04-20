import { useState, useEffect } from "react";

interface Overview {
  totalTasks: number;
  doneTasks: number;
  successRate: number;
  totalTokens: number;
  activeWorkflows: number;
  inProgress: number;
  blocked: number;
}

interface AgentStat {
  role: string;
  totalTasks: number;
  successes: number;
  failures: number;
  successRate: number;
  avgDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: string;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="dash-stat">
      <div className="dash-stat-value">{value}</div>
      <div className="dash-stat-label">{label}</div>
      {sub && <div className="dash-stat-sub">{sub}</div>}
    </div>
  );
}

function HealthDot({ status }: { status: "pass" | "warn" | "fail" }) {
  return <span className={`dash-health-dot dash-health-dot--${status}`} />;
}

export function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [agents, setAgents] = useState<AgentStat[]>([]);
  const [health, setHealth] = useState<{ overall: string; checks: HealthCheck[] } | null>(null);
  const [workflows, setWorkflows] = useState<{ templates: number; instances: number; running: number; completed: number } | null>(null);
  const [gates, setGates] = useState<{ totalExecutions: number; passed: number; failed: number; passRate: number } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/overview").then((r) => r.json()),
      fetch("/api/dashboard/agents").then((r) => r.json()),
      fetch("/api/doctor").then((r) => r.json()),
      fetch("/api/dashboard/workflows").then((r) => r.json()),
      fetch("/api/dashboard/gates").then((r) => r.json()),
    ]).then(([ov, ag, h, wf, g]) => {
      setOverview(ov);
      setAgents(ag);
      setHealth(h);
      setWorkflows(wf);
      setGates(g);
    }).catch(() => {});
  }, []);

  return (
    <>
      <div className="dash-header">
        <span className="dash-title">Dashboard</span>
        {health && <span className={`dash-health-badge dash-health-badge--${health.overall}`}>{health.overall}</span>}
      </div>

      <div className="dash-body">
        {/* Overview cards */}
        {overview && (
          <div className="dash-stats-row">
            <StatCard label="Tasks" value={overview.totalTasks} sub={`${overview.doneTasks} done`} />
            <StatCard label="Success Rate" value={`${overview.successRate}%`} />
            <StatCard label="In Progress" value={overview.inProgress} />
            <StatCard label="Blocked" value={overview.blocked} />
            <StatCard label="Tokens" value={overview.totalTokens > 1000 ? `${(overview.totalTokens / 1000).toFixed(1)}k` : overview.totalTokens} />
            <StatCard label="Workflows" value={overview.activeWorkflows} sub="active" />
          </div>
        )}

        <div className="dash-grid">
          {/* Agent Performance */}
          {agents.length > 0 && (
            <div className="dash-card dash-card--wide">
              <div className="dash-card-title">Agent Performance</div>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Tasks</th>
                    <th>Success</th>
                    <th>Avg Duration</th>
                    <th>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.role}>
                      <td className="dash-table-role">{a.role}</td>
                      <td>{a.totalTasks}</td>
                      <td>
                        <span className={`dash-rate ${a.successRate >= 80 ? "dash-rate--good" : a.successRate >= 50 ? "dash-rate--ok" : "dash-rate--bad"}`}>
                          {a.successRate}%
                        </span>
                      </td>
                      <td>{a.avgDurationMs > 0 ? `${(a.avgDurationMs / 1000).toFixed(1)}s` : "—"}</td>
                      <td>{((a.totalInputTokens + a.totalOutputTokens) / 1000).toFixed(1)}k</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Workflows */}
          {workflows && (
            <div className="dash-card">
              <div className="dash-card-title">Workflows</div>
              <div className="dash-card-stats">
                <div className="dash-card-stat">
                  <span className="dash-card-stat-value">{workflows.templates}</span>
                  <span className="dash-card-stat-label">Templates</span>
                </div>
                <div className="dash-card-stat">
                  <span className="dash-card-stat-value">{workflows.running}</span>
                  <span className="dash-card-stat-label">Running</span>
                </div>
                <div className="dash-card-stat">
                  <span className="dash-card-stat-value">{workflows.completed}</span>
                  <span className="dash-card-stat-label">Completed</span>
                </div>
              </div>
            </div>
          )}

          {/* Gates */}
          {gates && (
            <div className="dash-card">
              <div className="dash-card-title">Validation Gates</div>
              <div className="dash-card-stats">
                <div className="dash-card-stat">
                  <span className="dash-card-stat-value">{gates.totalExecutions}</span>
                  <span className="dash-card-stat-label">Executions</span>
                </div>
                <div className="dash-card-stat">
                  <span className={`dash-card-stat-value ${gates.passRate >= 80 ? "dash-rate--good" : "dash-rate--bad"}`}>{gates.passRate}%</span>
                  <span className="dash-card-stat-label">Pass Rate</span>
                </div>
              </div>
            </div>
          )}

          {/* Health Checks */}
          {health && (
            <div className="dash-card">
              <div className="dash-card-title">System Health</div>
              <div className="dash-health-list">
                {health.checks.map((c) => (
                  <div key={c.name} className="dash-health-item">
                    <HealthDot status={c.status} />
                    <span className="dash-health-name">{c.name}</span>
                    <span className="dash-health-msg">{c.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {!overview && (
          <div className="dash-empty">Loading dashboard...</div>
        )}
      </div>
    </>
  );
}
