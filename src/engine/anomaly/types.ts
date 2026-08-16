import type { GraphDataset } from "../../types/graphData";

export type AnomalyType =
  | "runaway_retry_loop"
  | "cognitive_token_spike"
  | "stranded_distributed_lock"
  | "circular_dependency_deadlock"
  | "latency_bottleneck"
  | "error_cascade"
  | "contract_violation"
  | "zombie_lease"
  | "orphaned_subgraph"
  | "diamond_join_deadlock"
  | "unbounded_growth";

export type AnomalyCategory = "topology" | "execution" | "resource" | "performance" | "quality";

export type AnomalySeverity = "critical" | "error" | "warning" | "info";

export interface AnomalyQuickFix {
  type:
    | "break_cycle"
    | "evict_lease"
    | "reset_retries"
    | "upgrade_tier"
    | "throttle"
    | "reconnect"
    | "prune_context"
    | "bypass_join"
    | string;
  targetId?: string;
  patch?: Record<string, unknown>;
}

export interface AnomalyRemediation {
  action: string;
  suggestion: string;
  autoFixable?: boolean;
  quickFix?: AnomalyQuickFix;
}

export interface AnomalyEvidence {
  metrics?: Record<string, number | string | boolean>;
  logs?: string[];
  relatedNodes?: string[];
  relatedEdges?: string[];
  cyclePath?: string[];
  traceSteps?: number[];
  confidence?: number;
  [key: string]: unknown;
}

export interface AnomalyFinding {
  id: string;
  type: AnomalyType;
  category: AnomalyCategory;
  severity: AnomalySeverity;
  title: string;
  description: string;
  nodeIds: string[];
  edgeIds?: string[];
  impactScore: number; // Normalized 0-100
  metricValue?: number;
  thresholdValue?: number;
  unit?: string;
  remediation: AnomalyRemediation;
  evidence: AnomalyEvidence;
  timestamp: string | number;
  metadata?: Record<string, unknown>;
}

export interface AnomalyThresholds {
  maxRetries: number;
  maxRepairRounds: number;
  tokenSpikeAbsoluteThreshold: number;
  tokenSpikeDeviationMultiplier: number;
  cognitiveTokenRatioThreshold: number;
  latencyThresholdMs: number;
  latencyDeviationMultiplier: number;
  leaseTimeoutMs: number;
  edgeLatencyThresholdMs: number;
  criticalPathSlowdownRatio: number;
  minNodeSampleForStats: number;
}

export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
  maxRetries: 3,
  maxRepairRounds: 2,
  tokenSpikeAbsoluteThreshold: 50000,
  tokenSpikeDeviationMultiplier: 2.5,
  cognitiveTokenRatioThreshold: 0.7,
  latencyThresholdMs: 30000,
  latencyDeviationMultiplier: 2.5,
  leaseTimeoutMs: 600000, // 10 minutes
  edgeLatencyThresholdMs: 5000,
  criticalPathSlowdownRatio: 0.35,
  minNodeSampleForStats: 3,
};

export interface AnomalyReport {
  datasetId: string;
  timestamp: string;
  totalAnomalies: number;
  severityCounts: {
    critical: number;
    error: number;
    warning: number;
    info: number;
  };
  categoryCounts: Record<AnomalyCategory, number>;
  healthScore: number; // 0 - 100
  anomalies: AnomalyFinding[];
  topologicalCyclePaths: string[][];
  criticalPathBottlenecks: string[];
  blastRadiusMap: Record<string, string[]>;
  recommendedActions: string[];
}

export type AnomalyDetectorFn = (
  dataset: GraphDataset,
  thresholds: AnomalyThresholds,
) => AnomalyFinding[];

export interface DetectorConfig {
  enabledDetectors?: AnomalyType[];
  thresholds?: Partial<AnomalyThresholds>;
  customDetectors?: AnomalyDetectorFn[];
}

export interface AnomalyFilterOptions {
  searchQuery?: string;
  severities?: AnomalySeverity[];
  categories?: AnomalyCategory[];
  nodeId?: string;
  edgeId?: string;
  autoFixableOnly?: boolean;
  minImpactScore?: number;
}
