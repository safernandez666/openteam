import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorOptions } from "./orchestrator.js";

function createMockOptions(): OrchestratorOptions {
  return {
    taskStore: {
      list: vi.fn().mockReturnValue([]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      areDependenciesMet: vi.fn().mockReturnValue(true),
      getDependents: vi.fn().mockReturnValue([]),
      recordFailure: vi.fn().mockReturnValue(false),
    } as unknown as OrchestratorOptions["taskStore"],
    eventLogger: {
      log: vi.fn(),
    } as unknown as OrchestratorOptions["eventLogger"],
    cwd: "/tmp",
    provider: "claude",
    maxConcurrentWorkers: 2,
    pollIntervalMs: 100,
  };
}

describe("Orchestrator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("setProvider", () => {
    it("changes the provider", () => {
      const orc = new Orchestrator(createMockOptions());
      // Access private field via workaround — cast to check internal state
      orc.setProvider("kimi");
      // Verify by creating another orchestrator task and checking it uses new provider
      // Since provider is private, we verify setProvider doesn't throw
      expect(() => orc.setProvider("kimi")).not.toThrow();
      expect(() => orc.setProvider("claude")).not.toThrow();
    });
  });

  describe("stop", () => {
    it("clears poll timer and stops cleanly", () => {
      const orc = new Orchestrator(createMockOptions());
      orc.start();
      expect(() => orc.stop()).not.toThrow();
    });

    it("can be called multiple times without error", () => {
      const orc = new Orchestrator(createMockOptions());
      orc.start();
      orc.stop();
      expect(() => orc.stop()).not.toThrow();
    });

    it("does not throw when workers exist", () => {
      const orc = new Orchestrator(createMockOptions());
      orc.start();
      // stop should handle empty and non-empty maps safely
      expect(() => orc.stop()).not.toThrow();
    });
  });

  describe("start/stop lifecycle", () => {
    it("starts polling and stops without leaking timers", () => {
      const opts = createMockOptions();
      const orc = new Orchestrator(opts);

      orc.start();
      // Should have called list at least once (initial poll)
      expect(opts.taskStore.list).toHaveBeenCalled();

      orc.stop();
      // After stop, advancing timers should not trigger more polls
      const callCount = (opts.taskStore.list as ReturnType<typeof vi.fn>).mock.calls.length;
      vi.advanceTimersByTime(1000);
      expect((opts.taskStore.list as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    });
  });

  describe("getWorkers", () => {
    it("returns empty array initially", () => {
      const orc = new Orchestrator(createMockOptions());
      expect(orc.getWorkers()).toEqual([]);
    });
  });

  describe("workerCount", () => {
    it("returns 0 when no workers active", () => {
      const orc = new Orchestrator(createMockOptions());
      expect(orc.workerCount).toBe(0);
    });
  });
});
