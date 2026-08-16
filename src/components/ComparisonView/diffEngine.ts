import type {
  FindingDetail,
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
} from "../../types/graphData";

export type DiffStatus = "added" | "removed" | "modified" | "unchanged";

export type FindingDiffStatus =
  | "repaired"
  | "regressed"
  | "new"
  | "persistent_open"
  | "persistent_resolved";

export interface FieldChange {
  field: string;
  label: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

export interface NodeDiff {
  id: string;
  name: string;
  status: DiffStatus;
  nodeA: GraphNodeData | null;
  nodeB: GraphNodeData | null;
  kindA: string | null;
  kindB: string | null;
  nodeStatusA: string | null;
  nodeStatusB: string | null;
  modelA: string | null;
  modelB: string | null;
  durationMsA: number;
  durationMsB: number;
  durationDeltaMs: number;
  durationDeltaPct: number;
  tokensA: number;
  tokensB: number;
  tokensDelta: number;
  tokensDeltaPct: number;
  repairRoundsA: number;
  repairRoundsB: number;
  repairRoundsDelta: number;
  findingsA: FindingDetail[];
  findingsB: FindingDetail[];
  fieldChanges: FieldChange[];
}

export interface EdgeDiff {
  id: string;
  source: string;
  target: string;
  status: DiffStatus;
  edgeA: GraphEdgeData | null;
  edgeB: GraphEdgeData | null;
  kindA: string | null;
  kindB: string | null;
  tokensA: number;
  tokensB: number;
  tokensDelta: number;
  exchangesCountA: number;
  exchangesCountB: number;
  exchangesDelta: number;
  fieldChanges: FieldChange[];
}

export interface FindingDiff {
  id: string;
  requirementId?: string;
  severity: "critical" | "important" | "suggestion" | "unknown";
  observation: string;
  remediation?: string;
  status: FindingDiffStatus;
  statusA?: "open" | "resolved" | null;
  statusB?: "open" | "resolved" | null;
  nodeId?: string;
  revalidationProof?: { method?: string; evidence?: string[] | string };
}

export interface MetricDelta {
  baseValue: number;
  targetValue: number;
  delta: number;
  percentChange: number;
  formattedDelta: string;
}

export interface GraphComparisonDiff {
  hasDatasets: boolean;
  isIdentical: boolean;
  baseTitle: string;
  targetTitle: string;
  nodesDiff: NodeDiff[];
  edgesDiff: EdgeDiff[];
  findingsDiff: FindingDiff[];
  summary: {
    nodes: {
      totalA: number;
      totalB: number;
      added: number;
      removed: number;
      modified: number;
      unchanged: number;
      delta: number;
    };
    edges: {
      totalA: number;
      totalB: number;
      added: number;
      removed: number;
      modified: number;
      unchanged: number;
      delta: number;
    };
    duration: MetricDelta;
    tokens: MetricDelta;
    promptTokens: MetricDelta;
    completionTokens: MetricDelta;
    reasoningTokens: MetricDelta;
    costUsd: MetricDelta;
    findings: {
      totalA: number;
      totalB: number;
      repaired: number;
      newIssues: number;
      regressed: number;
      persistentOpen: number;
      persistentResolved: number;
    };
  };
}

export function getNodeDurationMs(node: GraphNodeData | null | undefined): number {
  if (!node) return 0;
  if (typeof node.metrics?.durationMs === "number") return node.metrics.durationMs;
  if (typeof node.metadata?.durationMs === "number") return node.metadata.durationMs;
  if (typeof node.metrics?.timing?.wallDurationMs === "number") {
    return node.metrics.timing.wallDurationMs;
  }
  if (typeof node.metrics?.timingBreakdown?.wallDurationMs === "number") {
    return node.metrics.timingBreakdown.wallDurationMs;
  }
  if (typeof node.metadata?.timingBreakdown?.wallDurationMs === "number") {
    return node.metadata.timingBreakdown.wallDurationMs;
  }
  return 0;
}

export function getNodeTokensBreakdown(node: GraphNodeData | null | undefined): {
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
} {
  if (!node) {
    return {
      tokensIn: 0,
      tokensOut: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 0,
    };
  }

  const m = node.metrics;
  const t = m?.tokens ?? node.metadata?.tokens;

  const prompt = typeof t?.promptTokens === "number" ? t.promptTokens : (m?.tokensIn ?? 0);
  const completion =
    typeof t?.completionTokens === "number" ? t.completionTokens : (m?.tokensOut ?? 0);
  const reasoning = typeof t?.reasoningTokens === "number" ? t.reasoningTokens : 0;
  const cacheRead = typeof t?.cacheReadTokens === "number" ? t.cacheReadTokens : 0;
  const cacheCreation = typeof t?.cacheCreationTokens === "number" ? t.cacheCreationTokens : 0;

  const total =
    typeof t?.totalTokens === "number"
      ? t.totalTokens
      : prompt + completion + reasoning + cacheRead + cacheCreation;

  return {
    tokensIn: prompt,
    tokensOut: completion,
    reasoningTokens: reasoning,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
    totalTokens: total,
  };
}

export function getNodeCostUsd(node: GraphNodeData | null | undefined): number {
  if (!node) return 0;
  if (typeof node.metrics?.costUsd === "number") return node.metrics.costUsd;
  return 0;
}

export function getNodeModel(node: GraphNodeData | null | undefined): string {
  if (!node) return "";
  if (node.model) return node.model;
  if (node.harnessModel) return node.harnessModel;
  if (typeof node.hostAgent?.model === "string") return node.hostAgent.model;
  if (typeof node.metadata?.hostAgent?.model === "string") return node.metadata.hostAgent.model;
  return "";
}

export function getNodeRepairRounds(node: GraphNodeData | null | undefined): number {
  if (!node) return 0;
  if (typeof node.metrics?.repairRounds === "number") return node.metrics.repairRounds;
  if (typeof node.metadata?.repairRounds === "number") return node.metadata.repairRounds;
  if (typeof node.metrics?.retries === "number") return node.metrics.retries;
  return 0;
}

export function getNodeFindings(node: GraphNodeData | null | undefined): FindingDetail[] {
  if (!node) return [];
  const findings: FindingDetail[] = [];

  if (Array.isArray(node.metadata?.findings)) {
    for (const f of node.metadata.findings) {
      if (f && typeof f.id === "string") {
        findings.push(f);
      }
    }
  }

  if (Array.isArray(node.provenance?.remediations)) {
    for (const r of node.provenance.remediations) {
      const id = r.findingId ?? r.id;
      if (id && !findings.some((existing) => existing.id === id)) {
        findings.push({
          id,
          requirementId: typeof r.requirementId === "string" ? r.requirementId : undefined,
          severity:
            r.severity === "critical" || r.severity === "important" || r.severity === "suggestion"
              ? r.severity
              : "important",
          observation: typeof r.observation === "string" ? r.observation : "Remediation note",
          remediation: typeof r.remediation === "string" ? r.remediation : undefined,
          status: r.status === "resolved" ? "resolved" : "open",
        });
      }
    }
  }

  return findings;
}

function calculateMetricDelta(baseVal: number, targetVal: number, unit = ""): MetricDelta {
  const delta = targetVal - baseVal;
  const percentChange =
    baseVal !== 0 ? (delta / Math.abs(baseVal)) * 100 : targetVal !== 0 ? 100 : 0;
  const sign = delta > 0 ? "+" : "";
  const formattedDelta = `${sign}${delta.toLocaleString()}${unit ? ` ${unit}` : ""}`;

  return {
    baseValue: baseVal,
    targetValue: targetVal,
    delta,
    percentChange,
    formattedDelta,
  };
}

export function computeGraphDiff(
  baseDataset: GraphDataset | null | undefined,
  targetDataset: GraphDataset | null | undefined,
): GraphComparisonDiff {
  if (!baseDataset && !targetDataset) {
    return {
      hasDatasets: false,
      isIdentical: true,
      baseTitle: "",
      targetTitle: "",
      nodesDiff: [],
      edgesDiff: [],
      findingsDiff: [],
      summary: {
        nodes: { totalA: 0, totalB: 0, added: 0, removed: 0, modified: 0, unchanged: 0, delta: 0 },
        edges: { totalA: 0, totalB: 0, added: 0, removed: 0, modified: 0, unchanged: 0, delta: 0 },
        duration: calculateMetricDelta(0, 0, "ms"),
        tokens: calculateMetricDelta(0, 0),
        promptTokens: calculateMetricDelta(0, 0),
        completionTokens: calculateMetricDelta(0, 0),
        reasoningTokens: calculateMetricDelta(0, 0),
        costUsd: calculateMetricDelta(0, 0, "$"),
        findings: {
          totalA: 0,
          totalB: 0,
          repaired: 0,
          newIssues: 0,
          regressed: 0,
          persistentOpen: 0,
          persistentResolved: 0,
        },
      },
    };
  }

  const nodesA = baseDataset?.nodes ?? [];
  const nodesB = targetDataset?.nodes ?? [];
  const edgesA = baseDataset?.edges ?? [];
  const edgesB = targetDataset?.edges ?? [];

  const nodeMapA = new Map<string, GraphNodeData>();
  for (const n of nodesA) nodeMapA.set(n.id, n);

  const nodeMapB = new Map<string, GraphNodeData>();
  for (const n of nodesB) nodeMapB.set(n.id, n);

  const allNodeIds = new Set<string>([...nodeMapA.keys(), ...nodeMapB.keys()]);
  const nodesDiff: NodeDiff[] = [];

  let totalDurationA = 0;
  let totalDurationB = 0;
  let totalTokensA = 0;
  let totalTokensB = 0;
  let promptTokensA = 0;
  let promptTokensB = 0;
  let completionTokensA = 0;
  let completionTokensB = 0;
  let reasoningTokensA = 0;
  let reasoningTokensB = 0;
  let totalCostA = 0;
  let totalCostB = 0;

  for (const nodeId of allNodeIds) {
    const nodeA = nodeMapA.get(nodeId) ?? null;
    const nodeB = nodeMapB.get(nodeId) ?? null;

    const durA = getNodeDurationMs(nodeA);
    const durB = getNodeDurationMs(nodeB);
    totalDurationA += durA;
    totalDurationB += durB;

    const tokA = getNodeTokensBreakdown(nodeA);
    const tokB = getNodeTokensBreakdown(nodeB);
    totalTokensA += tokA.totalTokens;
    totalTokensB += tokB.totalTokens;
    promptTokensA += tokA.tokensIn;
    promptTokensB += tokB.tokensIn;
    completionTokensA += tokA.tokensOut;
    completionTokensB += tokB.tokensOut;
    reasoningTokensA += tokA.reasoningTokens;
    reasoningTokensB += tokB.reasoningTokens;

    const costA = getNodeCostUsd(nodeA);
    const costB = getNodeCostUsd(nodeB);
    totalCostA += costA;
    totalCostB += costB;

    const name = nodeB?.name ?? nodeA?.name ?? nodeId;
    const kindA = nodeA?.kind ?? null;
    const kindB = nodeB?.kind ?? null;
    const statusA = nodeA?.status ?? null;
    const statusB = nodeB?.status ?? null;
    const modelA = getNodeModel(nodeA) || null;
    const modelB = getNodeModel(nodeB) || null;
    const repairA = getNodeRepairRounds(nodeA);
    const repairB = getNodeRepairRounds(nodeB);
    const findingsListA = getNodeFindings(nodeA);
    const findingsListB = getNodeFindings(nodeB);

    const fieldChanges: FieldChange[] = [];

    let diffStatus: DiffStatus = "unchanged";
    if (!nodeA && nodeB) {
      diffStatus = "added";
    } else if (nodeA && !nodeB) {
      diffStatus = "removed";
    } else if (nodeA && nodeB) {
      if (statusA !== statusB) {
        fieldChanges.push({ field: "status", label: "Status", from: statusA, to: statusB });
      }
      if (kindA !== kindB) {
        fieldChanges.push({ field: "kind", label: "Kind", from: kindA, to: kindB });
      }
      if (modelA !== modelB) {
        fieldChanges.push({ field: "model", label: "Model", from: modelA, to: modelB });
      }
      if (durA !== durB) {
        fieldChanges.push({ field: "durationMs", label: "Duration (ms)", from: durA, to: durB });
      }
      if (tokA.totalTokens !== tokB.totalTokens) {
        fieldChanges.push({
          field: "totalTokens",
          label: "Total Tokens",
          from: tokA.totalTokens,
          to: tokB.totalTokens,
        });
      }
      if (repairA !== repairB) {
        fieldChanges.push({
          field: "repairRounds",
          label: "Repair Rounds",
          from: repairA,
          to: repairB,
        });
      }
      if (findingsListA.length !== findingsListB.length) {
        fieldChanges.push({
          field: "findingsCount",
          label: "Findings Count",
          from: findingsListA.length,
          to: findingsListB.length,
        });
      }

      diffStatus = fieldChanges.length > 0 ? "modified" : "unchanged";
    }

    const durDelta = durB - durA;
    const durPct = durA > 0 ? (durDelta / durA) * 100 : durB > 0 ? 100 : 0;
    const tokDelta = tokB.totalTokens - tokA.totalTokens;
    const tokPct =
      tokA.totalTokens > 0 ? (tokDelta / tokA.totalTokens) * 100 : tokB.totalTokens > 0 ? 100 : 0;

    nodesDiff.push({
      id: nodeId,
      name,
      status: diffStatus,
      nodeA,
      nodeB,
      kindA,
      kindB,
      nodeStatusA: statusA,
      nodeStatusB: statusB,
      modelA,
      modelB,
      durationMsA: durA,
      durationMsB: durB,
      durationDeltaMs: durDelta,
      durationDeltaPct: durPct,
      tokensA: tokA.totalTokens,
      tokensB: tokB.totalTokens,
      tokensDelta: tokDelta,
      tokensDeltaPct: tokPct,
      repairRoundsA: repairA,
      repairRoundsB: repairB,
      repairRoundsDelta: repairB - repairA,
      findingsA: findingsListA,
      findingsB: findingsListB,
      fieldChanges,
    });
  }

  // Edge Diffing
  const edgeMapA = new Map<string, GraphEdgeData>();
  for (const e of edgesA) edgeMapA.set(e.id, e);

  const edgeMapB = new Map<string, GraphEdgeData>();
  for (const e of edgesB) edgeMapB.set(e.id, e);

  const allEdgeIds = new Set<string>([...edgeMapA.keys(), ...edgeMapB.keys()]);
  const edgesDiff: EdgeDiff[] = [];

  for (const edgeId of allEdgeIds) {
    const edgeA = edgeMapA.get(edgeId) ?? null;
    const edgeB = edgeMapB.get(edgeId) ?? null;

    const source = edgeB?.source ?? edgeA?.source ?? "";
    const target = edgeB?.target ?? edgeA?.target ?? "";
    const kindA = edgeA?.kind ?? null;
    const kindB = edgeB?.kind ?? null;
    const tokA = edgeA?.tokens ?? edgeA?.traffic?.tokens ?? 0;
    const tokB = edgeB?.tokens ?? edgeB?.traffic?.tokens ?? 0;
    const exCountA = edgeA?.exchanges?.length ?? edgeA?.traffic?.exchanges?.length ?? 0;
    const exCountB = edgeB?.exchanges?.length ?? edgeB?.traffic?.exchanges?.length ?? 0;

    const fieldChanges: FieldChange[] = [];
    let diffStatus: DiffStatus = "unchanged";

    if (!edgeA && edgeB) {
      diffStatus = "added";
    } else if (edgeA && !edgeB) {
      diffStatus = "removed";
    } else if (edgeA && edgeB) {
      if (kindA !== kindB) {
        fieldChanges.push({ field: "kind", label: "Kind", from: kindA, to: kindB });
      }
      if (tokA !== tokB) {
        fieldChanges.push({ field: "tokens", label: "Traffic Tokens", from: tokA, to: tokB });
      }
      if (exCountA !== exCountB) {
        fieldChanges.push({
          field: "exchanges",
          label: "Exchanges",
          from: exCountA,
          to: exCountB,
        });
      }
      if (edgeA.condition !== edgeB.condition) {
        fieldChanges.push({
          field: "condition",
          label: "Condition",
          from: edgeA.condition ?? null,
          to: edgeB.condition ?? null,
        });
      }
      diffStatus = fieldChanges.length > 0 ? "modified" : "unchanged";
    }

    edgesDiff.push({
      id: edgeId,
      source,
      target,
      status: diffStatus,
      edgeA,
      edgeB,
      kindA,
      kindB,
      tokensA: tokA,
      tokensB: tokB,
      tokensDelta: tokB - tokA,
      exchangesCountA: exCountA,
      exchangesCountB: exCountB,
      exchangesDelta: exCountB - exCountA,
      fieldChanges,
    });
  }

  // Findings Diffing
  const findingsDiff: FindingDiff[] = [];
  const findingMapA = new Map<string, { finding: FindingDetail; nodeId: string }>();
  const findingMapB = new Map<string, { finding: FindingDetail; nodeId: string }>();

  for (const n of nodesA) {
    const list = getNodeFindings(n);
    for (const f of list) {
      findingMapA.set(f.id, { finding: f, nodeId: n.id });
    }
  }

  for (const n of nodesB) {
    const list = getNodeFindings(n);
    for (const f of list) {
      findingMapB.set(f.id, { finding: f, nodeId: n.id });
    }
  }

  const allFindingIds = new Set<string>([...findingMapA.keys(), ...findingMapB.keys()]);
  let repairedCount = 0;
  let newIssuesCount = 0;
  let regressedCount = 0;
  let persistentOpenCount = 0;
  let persistentResolvedCount = 0;

  for (const fId of allFindingIds) {
    const itemA = findingMapA.get(fId);
    const itemB = findingMapB.get(fId);

    const fA = itemA?.finding;
    const fB = itemB?.finding;
    const mainF = fB ?? fA;
    if (!mainF) continue;

    const statusA = fA?.status ?? null;
    const statusB = fB?.status ?? null;

    let diffStatus: FindingDiffStatus = "persistent_open";
    if (fA && !fB) {
      // In Run A but absent in Run B (resolved/fixed)
      diffStatus = fA.status === "open" ? "repaired" : "persistent_resolved";
    } else if (!fA && fB) {
      // New in Run B
      diffStatus = fB.status === "open" ? "new" : "persistent_resolved";
    } else if (fA && fB) {
      if (fA.status === "open" && fB.status === "resolved") {
        diffStatus = "repaired";
      } else if (fA.status === "resolved" && fB.status === "open") {
        diffStatus = "regressed";
      } else if (fA.status === "open" && fB.status === "open") {
        diffStatus = "persistent_open";
      } else {
        diffStatus = "persistent_resolved";
      }
    }

    if (diffStatus === "repaired") repairedCount++;
    else if (diffStatus === "new") newIssuesCount++;
    else if (diffStatus === "regressed") regressedCount++;
    else if (diffStatus === "persistent_open") persistentOpenCount++;
    else if (diffStatus === "persistent_resolved") persistentResolvedCount++;

    findingsDiff.push({
      id: fId,
      requirementId: mainF.requirementId,
      severity: mainF.severity,
      observation: mainF.observation,
      remediation: mainF.remediation,
      status: diffStatus,
      statusA,
      statusB,
      nodeId: itemB?.nodeId ?? itemA?.nodeId,
      revalidationProof: mainF.revalidationProof,
    });
  }

  const addedNodes = nodesDiff.filter((n) => n.status === "added").length;
  const removedNodes = nodesDiff.filter((n) => n.status === "removed").length;
  const modifiedNodes = nodesDiff.filter((n) => n.status === "modified").length;
  const unchangedNodes = nodesDiff.filter((n) => n.status === "unchanged").length;

  const addedEdges = edgesDiff.filter((e) => e.status === "added").length;
  const removedEdges = edgesDiff.filter((e) => e.status === "removed").length;
  const modifiedEdges = edgesDiff.filter((e) => e.status === "modified").length;
  const unchangedEdges = edgesDiff.filter((e) => e.status === "unchanged").length;

  const isIdentical =
    addedNodes === 0 &&
    removedNodes === 0 &&
    modifiedNodes === 0 &&
    addedEdges === 0 &&
    removedEdges === 0 &&
    modifiedEdges === 0 &&
    repairedCount === 0 &&
    newIssuesCount === 0 &&
    regressedCount === 0;

  return {
    hasDatasets: true,
    isIdentical,
    baseTitle: baseDataset?.title ?? baseDataset?.id ?? "Baseline",
    targetTitle: targetDataset?.title ?? targetDataset?.id ?? "Target",
    nodesDiff,
    edgesDiff,
    findingsDiff,
    summary: {
      nodes: {
        totalA: nodesA.length,
        totalB: nodesB.length,
        added: addedNodes,
        removed: removedNodes,
        modified: modifiedNodes,
        unchanged: unchangedNodes,
        delta: nodesB.length - nodesA.length,
      },
      edges: {
        totalA: edgesA.length,
        totalB: edgesB.length,
        added: addedEdges,
        removed: removedEdges,
        modified: modifiedEdges,
        unchanged: unchangedEdges,
        delta: edgesB.length - edgesA.length,
      },
      duration: calculateMetricDelta(totalDurationA, totalDurationB, "ms"),
      tokens: calculateMetricDelta(totalTokensA, totalTokensB),
      promptTokens: calculateMetricDelta(promptTokensA, promptTokensB),
      completionTokens: calculateMetricDelta(completionTokensA, completionTokensB),
      reasoningTokens: calculateMetricDelta(reasoningTokensA, reasoningTokensB),
      costUsd: calculateMetricDelta(totalCostA, totalCostB, "$"),
      findings: {
        totalA: findingMapA.size,
        totalB: findingMapB.size,
        repaired: repairedCount,
        newIssues: newIssuesCount,
        regressed: regressedCount,
        persistentOpen: persistentOpenCount,
        persistentResolved: persistentResolvedCount,
      },
    },
  };
}
