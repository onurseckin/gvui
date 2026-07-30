import { describe, expect, it } from "bun:test";
import { computeEdgePath } from "./computeEdgePath";

describe("computeEdgePath", () => {
  it("computes straight edge path with 8-direction snapping", () => {
    const result = computeEdgePath({
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 50,
      pathType: "straight",
    });

    expect(result.path.startsWith("M 0 0")).toBe(true);
    expect(result.labelX > 0).toBe(true);
    expect(result.labelY > 0).toBe(true);
  });

  it("computes smoothstep edge path", () => {
    const result = computeEdgePath({
      sourceX: 10,
      sourceY: 20,
      targetX: 200,
      targetY: 220,
      pathType: "smoothstep",
    });

    expect(result.path.startsWith("M 10 20")).toBe(true);
    expect(typeof result.labelX).toBe("number");
    expect(typeof result.labelY).toBe("number");
  });

  it("computes bezier edge path with control points", () => {
    const result = computeEdgePath({
      sourceX: 50,
      sourceY: 50,
      targetX: 50,
      targetY: 250,
      pathType: "bezier",
    });

    expect(result.path.includes("M 50 50 C")).toBe(true);
    expect(result.labelX).toBe(50);
    expect(result.labelY).toBe(150);
  });

  it("computes bezier path with parallel edge offset", () => {
    const result = computeEdgePath({
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 0,
      pathType: "bezier",
      offset: 35,
    });

    expect(result.path.includes("M 0 0 C")).toBe(true);
    expect(result.labelY !== 0).toBe(true);
  });
});
