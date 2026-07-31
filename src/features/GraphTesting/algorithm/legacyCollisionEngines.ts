import type {
  CalculatedBadge,
  CalculatedEdgeResult,
  PortSide,
  TestNode,
  TestScenario,
} from "../types";

/**
 * Legacy Collision Resolution Engines Archive
 *
 * Preserved for future reference and optional reinstatement:
 * 1. Step 2: Same-Source Fan-Out Cluster Optimizer (Multi-edge departure side dispersion)
 * 2. Step 3: Non-Related Inter-Edge Combinatorial k-at-a-Time Bump Search (1-at-a-time, 2-at-a-time, up to n-at-a-time)
 * 3. 2D Perpendicular Badge Nudge Fallback Pass
 */

export interface SidePairCandidate {
  srcSide: PortSide;
  tgtSide: PortSide;
  dist: number;
}

export function evaluateSameSourceClusterOptimizer(
  scenario: TestScenario,
  edgeCandidateRanks: SidePairCandidate[][],
  evaluateLayoutWithChoices: (choiceIndices: number[]) => {
    edgeAssignments: Array<{
      srcNode: TestNode;
      tgtNode: TestNode;
      srcSide: PortSide;
      tgtSide: PortSide;
    }>;
    edgeResults: CalculatedEdgeResult[];
    badges: CalculatedBadge[];
    totalDistance: number;
  },
  evaluateCollisions: (badges: CalculatedBadge[], edgeAssignments?: unknown) => number,
): number[] {
  const sourceClusters = new Map<string, number[]>();
  scenario.edges.forEach((edge: { source: string; target: string }, idx: number) => {
    const cluster = sourceClusters.get(edge.source) ?? [];
    cluster.push(idx);
    sourceClusters.set(edge.source, cluster);
  });

  const finalChoiceVector: number[] = new Array(scenario.edges.length).fill(0);

  sourceClusters.forEach((edgeIndices) => {
    if (edgeIndices.length <= 1) {
      finalChoiceVector[edgeIndices[0]] = 0;
      return;
    }

    const numClusterEdges = edgeIndices.length;
    let bestClusterChoices: number[] = new Array(numClusterEdges).fill(0);
    let minClusterScore = Infinity;

    const generateClusterCombinations = (
      clusterEdgeIdx: number,
      currentClusterChoices: number[],
    ) => {
      if (clusterEdgeIdx === numClusterEdges) {
        const trialVector = [...finalChoiceVector];
        edgeIndices.forEach((globalEdgeIdx, localIdx) => {
          trialVector[globalEdgeIdx] = currentClusterChoices[localIdx];
        });

        const layout = evaluateLayoutWithChoices(trialVector);
        const clusterBadges = layout.badges.filter((b) => edgeIndices.includes(b.idx));
        const clusterAssignments = layout.edgeAssignments.filter((_, idx) =>
          edgeIndices.includes(idx),
        );
        const collisionCount = evaluateCollisions(clusterBadges, clusterAssignments);

        const clusterDistance = layout.edgeResults
          .filter((_, idx) => edgeIndices.includes(idx))
          .reduce((sum, res) => sum + res.lineDist, 0);

        const sideCounts = new Map<PortSide, number>();
        edgeIndices.forEach((globalEdgeIdx) => {
          const assign = layout.edgeResults[globalEdgeIdx];
          const srcSide = assign.srcSide;
          sideCounts.set(srcSide, (sideCounts.get(srcSide) ?? 0) + 1);
        });

        let sideSharingPenalty = 0;
        sideCounts.forEach((count) => {
          if (count > 1) {
            sideSharingPenalty += (count - 1) * 60;
          }
        });

        const choicePenalty = currentClusterChoices.reduce((sum, c) => sum + c * 5, 0);
        const score = collisionCount * 10000 + clusterDistance + sideSharingPenalty + choicePenalty;

        if (score < minClusterScore) {
          minClusterScore = score;
          bestClusterChoices = [...currentClusterChoices];
        }
        return;
      }

      const globalIdx = edgeIndices[clusterEdgeIdx];
      const depth = Math.min(6, edgeCandidateRanks[globalIdx].length);
      for (let c = 0; c < depth; c++) {
        currentClusterChoices[clusterEdgeIdx] = c;
        generateClusterCombinations(clusterEdgeIdx + 1, currentClusterChoices);
      }
    };

    generateClusterCombinations(0, new Array(numClusterEdges).fill(0));

    edgeIndices.forEach((globalEdgeIdx, localIdx) => {
      finalChoiceVector[globalEdgeIdx] = bestClusterChoices[localIdx];
    });
  });

  return finalChoiceVector;
}

export function evaluateNonRelatedCombinatorialBumpSearch(
  finalChoiceVector: number[],
  reciprocalEdgePairs: Array<[number, number]>,
  edgeCandidateRanks: SidePairCandidate[][],
  evaluateLayoutWithChoices: (choiceIndices: number[]) => {
    edgeAssignments: Array<{
      srcNode: TestNode;
      tgtNode: TestNode;
      srcSide: PortSide;
      tgtSide: PortSide;
    }>;
    edgeResults: CalculatedEdgeResult[];
    badges: CalculatedBadge[];
    totalDistance: number;
  },
  evaluateCollisions: (badges: CalculatedBadge[], edgeAssignments?: unknown) => number,
): number[] {
  const initialLayout = evaluateLayoutWithChoices(finalChoiceVector);
  const globalCollisions = evaluateCollisions(initialLayout.badges, initialLayout.edgeAssignments);

  if (globalCollisions <= 0) return finalChoiceVector;

  const collidingEdgeIndices = new Set<number>();
  for (let i = 0; i < initialLayout.badges.length; i++) {
    const b1 = initialLayout.badges[i];
    for (let j = i + 1; j < initialLayout.badges.length; j++) {
      const b2 = initialLayout.badges[j];
      const minGapX = (b1.w + b2.w) / 2 + 2;
      const minGapY = (b1.h + b2.h) / 2 + 2;
      if (Math.abs(b1.x - b2.x) < minGapX && Math.abs(b1.y - b2.y) < minGapY) {
        collidingEdgeIndices.add(b1.idx);
        collidingEdgeIndices.add(b2.idx);
      }
    }
  }

  reciprocalEdgePairs.forEach(([idx1, idx2]) => {
    const a1 = initialLayout.edgeAssignments[idx1];
    const a2 = initialLayout.edgeAssignments[idx2];
    if (a1 && a2 && (a1.srcSide === a2.tgtSide || a1.tgtSide === a2.srcSide)) {
      collidingEdgeIndices.add(idx1);
      collidingEdgeIndices.add(idx2);
    }
  });

  const sortedCollidingEdges = Array.from(collidingEdgeIndices).sort(
    (a, b) => initialLayout.edgeResults[a].lineDist - initialLayout.edgeResults[b].lineDist,
  );

  const n = sortedCollidingEdges.length;

  const getSubsetsOfSizeK = (arr: number[], k: number): number[][] => {
    const subsets: number[][] = [];
    const generate = (start: number, current: number[]) => {
      if (current.length === k) {
        subsets.push([...current]);
        return;
      }
      for (let i = start; i < arr.length; i++) {
        current.push(arr[i]);
        generate(i + 1, current);
        current.pop();
      }
    };
    generate(0, []);
    return subsets;
  };

  let bestInterChoiceVector = [...finalChoiceVector];
  let minCollisionsSeen = evaluateCollisions(initialLayout.badges, initialLayout.edgeAssignments);
  let minGlobalScoreSeen = minCollisionsSeen * 100000 + initialLayout.totalDistance;

  for (let k = 1; k <= n; k++) {
    const subsets = getSubsetsOfSizeK(sortedCollidingEdges, k);

    for (const subset of subsets) {
      const numSubsetEdges = subset.length;

      const generateSubsetRanks = (subsetIdx: number, currentRanks: number[]) => {
        if (subsetIdx === numSubsetEdges) {
          const trialVector = [...finalChoiceVector];
          subset.forEach((globalEdgeIdx, localIdx) => {
            trialVector[globalEdgeIdx] = currentRanks[localIdx];
          });

          const layout = evaluateLayoutWithChoices(trialVector);
          const cols = evaluateCollisions(layout.badges, layout.edgeAssignments);
          const dist = layout.totalDistance;
          const choicePenalty = currentRanks.reduce((sum, r) => sum + r * 5, 0);

          const score = cols * 100000 + dist + choicePenalty;

          if (
            cols < minCollisionsSeen ||
            (cols === minCollisionsSeen && score < minGlobalScoreSeen)
          ) {
            minCollisionsSeen = cols;
            minGlobalScoreSeen = score;
            bestInterChoiceVector = [...trialVector];
          }
          return;
        }

        const globalIdx = subset[subsetIdx];
        const maxDepth = edgeCandidateRanks[globalIdx].length;
        for (let r = 0; r < maxDepth; r++) {
          currentRanks[subsetIdx] = r;
          generateSubsetRanks(subsetIdx + 1, currentRanks);
        }
      };

      generateSubsetRanks(0, new Array(numSubsetEdges).fill(0));
    }
  }

  return bestInterChoiceVector;
}

export function perform2DBadgeNudgePass(badges: CalculatedBadge[]): void {
  for (let i = 0; i < badges.length; i++) {
    const b1 = badges[i];
    for (let j = i + 1; j < badges.length; j++) {
      const b2 = badges[j];
      const minGapX = (b1.w + b2.w) / 2 + 2;
      const minGapY = (b1.h + b2.h) / 2 + 2;

      if (Math.abs(b1.x - b2.x) < minGapX && Math.abs(b1.y - b2.y) < minGapY) {
        b2.y = b1.y + minGapY + 4;
      }
    }
  }
}
