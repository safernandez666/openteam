import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolveDbPath } from "./resolve-db-path.js";

const TEST_DIR = join("/tmp", `openteam-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function setup() {
  mkdirSync(TEST_DIR, { recursive: true });
}

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("resolveDbPath", () => {
  it("returns modern project path when active-project.json exists with valid DB", () => {
    setup();
    const projectId = "my-project";
    const workspaceId = "my-workspace";
    const dbDir = join(TEST_DIR, "projects", projectId, "workspaces", workspaceId);
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(dbDir, "openteam.db"), "");
    writeFileSync(
      join(TEST_DIR, "active-project.json"),
      JSON.stringify({ projectId, workspaceId }),
    );

    const result = resolveDbPath(TEST_DIR);
    expect(result).toBe(join(dbDir, "openteam.db"));
  });

  it("falls back to legacy workspace path when modern DB does not exist", () => {
    setup();
    const wsId = "legacy-ws";
    const wsDir = join(TEST_DIR, "workspaces", wsId);
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, "openteam.db"), "");
    writeFileSync(
      join(TEST_DIR, "active-workspace.json"),
      JSON.stringify({ active: wsId }),
    );

    const result = resolveDbPath(TEST_DIR);
    expect(result).toBe(join(wsDir, "openteam.db"));
  });

  it("falls back to legacy when active-project.json exists but DB file is missing", () => {
    setup();
    writeFileSync(
      join(TEST_DIR, "active-project.json"),
      JSON.stringify({ projectId: "ghost", workspaceId: "gone" }),
    );
    const wsId = "fallback-ws";
    const wsDir = join(TEST_DIR, "workspaces", wsId);
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, "openteam.db"), "");
    writeFileSync(
      join(TEST_DIR, "active-workspace.json"),
      JSON.stringify({ active: wsId }),
    );

    const result = resolveDbPath(TEST_DIR);
    expect(result).toBe(join(wsDir, "openteam.db"));
  });

  it("returns default path when no config files exist", () => {
    setup();
    const result = resolveDbPath(TEST_DIR);
    expect(result).toBe(join(TEST_DIR, "openteam.db"));
  });

  it("returns default path when active-project.json is malformed", () => {
    setup();
    writeFileSync(join(TEST_DIR, "active-project.json"), "not json");
    const result = resolveDbPath(TEST_DIR);
    expect(result).toBe(join(TEST_DIR, "openteam.db"));
  });

  it("prefers modern over legacy when both exist", () => {
    setup();
    // Set up modern
    const modernDir = join(TEST_DIR, "projects", "proj", "workspaces", "ws");
    mkdirSync(modernDir, { recursive: true });
    writeFileSync(join(modernDir, "openteam.db"), "");
    writeFileSync(
      join(TEST_DIR, "active-project.json"),
      JSON.stringify({ projectId: "proj", workspaceId: "ws" }),
    );
    // Set up legacy too
    const legacyDir = join(TEST_DIR, "workspaces", "old");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, "openteam.db"), "");
    writeFileSync(
      join(TEST_DIR, "active-workspace.json"),
      JSON.stringify({ active: "old" }),
    );

    const result = resolveDbPath(TEST_DIR);
    expect(result).toBe(join(modernDir, "openteam.db"));
  });
});
