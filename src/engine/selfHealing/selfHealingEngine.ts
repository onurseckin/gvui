/**
 * Autonomous Self-Healing Graph Engine
 * Dead node auto-restart, circuit breaking, fallback routing, anomaly integration, and auto-remediation playbooks.
 * 100% Zero-Any Strict TypeScript
 */

import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import type { AnomalyFinding } from "../anomaly/types";
import { CircuitBreakerManager } from "./circuitBreaker";
import { IncidentRecorder, IncidentReplayEngine } from "./incidentReplay";
import {
  DEFAULT_SELF_HEALING_CONFIG,
  type CircuitBreakerState,
  type FallbackRoute,
  type HealthStatus,
  type Incident,
  type IncidentSeverity,
  type NodeHealthRecord,
  type PlaybookContext,
  type PlaybookRule,
  type RemediationAction,
  type RemediationRecord,
  type RemediationResult,
  type SelfHealingAuditLogEntry,
  type SelfHealingConfig,
  type SelfHealingEventListener,
  type SelfHealingEventType,
} from "./types";

export type NodeRestarterFn = (nodeId: string) => Promise<boolean> | boolean;

export class SelfHealingEngine {
  private config: SelfHealingConfig;
  private nodeHealthRecords: Map<string, NodeHealthRecord> = new Map();
  private fallbackRoutes: Map<string, FallbackRoute> = new Map();
  private incidents: Map<string, Incident> = new Map();
  private auditLog: SelfHealingAuditLogEntry[] = [];
  private playbooks: Map<string, PlaybookRule> = new Map();
  private eventListeners: Map<SelfHealingEventType, Set<SelfHealingEventListener<unknown>>> =
    new Map();

  public readonly circuitBreakers: CircuitBreakerManager;
  public readonly recorder: IncidentRecorder;
  public readonly replayEngine: IncidentReplayEngine;

  private nodeRestarter?: NodeRestarterFn;
  private heartbeatIntervalTimer?: ReturnType<typeof setInterval>;
  private isEnabled: boolean = true;

  constructor(
    config?: Partial<SelfHealingConfig>,
    options?: {
      circuitBreakers?: CircuitBreakerManager;
      recorder?: IncidentRecorder;
      replayEngine?: IncidentReplayEngine;
      nodeRestarter?: NodeRestarterFn;
    },
  ) {
    this.config = { ...DEFAULT_SELF_HEALING_CONFIG, ...config };
    this.circuitBreakers =
      options?.circuitBreakers ??
      new CircuitBreakerManager({
        failureThreshold: this.config.circuitBreakerFailureThreshold,
        resetTimeoutMs: this.config.circuitBreakerResetTimeoutMs,
        halfOpenSuccessThreshold: this.config.circuitBreakerHalfOpenSuccessThreshold,
      });

    this.recorder = options?.recorder ?? new IncidentRecorder();
    this.replayEngine = options?.replayEngine ?? new IncidentReplayEngine(this.recorder);
    this.nodeRestarter = options?.nodeRestarter;

    this.circuitBreakers.onStateChange((id, from, to) => {
      this.handleCircuitBreakerStateChange(id, from, to);
    });

    this.registerDefaultPlaybooks();
  }

  /* -------------------------------------------------------------------------- */
  /* Configuration & Status                                                     */
  /* -------------------------------------------------------------------------- */

  public getConfig(): SelfHealingConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<SelfHealingConfig>): void {
    this.config = { ...this.config, ...patch };
    this.addAuditLog(
      "config_updated",
      "Self-healing configuration updated",
      undefined,
      patch as Record<string, unknown>,
    );
  }

  public isEngineEnabled(): boolean {
    return this.isEnabled;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public setNodeRestarter(restarter: NodeRestarterFn): void {
    this.nodeRestarter = restarter;
  }

  /* -------------------------------------------------------------------------- */
  /* Heartbeat & Node Health Monitoring                                         */
  /* -------------------------------------------------------------------------- */

  public recordHeartbeat(
    nodeId: string,
    status: HealthStatus = "healthy",
    metrics?: Record<string, number | string | boolean>,
    timestamp?: number,
  ): NodeHealthRecord {
    const existing = this.nodeHealthRecords.get(nodeId);
    const now = timestamp ?? Date.now();

    const restartAttempts =
      status === "healthy" && (existing?.status === "healthy" || existing?.status === "recovering")
        ? 0
        : (existing?.restartAttempts ?? 0);

    const record: NodeHealthRecord = {
      nodeId,
      status,
      lastHeartbeat: now,
      restartAttempts,
      nextRestartTime: status === "healthy" ? undefined : existing?.nextRestartTime,
      consecutiveFailures: status === "healthy" ? 0 : (existing?.consecutiveFailures ?? 0) + 1,
      metrics: {
        ...(existing?.metrics ?? {}),
        ...(metrics ?? {}),
      },
    };

    this.nodeHealthRecords.set(nodeId, record);

    if (existing?.status !== status) {
      this.emitEvent("health_changed", { nodeId, from: existing?.status, to: status });
    }

    this.emitEvent("heartbeat", { nodeId, status, timestamp: now });
    return record;
  }

  public getNodeHealth(nodeId: string): NodeHealthRecord | undefined {
    return this.nodeHealthRecords.get(nodeId);
  }

  public getAllNodeHealth(): Record<string, NodeHealthRecord> {
    const res: Record<string, NodeHealthRecord> = {};
    for (const [id, rec] of this.nodeHealthRecords.entries()) {
      res[id] = { ...rec };
    }
    return res;
  }

  public calculateBackoffMs(attempt: number): number {
    if (!Number.isFinite(attempt) || attempt <= 0) {
      return this.config.backoffBaseMs;
    }
    const exponent = Math.max(0, attempt - 1);
    const backoff = this.config.backoffBaseMs * Math.pow(this.config.backoffMultiplier, exponent);
    if (!Number.isFinite(backoff) || backoff >= this.config.backoffMaxMs) {
      return this.config.backoffMaxMs;
    }
    return Math.max(this.config.backoffBaseMs, Math.min(this.config.backoffMaxMs, backoff));
  }

  public checkHeartbeats(
    graph?: GraphDataset,
    now: number = Date.now(),
  ): {
    deadNodes: string[];
    degradedNodes: string[];
    recoveringNodes: string[];
    actionsTaken: RemediationRecord[];
  } {
    const deadNodes: string[] = [];
    const degradedNodes: string[] = [];
    const recoveringNodes: string[] = [];
    const actionsTaken: RemediationRecord[] = [];

    // Check all tracked nodes, as well as nodes present in the graph
    const trackedNodeIds = new Set<string>(this.nodeHealthRecords.keys());
    if (graph) {
      for (const node of graph.nodes) {
        trackedNodeIds.add(node.id);
      }
    }

    for (const nodeId of trackedNodeIds) {
      let record = this.nodeHealthRecords.get(nodeId);
      if (!record) {
        record = {
          nodeId,
          status: "healthy",
          lastHeartbeat: now,
          restartAttempts: 0,
          consecutiveFailures: 0,
        };
        this.nodeHealthRecords.set(nodeId, record);
      }

      const elapsed = now - record.lastHeartbeat;

      if (record.status === "recovering") {
        if (record.nextRestartTime && now >= record.nextRestartTime) {
          recoveringNodes.push(nodeId);
        }
      } else if (elapsed > this.config.deadNodeTimeoutMs) {
        if (record.status !== "dead") {
          record.status = "dead";
          this.emitEvent("health_changed", { nodeId, from: "degraded", to: "dead" });
          this.addAuditLog(
            "heartbeat_timeout",
            `Node ${nodeId} heartbeat timed out (${elapsed}ms)`,
            nodeId,
            {
              elapsed,
            },
          );
        }
        deadNodes.push(nodeId);

        if (this.isEnabled && this.config.autoRemediationEnabled) {
          const restartRecord = this.triggerAutoRestart(nodeId, graph);
          if (restartRecord) {
            actionsTaken.push(restartRecord);
          }
        }
      } else if (elapsed > this.config.degradedNodeTimeoutMs) {
        if (record.status === "healthy") {
          record.status = "degraded";
          this.emitEvent("health_changed", { nodeId, from: "healthy", to: "degraded" });
        }
        degradedNodes.push(nodeId);
      }
    }

    return { deadNodes, degradedNodes, recoveringNodes, actionsTaken };
  }

  public triggerAutoRestart(nodeId: string, graph?: GraphDataset): RemediationRecord | undefined {
    const record = this.nodeHealthRecords.get(nodeId);
    if (!record) return undefined;

    if (record.restartAttempts >= this.config.maxRestartAttempts) {
      const incident = this.createIncident({
        title: `Dead Node Max Restarts Exceeded: ${nodeId}`,
        description: `Node ${nodeId} has failed to restart after ${record.restartAttempts} attempts. Auto-remediation halted.`,
        severity: "critical",
        nodeId,
        initialSnapshot: graph,
      });

      this.addAuditLog(
        "incident_created",
        `Max restart attempts reached for ${nodeId}; incident ${incident.id} opened`,
        nodeId,
        { attempts: record.restartAttempts },
      );

      return {
        action: "restart_node",
        timestamp: Date.now(),
        success: false,
        targetId: nodeId,
        error: `Exceeded max restart attempts (${this.config.maxRestartAttempts})`,
      };
    }

    record.restartAttempts += 1;
    const backoffMs = this.calculateBackoffMs(record.restartAttempts);
    record.status = "recovering";
    record.nextRestartTime = Date.now() + backoffMs;

    this.addAuditLog(
      "node_restart_scheduled",
      `Scheduling restart for node ${nodeId} (Attempt ${record.restartAttempts}/${this.config.maxRestartAttempts}, Backoff: ${backoffMs}ms)`,
      nodeId,
      { attempt: record.restartAttempts, backoffMs, nextRestartTime: record.nextRestartTime },
    );

    let success = true;
    let errMessage: string | undefined;

    if (this.nodeRestarter) {
      try {
        const res = this.nodeRestarter(nodeId);
        if (typeof res === "boolean") {
          success = res;
        }
      } catch (err: unknown) {
        success = false;
        errMessage = err instanceof Error ? err.message : String(err);
      }
    }

    const remediationRecord: RemediationRecord = {
      action: "restart_node",
      timestamp: Date.now(),
      success,
      targetId: nodeId,
      details: { attempt: record.restartAttempts, backoffMs },
      error: errMessage,
    };

    this.emitEvent("node_restarted", { nodeId, attempt: record.restartAttempts, success });
    return remediationRecord;
  }

  /* -------------------------------------------------------------------------- */
  /* Fallback Routing for Broken Edge Paths                                     */
  /* -------------------------------------------------------------------------- */

  public registerFallbackRoute(
    originalEdgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    fallbackTargetNodeId: string,
    reason: string = "Manual configuration",
  ): FallbackRoute {
    const route: FallbackRoute = {
      originalEdgeId,
      sourceNodeId,
      targetNodeId,
      fallbackTargetNodeId,
      active: false,
      reason,
      createdAt: Date.now(),
    };
    this.fallbackRoutes.set(originalEdgeId, route);
    return route;
  }

  public activateFallbackRoute(originalEdgeId: string, reason?: string): FallbackRoute | undefined {
    const route = this.fallbackRoutes.get(originalEdgeId);
    if (!route) return undefined;

    route.active = true;
    route.activatedAt = Date.now();
    if (reason) {
      route.reason = reason;
    }

    this.addAuditLog(
      "fallback_route_activated",
      `Activated fallback route for edge ${originalEdgeId}: redirecting ${route.sourceNodeId} -> ${route.fallbackTargetNodeId} (was ${route.targetNodeId})`,
      originalEdgeId,
      { route },
    );

    this.emitEvent("fallback_route_changed", { action: "activated", route });
    return route;
  }

  public deactivateFallbackRoute(originalEdgeId: string): FallbackRoute | undefined {
    const route = this.fallbackRoutes.get(originalEdgeId);
    if (!route) return undefined;

    route.active = false;

    this.addAuditLog(
      "fallback_route_deactivated",
      `Deactivated fallback route for edge ${originalEdgeId}: traffic restored to original target ${route.targetNodeId}`,
      originalEdgeId,
      { route },
    );

    this.emitEvent("fallback_route_changed", { action: "deactivated", route });
    return route;
  }

  public getEffectiveTarget(
    sourceNodeId: string,
    originalTargetId: string,
    edgeId?: string,
  ): string {
    if (edgeId) {
      const route = this.fallbackRoutes.get(edgeId);
      if (route && route.active) {
        route.trafficCount = (route.trafficCount ?? 0) + 1;
        return route.fallbackTargetNodeId;
      }
    }

    for (const route of this.fallbackRoutes.values()) {
      if (
        route.active &&
        route.sourceNodeId === sourceNodeId &&
        route.targetNodeId === originalTargetId
      ) {
        route.trafficCount = (route.trafficCount ?? 0) + 1;
        return route.fallbackTargetNodeId;
      }
    }

    return originalTargetId;
  }

  public getFallbackRoutes(): Record<string, FallbackRoute> {
    const result: Record<string, FallbackRoute> = {};
    for (const [id, route] of this.fallbackRoutes.entries()) {
      result[id] = { ...route };
    }
    return result;
  }

  public autoRouteAroundDeadNode(deadNodeId: string, graph: GraphDataset): FallbackRoute[] {
    const activatedRoutes: FallbackRoute[] = [];
    const deadNode = graph.nodes.find((n) => n.id === deadNodeId);
    const candidateNodes = graph.nodes.filter(
      (n: GraphNodeData) =>
        n.id !== deadNodeId &&
        (deadNode ? n.kind === deadNode.kind : true) &&
        (n.status === "success" || n.status === "running" || n.status === "pending"),
    );

    if (candidateNodes.length === 0) {
      return activatedRoutes;
    }

    const fallbackTarget = candidateNodes[0].id;

    for (const edge of graph.edges) {
      if (edge.target === deadNodeId) {
        let route = this.fallbackRoutes.get(edge.id);
        if (!route) {
          route = this.registerFallbackRoute(
            edge.id,
            edge.source,
            deadNodeId,
            fallbackTarget,
            `Auto-routed around dead node ${deadNodeId}`,
          );
        }
        this.activateFallbackRoute(edge.id, `Dead node ${deadNodeId} detection`);
        activatedRoutes.push(route);
      }
    }

    return activatedRoutes;
  }

  /* -------------------------------------------------------------------------- */
  /* Incident Lifecycle Management                                              */
  /* -------------------------------------------------------------------------- */

  public createIncident(
    data: Omit<Incident, "id" | "detectedAt" | "status" | "remediationsApplied"> & {
      id?: string;
      detectedAt?: number;
      status?: Incident["status"];
    },
  ): Incident {
    const id = data.id ?? `inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const detectedAt = data.detectedAt ?? Date.now();
    const status = data.status ?? "detected";

    const incident: Incident = {
      id,
      title: data.title,
      description: data.description,
      severity: data.severity,
      status,
      nodeId: data.nodeId,
      edgeId: data.edgeId,
      sourceAnomalyId: data.sourceAnomalyId,
      anomalyType: data.anomalyType,
      detectedAt,
      remediationsApplied: [],
      initialSnapshot: data.initialSnapshot,
      finalSnapshot: data.finalSnapshot,
      metadata: data.metadata,
    };

    this.incidents.set(id, incident);

    if (incident.initialSnapshot) {
      this.recorder.createSession(incident, incident.initialSnapshot);
    }

    this.addAuditLog(
      "incident_created",
      `Incident created [${incident.severity.toUpperCase()}]: ${incident.title}`,
      incident.nodeId ?? incident.edgeId,
      { incidentId: id },
    );

    this.emitEvent("incident_created", incident);
    return incident;
  }

  public getIncident(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  public getAllIncidents(): Incident[] {
    return Array.from(this.incidents.values());
  }

  public getActiveIncidents(): Incident[] {
    return Array.from(this.incidents.values()).filter(
      (inc) =>
        inc.status === "detected" || inc.status === "remediating" || inc.status === "remediated",
    );
  }

  public resolveIncident(incidentId: string, finalSnapshot?: GraphDataset): Incident | undefined {
    const incident = this.incidents.get(incidentId);
    if (!incident) return undefined;

    incident.status = "resolved";
    incident.resolvedAt = Date.now();
    if (finalSnapshot) {
      incident.finalSnapshot = finalSnapshot;
      const session = this.recorder.getSessionByIncidentId(incidentId);
      if (session) {
        this.recorder.recordStep(session.id, {
          timestamp: incident.resolvedAt,
          type: "resolved",
          description: `Incident resolved: ${incident.title}`,
          snapshot: finalSnapshot,
        });
      }
    }

    this.addAuditLog(
      "incident_resolved",
      `Incident ${incidentId} resolved: ${incident.title}`,
      incident.nodeId ?? incident.edgeId,
      { incidentId },
    );

    this.emitEvent("incident_resolved", incident);
    return incident;
  }

  /* -------------------------------------------------------------------------- */
  /* Playbook & Anomaly Integration                                             */
  /* -------------------------------------------------------------------------- */

  public registerPlaybook(rule: PlaybookRule): void {
    this.playbooks.set(rule.id, rule);
  }

  public removePlaybook(ruleId: string): void {
    this.playbooks.delete(ruleId);
  }

  public getPlaybooks(): PlaybookRule[] {
    return Array.from(this.playbooks.values()).sort((a, b) => b.priority - a.priority);
  }

  public async handleAnomaly(
    anomaly: AnomalyFinding,
    graph?: GraphDataset,
  ): Promise<RemediationResult[]> {
    if (!this.isEnabled || !this.config.autoRemediationEnabled) {
      return [];
    }

    const severityMap: Record<string, IncidentSeverity> = {
      critical: "critical",
      error: "high",
      warning: "medium",
      info: "low",
    };

    const incidentSeverity = severityMap[anomaly.severity] ?? "medium";

    const incident = this.createIncident({
      title: `Anomaly Detected: ${anomaly.title}`,
      description: anomaly.description,
      severity: incidentSeverity,
      sourceAnomalyId: anomaly.id,
      anomalyType: anomaly.type,
      nodeId: anomaly.nodeIds?.[0],
      edgeId: anomaly.edgeIds?.[0],
      initialSnapshot: graph,
    });

    const context: PlaybookContext = {
      incident,
      anomaly,
      nodeId: anomaly.nodeIds?.[0],
      edgeId: anomaly.edgeIds?.[0],
      graph,
    };

    const results: RemediationResult[] = [];
    const matchedPlaybooks = this.getPlaybooks().filter((p) => {
      if (!p.enabled) return false;
      if (p.triggerOnAnomalyTypes && !p.triggerOnAnomalyTypes.includes(anomaly.type)) {
        return false;
      }
      if (p.triggerOnSeverities && !p.triggerOnSeverities.includes(incidentSeverity)) {
        return false;
      }
      if (p.cooldownMs > 0 && p.lastTriggeredAt) {
        if (Date.now() - p.lastTriggeredAt < p.cooldownMs) {
          return false;
        }
      }
      if (p.condition && !p.condition(context)) {
        return false;
      }
      return true;
    });

    for (const playbook of matchedPlaybooks) {
      playbook.lastTriggeredAt = Date.now();
      this.addAuditLog(
        "playbook_triggered",
        `Triggered playbook "${playbook.name}" for anomaly ${anomaly.type}`,
        context.nodeId,
        { playbookId: playbook.id, anomalyId: anomaly.id },
      );

      if (playbook.customRemediator) {
        const customResults = await playbook.customRemediator(context);
        for (const res of customResults) {
          results.push(res);
          incident.remediationsApplied.push({
            action: res.action,
            timestamp: Date.now(),
            success: res.success,
            targetId: res.targetId,
            details: res.details,
            error: res.error,
          });
        }
      } else {
        for (const action of playbook.actions) {
          const res = await this.executeRemediationAction(action, context);
          results.push(res);
          incident.remediationsApplied.push({
            action: res.action,
            timestamp: Date.now(),
            success: res.success,
            targetId: res.targetId,
            details: res.details,
            error: res.error,
          });
        }
      }
    }

    if (results.some((r) => r.success)) {
      incident.status = "remediated";
      incident.remediatedAt = Date.now();
    } else if (results.length > 0) {
      incident.status = "failed";
    }

    return results;
  }

  public async executeRemediationAction(
    action: RemediationAction,
    context: PlaybookContext,
  ): Promise<RemediationResult> {
    const targetId = context.nodeId ?? context.edgeId;

    switch (action) {
      case "restart_node": {
        if (!context.nodeId) {
          return { action, success: false, error: "No target nodeId specified for restart" };
        }
        const restartRecord = this.triggerAutoRestart(context.nodeId, context.graph);
        return {
          action,
          success: restartRecord ? restartRecord.success : false,
          targetId: context.nodeId,
          message: `Attempted auto-restart on node ${context.nodeId}`,
          details: restartRecord?.details,
          error: restartRecord?.error,
        };
      }

      case "trip_circuit": {
        const breakerId = targetId ?? "default_circuit";
        this.circuitBreakers.trip(breakerId, "Auto-remediation triggered circuit trip");
        return {
          action,
          success: true,
          targetId: breakerId,
          message: `Tripped circuit breaker ${breakerId}`,
        };
      }

      case "reset_circuit": {
        const breakerId = targetId ?? "default_circuit";
        this.circuitBreakers.reset(breakerId);
        return {
          action,
          success: true,
          targetId: breakerId,
          message: `Reset circuit breaker ${breakerId}`,
        };
      }

      case "fallback_route": {
        if (context.graph && context.nodeId) {
          const routes = this.autoRouteAroundDeadNode(context.nodeId, context.graph);
          return {
            action,
            success: routes.length > 0,
            targetId: context.nodeId,
            message: `Activated ${routes.length} fallback routes around node ${context.nodeId}`,
            details: { routesCount: routes.length },
          };
        } else if (context.edgeId) {
          const route = this.activateFallbackRoute(context.edgeId, "Playbook fallback");
          return {
            action,
            success: route !== undefined,
            targetId: context.edgeId,
            message: `Activated fallback for edge ${context.edgeId}`,
          };
        }
        return { action, success: false, error: "Insufficient context for fallback routing" };
      }

      case "restore_route": {
        if (context.edgeId) {
          const route = this.deactivateFallbackRoute(context.edgeId);
          return {
            action,
            success: route !== undefined,
            targetId: context.edgeId,
            message: `Restored original route for edge ${context.edgeId}`,
          };
        }
        return { action, success: false, error: "No edgeId for route restoration" };
      }

      case "throttle":
      case "isolate_node":
      case "drain_queue":
      case "scale_up":
      case "prune_context":
      case "noop": {
        this.addAuditLog(
          "remediation_executed",
          `Executed action "${action}" on ${targetId ?? "global"}`,
          targetId,
          { context: { nodeId: context.nodeId, edgeId: context.edgeId } },
        );
        return {
          action,
          success: true,
          targetId,
          message: `Remediation action "${action}" executed successfully`,
        };
      }

      default:
        return { action, success: false, error: `Unknown remediation action "${action}"` };
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Event Emitter & Audit Log                                                  */
  /* -------------------------------------------------------------------------- */

  public on<T = unknown>(
    event: SelfHealingEventType,
    listener: SelfHealingEventListener<T>,
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    const set = this.eventListeners.get(event)!;
    set.add(listener as SelfHealingEventListener<unknown>);
    return () => {
      set.delete(listener as SelfHealingEventListener<unknown>);
    };
  }

  public off<T = unknown>(
    event: SelfHealingEventType,
    listener: SelfHealingEventListener<T>,
  ): void {
    const set = this.eventListeners.get(event);
    if (set) {
      set.delete(listener as SelfHealingEventListener<unknown>);
    }
  }

  private emitEvent(event: SelfHealingEventType, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch {
          // Suppress listener error
        }
      }
    }
  }

  public addAuditLog(
    type: SelfHealingAuditLogEntry["type"],
    message: string,
    targetId?: string,
    details?: Record<string, unknown>,
  ): SelfHealingAuditLogEntry {
    const entry: SelfHealingAuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      type,
      message,
      targetId,
      details,
    };

    this.auditLog.unshift(entry);
    if (this.auditLog.length > this.config.maxAuditLogHistory) {
      this.auditLog.length = this.config.maxAuditLogHistory;
    }

    this.emitEvent("audit_log", entry);
    return entry;
  }

  public getAuditLog(): SelfHealingAuditLogEntry[] {
    return [...this.auditLog];
  }

  public clearAuditLog(): void {
    this.auditLog = [];
  }

  public startHeartbeatMonitor(intervalMs?: number): void {
    this.stopHeartbeatMonitor();
    const interval = intervalMs ?? this.config.heartbeatIntervalMs;
    this.heartbeatIntervalTimer = setInterval(() => {
      this.checkHeartbeats();
    }, interval);
  }

  public stopHeartbeatMonitor(): void {
    if (this.heartbeatIntervalTimer !== undefined) {
      clearInterval(this.heartbeatIntervalTimer);
      this.heartbeatIntervalTimer = undefined;
    }
  }

  public dispose(): void {
    this.stopHeartbeatMonitor();
    this.replayEngine.pause();
    this.circuitBreakers.clear();
    this.eventListeners.clear();
  }

  /* -------------------------------------------------------------------------- */
  /* Default Built-in Playbooks                                                */
  /* -------------------------------------------------------------------------- */

  private registerDefaultPlaybooks(): void {
    this.registerPlaybook({
      id: "pb_dead_node_restart",
      name: "Dead Node Auto-Restart",
      description: "Automatically schedules restart for dead or timed-out nodes",
      enabled: true,
      priority: 100,
      cooldownMs: 5000,
      triggerOnAnomalyTypes: ["zombie_lease", "stranded_distributed_lock"],
      actions: ["restart_node"],
    });

    this.registerPlaybook({
      id: "pb_error_cascade_circuit_breaker",
      name: "Error Cascade Circuit Breaker",
      description: "Trips circuit breaker when error cascade or runaway retry loop is detected",
      enabled: true,
      priority: 90,
      cooldownMs: 10000,
      triggerOnAnomalyTypes: ["error_cascade", "runaway_retry_loop"],
      actions: ["trip_circuit"],
    });

    this.registerPlaybook({
      id: "pb_latency_bottleneck_fallback",
      name: "Latency Bottleneck Fallback Route",
      description: "Reroutes traffic through fallback edges when latency bottlenecks occur",
      enabled: true,
      priority: 80,
      cooldownMs: 15000,
      triggerOnAnomalyTypes: ["latency_bottleneck"],
      actions: ["fallback_route"],
    });

    this.registerPlaybook({
      id: "pb_token_spike_throttle",
      name: "Cognitive Token Spike Throttle",
      description: "Throttles node and prunes context on sudden token consumption spikes",
      enabled: true,
      priority: 70,
      cooldownMs: 20000,
      triggerOnAnomalyTypes: ["cognitive_token_spike", "unbounded_growth"],
      actions: ["throttle", "prune_context"],
    });
  }

  private handleCircuitBreakerStateChange(
    id: string,
    from: CircuitBreakerState,
    to: CircuitBreakerState,
  ): void {
    this.addAuditLog(
      "circuit_state_changed",
      `Circuit breaker "${id}" state changed: ${from} -> ${to}`,
      id,
      { from, to },
    );
    this.emitEvent("circuit_state_changed", { id, from, to });
  }
}
