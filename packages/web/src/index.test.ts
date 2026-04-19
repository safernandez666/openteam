import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { startServer, app } from "./index.js";

// Start server on random port to avoid conflicts
const server = startServer(0, "127.0.0.1");

afterAll(() => {
  server.close();
});

describe("GET /api/health", () => {
  it("responds with ok status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.version).toBeDefined();
  });
});

describe("GET /api/tasks", () => {
  it("responds with array", async () => {
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("PUT /api/project", () => {
  it("updates provider and returns updated config", async () => {
    const res = await request(app)
      .put("/api/project")
      .send({ provider: "kimi" });
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("kimi");

    // Verify it persisted
    const get = await request(app).get("/api/project");
    expect(get.body.provider).toBe("kimi");

    // Reset back to claude
    await request(app).put("/api/project").send({ provider: "claude" });
  });
});

describe("PUT /api/active", () => {
  it("returns 400 when missing params", async () => {
    const res = await request(app)
      .put("/api/active")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns switched: true for valid project/workspace", async () => {
    // Get current active to use valid IDs
    const projects = await request(app).get("/api/projects");
    const active = projects.body.active;
    if (!active) return; // Skip if no active project

    const res = await request(app)
      .put("/api/active")
      .send({ projectId: active.projectId, workspaceId: active.workspaceId });
    expect(res.status).toBe(200);
    expect(res.body.switched).toBe(true);
  });
});
