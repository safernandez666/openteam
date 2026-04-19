export interface RoleDefinition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: "engineering" | "design" | "quality" | "ops" | "content" | "strategy";
  defaultName: string;
}

/**
 * Built-in role catalog — all available agent types.
 * Users pick from this catalog to build their team.
 */
export const ROLE_CATALOG: RoleDefinition[] = [
  // Engineering
  {
    id: "developer",
    name: "Developer",
    emoji: "code",
    description: "Writes code, implements features, fixes bugs",
    category: "engineering",
    defaultName: "Lucas",
  },
  {
    id: "architect",
    name: "Architect",
    emoji: "building",
    description: "System design, architecture decisions, tech strategy",
    category: "engineering",
    defaultName: "Marco",
  },
  {
    id: "api-designer",
    name: "API Designer",
    emoji: "plug",
    description: "REST/GraphQL API design, endpoint conventions, schemas",
    category: "engineering",
    defaultName: "Diego",
  },
  {
    id: "data-engineer",
    name: "Data Engineer",
    emoji: "database",
    description: "ETL pipelines, data models, migrations, queries",
    category: "engineering",
    defaultName: "Nina",
  },

  // Design
  {
    id: "designer",
    name: "Designer",
    emoji: "palette",
    description: "UI/UX design, components, visual polish",
    category: "design",
    defaultName: "Sofia",
  },

  // Quality
  {
    id: "tester",
    name: "Tester",
    emoji: "test-tube",
    description: "Tests, validation, quality assurance",
    category: "quality",
    defaultName: "Max",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    emoji: "search",
    description: "Code review, security, performance analysis",
    category: "quality",
    defaultName: "Ana",
  },

  // Ops
  {
    id: "devops",
    name: "DevOps",
    emoji: "rocket",
    description: "CI/CD, Docker, deployments, infrastructure",
    category: "ops",
    defaultName: "Omar",
  },
  {
    id: "security",
    name: "Security",
    emoji: "shield",
    description: "Auth, RLS, CSP, vulnerability scanning, hardening",
    category: "ops",
    defaultName: "Vera",
  },

  // Content
  {
    id: "copywriter",
    name: "Copywriter",
    emoji: "pen",
    description: "UI text, docs, marketing copy, error messages",
    category: "content",
    defaultName: "Lena",
  },
  {
    id: "seo",
    name: "SEO Specialist",
    emoji: "globe",
    description: "Meta tags, structured data, sitemaps, crawlability",
    category: "content",
    defaultName: "Kai",
  },

  // Strategy
  {
    id: "performance",
    name: "Performance",
    emoji: "zap",
    description: "Core Web Vitals, bundle size, caching, profiling",
    category: "strategy",
    defaultName: "Rin",
  },
];

/** Get a role definition by ID */
export function getRole(id: string): RoleDefinition | undefined {
  return ROLE_CATALOG.find((r) => r.id === id);
}

/** Get roles by category */
export function getRolesByCategory(category: string): RoleDefinition[] {
  return ROLE_CATALOG.filter((r) => r.category === category);
}

/** All category labels */
export const CATEGORIES = [
  { id: "engineering", label: "Engineering" },
  { id: "design", label: "Design" },
  { id: "quality", label: "Quality" },
  { id: "ops", label: "Ops & Security" },
  { id: "content", label: "Content" },
  { id: "strategy", label: "Strategy" },
];
