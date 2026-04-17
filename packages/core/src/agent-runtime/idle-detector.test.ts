import { describe, it, expect } from "vitest";
import { IdleDetector } from "./idle-detector.js";

describe("IdleDetector", () => {
  describe("parseTranscriptLine", () => {
    it("should parse valid JSON", () => {
      const line = '{"type":"system","subtype":"turn_duration","timestamp":"2026-04-17T14:00:00Z","durationMs":5000}';
      const result = IdleDetector.parseTranscriptLine(line);
      expect(result).toEqual({
        type: "system",
        subtype: "turn_duration",
        timestamp: "2026-04-17T14:00:00Z",
        durationMs: 5000,
      });
    });

    it("should return null for invalid JSON", () => {
      expect(IdleDetector.parseTranscriptLine("not json")).toBeNull();
      expect(IdleDetector.parseTranscriptLine("")).toBeNull();
    });

    it("should parse assistant end_turn event", () => {
      const line = JSON.stringify({
        type: "assistant",
        timestamp: "2026-04-17T14:00:00Z",
        message: {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Done." }],
        },
      });
      const result = IdleDetector.parseTranscriptLine(line);
      expect(result?.type).toBe("assistant");
      expect(result?.message?.stop_reason).toBe("end_turn");
    });

    it("should parse assistant tool_use event", () => {
      const line = JSON.stringify({
        type: "assistant",
        timestamp: "2026-04-17T14:00:00Z",
        message: {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", name: "Bash" }],
        },
      });
      const result = IdleDetector.parseTranscriptLine(line);
      expect(result?.message?.stop_reason).toBe("tool_use");
    });
  });
});
