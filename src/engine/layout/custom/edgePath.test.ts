import { describe, expect, it } from "bun:test";
import { buildEdgePath } from "./edgePath";
import type { Point } from "./types";

describe("buildEdgePath", () => {
  it("returns an empty string for no points", () => {
    expect(buildEdgePath([], "orthogonal", 8)).toBe("");
    expect(buildEdgePath([], "rounded", 8)).toBe("");
    expect(buildEdgePath([], "spline", 8)).toBe("");
    expect(buildEdgePath([], "straight", 8)).toBe("");
  });

  it("returns a bare move command for a single point, for every style", () => {
    const points: Point[] = [{ x: 12, y: 34 }];
    expect(buildEdgePath(points, "orthogonal", 8)).toBe("M 12 34");
    expect(buildEdgePath(points, "rounded", 8)).toBe("M 12 34");
    expect(buildEdgePath(points, "spline", 8)).toBe("M 12 34");
    expect(buildEdgePath(points, "straight", 8)).toBe("M 12 34");
  });

  it("straight style yields exactly two commands regardless of interior waypoints", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
      { x: 200, y: 100 },
    ];
    const path = buildEdgePath(points, "straight", 8);
    const commands = path.split(" ").filter((tok) => tok === "M" || tok === "L");
    expect(commands).toEqual(["M", "L"]);
    expect(path).toBe("M 0 0 L 200 100");
  });

  it("orthogonal style emits a plain M/L polyline with one L per waypoint after the first", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const path = buildEdgePath(points, "orthogonal", 8);
    expect(path).toBe("M 0 0 L 100 0 L 100 100");
  });

  it("rounded style emits exactly one Q per interior corner", () => {
    // A three-segment orthogonal chain has two interior vertices (indices 1 and 2).
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ];
    const path = buildEdgePath(points, "rounded", 8);
    const qCount = (path.match(/Q/g) ?? []).length;
    expect(qCount).toBe(2);
    // Starts at the first point and ends at the last point exactly (rounding never clips the
    // path's own endpoints, only interior corners).
    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path.endsWith("L 200 100")).toBe(true);
  });

  it("rounded style clamps the corner radius to half the shorter adjacent segment", () => {
    // Segments of length 10 and 100 meeting at (10, 0); requested radius (8) exceeds half of
    // the short segment (5), so the entry point must sit exactly 5 units back from the corner.
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 100 },
    ];
    const path = buildEdgePath(points, "rounded", 8);
    // Entry point of the rounded corner: (10 - 5, 0) = (5, 0).
    expect(path).toContain("L 5 0");
    // Exit point: radius is also clamped by the long segment's half-length (50), so it's not
    // clamped there — but the corner radius itself (5, from the short segment) still applies to
    // both ends of the arc, so the exit sits at (10, 0 + 5) = (10, 5).
    expect(path).toContain("Q 10 0 10 5");
  });

  it("rounded style degrades collinear interior vertices to a plain L, no Q", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const path = buildEdgePath(points, "rounded", 8);
    expect(path).not.toContain("Q");
    expect(path).toBe("M 0 0 L 50 0 L 100 0");
  });

  it("rounded style degrades a zero-length adjacent segment to a plain L, no Q", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ];
    const path = buildEdgePath(points, "rounded", 8);
    expect(path).not.toContain("Q");
  });

  it("rounded style with cornerRadius 0 behaves like orthogonal", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(buildEdgePath(points, "rounded", 0)).toBe(buildEdgePath(points, "orthogonal", 0));
  });

  it("spline style produces one C command per segment and passes through every waypoint", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 20 },
      { x: 100, y: 0 },
    ];
    const path = buildEdgePath(points, "spline", 8);
    const cCount = (path.match(/C/g) ?? []).length;
    expect(cCount).toBe(points.length - 1);
    // Every cubic segment's endpoint (the last x,y pair before the next command or path end)
    // must equal the corresponding waypoint — Catmull-Rom interpolates exactly through its
    // control points.
    expect(path).toContain("50 20");
    expect(path.endsWith("100 0")).toBe(true);
  });

  it("spline style on two points degenerates to a single cubic segment", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const path = buildEdgePath(points, "spline", 8);
    expect((path.match(/C/g) ?? []).length).toBe(1);
    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path.endsWith("100 0")).toBe(true);
  });
});
