import { describe, expect, it } from "bun:test";
import { TEST_SCENARIOS } from "../../data/testScenarios";
import type { TestNode } from "../../types";
import { computeShortestPathLayout } from "../shortestPathEngine";

/**
 * Helper to check if a line segment P1 -> P2 penetrates into a node's bounding box.
 * Points inside a node box are ONLY allowed if they are within 6px of the source port or target port!
 * If a line segment enters a node box far from the port (e.g. entering Top border to reach Left port), it is flagged as SPACE INVASION!
 */
function segmentPenetratesNodeBox(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  node: TestNode,
  srcPort?: { x: number; y: number },
  tgtPort?: { x: number; y: number },
): boolean {
  const margin = 1; // 1px margin around node box
  const minX = node.x - margin;
  const maxX = node.x + node.w + margin;
  const minY = node.y - margin;
  const maxY = node.y + node.h + margin;

  const steps = 50;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = p1.x + t * (p2.x - p1.x);
    const y = p1.y + t * (p2.y - p1.y);

    const insideNodeBox = x >= minX && x <= maxX && y >= minY && y <= maxY;

    if (insideNodeBox) {
      // Check if point is legitimately near the source port or target port on this node
      const distToSrc = srcPort ? Math.hypot(x - srcPort.x, y - srcPort.y) : Infinity;
      const distToTgt = tgtPort ? Math.hypot(x - tgtPort.x, y - tgtPort.y) : Infinity;

      // Only points within 8px of an authorized port are allowed!
      if (distToSrc > 8 && distToTgt > 8) {
        return true; // Line point is inside node body away from port -> SPACE INVASION!
      }
    }
  }

  return false;
}

/**
 * Helper to parse SVG path string "M x1 y1 L x2 y2 L x3 y3" into points array
 */
function parseSvgPathToPoints(dPath: string): Array<{ x: number; y: number }> {
  const tokens = dPath.trim().split(/\s+/);
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "M" || tokens[i] === "L") {
      const x = parseFloat(tokens[i + 1]);
      const y = parseFloat(tokens[i + 2]);
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y });
      }
      i += 2;
    }
  }

  return points;
}

describe("Strict Edge-to-Node Interior Penetration & Space Invasion Tests", () => {
  Object.values(TEST_SCENARIOS).forEach((scenario) => {
    it(`Scenario ${scenario.id} ("${scenario.title}"): NO edge lines or badges should invade any node space`, () => {
      const result = computeShortestPathLayout(scenario);

      // 1. Audit Edge Lines against Node Bounding Boxes
      result.edges.forEach((edgeRes, edgeIdx) => {
        const edgeSpec = scenario.edges[edgeIdx];
        const srcNode = scenario.nodes.find((n) => n.id === edgeSpec.source)!;
        const tgtNode = scenario.nodes.find((n) => n.id === edgeSpec.target)!;

        const points = parseSvgPathToPoints(edgeRes.dPath);
        const pStart = points[0];
        const pEnd = points[points.length - 1];

        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];

          scenario.nodes.forEach((node) => {
            const isSourceNode = node.id === srcNode.id;
            const isTargetNode = node.id === tgtNode.id;

            const srcPort = isSourceNode ? pStart : undefined;
            const tgtPort = isTargetNode ? pEnd : undefined;

            const penetrated = segmentPenetratesNodeBox(p1, p2, node, srcPort, tgtPort);

            if (penetrated) {
              console.log(
                `❌ SPACE INVASION DETECTED in Scenario ${scenario.id}!`,
                `Edge "${edgeSpec.label}" (${srcNode.name} -> ${tgtNode.name}) segment (${p1.x.toFixed(1)}, ${p1.y.toFixed(1)}) -> (${p2.x.toFixed(1)}, ${p2.y.toFixed(1)}) penetrates Node "${node.name}" body [x:${node.x}, y:${node.y}, w:${node.w}, h:${node.h}]!`,
              );
            }

            expect(penetrated).toBe(false);
          });
        }
      });

      // 2. Audit Badges against Node Bounding Boxes
      result.badges.forEach((badge) => {
        const badgeLeft = badge.x - badge.w / 2;
        const badgeRight = badge.x + badge.w / 2;
        const badgeTop = badge.y - badge.h / 2;
        const badgeBottom = badge.y + badge.h / 2;

        scenario.nodes.forEach((node) => {
          const nodeLeft = node.x;
          const nodeRight = node.x + node.w;
          const nodeTop = node.y;
          const nodeBottom = node.y + node.h;

          const badgeOverlapsNode =
            badgeRight > nodeLeft &&
            badgeLeft < nodeRight &&
            badgeBottom > nodeTop &&
            badgeTop < nodeBottom;

          if (badgeOverlapsNode) {
            console.log(
              `❌ BADGE NODE OVERLAP DETECTED in Scenario ${scenario.id}!`,
              `Badge "${badge.label}" bbox [${badgeLeft.toFixed(1)}, ${badgeRight.toFixed(1)}, ${badgeTop.toFixed(1)}, ${badgeBottom.toFixed(1)}] invades Node "${node.name}" space [${nodeLeft}, ${nodeRight}, ${nodeTop}, ${nodeBottom}]!`,
            );
          }

          expect(badgeOverlapsNode).toBe(false);
        });
      });
    });
  });
});
