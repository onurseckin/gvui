export type ReportExportFormat = "pdf" | "html" | "json" | "markdown";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface KpiScorecard {
  totalNodes: number;
  totalEdges: number;
  successCount: number;
  failureCount: number;
  runningCount: number;
  pendingCount: number;
  skippedCount: number;
  failureRate: number; // 0 - 100 percentage
  healthScore: number; // 0 - 100 composite index
  mttrMs: number; // Mean time to recovery in ms
  totalDurationMs: number;
  throughputNodesPerSec: number;
  bottleneckScore: number; // 0 - 100 score indicating latency concentration
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  /** Sum of the recorded costs. Absent when the run recorded no dollars at all. */
  totalCostUsd?: number;
  totalRetries: number;
  totalRepairRounds: number;
  recoveryEfficiency: number; // 0 - 100 percentage
  criticalPathDurationMs: number;
  criticalPathNodeCount: number;
}

export interface NodeTokenDetail {
  nodeId: string;
  nodeName: string;
  kind?: string;
  model?: string;
  tier?: string;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  totalTokens: number;
  /** Recorded dollars only, absent when this node reported none. */
  costUsd?: number;
  durationMs: number;
  tokenPercentage: number;
  /** Absent whenever the run has no recorded cost to take a share of. */
  costPercentage?: number;
}

export interface CategoryTokenBreakdown {
  category: string;
  tokens: number;
  /** Sum of the recorded costs in this category. Absent when none of its nodes reported one. */
  costUsd?: number;
  nodeCount: number;
  percentage: number;
}

export interface TokenAttribution {
  totalTokens: number;
  /** Sum of the recorded costs. Absent when the run recorded no dollars at all. */
  totalCostUsd?: number;
  byNode: NodeTokenDetail[];
  byModel: CategoryTokenBreakdown[];
  byTier: CategoryTokenBreakdown[];
  bySection: CategoryTokenBreakdown[];
}

export interface FailureCascadeNode {
  nodeId: string;
  nodeName: string;
  kind?: string;
  depth: number;
  impactWeight: number;
  reason?: string;
}

export interface NodeBlastImpact {
  nodeId: string;
  nodeName: string;
  kind?: string;
  status?: string;
  directDownstreamCount: number;
  transitiveDownstreamCount: number;
  affectedNodeIds: string[];
  affectedTerminalCount: number;
  maxCascadeDepth: number;
  blastRadiusScore: number; // 0 - 100 risk score
  riskLevel: RiskLevel;
  isOnCriticalPath: boolean;
  cascadeTree: FailureCascadeNode[];
  /** Recorded dollars on the affected nodes. Absent when none of them reported a cost. */
  estimatedCostAtRiskUsd?: number;
  remediationRecommendation: string;
}

export interface BlastRadiusMatrix {
  items: NodeBlastImpact[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  maxGraphDepth: number;
  overallFragilityIndex: number; // 0 - 100 index
  topRiskNodeId: string | null;
}

export interface AuditFindingSummary {
  id: string;
  nodeId: string;
  nodeName: string;
  severity: "critical" | "important" | "suggestion";
  observation: string;
  remediation?: string;
  status: "open" | "resolved";
}

export interface ExecutiveReportConfig {
  title?: string;
  subtitle?: string;
  generatedAt?: string;
  generatedBy?: string;
  includeScorecard?: boolean;
  includeBlastRadius?: boolean;
  includeTokenAttribution?: boolean;
  includeNodeBreakdown?: boolean;
  includeFindings?: boolean;
  theme?: "dark" | "light";
  customNotes?: string;
  format?: ReportExportFormat;
}

export interface ExecutiveReportData {
  datasetId: string;
  datasetTitle: string;
  datasetDescription?: string;
  generatedAt: string;
  kpi: KpiScorecard;
  tokenAttribution: TokenAttribution;
  blastRadius: BlastRadiusMatrix;
  findings: AuditFindingSummary[];
  criticalPath: string[];
  config: ExecutiveReportConfig;
}
