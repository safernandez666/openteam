import { describe, it, expect, vi } from "vitest";
import { AgentSimulator } from "./agent-simulator.js";
import type { AgentConfig, AgentStatus } from "./types.js";

const testConfig: AgentConfig = {
  name: "sim-test",
  cwd: "/tmp/test",
  cli: "simulator",
};

describe("AgentSimulator", () => {
  it("should start and transition to working then idle", async () => {
    const sim = new AgentSimulator(testConfig, {
      startupDelayMs: 10,
      autoIdleDelayMs: 50,
    });

    const statuses: AgentStatus[] = [];
    sim.emitter.on("status-change", (state) => {
      statuses.push(state.status);
    });

    await sim.start();

    // Wait for auto-idle
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(statuses).toContain("starting");
    expect(statuses).toContain("working");
    expect(statuses).toContain("idle");
    expect(sim.status).toBe("idle");
    expect(sim.pid).not.toBeNull();

    await sim.stop();
    expect(sim.status).toBe("stopped");
    expect(sim.pid).toBeNull();
  });

  it("should respond to input with configured responses", async () => {
    const responses = new Map([["hello", "world"]]);
    const sim = new AgentSimulator(testConfig, {
      startupDelayMs: 10,
      responseDelayMs: 10,
      autoIdleDelayMs: 50,
      responses,
    });

    const outputs: string[] = [];
    sim.emitter.on("output", (o) => outputs.push(o.data));

    await sim.start();
    await sim.sendInput("hello");

    expect(outputs).toContain("world\n");

    await sim.stop();
  });

  it("should use default response for unknown input", async () => {
    const sim = new AgentSimulator(testConfig, {
      startupDelayMs: 10,
      responseDelayMs: 10,
      autoIdleDelayMs: 50,
    });

    const outputs: string[] = [];
    sim.emitter.on("output", (o) => outputs.push(o.data));

    await sim.start();
    await sim.sendInput("anything");

    expect(outputs.some((o) => o.includes('Received: "anything"'))).toBe(true);

    await sim.stop();
  });

  it("should throw when sending input while stopped", async () => {
    const sim = new AgentSimulator(testConfig);
    await expect(sim.sendInput("test")).rejects.toThrow("not running");
  });

  it("should emit exit event on stop", async () => {
    const sim = new AgentSimulator(testConfig, { startupDelayMs: 10 });
    const exitHandler = vi.fn();
    sim.emitter.on("exit", exitHandler);

    await sim.start();
    await sim.stop();

    expect(exitHandler).toHaveBeenCalledWith(0);
  });

  it("should report correct state", async () => {
    const sim = new AgentSimulator(testConfig, { startupDelayMs: 10 });
    await sim.start();

    const state = sim.state;
    expect(state.name).toBe("sim-test");
    expect(state.pid).not.toBeNull();
    expect(state.sessionId).toBe("sim-session-001");
    expect(state.startedAt).toBeInstanceOf(Date);

    await sim.stop();
  });
});
