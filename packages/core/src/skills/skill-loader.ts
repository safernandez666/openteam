import { readFileSync, readdirSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

export interface Skill {
  name: string;
  content: string;
  source: "built-in" | "user";
}

/** A modular skill that can be assigned to any role. */
export interface SkillModule {
  name: string;
  content: string;
  source: "built-in" | "user";
}

/** Maps role names to arrays of assigned module names. */
export type RoleSkillsMap = Record<string, string[]>;

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveBuiltInDir(): string {
  // In source (tests): __dirname = .../src/skills/ → built-in is a sibling
  const srcPath = join(__dirname, "built-in");
  if (existsSync(srcPath)) return srcPath;
  // In dist (bundled): __dirname = .../dist/ → skills/built-in is a child
  return join(__dirname, "skills/built-in");
}

const BUILT_IN_DIR = resolveBuiltInDir();

/**
 * Loads skill definitions from .md files.
 * Built-in skills ship with the package.
 * User skills override built-ins when names collide.
 */
export class SkillLoader {
  private skills = new Map<string, Skill>();
  private modules = new Map<string, SkillModule>();
  private roleSkills: RoleSkillsMap = {};
  private userSkillsDir: string | null;

  constructor(userSkillsDir?: string) {
    this.userSkillsDir = userSkillsDir ?? null;
    this.reload();
  }

  /** Reload all skills and modules from disk. */
  reload(): void {
    this.skills.clear();
    this.modules.clear();

    // Load built-in roles
    this.loadDir(BUILT_IN_DIR, "built-in");

    // Load built-in modules
    const builtInModules = join(BUILT_IN_DIR, "modules");
    this.loadModulesDir(builtInModules, "built-in");

    // User skills override built-ins
    if (this.userSkillsDir && existsSync(this.userSkillsDir)) {
      this.loadDir(this.userSkillsDir, "user");
      // User modules
      const userModules = join(this.userSkillsDir, "modules");
      this.loadModulesDir(userModules, "user");
    }

    // Load role-skills mapping
    this.loadRoleSkillsMap();
  }

  /** Get a skill by name. Returns null if not found. */
  get(name: string): Skill | null {
    return this.skills.get(name) ?? null;
  }

  /** List all available skill names. */
  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /** Check if a skill exists. */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  // ── Module methods ──────────────────────────────────

  /** Get a module by name. */
  getModule(name: string): SkillModule | null {
    return this.modules.get(name) ?? null;
  }

  /** List all available modules. */
  listModules(): SkillModule[] {
    return Array.from(this.modules.values());
  }

  /** Save a user module to disk. */
  saveModule(name: string, content: string): void {
    if (!this.userSkillsDir) throw new Error("No user skills directory configured");
    const dir = join(this.userSkillsDir, "modules");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.md`), content.trim(), "utf-8");
    this.reload();
  }

  /** Remove a user module by name. Returns true if removed. */
  removeModule(name: string): boolean {
    if (!this.userSkillsDir) throw new Error("No user skills directory configured");
    const filePath = join(this.userSkillsDir, "modules", `${name}.md`);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    this.reload();
    return true;
  }

  /**
   * Install modules from a GitHub URL.
   * Clones the repo, finds .md files, and saves them as modules.
   * Returns the names of installed modules.
   */
  installModules(source: string, customName?: string): string[] {
    if (!this.userSkillsDir) throw new Error("No user skills directory configured");

    const isGitUrl =
      source.startsWith("https://github.com/") ||
      source.startsWith("git@github.com:") ||
      source.endsWith(".git");

    if (!isGitUrl) {
      throw new Error(`Unsupported source: ${source}\nSupported: GitHub URL (https://github.com/user/repo)`);
    }

    let gitUrl = source;
    if (!gitUrl.endsWith(".git")) {
      gitUrl = gitUrl.replace(/\/$/, "") + ".git";
    }

    const tmpDir = join(this.userSkillsDir, ".tmp-clone");
    const modulesDir = join(this.userSkillsDir, "modules");
    mkdirSync(modulesDir, { recursive: true });

    try {
      if (existsSync(tmpDir)) {
        execSync(`rm -rf ${JSON.stringify(tmpDir)}`);
      }

      execSync(`git clone --depth 1 ${JSON.stringify(gitUrl)} ${JSON.stringify(tmpDir)}`, {
        stdio: "pipe",
        timeout: 30000,
      });

      const installed: string[] = [];

      const SKIP_FILES = new Set([
        "readme.md", "license.md", "code_of_conduct.md", "contributing.md",
        "changelog.md", "security.md", "pull_request_template.md",
        "bug_report.md", "feature_request.md", "attack_coverage.md",
      ]);

      // Recursively find .md files
      const findMdFiles = (dir: string): Array<{ filePath: string; fileName: string }> => {
        if (!existsSync(dir)) return [];
        const results: Array<{ filePath: string; fileName: string }> = [];
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            results.push(...findMdFiles(join(dir, entry.name)));
          } else if (entry.isFile() && extname(entry.name) === ".md") {
            results.push({ filePath: join(dir, entry.name), fileName: entry.name });
          }
        }
        return results;
      };

      for (const { filePath, fileName } of findMdFiles(tmpDir)) {
        if (SKIP_FILES.has(fileName.toLowerCase())) continue;

        const content = readFileSync(filePath, "utf-8").trim();

        // Skip files that look like repo docs
        const looksLikeDoc =
          content.includes("img.shields.io") ||
          content.includes("<p align=") ||
          content.includes("Supported |") ||
          content.includes("## Contributing") ||
          content.startsWith("# Code of") ||
          content.length < 50;
        if (looksLikeDoc) continue;

        // Derive name: SKILL.md uses parent folder, otherwise file name
        let skillName: string;
        if (fileName.toLowerCase() === "skill.md") {
          skillName = basename(join(filePath, "..")).toLowerCase();
        } else {
          skillName = basename(fileName, ".md").toLowerCase();
        }

        const finalName = customName && installed.length === 0 ? customName.toLowerCase() : skillName;
        writeFileSync(join(modulesDir, `${finalName}.md`), content, "utf-8");
        installed.push(finalName);
      }

      if (installed.length === 0) {
        throw new Error("No .md skill files found in repository");
      }

      this.reload();
      return installed;
    } finally {
      if (existsSync(tmpDir)) {
        execSync(`rm -rf ${JSON.stringify(tmpDir)}`);
      }
    }
  }

  // ── Role-skills mapping ────────────────────────────

  /** Get modules assigned to a role. */
  getRoleSkills(role: string): string[] {
    return this.roleSkills[role] ?? [];
  }

  /** Set the full list of modules assigned to a role. */
  setRoleSkills(role: string, moduleNames: string[]): void {
    this.roleSkills[role] = moduleNames;
    this.saveRoleSkillsMap();
  }

  /** Add a module to a role. */
  addRoleSkill(role: string, moduleName: string): void {
    const current = this.getRoleSkills(role);
    if (!current.includes(moduleName)) {
      current.push(moduleName);
      this.roleSkills[role] = current;
      this.saveRoleSkillsMap();
    }
  }

  /** Remove a module from a role. */
  removeRoleSkill(role: string, moduleName: string): void {
    const current = this.getRoleSkills(role);
    this.roleSkills[role] = current.filter((n) => n !== moduleName);
    this.saveRoleSkillsMap();
  }

  /** Get the full mapping. */
  getAllRoleSkills(): RoleSkillsMap {
    return { ...this.roleSkills };
  }

  /**
   * Build a system prompt for a worker with the given role.
   * Concatenates base role prompt + all assigned module contents.
   */
  buildWorkerPrompt(role?: string): string {
    if (!role) {
      return "You are a Worker agent in the OpenTeam framework. Complete the assigned task efficiently and concisely.";
    }

    const skill = this.get(role);
    let prompt = skill
      ? skill.content
      : `You are a Worker agent with the role "${role}" in the OpenTeam framework. Complete the assigned task efficiently and concisely.`;

    // Append assigned modules
    const assignedModules = this.getRoleSkills(role);
    for (const modName of assignedModules) {
      const mod = this.getModule(modName);
      if (mod) {
        prompt += `\n\n---\n\n## Skill: ${mod.name}\n\n${mod.content}`;
      }
    }

    return prompt;
  }

  /**
   * Install a skill from a GitHub URL or local path.
   * GitHub repos are cloned to a temp dir, then .md files are copied to the user skills dir.
   * Returns the names of installed skills.
   */
  install(source: string): string[] {
    if (!this.userSkillsDir) {
      throw new Error("No user skills directory configured");
    }

    mkdirSync(this.userSkillsDir, { recursive: true });

    // Local .md file
    if (source.endsWith(".md") && existsSync(source)) {
      const name = basename(source, ".md");
      const content = readFileSync(source, "utf-8").trim();
      writeFileSync(join(this.userSkillsDir, `${name}.md`), content, "utf-8");
      this.reload();
      return [name];
    }

    // GitHub URL — clone and extract .md files
    const isGitUrl =
      source.startsWith("https://github.com/") ||
      source.startsWith("git@github.com:") ||
      source.endsWith(".git");

    if (!isGitUrl) {
      throw new Error(
        `Unsupported source: ${source}\nSupported: GitHub URL (https://github.com/user/repo) or local .md file path`,
      );
    }

    // Normalize GitHub URL
    let gitUrl = source;
    if (!gitUrl.endsWith(".git")) {
      gitUrl = gitUrl.replace(/\/$/, "") + ".git";
    }

    const tmpDir = join(this.userSkillsDir, ".tmp-clone");
    try {
      // Clean up any leftover tmp dir
      if (existsSync(tmpDir)) {
        execSync(`rm -rf ${JSON.stringify(tmpDir)}`);
      }

      execSync(`git clone --depth 1 ${JSON.stringify(gitUrl)} ${JSON.stringify(tmpDir)}`, {
        stdio: "pipe",
        timeout: 30000,
      });

      // Find all .md files (top-level and in skills/ subdir)
      const installed: string[] = [];
      const searchDirs = [tmpDir, join(tmpDir, "skills")];

      for (const dir of searchDirs) {
        if (!existsSync(dir)) continue;
        for (const file of readdirSync(dir)) {
          if (extname(file) !== ".md") continue;
          if (file.toLowerCase() === "readme.md") continue;
          if (file.toLowerCase() === "license.md") continue;

          const name = basename(file, ".md");
          const content = readFileSync(join(dir, file), "utf-8").trim();
          writeFileSync(join(this.userSkillsDir, `${name}.md`), content, "utf-8");
          installed.push(name);
        }
      }

      if (installed.length === 0) {
        throw new Error("No .md skill files found in repository");
      }

      this.reload();
      return installed;
    } finally {
      // Clean up tmp dir
      if (existsSync(tmpDir)) {
        execSync(`rm -rf ${JSON.stringify(tmpDir)}`);
      }
    }
  }

  /** Save (create or update) a user skill. Writes to disk and reloads. */
  save(name: string, content: string): void {
    if (!this.userSkillsDir) {
      throw new Error("No user skills directory configured");
    }
    mkdirSync(this.userSkillsDir, { recursive: true });
    writeFileSync(join(this.userSkillsDir, `${name}.md`), content.trim(), "utf-8");
    this.reload();
  }

  /** Remove a user-installed skill by name. Returns true if removed. */
  remove(name: string): boolean {
    if (!this.userSkillsDir) {
      throw new Error("No user skills directory configured");
    }

    const filePath = join(this.userSkillsDir, `${name}.md`);
    if (!existsSync(filePath)) {
      return false;
    }

    unlinkSync(filePath);
    this.reload();
    return true;
  }

  private loadDir(dir: string, source: "built-in" | "user"): void {
    if (!existsSync(dir)) return;

    const files = readdirSync(dir);
    for (const file of files) {
      if (extname(file) !== ".md") continue;
      const name = basename(file, ".md");
      const content = readFileSync(join(dir, file), "utf-8").trim();
      this.skills.set(name, { name, content, source });
    }
  }

  private loadModulesDir(dir: string, source: "built-in" | "user"): void {
    if (!existsSync(dir)) return;

    const files = readdirSync(dir);
    for (const file of files) {
      if (extname(file) !== ".md") continue;
      const name = basename(file, ".md");
      const content = readFileSync(join(dir, file), "utf-8").trim();
      this.modules.set(name, { name, content, source });
    }
  }

  private roleSkillsPath(): string | null {
    if (!this.userSkillsDir) return null;
    return join(this.userSkillsDir, "role-skills.json");
  }

  private loadRoleSkillsMap(): void {
    const path = this.roleSkillsPath();
    if (!path || !existsSync(path)) {
      this.roleSkills = {};
      return;
    }
    try {
      this.roleSkills = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      this.roleSkills = {};
    }
  }

  private saveRoleSkillsMap(): void {
    const path = this.roleSkillsPath();
    if (!path) throw new Error("No user skills directory configured");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.roleSkills, null, 2), "utf-8");
  }
}
