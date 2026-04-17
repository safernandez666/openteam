import { describe, it, expect } from "vitest";
import { app } from "./index.js";

describe("web server", () => {
  it("should export express app", () => {
    expect(app).toBeDefined();
  });
});
