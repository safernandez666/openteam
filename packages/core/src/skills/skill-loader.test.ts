import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SkillLoader } from "./skill-loader.js";

describe("SkillLoader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `skill-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads built-in skills", () => {
    const loader = new SkillLoader();
    const skills = loader.list();
    expect(skills.length).toBeGreaterThanOrEqual(3);

    const names = skills.map((s) => s.name);
    expect(names).toContain("developer");
    expect(names).toContain("tester");
    expect(names).toContain("reviewer");

    for (const skill of skills) {
      expect(skill.source).toBe("built-in");
      expect(skill.content.length).toBeGreaterThan(0);
    }
  });

  it("gets a skill by name", () => {
    const loader = new SkillLoader();
    const dev = loader.get("developer");
    expect(dev).not.toBeNull();
    expect(dev!.name).toBe("developer");
    expect(dev!.content).toContain("Developer");
  });

  it("returns null for unknown skill", () => {
    const loader = new SkillLoader();
    expect(loader.get("nonexistent")).toBeNull();
  });

  it("has() checks existence", () => {
    const loader = new SkillLoader();
    expect(loader.has("developer")).toBe(true);
    expect(loader.has("nonexistent")).toBe(false);
  });

  it("loads user skills from custom directory", () => {
    writeFileSync(join(tempDir, "custom-role.md"), "You are a custom agent.");

    const loader = new SkillLoader(tempDir);
    const custom = loader.get("custom-role");
    expect(custom).not.toBeNull();
    expect(custom!.name).toBe("custom-role");
    expect(custom!.content).toBe("You are a custom agent.");
    expect(custom!.source).toBe("user");
  });

  it("user skills override built-in skills", () => {
    writeFileSync(join(tempDir, "developer.md"), "Custom developer prompt.");

    const loader = new SkillLoader(tempDir);
    const dev = loader.get("developer");
    expect(dev).not.toBeNull();
    expect(dev!.content).toBe("Custom developer prompt.");
    expect(dev!.source).toBe("user");
  });

  it("ignores non-md files", () => {
    writeFileSync(join(tempDir, "notes.txt"), "not a skill");
    writeFileSync(join(tempDir, "valid.md"), "a skill");

    const loader = new SkillLoader(tempDir);
    expect(loader.has("valid")).toBe(true);
    expect(loader.has("notes")).toBe(false);
  });

  it("buildWorkerPrompt returns skill content for known role", () => {
    const loader = new SkillLoader();
    const prompt = loader.buildWorkerPrompt("developer");
    expect(prompt).toContain("Developer");
  });

  it("buildWorkerPrompt returns generic prompt for unknown role", () => {
    const loader = new SkillLoader();
    const prompt = loader.buildWorkerPrompt("unknown-role");
    expect(prompt).toContain("unknown-role");
    expect(prompt).toContain("Worker agent");
  });

  it("buildWorkerPrompt returns generic prompt when no role given", () => {
    const loader = new SkillLoader();
    const prompt = loader.buildWorkerPrompt();
    expect(prompt).toContain("Worker agent");
    expect(prompt).not.toContain("undefined");
  });

  it("reload refreshes from disk", () => {
    const loader = new SkillLoader(tempDir);
    expect(loader.has("new-skill")).toBe(false);

    writeFileSync(join(tempDir, "new-skill.md"), "Added later.");
    loader.reload();

    expect(loader.has("new-skill")).toBe(true);
    expect(loader.get("new-skill")!.content).toBe("Added later.");
  });

  it("handles missing user skills directory gracefully", () => {
    const loader = new SkillLoader("/tmp/nonexistent-dir-12345");
    // Should still load built-in skills without error
    expect(loader.list().length).toBeGreaterThanOrEqual(3);
  });
});
