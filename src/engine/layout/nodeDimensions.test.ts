import { describe, expect, it } from "bun:test";
import { calculatePortPosition, findTotalPathMidpoint, getSideFromAngle } from "./nodeDimensions";

// `calculateNodeDimensions` and `computeDagreLayout` were removed with the v2 rewrite: node sizing
// is now the measurement provider's job (src/engine/layout/measurement), and dagre is gone
// entirely. This file only exercises the pure geometry helpers that survived the cut and are still
// used by port/edge-path plumbing elsewhere in the engine.
describe("nodeDimensions multi-port equal spacing", () => {
  it("determines correct side based on angle theta", () => {
    expect(getSideFromAngle(0)).toBe("Right");
    expect(getSideFromAngle(Math.PI / 4)).toBe("Bottom");
    expect(getSideFromAngle(Math.PI / 2)).toBe("Bottom");
    expect(getSideFromAngle((3 * Math.PI) / 4)).toBe("Left");
    expect(getSideFromAngle(Math.PI)).toBe("Left");
    expect(getSideFromAngle(-Math.PI)).toBe("Left");
    expect(getSideFromAngle(-Math.PI / 2)).toBe("Top");
    expect(getSideFromAngle(-Math.PI / 4)).toBe("Right");
  });

  it("calculates port position on border with alpha offset", () => {
    const node = { x: 100, y: 50, width: 200, height: 100 };

    expect(calculatePortPosition(node, "Top", 0.5)).toEqual({ x: 200, y: 50 });
    expect(calculatePortPosition(node, "Bottom", 0.5)).toEqual({ x: 200, y: 150 });
    expect(calculatePortPosition(node, "Left", 0.25)).toEqual({ x: 100, y: 75 });
    expect(calculatePortPosition(node, "Right", 0.75)).toEqual({ x: 300, y: 125 });
  });

  it("calculates exact 50% total path arc-length midpoint", () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    // Total length = 100 + 100 = 200. Midpoint at distance 100 should be { x: 100, y: 0 }
    const mid = findTotalPathMidpoint(polyline);
    expect(Math.abs(mid.x - 100) < 0.001).toBe(true);
    expect(Math.abs(mid.y - 0) < 0.001).toBe(true);
  });
});
