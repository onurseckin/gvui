import type {
  CalculatedBadge,
  CalculatedEdgeResult,
  PortSide,
  ScenarioLayoutResult,
  TestScenario,
} from "../types";
import { computeDistance, getPortPosition, getPortStub } from "./shortestPathEngine";

/**
 * Dagre Rank Engine (Option B)
 *
 * Architecture Summary:
 * ---------------------
 * 1. Rigid Layered Rank Flow:
 *    Forces all forward tree edges to depart from Bottom side of source node and arrive
 *    at Top side of target node.
 *
 * 2. Outer Flank Cycle Loop Routing:
 *    Sweeps cycle loopback edges around the right flank of the graph canvas.
 */
export function computeDagreRankLayout(scenario: TestScenario): ScenarioLayoutResult {
  let totalDistance = 0;
  const edgeResults: CalculatedEdgeResult[] = [];
  const badgesToRender: CalculatedBadge[] = [];

  scenario.edges.forEach((edge, idx) => {
    const srcNode = scenario.nodes.find((n) => n.id === edge.source) ?? scenario.nodes[0];
    const tgtNode = scenario.nodes.find((n) => n.id === edge.target) ?? scenario.nodes[0];

    const srcSide: PortSide = edge.isCycle ? "Right" : "Bottom";
    const tgtSide: PortSide = edge.isCycle ? "Right" : "Top";

    const pS = getPortPosition(srcNode, srcSide, 0.5);
    const pT = getPortPosition(tgtNode, tgtSide, 0.5);
    const stS = getPortStub(pS, srcSide);
    const stT = getPortStub(pT, tgtSide);

    let dPath = "";
    let lineDist = 0;
    let midX = (pS.x + pT.x) / 2;
    let midY = (pS.y + pT.y) / 2;

    if (edge.isCycle) {
      const sweepX = Math.max(srcNode.x + srcNode.w, tgtNode.x + tgtNode.w) + 40;
      dPath = `M ${pS.x} ${pS.y} L ${stS.x} ${stS.y} L ${sweepX} ${stS.y} L ${sweepX} ${stT.y} L ${stT.x} ${stT.y} L ${pT.x} ${pT.y}`;
      lineDist =
        computeDistance(pS, stS) +
        Math.abs(sweepX - stS.x) +
        Math.abs(stT.y - stS.y) +
        Math.abs(stT.x - sweepX) +
        computeDistance(stT, pT);
      midX = sweepX;
      midY = (stS.y + stT.y) / 2;
    } else {
      dPath = `M ${pS.x} ${pS.y} L ${stS.x} ${stS.y} L ${stT.x} ${stT.y} L ${pT.x} ${pT.y}`;
      lineDist = computeDistance(pS, stS) + computeDistance(stS, stT) + computeDistance(stT, pT);
      midX = (stS.x + stT.x) / 2;
      midY = (stS.y + stT.y) / 2;
    }

    totalDistance += lineDist;

    const labelStr = edge.label || "";
    const badgeW = Math.max(80, labelStr.length * 7 + 20);
    const badgeH = 24;

    const badge: CalculatedBadge = {
      idx,
      label: labelStr,
      isCycle: edge.isCycle,
      x: midX,
      y: midY,
      w: badgeW,
      h: badgeH,
    };

    badgesToRender.push(badge);

    edgeResults.push({
      dPath,
      lineDist,
      badge,
      srcSide,
      tgtSide,
    });
  });

  return {
    edges: edgeResults,
    badges: badgesToRender,
    totalDistance,
  };
}
