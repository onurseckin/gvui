import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { planLabelLaneDemands } from "./labelLanePlanner";
import type { BadgePlacement, RoutedPath } from "./types";

describe("labelLanePlanner", () => {
  type LabelLanePlannerContext = {
    rankByNodeId: Map<string, number>;
    layerNodeIds: string[][];
    nodeGapByRank?: Map<number, number>;
    rankGapAfterRank?: Map<number, number>;
  };

  const planWithContext = planLabelLaneDemands as (
    placements: BadgePlacement[],
    routes: RoutedPath[],
    config: ReturnType<typeof resolveCustomLayoutConfig>,
    context: LabelLanePlannerContext,
  ) => ReturnType<typeof planLabelLaneDemands>;

  const verticalRoute = (
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    x: number,
  ): RoutedPath => ({
    edgeId,
    points: [
      { x, y: 40 },
      { x, y: 220 },
    ],
    sourcePort: {
      nodeId: sourceNodeId,
      side: "bottom",
      index: 0,
      point: { x, y: 40 },
      stub: { x, y: 60 },
    },
    targetPort: {
      nodeId: targetNodeId,
      side: "top",
      index: 0,
      point: { x, y: 220 },
      stub: { x, y: 200 },
    },
  });

  const horizontalRoute = (
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    y: number,
  ): RoutedPath => ({
    edgeId,
    points: [
      { x: 40, y },
      { x: 220, y },
    ],
    sourcePort: {
      nodeId: sourceNodeId,
      side: "right",
      index: 0,
      point: { x: 40, y },
      stub: { x: 60, y },
    },
    targetPort: {
      nodeId: targetNodeId,
      side: "left",
      index: 0,
      point: { x: 220, y },
      stub: { x: 200, y },
    },
  });

  const singletonRankContext: LabelLanePlannerContext = {
    rankByNodeId: new Map([
      ["A", 0],
      ["B", 1],
    ]),
    layerNodeIds: [["A"], ["B"]],
  };

  it("does not append an ineffective global X demand when every affected rank has one movable node", () => {
    const config = resolveCustomLayoutConfig();
    const placements: BadgePlacement[] = [
      {
        edgeId: "e1",
        label: "HTTP",
        rect: { x: 100, y: 100, width: 60, height: 20 },
        anchorPoint: { x: 130, y: 110 },
      },
      {
        edgeId: "e2",
        label: "gRPC",
        rect: { x: 120, y: 105, width: 60, height: 20 },
        anchorPoint: { x: 150, y: 115 },
      },
    ];

    const demands = planWithContext(
      placements,
      [verticalRoute("e1", "A", "B", 130), verticalRoute("e2", "A", "B", 150)],
      config,
      singletonRankContext,
    );

    expect(demands).toEqual([]);
  });

  it("emits a rank-scoped X lane demand only when an affected rank can move two nodes apart", () => {
    const config = resolveCustomLayoutConfig();
    const placements: BadgePlacement[] = [
      {
        edgeId: "e1",
        label: "HTTP",
        rect: { x: 100, y: 100, width: 60, height: 20 },
        anchorPoint: { x: 130, y: 110 },
      },
      {
        edgeId: "e2",
        label: "gRPC",
        rect: { x: 120, y: 105, width: 60, height: 20 },
        anchorPoint: { x: 150, y: 115 },
      },
    ];

    const context: LabelLanePlannerContext = {
      rankByNodeId: new Map([
        ["A", 0],
        ["B", 0],
        ["C", 1],
        ["D", 1],
      ]),
      layerNodeIds: [
        ["A", "B"],
        ["C", "D"],
      ],
    };
    const routes = [verticalRoute("e1", "A", "C", 130), verticalRoute("e2", "B", "D", 150)];
    const demands = planWithContext(placements, routes, config, context);

    expect(demands).toHaveLength(1);
    expect(demands[0].kind).toBe("lane-x");
    expect(demands[0].rank).toBe(0);
    expect(demands[0].reason).toBe("parallel-labels");
    expect(demands[0].affectedEdgeIds).toEqual(["e1", "e2"]);
  });

  it("does not emit a no-op X demand when the effective rank gap already exceeds its minimum", () => {
    const config = resolveCustomLayoutConfig();
    const placements: BadgePlacement[] = [
      {
        edgeId: "e1",
        label: "HTTP",
        rect: { x: 100, y: 100, width: 60, height: 20 },
        anchorPoint: { x: 130, y: 110 },
      },
      {
        edgeId: "e2",
        label: "gRPC",
        rect: { x: 120, y: 105, width: 60, height: 20 },
        anchorPoint: { x: 150, y: 115 },
      },
    ];
    const context: LabelLanePlannerContext = {
      rankByNodeId: new Map([
        ["A", 0],
        ["B", 0],
        ["C", 1],
        ["D", 1],
      ]),
      layerNodeIds: [
        ["A", "B"],
        ["C", "D"],
      ],
      nodeGapByRank: new Map([[0, 200]]),
    };

    expect(
      planWithContext(
        placements,
        [verticalRoute("e1", "A", "C", 130), verticalRoute("e2", "B", "D", 150)],
        config,
        context,
      ),
    ).toEqual([]);
  });

  it("emits a rank-boundary Y lane demand for overlapping horizontal label routes", () => {
    const config = resolveCustomLayoutConfig({ rankGap: 10 });
    const placements: BadgePlacement[] = [
      {
        edgeId: "e1",
        label: "HTTP",
        rect: { x: 100, y: 100, width: 60, height: 20 },
        anchorPoint: { x: 130, y: 110 },
      },
      {
        edgeId: "e2",
        label: "gRPC",
        rect: { x: 105, y: 110, width: 60, height: 20 },
        anchorPoint: { x: 135, y: 120 },
      },
    ];
    const context: LabelLanePlannerContext = {
      rankByNodeId: new Map([
        ["A", 0],
        ["B", 2],
        ["C", 0],
        ["D", 2],
      ]),
      layerNodeIds: [["A", "C"], ["mid"], ["B", "D"]],
    };

    const demands = planWithContext(
      placements,
      [horizontalRoute("e1", "A", "B", 110), horizontalRoute("e2", "C", "D", 120)],
      config,
      context,
    );

    expect(demands).toHaveLength(1);
    expect(demands[0]?.kind).toBe("lane-y");
    expect(demands[0]?.rank).toBe(0);
    expect(demands[0]?.affectedEdgeIds).toEqual(["e1", "e2"]);
    expect(demands[0]?.reason).toBe("parallel-labels");
  });
});
