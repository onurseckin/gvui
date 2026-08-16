import { describe, expect, it } from "bun:test";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import {
  DEFAULT_CRITICAL_PATH_CONFIG,
  DEFAULT_HEATMAP_CONFIG,
  DEFAULT_NONE_CONFIG,
  DEFAULT_RISK_CONFIG,
  DEFAULT_TOKEN_CONFIG,
} from "../../../store/useCanvasLensStore";
import { evaluateCanvasLens } from "./lensEvaluator";

describe("lensEvaluator Module", () => {
  const mockNodes: PositionedNode[] = [
    {
      id: "n1",
      name: "Node 1",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      metrics: { durationMs: 1000 },
    },
    {
      id: "n2",
      name: "Node 2",
      x: 150,
      y: 0,
      width: 100,
      height: 50,
      metrics: { durationMs: 2000 },
    },
  ];

  const mockEdges: PositionedEdge[] = [
    {
      id: "e1",
      source: "n1",
      target: "n2",
      path: "M 0 0 L 150 0",
    },
  ];

  it("handles mode 'none' with clean empty baseline overlays", () => {
    const res = evaluateCanvasLens(mockNodes, mockEdges, DEFAULT_NONE_CONFIG);
    expect(res.lens).toBe("none");
    expect(res.nodeOverlays.size).toBe(2);
    expect(res.nodeOverlays.get("n1")?.badgeText).toBe("");
  });

  it("routes 'heatmap' evaluation correctly", () => {
    const res = evaluateCanvasLens(mockNodes, mockEdges, DEFAULT_HEATMAP_CONFIG);
    expect(res.lens).toBe("heatmap");
    expect(res.nodeOverlays.get("n2")?.rawValue).toBe(2000);
  });

  it("routes 'critical-path' evaluation correctly", () => {
    const res = evaluateCanvasLens(mockNodes, mockEdges, DEFAULT_CRITICAL_PATH_CONFIG);
    expect(res.lens).toBe("critical-path");
    expect(res.criticalPathData).toBeDefined();
    expect(res.criticalPathData?.totalDurationMs).toBe(3000);
  });

  it("routes 'risk' evaluation correctly", () => {
    const res = evaluateCanvasLens(mockNodes, mockEdges, DEFAULT_RISK_CONFIG);
    expect(res.lens).toBe("risk");
    expect(res.nodeOverlays.size).toBe(2);
  });

  it("routes 'token' evaluation correctly", () => {
    const res = evaluateCanvasLens(mockNodes, mockEdges, DEFAULT_TOKEN_CONFIG);
    expect(res.lens).toBe("token");
    expect(res.nodeOverlays.size).toBe(2);
  });
});
