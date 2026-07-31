import type { CustomLayoutConfig } from "./config";
import type {
  BadgeSpacingRequest,
  ExactSpacingDemand,
  NormalizedEdge,
  NormalizedNode,
} from "./types";

export interface MeasuredBadge {
  width: number;
  height: number;
}

export interface SpacingOverrides {
  nodeGapByRank?: Map<number, number>;
  rankGapAfterRank?: Map<number, number>;
  nodeGapAfterNodeId?: Map<string, number>;
}

export function requiredSameRankBadgeGap(badgeWidth: number, config: CustomLayoutConfig): number {
  const endpointApproachClearance = 2 * config.badgeClearance + 2 * config.portStubLength;
  return badgeWidth + Math.max(config.nodeGap, endpointApproachClearance);
}

function spacingAxis(kind: ExactSpacingDemand["kind"]): "x" | "y" | "padding" {
  if (kind === "node-gap" || kind === "lane-x") return "x";
  if (kind === "rank-gap" || kind === "lane-y") return "y";
  return "padding";
}

function spacingDemandScopeKey(demand: ExactSpacingDemand): string {
  return `${spacingAxis(demand.kind)}:${demand.rank ?? "global"}:${demand.afterNodeId ?? ""}`;
}

function spacingDemandRepresentativeKey(demand: ExactSpacingDemand): string {
  return `${demand.kind}:${demand.reason}`;
}

export function canonicalizeExactSpacingDemands(
  demands: ExactSpacingDemand[],
): ExactSpacingDemand[] {
  const byScope = new Map<string, ExactSpacingDemand>();

  for (const demand of demands) {
    const key = spacingDemandScopeKey(demand);
    const existing = byScope.get(key);
    const affectedEdgeIds = [
      ...new Set([...(existing?.affectedEdgeIds ?? []), ...demand.affectedEdgeIds]),
    ].sort();
    if (
      !existing ||
      demand.minimum > existing.minimum ||
      (demand.minimum === existing.minimum &&
        spacingDemandRepresentativeKey(demand).localeCompare(
          spacingDemandRepresentativeKey(existing),
        ) < 0)
    ) {
      byScope.set(key, { ...demand, affectedEdgeIds });
    } else {
      byScope.set(key, { ...existing, affectedEdgeIds });
    }
  }

  return Array.from(byScope.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, demand]) => demand);
}

export function exactSpacingDemandSignature(demands: ExactSpacingDemand[]): string {
  return canonicalizeExactSpacingDemands(demands)
    .map((demand) => `${spacingDemandScopeKey(demand)}:${demand.minimum}`)
    .join(";");
}

export function computeBadgeSpacingDemands(
  _nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  badgeMeasurements: Map<string, MeasuredBadge>,
  ranks: Map<string, number>,
  config: CustomLayoutConfig,
): BadgeSpacingRequest[] {
  const requests: BadgeSpacingRequest[] = [];

  // Group edges by endpoint pair (undirected pair key) that have measured badges
  const pairGroups = new Map<string, { edge: NormalizedEdge; badge: MeasuredBadge }[]>();

  for (const edge of edges) {
    const badge = badgeMeasurements.get(edge.id);
    if (!badge || badge.width <= 0 || badge.height <= 0) {
      continue;
    }

    const pairKey =
      edge.source < edge.target
        ? `${edge.source}::${edge.target}`
        : `${edge.target}::${edge.source}`;

    const group = pairGroups.get(pairKey) ?? [];
    group.push({ edge, badge });
    pairGroups.set(pairKey, group);
  }

  for (const group of pairGroups.values()) {
    if (group.length === 0) continue;

    const firstEdge = group[0].edge;
    const rU = ranks.get(firstEdge.source);
    const rV = ranks.get(firstEdge.target);

    if (rU === undefined || rV === undefined) {
      continue;
    }

    if (group.length === 1) {
      const { edge, badge } = group[0];
      if (rU === rV) {
        // Same-rank edge label
        requests.push({
          edgeId: edge.id,
          kind: "node-gap",
          rank: rU,
          afterNodeId: edge.source,
          minimum: requiredSameRankBadgeGap(badge.width, config),
          reason: "same-rank-label",
        });
      } else {
        // Cross-rank single edge
        const requiredHeight = badge.height + 2 * config.badgeClearance + 2 * config.portStubLength;
        if (requiredHeight > config.rankGap) {
          requests.push({
            edgeId: edge.id,
            kind: "rank-gap",
            rank: Math.min(rU, rV),
            minimum: requiredHeight,
            reason: "blocked-direct-badge",
          });
        }
      }
    } else {
      // Parallel edge labels
      if (rU === rV) {
        const sumWidth = group.reduce((sum, item) => sum + item.badge.width, 0);
        const totalMinimum = sumWidth + (group.length + 1) * config.badgeClearance;

        for (const { edge } of group) {
          requests.push({
            edgeId: edge.id,
            kind: "node-gap",
            rank: rU,
            afterNodeId: edge.source,
            minimum: totalMinimum,
            reason: "parallel-labels",
          });
        }
      } else {
        const sumHeight = group.reduce((sum, item) => sum + item.badge.height, 0);
        const totalMinimum =
          sumHeight + (group.length + 1) * config.badgeClearance + 2 * config.portStubLength;
        const minimum = Math.max(config.rankGap, totalMinimum);

        for (const { edge } of group) {
          requests.push({
            edgeId: edge.id,
            kind: "rank-gap",
            rank: Math.min(rU, rV),
            minimum,
            reason: "parallel-labels",
          });
        }
      }
    }
  }

  return requests;
}

export function resolveEffectiveSpacingOverrides(
  requests: BadgeSpacingRequest[],
  defaultNodeGap: number,
  defaultRankGap: number,
): SpacingOverrides {
  const nodeGapByRank = new Map<number, number>();
  const rankGapAfterRank = new Map<number, number>();
  const nodeGapAfterNodeId = new Map<string, number>();

  for (const req of requests) {
    if (req.kind === "node-gap") {
      if (req.rank !== undefined) {
        const current = nodeGapByRank.get(req.rank) ?? defaultNodeGap;
        nodeGapByRank.set(req.rank, Math.max(current, req.minimum));
      }
      if (req.afterNodeId !== undefined) {
        const current = nodeGapAfterNodeId.get(req.afterNodeId) ?? defaultNodeGap;
        nodeGapAfterNodeId.set(req.afterNodeId, Math.max(current, req.minimum));
      }
    } else if (req.kind === "rank-gap") {
      if (req.rank !== undefined) {
        const current = rankGapAfterRank.get(req.rank) ?? defaultRankGap;
        rankGapAfterRank.set(req.rank, Math.max(current, req.minimum));
      }
    }
  }

  return {
    nodeGapByRank,
    rankGapAfterRank,
    nodeGapAfterNodeId,
  };
}

export interface SpacingOverrides {
  nodeGapByRank?: Map<number, number>;
  rankGapAfterRank?: Map<number, number>;
  nodeGapAfterNodeId?: Map<string, number>;
  globalNodeGap?: number;
  globalRankGap?: number;
}

export function resolveExactSpacingDemands(
  demands: ExactSpacingDemand[],
  defaultNodeGap: number,
  defaultRankGap: number,
): SpacingOverrides {
  const nodeGapByRank = new Map<number, number>();
  const rankGapAfterRank = new Map<number, number>();
  const nodeGapAfterNodeId = new Map<string, number>();
  let globalNodeGap = defaultNodeGap;
  let globalRankGap = defaultRankGap;

  for (const d of demands) {
    if (d.kind === "node-gap" || d.kind === "lane-x") {
      if (d.rank !== undefined) {
        const current = nodeGapByRank.get(d.rank) ?? defaultNodeGap;
        nodeGapByRank.set(d.rank, Math.max(current, d.minimum));
      }
      if (d.afterNodeId !== undefined) {
        const current = nodeGapAfterNodeId.get(d.afterNodeId) ?? defaultNodeGap;
        nodeGapAfterNodeId.set(d.afterNodeId, Math.max(current, d.minimum));
      }
      if (d.rank === undefined && d.afterNodeId === undefined) {
        globalNodeGap = Math.max(globalNodeGap, d.minimum);
      }
    } else if (d.kind === "rank-gap" || d.kind === "lane-y") {
      if (d.rank !== undefined) {
        const current = rankGapAfterRank.get(d.rank) ?? defaultRankGap;
        rankGapAfterRank.set(d.rank, Math.max(current, d.minimum));
      } else {
        globalRankGap = Math.max(globalRankGap, d.minimum);
      }
    }
  }

  return {
    nodeGapByRank,
    rankGapAfterRank,
    nodeGapAfterNodeId,
    globalNodeGap,
    globalRankGap,
  };
}
