import type { GraphEdgeData, GraphNodeData } from "../../types/graphData";

/**
 * Status of an entity in comparison to baseline.
 */
export type DiffStatus = "added" | "removed" | "modified" | "unchanged";

/**
 * Filtering modes for node/edge lists in the diff view.
 */
export type DiffFilterMode =
  | "all"
  | "changes-only"
  | "added-only"
  | "removed-only"
  | "modified-only"
  | "unchanged-only";

/**
 * Visual rendering mode for cross-run comparison.
 */
export type VisualComparisonMode = "side-by-side" | "unified-overlay" | "split-screen";

/**
 * Finding state transition classification between runs.
 */
export type FindingDiffStatus =
  | "repaired"
  | "new"
  | "regressed"
  | "persistent_open"
  | "persistent_resolved";

/**
 * Detailed delta for a numeric metric.
 */
export interface MetricDelta {
  baseValue: number;
  compValue: number;
  delta: number;
  percentChange: number;
  formattedDelta: string;
  isIncrease: boolean;
  isDecrease: boolean;
  isNeutral: boolean;
}

/**
 * Individual field change comparison.
 */
export interface PropertyDiff<T = unknown> {
  field: string;
  label: string;
  oldValue: T;
  newValue: T;
  isDifferent: boolean;
  description?: string;
}

/**
 * Port diff record.
 */
export interface PortChange {
  portId?: string;
  label: string;
  kind: string;
  tokens?: number;
  status: DiffStatus;
}

/**
 * Tool diff record.
 */
export interface ToolChange {
  name: string;
  type?: string;
  status: DiffStatus;
}

/**
 * File touch diff record.
 */
export interface FileChange {
  path: string;
  mode?: string;
  status: DiffStatus;
  additionsDelta?: number;
  deletionsDelta?: number;
}

/**
 * Finding comparison record.
 */
export interface FindingDiff {
  id: string;
  requirementId?: string;
  severity: "critical" | "important" | "suggestion" | string;
  observation: string;
  remediation?: string;
  status: FindingDiffStatus;
  statusBase?: "open" | "resolved" | string | null;
  statusComp?: "open" | "resolved" | string | null;
  nodeId?: string;
  revalidationProof?: { method?: string; evidence?: string[] | string };
}

/**
 * Detailed node metric deltas.
 */
export interface NodeMetricDiff {
  durationMs: MetricDelta;
  tokensIn: MetricDelta;
  tokensOut: MetricDelta;
  tokensTotal: MetricDelta;
  promptTokens: MetricDelta;
  completionTokens: MetricDelta;
  reasoningTokens: MetricDelta;
  cacheReadTokens: MetricDelta;
  cacheCreationTokens: MetricDelta;
  costUsd: MetricDelta;
  retries: MetricDelta;
  repairRounds: MetricDelta;
}

/**
 * Complete node comparison record.
 */
export interface NodeDiff {
  id: string;
  name: string;
  status: DiffStatus;
  baseNode: GraphNodeData | null;
  compNode: GraphNodeData | null;
  kindBase: string | null;
  kindComp: string | null;
  nodeStatusBase: string | null;
  nodeStatusComp: string | null;
  modelBase: string | null;
  modelComp: string | null;
  metrics: NodeMetricDiff;
  propertyChanges: PropertyDiff[];
  inputPortChanges: PortChange[];
  outputPortChanges: PortChange[];
  toolChanges: ToolChange[];
  fileChanges: FileChange[];
  findingsDiff: FindingDiff[];
  isStructuralChange: boolean;
  isExecutionChange: boolean;
  hasMetricChanges: boolean;
  isOrphanedBase: boolean;
  isOrphanedComp: boolean;
  isInCycleBase: boolean;
  isInCycleComp: boolean;
}

/**
 * Edge traffic metrics delta.
 */
export interface EdgeTrafficDelta {
  volume: MetricDelta;
  tokens: MetricDelta;
  bytes: MetricDelta;
  messagesCount: MetricDelta;
  exchangesCount: MetricDelta;
}

/**
 * Complete edge comparison record.
 */
export interface EdgeDiff {
  id: string;
  source: string;
  target: string;
  status: DiffStatus;
  baseEdge: GraphEdgeData | null;
  compEdge: GraphEdgeData | null;
  kindBase: string | null;
  kindComp: string | null;
  labelBase: string | null;
  labelComp: string | null;
  conditionBase: string | null;
  conditionComp: string | null;
  weightBase: number | null;
  weightComp: number | null;
  traffic: EdgeTrafficDelta;
  propertyChanges: PropertyDiff[];
  isStructuralChange: boolean;
  hasTrafficChanges: boolean;
  isDanglingBase: boolean;
  isDanglingComp: boolean;
  isCycleBase: boolean;
  isCycleComp: boolean;
}

/**
 * Aggregate metric summary comparing whole datasets.
 */
export interface GraphMetricSummary {
  totalDurationMs: MetricDelta;
  totalTokens: MetricDelta;
  totalPromptTokens: MetricDelta;
  totalCompletionTokens: MetricDelta;
  totalReasoningTokens: MetricDelta;
  totalCostUsd: MetricDelta;
  gateCount: MetricDelta;
  repairRoundsCount: MetricDelta;
  findingsCount: MetricDelta;
  resolvedFindingsCount: MetricDelta;
  unresolvedFindingsCount: MetricDelta;
  nodeCount: MetricDelta;
  edgeCount: MetricDelta;
}

/**
 * Breakdown counts of changes across entities.
 */
export interface GraphDiffCounts {
  nodes: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    total: number;
  };
  edges: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    total: number;
  };
  findings: {
    repaired: number;
    new: number;
    regressed: number;
    persistentOpen: number;
    persistentResolved: number;
    total: number;
  };
  orphans: {
    baseNodes: number;
    compNodes: number;
    baseEdges: number;
    compEdges: number;
  };
  cycles: {
    baseEdges: number;
    compEdges: number;
  };
}

/**
 * Output of the pure diff calculation engine.
 */
export interface GraphDiffResult {
  hasDatasets: boolean;
  isIdentical: boolean;
  baseRunId: string | null;
  compRunId: string | null;
  baseTitle: string;
  compTitle: string;
  nodeDiffs: NodeDiff[];
  edgeDiffs: EdgeDiff[];
  nodeDiffMap: Record<string, NodeDiff>;
  edgeDiffMap: Record<string, EdgeDiff>;
  counts: GraphDiffCounts;
  metrics: GraphMetricSummary;
  topologyChanged: boolean;
  executionMetricsChanged: boolean;
  findingsChanged: boolean;
  computedAt: string;
}

/**
 * Options configurable when computing a diff.
 */
export interface GraphDiffOptions {
  baseRunId?: string;
  compRunId?: string;
  toleranceMs?: number;
  toleranceTokens?: number;
  ignoreUnchangedNodes?: boolean;
  ignoreVisualPositionChanges?: boolean;
}
