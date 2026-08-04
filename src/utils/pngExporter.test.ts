import { describe, expect, it } from "bun:test";
import {
  computeFitScale,
  computeFitTransform,
  computeGraphBounds,
  deriveExportFilename,
  planRaster,
} from "./pngExporter";
import type { PositionedEdge, PositionedNode } from "../types/graphData";

describe("computeFitScale", () => {
  it("fits a wide graph by its width", () => {
    expect(computeFitScale({ width: 1600, height: 200 }, { width: 800, height: 600 })).toBe(0.5);
  });

  it("fits a tall graph by its height", () => {
    expect(computeFitScale({ width: 200, height: 1600 }, { width: 800, height: 600 })).toBe(0.375);
  });

  it("leaves a graph smaller than the target at natural size", () => {
    expect(computeFitScale({ width: 200, height: 100 }, { width: 800, height: 600 })).toBe(1);
  });

  it("allows upscaling only up to an explicit maxScale", () => {
    expect(computeFitScale({ width: 200, height: 100 }, { width: 800, height: 600 }, 2)).toBe(2);
  });

  it("falls back to maxScale for degenerate content or target sizes", () => {
    expect(computeFitScale({ width: 0, height: 0 }, { width: 800, height: 600 })).toBe(1);
    expect(computeFitScale({ width: 100, height: 100 }, { width: 0, height: 600 })).toBe(1);
  });
});

describe("computeFitTransform", () => {
  it("centres content that already fits without shrinking it", () => {
    const result = computeFitTransform(
      { minX: 0, minY: 0, maxX: 800, maxY: 400 },
      { width: 800, height: 600 },
      0,
    );

    expect(result.scale).toBe(1);
    expect(result.translateX).toBe(0);
    expect(result.translateY).toBe(100);
  });

  it("shrinks and centres content wider than the target", () => {
    const result = computeFitTransform(
      { minX: 0, minY: 0, maxX: 1600, maxY: 400 },
      { width: 800, height: 600 },
      0,
    );

    expect(result.scale).toBe(0.5);
    expect(result.translateX).toBe(0);
    expect(result.translateY).toBe(200);
  });

  it("keeps negative graph coordinates inside the target", () => {
    const result = computeFitTransform(
      { minX: -400, minY: -400, maxX: 400, maxY: 400 },
      { width: 800, height: 800 },
      0,
    );

    expect(result.scale).toBe(1);
    expect(result.translateX).toBe(400);
    expect(result.translateY).toBe(400);
  });

  it("reserves padding on every side, which shrinks the fit scale", () => {
    const padded = computeFitTransform(
      { minX: 0, minY: 0, maxX: 800, maxY: 400 },
      { width: 800, height: 600 },
      80,
    );

    expect(padded.scale).toBeLessThan(1);
    expect(padded.scale).toBeGreaterThan(0.8);
  });
});

describe("planRaster", () => {
  it("honours the device pixel ratio while under the cap", () => {
    const plan = planRaster({ width: 1000, height: 1000 }, 2, 10_000_000);

    expect(plan.scale).toBe(2);
    expect(plan.pixelWidth).toBe(2000);
    expect(plan.pixelHeight).toBe(2000);
    expect(plan.isDownscaled).toBe(false);
  });

  it("scales down proportionally when the retina raster would exceed the cap", () => {
    const plan = planRaster({ width: 4000, height: 4000 }, 2, 10_000_000);

    expect(plan.isDownscaled).toBe(true);
    expect(plan.scale).toBeLessThan(1);
    expect(plan.pixelWidth).toBe(plan.pixelHeight);
    expect(plan.pixelWidth * plan.pixelHeight).toBeLessThanOrEqual(10_000_000);
  });

  it("scales down even at 1x when the natural size alone exceeds the cap", () => {
    const plan = planRaster({ width: 5000, height: 5000 }, 1, 10_000_000);

    expect(plan.isDownscaled).toBe(true);
    expect(plan.scale).toBeLessThan(1);
    expect(plan.pixelWidth * plan.pixelHeight).toBeLessThanOrEqual(10_000_000);
  });

  it("preserves the aspect ratio when capping a non-square graph", () => {
    const plan = planRaster({ width: 8000, height: 2000 }, 2, 10_000_000);

    expect(plan.isDownscaled).toBe(true);
    expect(plan.pixelWidth).toBe(plan.pixelHeight * 4);
  });

  it("never rasterizes below 1x or above 4x, whatever the device reports", () => {
    expect(planRaster({ width: 100, height: 100 }, 0.5).scale).toBe(1);
    expect(planRaster({ width: 100, height: 100 }, Number.NaN).scale).toBe(1);
    expect(planRaster({ width: 100, height: 100 }, 8).scale).toBe(4);
  });

  it("never produces a zero-pixel canvas", () => {
    const plan = planRaster({ width: 0, height: 0 }, 1);

    expect(plan.pixelWidth).toBeGreaterThanOrEqual(1);
    expect(plan.pixelHeight).toBeGreaterThanOrEqual(1);
  });
});

describe("deriveExportFilename", () => {
  it("slugifies a human title", () => {
    expect(deriveExportFilename("AI Agent Trace", "png")).toBe("gvui-export-ai-agent-trace.png");
  });

  it("collapses path separators and punctuation so the name cannot escape the download folder", () => {
    expect(deriveExportFilename("reports/Q3 2026.json", "png")).toBe(
      "gvui-export-reports-q3-2026-json.png",
    );
  });

  it("falls back to a generic slug when nothing survives slugification", () => {
    expect(deriveExportFilename("", "png")).toBe("gvui-export-graph.png");
    expect(deriveExportFilename("!!! ???", "png")).toBe("gvui-export-graph.png");
  });

  it("normalizes the extension", () => {
    expect(deriveExportFilename("Trace", ".HTML")).toBe("gvui-export-trace.html");
  });

  it("truncates absurdly long titles", () => {
    const name = deriveExportFilename("a".repeat(400), "png");

    expect(name).toBe(`gvui-export-${"a".repeat(64)}.png`);
  });
});

describe("computeGraphBounds", () => {
  it("returns a zero box for an empty graph", () => {
    expect(computeGraphBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it("covers every node rect", () => {
    const nodes: PositionedNode[] = [
      { id: "a", name: "A", x: 10, y: 20, width: 100, height: 50 },
      { id: "b", name: "B", x: -40, y: 200, width: 80, height: 60 },
    ];

    expect(computeGraphBounds(nodes)).toEqual({ minX: -40, minY: 20, maxX: 110, maxY: 260 });
  });

  it("expands to include edge badge boxes and route waypoints", () => {
    const nodes: PositionedNode[] = [{ id: "a", name: "A", x: 0, y: 0, width: 100, height: 50 }];
    const edges: PositionedEdge[] = [
      {
        id: "e1",
        source: "a",
        target: "a",
        path: "",
        points: [
          { x: 50, y: 50 },
          { x: 400, y: 300 },
        ],
        badgeRect: { x: -200, y: -100, width: 60, height: 28 },
      },
    ];

    expect(computeGraphBounds(nodes, edges)).toEqual({
      minX: -200,
      minY: -100,
      maxX: 400,
      maxY: 300,
    });
  });
});
