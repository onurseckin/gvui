export type SpanTier = "root" | "coordinator" | "subagent" | "worker" | "tool" | "gate" | "system";

export type SpanStatus = "pending" | "running" | "success" | "error" | "cancelled";

export type SpanCategory =
  | "agent_cascade"
  | "llm_call"
  | "tool_execution"
  | "task_lease"
  | "validator_gate"
  | "custom";

export type ColorScheme = "agent" | "tier" | "status" | "tokens" | "latency";

export interface TokenMetrics {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface ProfileSpan {
  id: string;
  parentId?: string | null;
  name: string;
  agentId?: string;
  agentRole?: string;
  tier: SpanTier;
  status: SpanStatus;
  category: SpanCategory;
  startTime: number;
  endTime: number;
  duration: number;
  tokens: TokenMetrics;
  costUsd?: number;
  metadata?: Record<string, unknown>;
  children?: ProfileSpan[];
  error?: string;
  tags?: string[];
}

export interface FlamegraphNode {
  span: ProfileSpan;
  id: string;
  parentId: string | null;
  name: string;
  agentId: string;
  tier: SpanTier;
  status: SpanStatus;
  category: SpanCategory;
  startTime: number;
  endTime: number;
  duration: number;
  selfTime: number;
  tokens: TokenMetrics;
  /** Recorded dollars only. Absent when the span carried no cost. */
  costUsd?: number;
  depth: number;
  xPct: number;
  widthPct: number;
  hasChildren: boolean;
  childIds: string[];
  isMatchedBySearch: boolean;
  color: string;
}

export interface AgentMetricBreakdown {
  agentId: string;
  agentRole: string;
  spanCount: number;
  durationMs: number;
  tokens: TokenMetrics;
  /** Sum of this agent's recorded costs. Absent when none of its spans recorded one. */
  costUsd?: number;
}

export interface FlamegraphMetrics {
  totalSpans: number;
  totalDurationMs: number;
  activeExecutionMs: number;
  minStartTime: number;
  maxEndTime: number;
  totalTokens: TokenMetrics;
  /** Sum of the recorded span costs. Absent when the profile carries no cost at all. */
  totalCostUsd?: number;
  maxDepth: number;
  concurrencyPeak: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  agentBreakdown: Record<string, AgentMetricBreakdown>;
  statusCounts: Record<SpanStatus, number>;
  tierCounts: Record<SpanTier, number>;
  categoryCounts: Record<SpanCategory, number>;
}

export interface ViewportRange {
  start: number;
  end: number;
}

export interface FlamegraphFilterOptions {
  tierFilter: SpanTier | "all";
  statusFilter: SpanStatus | "all";
  categoryFilter: SpanCategory | "all";
  agentFilter: string | "all";
  searchQuery: string;
  minDurationMs?: number;
}

export interface FlattenOptions {
  includeFilteredOut?: boolean;
  filterOptions?: FlamegraphFilterOptions;
}

export interface LayoutOptions {
  viewport: ViewportRange;
  zoom: number;
  panOffsetPct: number;
  colorScheme: ColorScheme;
  filterOptions: FlamegraphFilterOptions;
}

export interface ProfileExportData {
  version: string;
  exportedAt: string;
  title?: string;
  spans: ProfileSpan[];
  metrics: FlamegraphMetrics;
}
