export type AgentRole =
  | "orchestrator"
  | "implementer"
  | "validator"
  | "critic"
  | "system"
  | "user"
  | "unknown"
  | (string & {});

export type CollaborationEventType =
  | "claim"
  | "start"
  | "finish"
  | "tool_call"
  | "error"
  | "handoff"
  | "lease_acquired"
  | "lease_released"
  | "validation_started"
  | "validation_rejected"
  | "validation_approved"
  | "critic_started"
  | "critic_approved"
  | "token_metric"
  | (string & {});

export type EventSeverity = "info" | "warn" | "reject" | "approve" | "error";

export type SeverityFilter = "all" | "info" | "warn" | "reject" | "approve" | "error";

export type RoleFilter = "all" | "orchestrator" | "implementer" | "validator" | "critic";

export interface AgentLock {
  taskId: string;
  taskLabel?: string;
  agentId: string;
  agentName?: string;
  role: AgentRole;
  acquiredAt: number | string;
  expiresAt?: number | string;
  durationSeconds?: number;
  writeScope?: string[];
  tokenDigest?: string;
}

export interface HandoffRecord {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  fromAgentName?: string;
  toAgentName?: string;
  taskId?: string;
  taskLabel?: string;
  timestamp: number | string;
  reason?: string;
  status?: "pending" | "completed" | "failed";
}

export interface ThroughputMetrics {
  tokensPerSec: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  peakTokensPerSec: number;
  sampleCount: number;
  history?: Array<{ timestamp: number; rate: number }>;
}

export interface AgentInfo {
  id: string;
  name: string;
  role: AgentRole;
  avatarUrl?: string;
  status: "active" | "idle" | "busy" | "error";
  lastActiveAt: number | string;
  currentTaskId?: string;
  totalTokens?: number;
  completedTasks?: number;
}

export interface EventMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  tokensPerSec?: number;
  latencyMs?: number;
  durationMs?: number;
  toolDurationMs?: number;
  thinkDurationMs?: number;
  costUsd?: number;
  [key: string]: unknown;
}

export interface CollaborationEvent {
  id: string;
  timestamp: number | string;
  agentId: string;
  agentName?: string;
  role: AgentRole;
  type: CollaborationEventType;
  taskId?: string;
  taskLabel?: string;
  severity: EventSeverity;
  summary: string;
  details?: string | Record<string, unknown>;
  payload?: Record<string, unknown>;
  metrics?: EventMetrics;
  targetAgentId?: string;
  targetAgentName?: string;
  lockInfo?: Partial<AgentLock>;
}

export interface CollaborationEventInput {
  id?: string;
  timestamp?: number | string;
  agentId: string;
  agentName?: string;
  role?: AgentRole;
  type: CollaborationEventType;
  taskId?: string;
  taskLabel?: string;
  severity?: EventSeverity;
  summary: string;
  details?: string | Record<string, unknown>;
  payload?: Record<string, unknown>;
  metrics?: EventMetrics;
  targetAgentId?: string;
  targetAgentName?: string;
  lockInfo?: Partial<AgentLock>;
}

export interface CollaborationFeedFilterOptions {
  severity: SeverityFilter;
  role: RoleFilter;
  searchQuery: string;
}
