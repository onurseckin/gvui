export { ComparisonView } from "./ComparisonView";
export type { ComparisonViewProps } from "./ComparisonView";

export {
  computeGraphDiff,
  getNodeDurationMs,
  getNodeTokensBreakdown,
  getNodeCostUsd,
  getNodeModel,
  getNodeRepairRounds,
  getNodeFindings,
} from "./diffEngine";

export type {
  DiffStatus,
  FindingDiffStatus,
  FieldChange,
  NodeDiff,
  EdgeDiff,
  FindingDiff,
  MetricDelta,
  GraphComparisonDiff,
} from "./diffEngine";
