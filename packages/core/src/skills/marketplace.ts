import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  source: string;
  custom?: boolean;
}

/**
 * Built-in curated skills.
 */
const BUILT_IN_MARKETPLACE: MarketplaceSkill[] = [
  { id: "react", name: "React", description: "Functional components, hooks, state management", category: "Frontend", source: "built-in" },
  { id: "nextjs", name: "Next.js", description: "App Router, Server Components, SSR/SSG", category: "Frontend", source: "built-in" },
  { id: "tailwind", name: "Tailwind CSS", description: "Utility-first CSS framework patterns", category: "Frontend", source: "built-in" },
  { id: "prisma", name: "Prisma", description: "ORM, migrations, schema design", category: "Database", source: "built-in" },
  { id: "postgresql", name: "PostgreSQL", description: "SQL, indexes, CTEs, JSONB", category: "Database", source: "built-in" },
  { id: "vitest", name: "Vitest", description: "Unit tests, mocks, coverage", category: "Testing", source: "built-in" },
  { id: "docker", name: "Docker", description: "Containers, multi-stage builds, compose", category: "DevOps", source: "built-in" },
  { id: "figma", name: "Figma to Code", description: "Translate Figma designs to components", category: "Design", source: "built-in" },
];

export const MARKETPLACE_CATEGORIES = [
  "Frontend",
  "Backend",
  "Database",
  "Testing",
  "DevOps",
  "Design",
  "Security",
  "Custom",
];

/**
 * Auto-categorize a skill based on its content and name.
 */
export function autoCategorize(name: string, content: string): string {
  const text = `${name} ${content}`.toLowerCase();
  const keywords: Record<string, string[]> = {
    Frontend: ["react", "vue", "svelte", "angular", "css", "tailwind", "component", "ui", "dom", "browser", "html"],
    Backend: ["express", "fastapi", "django", "api", "server", "middleware", "route", "endpoint", "node"],
    Database: ["sql", "prisma", "drizzle", "mongo", "postgres", "supabase", "migration", "schema", "orm", "query"],
    Testing: ["test", "vitest", "jest", "playwright", "cypress", "assert", "mock", "coverage", "e2e"],
    DevOps: ["docker", "ci", "cd", "deploy", "kubernetes", "terraform", "github actions", "pipeline", "nginx"],
    Design: ["figma", "design", "storybook", "accessibility", "wcag", "color", "typography", "animation"],
    Security: ["auth", "security", "csp", "cors", "jwt", "oauth", "wazuh", "vulnerability", "encryption"],
  };
  let best = "Custom";
  let bestScore = 0;
  for (const [cat, kws] of Object.entries(keywords)) {
    const score = kws.filter((kw) => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

/**
 * Manages the user's custom marketplace catalog.
 * Persisted globally in ~/.openteam/marketplace-catalog.json
 */
export class MarketplaceCatalog {
  private catalog: MarketplaceSkill[] = [];
  private catalogPath: string;

  constructor(baseDir: string) {
    this.catalogPath = join(baseDir, "marketplace-catalog.json");
    this.load();
  }

  private load(): void {
    if (!existsSync(this.catalogPath)) return;
    try {
      this.catalog = JSON.parse(readFileSync(this.catalogPath, "utf-8"));
    } catch { /* ignore */ }
  }

  private save(): void {
    mkdirSync(join(this.catalogPath, ".."), { recursive: true });
    writeFileSync(this.catalogPath, JSON.stringify(this.catalog, null, 2), "utf-8");
  }

  /** Get full marketplace: built-in + user custom */
  getAll(): MarketplaceSkill[] {
    return [...BUILT_IN_MARKETPLACE, ...this.catalog];
  }

  /** Add a skill to the catalog. Auto-categorizes if no category provided. */
  add(skill: { id: string; name: string; description: string; source: string; category?: string; content?: string }): MarketplaceSkill {
    const existing = this.catalog.find((s) => s.id === skill.id);
    if (existing) return existing;

    const category = skill.category || autoCategorize(skill.name, skill.content ?? skill.description);

    const entry: MarketplaceSkill = {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category,
      source: skill.source,
      custom: true,
    };
    this.catalog.push(entry);
    this.save();
    return entry;
  }

  /** Remove a custom skill from the catalog. */
  remove(id: string): boolean {
    const before = this.catalog.length;
    this.catalog = this.catalog.filter((s) => s.id !== id);
    if (this.catalog.length !== before) {
      this.save();
      return true;
    }
    return false;
  }
}
