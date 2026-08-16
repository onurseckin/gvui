/**
 * Autonomous Self-Healing Graph Engine Types
 * 100% Zero-Any Strict TypeScript
 */

import type { GraphDataset } from "../../types/graphData";
import type { AnomalyFinding } from "../anomaly/types";

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "dead" | "recovering";

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type RemediationAction =
  | "restart_node"
  | "trip_circuit"
  | "reset_circuit"
  | "fallback_route"
  | "restore_route"
  | "throttle"
  | "isolate_node"
  | "drain_queue"
  | "scale_up"
  | "prune_context"
  | "noop";

export type IncidentSeverity = "info" | "low" | "medium" | "high" | "critical";

export type IncidentStatus =
  | "detected"
  | "remediating"
  | "remediated"
  | "failed"
  | "resolved"
  | "suppressed";

export interface RemediationRecord {
  action: RemediationAction;
  timestamp: number;
  success: boolean;
  targetId?: string;
  details?: Record<string, unknown>;
  error?: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  nodeId?: string;
  edgeId?: string;
  sourceAnomalyId?: string;
  anomalyType?: string;
  detectedAt: number;
  remediatedAt?: number;
  resolvedAt?: number;
  remediationsApplied: RemediationRecord[];
  initialSnapshot?: GraphDataset;
  finalSnapshot?: GraphDataset;
  metadata?: Record<string, unknown>;
}

export type TelemetryEventType =
  | "heartbeat"
  | "error"
  | "timeout"
  | "latency"
  | "state_change"
  | "metric"
  | "anomaly"
  | "remediation";

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  type: TelemetryEventType;
  nodeId?: string;
  edgeId?: string;
  payload?: Record<string, unknown>;
}

export interface NodeHealthRecord {
  nodeId: string;
  status: HealthStatus;
  lastHeartbeat: number;
  restartAttempts: number;
  nextRestartTime?: number;
  lastError?: string;
  consecutiveFailures: number;
  metrics?: Record<string, number | string | boolean>;
}

export interface FallbackRoute {
  originalEdgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  fallbackTargetNodeId: string;
  active: boolean;
  reason: string;
  createdAt: number;
  activatedAt?: number;
  trafficCount?: number;
  metadata?: Record<string, unknown>;
}

export interface CircuitBreakerInfo {
  id: string;
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  consecutiveSuccesses: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  lastTrippedAt?: number;
  lastStateChange: number;
  halfOpenTrials: number;
}

export interface SelfHealingAuditLogEntry {
  id: string;
  timestamp: number;
  type:
    | "incident_created"
    | "incident_resolved"
    | "incident_status_changed"
    | "remediation_executed"
    | "node_restart_scheduled"
    | "node_restarted"
    | "circuit_state_changed"
    | "fallback_route_activated"
    | "fallback_route_deactivated"
    | "heartbeat_timeout"
    | "playbook_triggered"
    | "config_updated"
    | "custom";
  message: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

export interface SelfHealingConfig {
  heartbeatIntervalMs: number;
  deadNodeTimeoutMs: number;
  degradedNodeTimeoutMs: number;
  maxRestartAttempts: number;
  backoffBaseMs: number;
  backoffMultiplier: number;
  backoffMaxMs: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerResetTimeoutMs: number;
  circuitBreakerHalfOpenSuccessThreshold: number;
  autoRemediationEnabled: boolean;
  maxIncidentHistory: number;
  maxAuditLogHistory: number;
}

export const DEFAULT_SELF_HEALING_CONFIG: SelfHealingConfig = {
  heartbeatIntervalMs: 1000,
  deadNodeTimeoutMs: 5000,
  degradedNodeTimeoutMs: 2500,
  maxRestartAttempts: 5,
  backoffBaseMs: 500,
  backoffMultiplier: 2,
  backoffMaxMs: 30000,
  circuitBreakerFailureThreshold: 5,
  circuitBreakerResetTimeoutMs: 10000,
  circuitBreakerHalfOpenSuccessThreshold: 2,
  autoRemediationEnabled: true,
  maxIncidentHistory: 200,
  maxAuditLogHistory: 500,
};

export type ReplayStepType =
  | "initial"
  | "telemetry"
  | "anomaly"
  | "incident_detected"
  | "remediation_started"
  | "remediation_completed"
  | "route_updated"
  | "circuit_tripped"
  | "node_restarted"
  | "resolved";

export interface ReplayStep {
  stepIndex: number;
  timestamp: number;
  type: ReplayStepType;
  description: string;
  snapshot: GraphDataset;
  actionTaken?: RemediationAction;
  targetId?: string;
  delta?: {
    nodesAdded?: string[];
    nodesUpdated?: string[];
    nodesRemoved?: string[];
    edgesAdded?: string[];
    edgesUpdated?: string[];
    edgesRemoved?: string[];
    details?: Record<string, unknown>;
  };
}

export interface ReplaySession {
  id: string;
  incidentId: string;
  title: string;
  createdAt: number;
  initialGraph: GraphDataset;
  steps: ReplayStep[];
  status: "idle" | "playing" | "paused" | "completed";
  currentStepIndex: number;
}

export interface PlaybookContext {
  incident?: Incident;
  anomaly?: AnomalyFinding;
  nodeId?: string;
  edgeId?: string;
  graph?: GraphDataset;
  telemetry?: TelemetryEvent;
  metadata?: Record<string, unknown>;
}

export interface RemediationResult {
  action: RemediationAction;
  success: boolean;
  targetId?: string;
  message?: string;
  details?: Record<string, unknown>;
  error?: string;
}

export interface PlaybookRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number;
  cooldownMs: number;
  lastTriggeredAt?: number;
  triggerOnAnomalyTypes?: string[];
  triggerOnSeverities?: IncidentSeverity[];
  condition?: (context: PlaybookContext) => boolean;
  actions: RemediationAction[];
  customRemediator?: (
    context: PlaybookContext,
  ) => Promise<RemediationResult[]> | RemediationResult[];
  metadata?: Record<string, unknown>;
}

export interface TimeTravelValidationResult {
  valid: boolean;
  stepCount: number;
  invariantsChecked: number;
  errors: string[];
  warnings: string[];
  metrics: {
    nodeHealthProgression: Array<{ stepIndex: number; healthyRatio: number }>;
    edgeIntegrityPreserved: boolean;
    deterministicHashMatches: boolean;
  };
}

export type SelfHealingEventType =
  | "heartbeat"
  | "health_changed"
  | "incident_created"
  | "incident_resolved"
  | "remediation_executed"
  | "circuit_state_changed"
  | "fallback_route_changed"
  | "node_restarted"
  | "audit_log";

export type SelfHealingEventListener<T = unknown> = (data: T) => void;
