import type BetterSqlite3 from "better-sqlite3";
import type { ProviderType } from "../orchestrator/cli-provider.js";

export type Tier = "economy" | "fast" | "standard" | "quality" | "premium";

export interface TierConfig {
  roleId: string;
  tier: Tier;
  provider: ProviderType | null;
}

const DEFAULT_TIERS: Record<string, Tier> = {
  pm: "quality",
  developer: "quality",
  architect: "quality",
  "api-designer": "standard",
  "data-engineer": "standard",
  designer: "quality",
  tester: "fast",
  reviewer: "economy",
  devops: "fast",
  security: "quality",
  copywriter: "economy",
  seo: "economy",
  performance: "standard",
};

const TIER_PROVIDER_MAP: Record<Tier, ProviderType> = {
  economy: "kimi",
  fast: "kimi",
  standard: "claude",
  quality: "claude",
  premium: "claude",
};

export class TierEngine {
  constructor(private db: BetterSqlite3.Database) {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const count = (this.db.prepare("SELECT COUNT(*) as c FROM worker_tiers").get() as { c: number }).c;
    if (count > 0) return;

    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO worker_tiers (role_id, tier) VALUES (?, ?)",
    );
    for (const [role, tier] of Object.entries(DEFAULT_TIERS)) {
      stmt.run(role, tier);
    }
  }

  /** Get tier config for a role. Falls back to 'standard'. */
  getTier(roleId: string): TierConfig {
    const row = this.db.prepare("SELECT * FROM worker_tiers WHERE role_id = ?").get(roleId) as
      | { role_id: string; tier: string; provider: string | null }
      | undefined;
    if (!row) return { roleId, tier: DEFAULT_TIERS[roleId] ?? "standard", provider: null };
    return { roleId: row.role_id, tier: row.tier as Tier, provider: row.provider as ProviderType | null };
  }

  /** Set tier for a role. */
  setTier(roleId: string, tier: Tier, provider?: ProviderType | null): void {
    this.db.prepare(
      "INSERT INTO worker_tiers (role_id, tier, provider, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(role_id) DO UPDATE SET tier = ?, provider = ?, updated_at = datetime('now')",
    ).run(roleId, tier, provider ?? null, tier, provider ?? null);
  }

  /** Get all tier configs. */
  getAllTiers(): TierConfig[] {
    const rows = this.db.prepare("SELECT * FROM worker_tiers ORDER BY role_id").all() as
      Array<{ role_id: string; tier: string; provider: string | null }>;
    return rows.map((r) => ({ roleId: r.role_id, tier: r.tier as Tier, provider: r.provider as ProviderType | null }));
  }

  /** Reset all tiers to defaults. */
  resetToDefaults(): void {
    this.db.prepare("DELETE FROM worker_tiers").run();
    this.seedDefaults();
  }

  /** Map tier to provider. Returns tier-recommended provider unless overridden. */
  getProviderForTier(tier: Tier, roleProvider: ProviderType | null, workspaceDefault: ProviderType): ProviderType {
    if (roleProvider) return roleProvider;
    return TIER_PROVIDER_MAP[tier] ?? workspaceDefault;
  }

  /** Score task complexity (Fibonacci: 1,2,3,5,8,13). */
  scoreTask(title: string, description?: string, role?: string): number {
    let score = 1;
    const text = `${title} ${description ?? ""}`.toLowerCase();

    if (text.includes("refactor")) score += 3;
    if (text.includes("migration")) score += 5;
    if (text.includes("security") || text.includes("auth")) score += 3;
    if (text.includes("architecture") || text.includes("design system")) score += 3;
    if (text.includes("multiple files") || text.includes("across")) score += 2;
    if ((description?.length ?? 0) > 500) score += 2;

    if (role === "architect" || role === "security") score += 3;

    // Map to Fibonacci
    if (score <= 2) return 2;
    if (score <= 4) return 3;
    if (score <= 6) return 5;
    if (score <= 9) return 8;
    return 13;
  }

  /** Infer tier from task complexity score. */
  inferTier(score: number, roleTier: Tier): Tier {
    if (score <= 2) return roleTier === "economy" || roleTier === "fast" ? roleTier : "fast";
    if (score <= 5) return "standard";
    if (score <= 8) return "quality";
    return "quality"; // 13 = quality + panel review
  }

  /** Get tier label for display. */
  static label(tier: Tier): string {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  }
}
