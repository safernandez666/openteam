export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  source: string;
  installs?: string;
}

/**
 * Curated skill marketplace.
 * Each skill can be installed from GitHub with one click.
 */
export const MARKETPLACE: MarketplaceSkill[] = [
  // Frontend
  { id: "react", name: "React", description: "Functional components, hooks, state management", category: "Frontend", source: "built-in", installs: "built-in" },
  { id: "nextjs", name: "Next.js", description: "App Router, Server Components, SSR/SSG", category: "Frontend", source: "built-in", installs: "built-in" },
  { id: "tailwind", name: "Tailwind CSS", description: "Utility-first CSS framework patterns", category: "Frontend", source: "built-in", installs: "built-in" },
  { id: "vue", name: "Vue.js", description: "Composition API, reactivity, SFC patterns", category: "Frontend", source: "anthropics/claude-code-skills" },
  { id: "svelte", name: "Svelte", description: "Svelte 5 runes, SvelteKit, stores", category: "Frontend", source: "anthropics/claude-code-skills" },
  { id: "angular", name: "Angular", description: "Components, services, RxJS, standalone APIs", category: "Frontend", source: "anthropics/claude-code-skills" },

  // Backend
  { id: "nodejs", name: "Node.js", description: "Express, Fastify, middleware, async patterns", category: "Backend", source: "anthropics/claude-code-skills" },
  { id: "python", name: "Python", description: "FastAPI, Django, type hints, async", category: "Backend", source: "anthropics/claude-code-skills" },
  { id: "go", name: "Go", description: "Standard library, goroutines, error handling", category: "Backend", source: "anthropics/claude-code-skills" },
  { id: "rust", name: "Rust", description: "Ownership, lifetimes, async, error handling", category: "Backend", source: "anthropics/claude-code-skills" },

  // Database
  { id: "prisma", name: "Prisma", description: "ORM, migrations, schema design", category: "Database", source: "built-in", installs: "built-in" },
  { id: "postgresql", name: "PostgreSQL", description: "SQL, indexes, CTEs, JSONB", category: "Database", source: "built-in", installs: "built-in" },
  { id: "drizzle", name: "Drizzle ORM", description: "Type-safe SQL, migrations, relations", category: "Database", source: "anthropics/claude-code-skills" },
  { id: "supabase", name: "Supabase", description: "Auth, RLS, realtime, edge functions", category: "Database", source: "anthropics/claude-code-skills" },
  { id: "mongodb", name: "MongoDB", description: "Mongoose, aggregation, indexes", category: "Database", source: "anthropics/claude-code-skills" },

  // Testing
  { id: "vitest", name: "Vitest", description: "Unit tests, mocks, coverage", category: "Testing", source: "built-in", installs: "built-in" },
  { id: "playwright", name: "Playwright", description: "E2E testing, browser automation", category: "Testing", source: "anthropics/claude-code-skills" },
  { id: "cypress", name: "Cypress", description: "E2E and component testing", category: "Testing", source: "anthropics/claude-code-skills" },

  // DevOps
  { id: "docker", name: "Docker", description: "Containers, multi-stage builds, compose", category: "DevOps", source: "built-in", installs: "built-in" },
  { id: "github-actions", name: "GitHub Actions", description: "CI/CD workflows, caching, secrets", category: "DevOps", source: "anthropics/claude-code-skills" },
  { id: "terraform", name: "Terraform", description: "Infrastructure as code, AWS/GCP/Azure", category: "DevOps", source: "anthropics/claude-code-skills" },
  { id: "kubernetes", name: "Kubernetes", description: "Deployments, services, helm charts", category: "DevOps", source: "anthropics/claude-code-skills" },

  // Design
  { id: "figma", name: "Figma to Code", description: "Translate Figma designs to components", category: "Design", source: "built-in", installs: "built-in" },
  { id: "storybook", name: "Storybook", description: "Component documentation and testing", category: "Design", source: "anthropics/claude-code-skills" },

  // Security
  { id: "auth", name: "Authentication", description: "NextAuth, OAuth, JWT, session management", category: "Security", source: "anthropics/claude-code-skills" },
  { id: "wazuh", name: "Wazuh", description: "SIEM rules, agent config, threat detection", category: "Security", source: "custom" },
];

export const MARKETPLACE_CATEGORIES = [
  "Frontend",
  "Backend",
  "Database",
  "Testing",
  "DevOps",
  "Design",
  "Security",
];
