import type {
  CalculatedBadge,
  Point2D,
  PortSide,
  ScenarioLayoutResult,
  TestNode,
  TestScenario,
} from "../types";

export function getPortPosition(node: TestNode, side: PortSide, alpha = 0.5): Point2D {
  switch (side) {
    case "Top":
      return { x: node.x + node.w * alpha, y: node.y };
    case "Bottom":
      return { x: node.x + node.w * alpha, y: node.y + node.h };
    case "Left":
      return { x: node.x, y: node.y + node.h * alpha };
    case "Right":
      return { x: node.x + node.w, y: node.y + node.h * alpha };
    default:
      return { x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 };
  }
}

export function getPortStub(port: Point2D, side: PortSide, stubLen = 20): Point2D {
  switch (side) {
    case "Top":
      return { x: port.x, y: port.y - stubLen };
    case "Bottom":
      return { x: port.x, y: port.y + stubLen };
    case "Left":
      return { x: port.x - stubLen, y: port.y };
    case "Right":
      return { x: port.x + stubLen, y: port.y };
    default:
      return { ...port };
  }
}

export function computeDistance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Ground Zero Shortest Path Engine Starter.
 * Ready for fresh custom algorithm development from scratch.
 */
export function computeShortestPathLayout(scenario: TestScenario): ScenarioLayoutResult {
  const edges = scenario.edges.map((edge, idx) => {
    const srcNode = scenario.nodes.find((n) => n.id === edge.source) ?? scenario.nodes[0];
    const tgtNode = scenario.nodes.find((n) => n.id === edge.target) ?? scenario.nodes[0];

    const pS = { x: srcNode.x + srcNode.w, y: srcNode.y + srcNode.h / 2 };
    const pT = { x: tgtNode.x, y: tgtNode.y + tgtNode.h / 2 };

    const midX = (pS.x + pT.x) / 2;
    const dPath = `M ${pS.x} ${pS.y} L ${midX} ${pS.y} L ${midX} ${pT.y} L ${pT.x} ${pT.y}`;
    const lineDist = Math.hypot(pT.x - pS.x, pT.y - pS.y);

    const badge: CalculatedBadge = {
      idx,
      label: edge.label || "",
      isCycle: edge.isCycle,
      x: midX,
      y: (pS.y + pT.y) / 2,
      w: Math.max(80, (edge.label || "").length * 7 + 20),
      h: 24,
    };

    return {
      dPath,
      lineDist,
      badge,
      srcSide: "Right" as const,
      tgtSide: "Left" as const,
    };
  });

  const badges = edges.map((e) => e.badge);
  const totalDistance = edges.reduce((acc, e) => acc + e.lineDist, 0);

  return {
    edges,
    badges,
    totalDistance,
    nodes: scenario.nodes,
  };
}
