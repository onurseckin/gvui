import type { GraphDataset, GraphNodeData } from "../../../types/graphData";
import type { AnomalyFinding, AnomalyThresholds, AnomalyDetectorFn } from "../types";

function parseExpirationMs(node: GraphNodeData): number | null {
  const leaseObj =
    typeof node.metadata?.lease === "object" && node.metadata?.lease !== null
      ? (node.metadata.lease as Record<string, unknown>)
      : null;

  const expiresAt =
    node.metadata?.expiresAt ||
    node.metadata?.expires_at ||
    (leaseObj ? leaseObj.expires_at || leaseObj.expiresAt : null);

  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
    return expiresAt;
  }
  if (typeof expiresAt === "string") {
    const parsed = Date.parse(expiresAt);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

export const detectStrandedLocks: AnomalyDetectorFn = (
  dataset: GraphDataset,
  thresholds: AnomalyThresholds,
): AnomalyFinding[] => {
  const findings: AnomalyFinding[] = [];
  const nodes = dataset.nodes || [];
  const edges = dataset.edges || [];

  // Build downstream dependency map (nodeId -> dependent nodeIds)
  const downstreamMap = new Map<string, string[]>();
  for (const edge of edges) {
    const list = downstreamMap.get(edge.source) || [];
    list.push(edge.target);
    downstreamMap.set(edge.source, list);
  }

  const nodeMap = new Map<string, GraphNodeData>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const now = Date.now();

  for (const node of nodes) {
    const status = node.status;
    const isUnderExecution =
      status === "running" ||
      status === "pending" ||
      node.provenance?.status === "leased" ||
      node.provenance?.status === "running";

    // Extract lease details
    const leaseToken =
      node.metadata?.leaseToken ||
      node.provenance?.leaseToken ||
      (typeof node.metadata?.lease === "object" && node.metadata?.lease !== null
        ? ((node.metadata.lease as Record<string, unknown>).token as string | undefined)
        : undefined);

    const leaseAgent =
      node.metadata?.leaseAgent ||
      node.provenance?.actorId ||
      node.provenance?.agent ||
      (typeof node.metadata?.hostAgent === "object" ? node.metadata.hostAgent?.name : undefined);

    const rawDuration =
      typeof node.metrics?.durationMs === "number"
        ? node.metrics.durationMs
        : typeof node.metadata?.durationMs === "number"
          ? node.metadata.durationMs
          : typeof node.metrics?.timingBreakdown?.wallDurationMs === "number"
            ? node.metrics.timingBreakdown.wallDurationMs
            : 0;

    const durationMs = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;

    const expirationTimestamp = parseExpirationMs(node);
    const isExplicitlyExpired = expirationTimestamp !== null && expirationTimestamp < now;

    // Check for expired or stranded leases
    const hasLease = Boolean(leaseToken || leaseAgent || expirationTimestamp !== null);
    const isExceededTimeout = durationMs > thresholds.leaseTimeoutMs || isExplicitlyExpired;

    // Check if downstream nodes are waiting in pending
    const downstreamIds = downstreamMap.get(node.id) || [];
    const blockedPendingDownstreams = downstreamIds.filter((id) => {
      const dep = nodeMap.get(id);
      return dep?.status === "pending";
    });

    if (hasLease && isUnderExecution && isExceededTimeout) {
      const isCritical = blockedPendingDownstreams.length > 0;
      const severity = isCritical ? "critical" : "error";
      const impactScore = Math.min(100, Math.round(75 + blockedPendingDownstreams.length * 10));

      findings.push({
        id: `anomaly-lock-timeout-${node.id}`,
        type: "stranded_distributed_lock",
        category: "execution",
        severity,
        title: `Stranded Distributed Lock on Node ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" has held active lease "${leaseToken || leaseAgent || "active-lease"}" ${
          isExplicitlyExpired
            ? `which expired at ${new Date(expirationTimestamp!).toISOString()}`
            : `for ${(durationMs / 1000).toFixed(0)}s (limit: ${thresholds.leaseTimeoutMs / 1000}s)`
        } without concluding execution.${
          blockedPendingDownstreams.length > 0
            ? ` It is currently blocking ${blockedPendingDownstreams.length} downstream dependent tasks.`
            : ""
        }`,
        nodeIds: [node.id, ...blockedPendingDownstreams],
        impactScore,
        metricValue: durationMs > 0 ? durationMs : thresholds.leaseTimeoutMs,
        thresholdValue: thresholds.leaseTimeoutMs,
        unit: "ms",
        remediation: {
          action: "Evict Stranded Lease & Re-Queue Task",
          suggestion: `Forcibly revoke lease token "${leaseToken || "active-lock"}" from agent "${leaseAgent || "unknown"}", evict the stale lock, and reschedule node ${node.id}.`,
          autoFixable: true,
          quickFix: {
            type: "evict_lease",
            targetId: node.id,
            patch: {
              status: "pending",
              leaseToken: undefined,
              leaseAgent: undefined,
            },
          },
        },
        evidence: {
          metrics: {
            durationMs,
            leaseTimeoutMs: thresholds.leaseTimeoutMs,
            blockedDownstreamCount: blockedPendingDownstreams.length,
            isExplicitlyExpired,
          },
          relatedNodes: [node.id, ...blockedPendingDownstreams],
          logs: [
            `Lease ${leaseToken ?? "held"} by ${leaseAgent ?? "unknown"} timed out after ${durationMs}ms`,
          ],
          confidence: 0.98,
        },
        timestamp: now,
      });
    } else if (
      (status === "error" || status === "skipped") &&
      leaseToken &&
      node.provenance?.status === "leased"
    ) {
      // Zombie lease: terminal status in node but lease not released
      findings.push({
        id: `anomaly-zombie-lease-${node.id}`,
        type: "zombie_lease",
        category: "execution",
        severity: "error",
        title: `Zombie Lease Retained on Terminal Node ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" reached terminal status "${status}" but lease token "${leaseToken}" was never officially released in provenance records.`,
        nodeIds: [node.id],
        impactScore: 60,
        remediation: {
          action: "Release Zombie Lease Token",
          suggestion: `Clean up lingering lease tokens on terminated node ${node.id} to avoid phantom concurrency count.`,
          autoFixable: true,
          quickFix: {
            type: "evict_lease",
            targetId: node.id,
          },
        },
        evidence: {
          metrics: {
            status,
            leaseToken,
          },
          relatedNodes: [node.id],
          confidence: 0.95,
        },
        timestamp: now,
      });
    } else if (hasLease && isUnderExecution && durationMs > thresholds.leaseTimeoutMs * 0.8) {
      // Warning for nearing timeout
      findings.push({
        id: `anomaly-lock-warn-${node.id}`,
        type: "stranded_distributed_lock",
        category: "execution",
        severity: "warning",
        title: `Lease Approaching Expiration on Node ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" has been executing for ${(durationMs / 1000).toFixed(0)}s (80% of ${thresholds.leaseTimeoutMs / 1000}s threshold).`,
        nodeIds: [node.id],
        impactScore: 40,
        metricValue: durationMs,
        thresholdValue: thresholds.leaseTimeoutMs,
        unit: "ms",
        remediation: {
          action: "Heartbeat Lease Renewal",
          suggestion: `Ensure worker agent is sending active heartbeats to prevent unexpected lease expiration.`,
          autoFixable: false,
        },
        evidence: {
          metrics: {
            durationMs,
            leaseTimeoutMs: thresholds.leaseTimeoutMs,
          },
          relatedNodes: [node.id],
          confidence: 0.75,
        },
        timestamp: now,
      });
    }
  }

  return findings;
};
