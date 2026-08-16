import type { ModelTier } from "../../../types/graphData";

// ============================================================================
// Core Lens Modes and Sub-Metrics
// ============================================================================

export type LensMode = "none" | "heatmap" | "critical-path" | "risk" | "token";

export type HeatmapMetric =
  | "duration"
  | "frequency"
  | "cognitiveLatency"
  | "toolDuration"
  | "queueWait";

export type CriticalPathMetric = "duration" | "slack" | "bottleneckScore";

export type RiskMetric =
  | "composite"
  | "errorRate"
  | "retryCount"
  | "findingSeverity"
  | "failureProbability"
  | "blastRadius";

export type TokenMetric =
  | "totalTokens"
  | "promptTokens"
  | "completionTokens"
  | "reasoningTokens"
  | "costUsd"
  | "costIntensity";

export type ScaleType = "linear" | "log" | "sqrt" | "quantile";

export type FilterMode = "dim" | "hide" | "highlight";

export type ColorRampPreset =
  | "viridis"
  | "plasma"
  | "inferno"
  | "magma"
  | "turbo"
  | "cividis"
  | "reds"
  | "amber"
  | "emerald"
  | "risk-alert"
  | "cyber-heat"
  | "coolwarm"
  | "spectral"
  | "custom";

// ============================================================================
// Color Ramps and Palettes
// ============================================================================

export interface ColorStop {
  stop: number; // 0.0 to 1.0
  color: string; // Hex (#RRGGBB) or RGB/RGBA string
}

export interface RgbColor {
  r: number; // 0 - 255
  g: number; // 0 - 255
  b: number; // 0 - 255
  a?: number; // 0.0 - 1.0
}

export interface HslColor {
  h: number; // 0 - 360
  s: number; // 0 - 100
  l: number; // 0 - 100
  a?: number; // 0.0 - 1.0
}

// ============================================================================
// Risk Weight Configuration
// ============================================================================

export interface RiskWeightConfig {
  statusWeight: number;
  retriesWeight: number;
  findingsWeight: number;
  commandsWeight: number;
  complexityWeight: number;
  blastRadiusWeight: number;
}

export const DEFAULT_RISK_WEIGHTS: Readonly<RiskWeightConfig> = Object.freeze({
  statusWeight: 0.3,
  retriesWeight: 0.25,
  findingsWeight: 0.2,
  commandsWeight: 0.15,
  complexityWeight: 0.05,
  blastRadiusWeight: 0.05,
});

// ============================================================================
// Per-Lens Configuration
// ============================================================================

export interface LensConfig {
  lens: LensMode;
  colorRamp: ColorRampPreset;
  customStops: ColorStop[];
  invertRamp: boolean;
  scaleType: ScaleType;
  minThreshold: number; // 0.0 to 1.0 (normalized) or raw domain minimum
  maxThreshold: number; // 0.0 to 1.0 (normalized) or raw domain maximum
  filterMode: FilterMode;
  dimOpacity: number;
  showGlow: boolean;
  glowIntensity: number;
  showBadges: boolean;
  showMetricLabels: boolean;
  heatmapMetric: HeatmapMetric;
  criticalPathMetric: CriticalPathMetric;
  riskMetric: RiskMetric;
  tokenMetric: TokenMetric;
  riskWeights: RiskWeightConfig;
  traceSubCriticalPaths: boolean;
  subCriticalThresholdPct: number; // e.g. 15% slack tolerance
}

// ============================================================================
// Tooltip & Detail Breakdown
// ============================================================================

export interface LensTooltipFactor {
  label: string;
  value: string | number;
  severity?: "normal" | "info" | "warning" | "error" | "critical";
  percentage?: number;
}

export interface LensTooltipData {
  title: string;
  subtitle?: string;
  primaryMetric: {
    label: string;
    formatted: string;
    unit?: string;
    raw: number;
  };
  factors: LensTooltipFactor[];
  summaryNote?: string;
}

// ============================================================================
// Overlay Descriptors
// ============================================================================

export interface NodeLensOverlay {
  nodeId: string;
  rawValue: number;
  normalizedValue: number; // 0.0 to 1.0
  color: string;
  fillColor: string;
  borderColor: string;
  glowColor: string;
  glowIntensity: number;
  isFiltered: boolean;
  opacity: number;
  badgeText: string;
  badgeVariant: "info" | "warning" | "error" | "success" | "neutral" | "cyan" | "indigo" | "amber";
  metricFormatted: string;
  metricUnit: string;
  tooltipContent: LensTooltipData;
  isCritical?: boolean;
  isBottleneck?: boolean;
  slackMs?: number;
  criticalPathRank?: number;
  riskScore?: number;
  riskLevel?: "low" | "moderate" | "high" | "critical";
  tokenBreakdown?: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    costUsd: number;
  };
}

export interface EdgeLensOverlay {
  edgeId: string;
  source: string;
  target: string;
  rawValue: number;
  normalizedValue: number; // 0.0 to 1.0
  color: string;
  glowColor: string;
  strokeWidth: number;
  strokeDasharray?: string;
  isCritical: boolean;
  isSubCritical: boolean;
  isFiltered: boolean;
  opacity: number;
  animationSpeed?: number;
  badgeText?: string;
  trafficTokens?: number;
  latencyMs?: number;
}

// ============================================================================
// Critical Path Evaluation Models
// ============================================================================

export interface CriticalPathNodeInfo {
  nodeId: string;
  durationMs: number;
  earlyStartMs: number;
  earlyFinishMs: number;
  lateStartMs: number;
  lateFinishMs: number;
  slackMs: number;
  isCritical: boolean;
  isSubCritical: boolean;
  bottleneckScore: number;
  rank: number;
}

export interface CriticalPathEvaluation {
  totalDurationMs: number;
  criticalPathNodes: string[]; // Ordered list of node IDs
  criticalPathEdges: string[]; // Ordered list of edge IDs
  subCriticalNodes: string[];
  subCriticalEdges: string[];
  bottlenecks: CriticalPathNodeInfo[];
  nodeInfoMap: Map<string, CriticalPathNodeInfo>;
  isCyclic: boolean;
  detectedCycles: string[][];
}

// ============================================================================
// Risk Evaluation Models
// ============================================================================

export interface NodeRiskDetail {
  nodeId: string;
  statusRisk: number; // 0.0 to 1.0
  retriesRisk: number; // 0.0 to 1.0
  findingsRisk: number; // 0.0 to 1.0
  commandsRisk: number; // 0.0 to 1.0
  complexityRisk: number; // 0.0 to 1.0
  blastRadiusRisk: number; // 0.0 to 1.0
  compositeScore: number; // 0.0 to 1.0
  level: "low" | "moderate" | "high" | "critical";
  errorCount: number;
  retryCount: number;
  findingCount: number;
  criticalFindingCount: number;
  commandFailures: number;
}

// ============================================================================
// Token Evaluation Models
// ============================================================================

export interface NodeTokenDetail {
  nodeId: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  costIntensity: number; // USD per second or tokens per ms
  tier: ModelTier | "unknown";
  isTopConsumer: boolean; // Top 20% Pareto
}

// ============================================================================
// Master Evaluation Result & Statistics
// ============================================================================

export interface HistogramBucket {
  min: number;
  max: number;
  count: number;
  color: string;
}

export interface LensLegendData {
  title: string;
  unit: string;
  minRaw: number;
  maxRaw: number;
  formattedMin: string;
  formattedMax: string;
  colorStops: ColorStop[];
  histogramBuckets: HistogramBucket[];
  quantiles?: number[];
}

export interface LensSummaryStats {
  lens: LensMode;
  metricLabel: string;
  totalNodes: number;
  activeNodesCount: number;
  filteredNodesCount: number;
  rawMin: number;
  rawMax: number;
  rawAverage: number;
  rawMedian: number;
  rawSum: number;
  formattedMin: string;
  formattedMax: string;
  formattedAverage: string;
  formattedSum: string;
  unit: string;
  criticalPathLengthMs?: number;
  criticalPathNodeCount?: number;
  highRiskNodeCount?: number;
  totalCostUsd?: number;
  totalTokens?: number;
  topBottlenecks?: Array<{ id: string; name: string; score: number }>;
}

export interface LensEvaluationResult {
  lens: LensMode;
  metricName: string;
  nodeOverlays: Map<string, NodeLensOverlay>;
  edgeOverlays: Map<string, EdgeLensOverlay>;
  summaryStats: LensSummaryStats;
  legendData: LensLegendData;
  criticalPathData?: CriticalPathEvaluation;
}

// ============================================================================
// Configuration Export / Import Structure
// ============================================================================

export interface LensConfigExport {
  version: "1.0.0";
  timestamp: string;
  activeLens: LensMode;
  smoothTransitions: boolean;
  transitionDurationMs: number;
  configs: Record<LensMode, LensConfig>;
}
