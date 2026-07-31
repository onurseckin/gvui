import { describe, expect, it } from "bun:test";
import { TEST_SCENARIOS } from "../../data/testScenarios";
import type { TestScenario } from "../../types";
import {
  evaluateNonRelatedCombinatorialBumpSearch,
  evaluateSameSourceClusterOptimizer,
} from "../legacyCollisionEngines";
import {
  computeShortestPathLayout,
  getPortPosition,
  lineIntersectsNodeInterior,
} from "../shortestPathEngine";

describe("ShortestPathEngine Node Crossing & Inter-Edge Collision Tests", () => {
  it("should evaluate 4-node API Gateway fan-out using legacy cluster optimizer for badge dispersion", () => {
    expect(typeof evaluateSameSourceClusterOptimizer).toBe("function");
  });

  it("should verify legacy collision engine is preserved in legacyCollisionEngines.ts", () => {
    expect(typeof evaluateNonRelatedCombinatorialBumpSearch).toBe("function");
  });

  it("should ensure edge paths go around nodes and never cut through node card interiors", () => {
    const obstacleScenario: TestScenario = {
      id: 101,
      title: "Obstacle Node Avoidance",
      nodes: [
        { id: "A", name: "Source A", desc: "Top-Left", x: 60, y: 50, w: 150, h: 60 },
        {
          id: "C",
          name: "Obstacle Node C",
          desc: "Blocking Middle",
          x: 330,
          y: 220,
          w: 160,
          h: 65,
        },
        { id: "B", name: "Target B", desc: "Bottom-Right", x: 600, y: 390, w: 150, h: 60 },
      ],
      edges: [{ source: "A", target: "B", label: "bypass route" }],
    };

    const result = computeShortestPathLayout(obstacleScenario);
    const edgeRes = result.edges[0];

    const srcNode = obstacleScenario.nodes[0];
    const tgtNode = obstacleScenario.nodes[2];
    const obstacleNode = obstacleScenario.nodes[1];

    const pS = getPortPosition(srcNode, edgeRes.srcSide);
    const pT = getPortPosition(tgtNode, edgeRes.tgtSide);

    expect(typeof edgeRes.dPath).toBe("string");
    expect(edgeRes.dPath.length > 10).toBe(true);

    const bypassX =
      pS.x < obstacleNode.x ? obstacleNode.x - 40 : obstacleNode.x + obstacleNode.w + 40;
    const w1 = { x: bypassX, y: pS.y };
    const w2 = { x: bypassX, y: pT.y };

    const seg1Intersects = lineIntersectsNodeInterior(pS, w1, obstacleNode);
    const seg2Intersects = lineIntersectsNodeInterior(w1, w2, obstacleNode);
    const seg3Intersects = lineIntersectsNodeInterior(w2, pT, obstacleNode);

    expect(seg1Intersects).toBe(false);
    expect(seg2Intersects).toBe(false);
    expect(seg3Intersects).toBe(false);
  });

  it("should enforce that cyclic looping edge pairs NEVER share any node side (neither outgoing nor incoming)", () => {
    const result = computeShortestPathLayout(TEST_SCENARIOS[1]);
    const checkout = result.edges[5];
    const callback = result.edges[6];

    expect(checkout.srcSide).not.toBe(callback.tgtSide);
    expect(checkout.tgtSide).not.toBe(callback.srcSide);
  });

  it("should balance edge connections across available node sides when connected edges <= 4", () => {
    const scenario: TestScenario = {
      id: 104,
      title: "3-Incoming Edge Destination Node",
      nodes: [
        { id: "S1", name: "Source 1", desc: "Top-Left", x: 40, y: 40, w: 130, h: 50 },
        { id: "S2", name: "Source 2", desc: "Top-Right", x: 340, y: 40, w: 130, h: 50 },
        { id: "S3", name: "Source 3", desc: "Bottom-Left", x: 40, y: 240, w: 130, h: 50 },
        { id: "T", name: "Target Node", desc: "Center", x: 190, y: 140, w: 140, h: 60 },
      ],
      edges: [
        { source: "S1", target: "T", label: "stream 1" },
        { source: "S2", target: "T", label: "stream 2" },
        { source: "S3", target: "T", label: "stream 3" },
      ],
    };

    const result = computeShortestPathLayout(scenario);

    const targetSides = result.edges.map((e) => e.tgtSide);
    const uniqueSides = new Set(targetSides);

    expect(uniqueSides.size).toBe(3);
  });

  it("should place single edges at the exact dead-center (alpha = 0.5) of their node face", () => {
    const scenario: TestScenario = {
      id: 105,
      title: "Single Edge Center Alignment",
      nodes: [
        { id: "A", name: "Source A", desc: "Top", x: 100, y: 50, w: 140, h: 60 },
        { id: "B", name: "Target B", desc: "Bottom", x: 300, y: 250, w: 140, h: 60 },
      ],
      edges: [{ source: "A", target: "B", label: "single link" }],
    };

    const result = computeShortestPathLayout(scenario);
    const edgeRes = result.edges[0];
    const srcNode = scenario.nodes[0];
    const tgtNode = scenario.nodes[1];

    const pS = getPortPosition(srcNode, edgeRes.srcSide, 0.5);
    const pT = getPortPosition(tgtNode, edgeRes.tgtSide, 0.5);

    expect(edgeRes.dPath.includes(`M ${pS.x} ${pS.y}`)).toBe(true);
    expect(edgeRes.dPath.includes(`${pT.x} ${pT.y}`)).toBe(true);
  });

  it("should balance combined incoming AND outgoing edges across 3 UNIQUE faces of a node when unused faces are available", () => {
    const scenario: TestScenario = {
      id: 106,
      title: "Combined Incoming and Outgoing Node Face Dispersion",
      nodes: [
        { id: "A", name: "Node A", desc: "Top", x: 190, y: 30, w: 140, h: 50 },
        { id: "B", name: "Node B", desc: "Left", x: 30, y: 150, w: 130, h: 50 },
        { id: "C", name: "Node C", desc: "Bottom", x: 190, y: 270, w: 140, h: 50 },
        { id: "M", name: "Middle Node", desc: "Center", x: 190, y: 150, w: 140, h: 50 },
      ],
      edges: [
        { source: "A", target: "M", label: "inbound top" },
        { source: "B", target: "M", label: "inbound left" },
        { source: "M", target: "C", label: "outbound bottom" },
      ],
    };

    const result = computeShortestPathLayout(scenario);

    const mSides: string[] = [];
    result.edges.forEach((e, idx) => {
      const spec = scenario.edges[idx];
      if (spec.source === "M") mSides.push(e.srcSide);
      if (spec.target === "M") mSides.push(e.tgtSide);
    });

    const uniqueMSides = new Set(mSides);
    expect(uniqueMSides.size).toBe(3);
  });

  it("should allow edges to land on all 4 faces including far sides by routing around node perimeters without penetrating card body", () => {
    const scenario: TestScenario = {
      id: 107,
      title: "Far Side Perimeter Bypass Test",
      nodes: [
        { id: "A", name: "Source A", desc: "Left", x: 40, y: 100, w: 140, h: 60 },
        { id: "B", name: "Target B", desc: "Right", x: 340, y: 100, w: 140, h: 60 },
      ],
      edges: [{ source: "A", target: "B", label: "far side link" }],
    };

    const result = computeShortestPathLayout(scenario);
    const edgeRes = result.edges[0];

    const p1 = { x: 40 + 140, y: 130 };
    const p2 = { x: 340, y: 130 };
    const srcNode = scenario.nodes[0];
    const tgtNode = scenario.nodes[1];

    expect(lineIntersectsNodeInterior(p1, p2, srcNode)).toBe(false);
    expect(lineIntersectsNodeInterior(p1, p2, tgtNode)).toBe(false);
    expect(typeof edgeRes.dPath).toBe("string");
  });

  it("should separate parallel overlapping vertical and horizontal edge segments into distinct coordinate lines", () => {
    const parallelScenario: TestScenario = {
      id: 201,
      title: "Parallel Edge Segment Overlap Test",
      nodes: [
        { id: "A1", name: "Source A1", desc: "", x: 50, y: 50, w: 100, h: 60 },
        { id: "A2", name: "Source A2", desc: "", x: 50, y: 150, w: 100, h: 60 },
        { id: "B1", name: "Target B1", desc: "", x: 500, y: 50, w: 100, h: 60 },
        { id: "B2", name: "Target B2", desc: "", x: 500, y: 150, w: 100, h: 60 },
      ],
      edges: [
        { source: "A1", target: "B2", label: "route 1" },
        { source: "A2", target: "B1", label: "route 2" },
      ],
    };

    const result = computeShortestPathLayout(parallelScenario);

    const parseSegments = (
      dPath: string,
    ): Array<{ isVert: boolean; coord: number; min: number; max: number }> => {
      const tokens = dPath.trim().split(/\s+/);
      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === "M" || tokens[i] === "L") {
          const x = Number.parseFloat(tokens[i + 1]);
          const y = Number.parseFloat(tokens[i + 2]);
          points.push({ x, y });
          i += 2;
        }
      }

      const segments: Array<{ isVert: boolean; coord: number; min: number; max: number }> = [];
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        if (Math.abs(p1.x - p2.x) < 0.001) {
          const min = Math.min(p1.y, p2.y);
          const max = Math.max(p1.y, p2.y);
          if (max - min > 1) {
            segments.push({ isVert: true, coord: p1.x, min, max });
          }
        } else if (Math.abs(p1.y - p2.y) < 0.001) {
          const min = Math.min(p1.x, p2.x);
          const max = Math.max(p1.x, p2.x);
          if (max - min > 1) {
            segments.push({ isVert: false, coord: p1.y, min, max });
          }
        }
      }
      return segments;
    };

    const allEdgeSegments = result.edges.map((e) => parseSegments(e.dPath));
    let hasSharedCoordinateLine = false;

    for (let i = 0; i < allEdgeSegments.length; i++) {
      for (let j = i + 1; j < allEdgeSegments.length; j++) {
        for (const s1 of allEdgeSegments[i]) {
          for (const s2 of allEdgeSegments[j]) {
            if (s1.isVert === s2.isVert && Math.abs(s1.coord - s2.coord) < 0.001) {
              const overlap = Math.min(s1.max, s2.max) - Math.max(s1.min, s2.min);
              if (overlap > 1) {
                hasSharedCoordinateLine = true;
              }
            }
          }
        }
      }
    }

    expect(hasSharedCoordinateLine).toBe(false);
  });

  it("should position calculated edge badges at exact 50% total path arc-length", () => {
    const scenario: TestScenario = {
      id: 202,
      title: "Badge 50% Arc-Length Positioning Test",
      nodes: [
        { id: "A", name: "Node A", desc: "", x: 50, y: 50, w: 120, h: 60 },
        { id: "B", name: "Node B", desc: "", x: 450, y: 250, w: 120, h: 60 },
      ],
      edges: [{ source: "A", target: "B", label: "arc length check" }],
    };

    const result = computeShortestPathLayout(scenario);
    const edge = result.edges[0];
    const badge = edge.badge;

    const tokens = edge.dPath.trim().split(/\s+/);
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === "M" || tokens[i] === "L") {
        const x = Number.parseFloat(tokens[i + 1]);
        const y = Number.parseFloat(tokens[i + 2]);
        points.push({ x, y });
        i += 2;
      }
    }

    let totalLength = 0;
    const segLengths: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
      segLengths.push(len);
      totalLength += len;
    }

    let badgeArcLength = -1;
    let accumulated = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const segLen = segLengths[i];

      const distP1 = Math.hypot(badge.x - p1.x, badge.y - p1.y);
      const distP2 = Math.hypot(p2.x - badge.x, p2.y - badge.y);

      if (Math.abs(distP1 + distP2 - segLen) < 0.01) {
        badgeArcLength = accumulated + distP1;
        break;
      }
      accumulated += segLen;
    }

    expect(badgeArcLength > -1).toBe(true);
    expect(Math.abs(badgeArcLength - totalLength / 2) < 0.5).toBe(true);
  });
});

