import type { GraphDataset } from "../../../types/graphData";
import type { AnomalyFinding, AnomalyThresholds, AnomalyDetectorFn } from "../types";

export const detectRetryLoops: AnomalyDetectorFn = (
  dataset: GraphDataset,
  thresholds: AnomalyThresholds,
): AnomalyFinding[] => {
  const findings: AnomalyFinding[] = [];
  const nodes = dataset.nodes || [];
  const edges = dataset.edges || [];

  for (const node of nodes) {
    const retries = typeof node.metrics?.retries === "number" ? node.metrics.retries : 0;
    const repairRounds =
      typeof node.metrics?.repairRounds === "number"
        ? node.metrics.repairRounds
        : typeof node.metadata?.repairRounds === "number"
          ? node.metadata.repairRounds
          : 0;

    // Check provenance events for rejections/repairs
    const events = node.provenance?.events || node.events || node.timeline || [];
    let rejectionCount = 0;
    let maxAttempt = 0;

    for (const ev of events) {
      if (ev.status === "rejected" || ev.type === "rejection" || ev.type === "repair") {
        rejectionCount++;
      }
      if (typeof ev.attempt === "number" && ev.attempt > maxAttempt) {
        maxAttempt = ev.attempt;
      }
    }

    const totalRetries = Math.max(retries, rejectionCount, maxAttempt > 1 ? maxAttempt - 1 : 0);
    const totalRepairs = Math.max(repairRounds, rejectionCount);

    const isExcessiveRetries = totalRetries >= thresholds.maxRetries;
    const isExcessiveRepairs = totalRepairs >= thresholds.maxRepairRounds;
    const isCriticalLoop =
      totalRetries >= thresholds.maxRetries * 2 ||
      totalRepairs >= thresholds.maxRepairRounds * 2 ||
      (totalRetries >= 2 && totalRepairs >= 2);

    if (isExcessiveRetries || isExcessiveRepairs) {
      const severity = isCriticalLoop ? "critical" : "error";
      const impactScore = Math.min(100, Math.round(totalRetries * 20 + totalRepairs * 25));

      findings.push({
        id: `anomaly-retry-${node.id}`,
        type: "runaway_retry_loop",
        category: "execution",
        severity,
        title: `Runaway Retry Loop on Node ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" encountered ${totalRetries} retries and ${totalRepairs} repair rounds (thresholds: max ${thresholds.maxRetries} retries, ${thresholds.maxRepairRounds} repairs). Execution is at risk of infinite recursion.`,
        nodeIds: [node.id],
        impactScore,
        metricValue: totalRetries + totalRepairs,
        thresholdValue: thresholds.maxRetries,
        unit: "attempts",
        remediation: {
          action: "Trigger Circuit Breaker or Upgrade Model Tier",
          suggestion: `Node ${node.id} has repeatedly failed validation. Inspect the root cause error in node logs, upgrade the reasoning tier or adjust validation heuristics to unblock graph flow.`,
          autoFixable: true,
          quickFix: {
            type: "reset_retries",
            targetId: node.id,
            patch: {
              status: "warning",
              repairRounds: 0,
            },
          },
        },
        evidence: {
          metrics: {
            retries: totalRetries,
            repairRounds: totalRepairs,
            rejections: rejectionCount,
          },
          logs: node.logs ? [node.logs.slice(-300)] : [],
          relatedNodes: [node.id],
          confidence: 0.95,
        },
        timestamp: Date.now(),
      });
    } else if (totalRetries > 0 || totalRepairs > 0) {
      findings.push({
        id: `anomaly-retry-warn-${node.id}`,
        type: "runaway_retry_loop",
        category: "execution",
        severity: "warning",
        title: `Elevated Retries on Node ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" experienced ${totalRetries} retry and ${totalRepairs} repair rounds. Monitor for potential regression.`,
        nodeIds: [node.id],
        impactScore: Math.min(60, Math.round(totalRetries * 15 + totalRepairs * 20)),
        metricValue: totalRetries,
        thresholdValue: thresholds.maxRetries,
        unit: "attempts",
        remediation: {
          action: "Monitor Task Convergence",
          suggestion: `Node ${node.id} recovered after ${totalRetries} attempts. Review prompt constraints to prevent future retry spikes.`,
          autoFixable: false,
        },
        evidence: {
          metrics: {
            retries: totalRetries,
            repairRounds: totalRepairs,
          },
          relatedNodes: [node.id],
          confidence: 0.8,
        },
        timestamp: Date.now(),
      });
    }
  }

  // Inspect edge loop and feedback patterns
  for (const edge of edges) {
    if (edge.kind === "loop" || edge.kind === "pushback" || edge.isCycle) {
      const exchanges = edge.traffic?.exchanges || edge.exchanges || [];
      const rejectionExchanges = exchanges.filter(
        (ex) => ex.type === "rejection" || ex.type === "repair" || ex.verdict === "FAIL",
      );

      if (rejectionExchanges.length >= thresholds.maxRepairRounds) {
        findings.push({
          id: `anomaly-edge-loop-${edge.id}`,
          type: "runaway_retry_loop",
          category: "execution",
          severity:
            rejectionExchanges.length >= thresholds.maxRepairRounds * 2 ? "critical" : "error",
          title: `Cyclic Pushback Loop on Edge ${edge.id}`,
          description: `Edge between "${edge.source}" and "${edge.target}" has recorded ${rejectionExchanges.length} sequential rejection exchanges without convergence.`,
          nodeIds: [edge.source, edge.target],
          edgeIds: [edge.id],
          impactScore: Math.min(95, rejectionExchanges.length * 25),
          metricValue: rejectionExchanges.length,
          thresholdValue: thresholds.maxRepairRounds,
          unit: "exchanges",
          remediation: {
            action: "Short-Circuit Feedback Edge",
            suggestion: `Bypass the repeated pushback loop between ${edge.source} and ${edge.target} by establishing a deterministic fallback path.`,
            autoFixable: true,
            quickFix: {
              type: "break_cycle",
              targetId: edge.id,
            },
          },
          evidence: {
            relatedNodes: [edge.source, edge.target],
            relatedEdges: [edge.id],
            metrics: {
              rejectionExchanges: rejectionExchanges.length,
              totalExchanges: exchanges.length,
            },
            confidence: 0.9,
          },
          timestamp: Date.now(),
        });
      }
    }
  }

  return findings;
};
