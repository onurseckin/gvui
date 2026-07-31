import { describe, expect, it } from "bun:test";
import { deriveProgressState } from "./customLayoutWorkerPool";

describe("customLayoutWorkerPool progress emitter", () => {
  it("computes accurate stage percentages and status descriptions", () => {
    const p1 = deriveProgressState(1, 5, "Parsing nodes");
    expect(p1.percent).toBe(20);
    expect(p1.stageText).toContain("Stage 1 of 5");

    const p5 = deriveProgressState(5, 5, "Finalizing SVG paths");
    expect(p5.percent).toBe(100);
  });
});
