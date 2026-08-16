import type { GraphDataset, GraphNodeData, GraphEdgeData } from "../../../types/graphData";
import type { AnomalyFinding, AnomalyThresholds, AnomalyDetectorFn } from "../types";

export function buildOutAdjacency(edges: GraphEdgeData[]): Map<string, string[]> {
  const outAdj = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outAdj.get(edge.source);
    if (list) {
      list.push(edge.target);
    } else {
      outAdj.set(edge.source, [edge.target]);
    }
  }
  return outAdj;
}

/**
 * Traverses downstream dependencies from a given node and returns all reachable descendant node IDs.
 */
export function computeDownstreamDescendants(
  dataset: GraphDataset,
  startNodeId: string,
  outAdj?: Map<string, string[]>,
): string[] {
  const adj = outAdj || buildOutAdjacency(dataset.edges || []);
  const visited = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const neighbors = adj.get(current) || [];
    for (const target of neighbors) {
      if (!visited.has(target) && target !== startNodeId) {
        visited.add(target);
        queue.push(target);
      }
    }
  }

  return Array.from(visited);
}

export const detectErrorCascades: AnomalyDetectorFn = (
  dataset: GraphDataset,
  _thresholds: AnomalyThresholds,
): AnomalyFinding[] => {
  const findings: AnomalyFinding[] = [];
  const nodes = dataset.nodes || [];
  const edges = dataset.edges || [];
  if (nodes.length === 0) return findings;

  const nodeMap = new Map<string, GraphNodeData>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const outAdj = buildOutAdjacency(edges);

  // 1. Error Cascades & Blast Radius
  const errorNodes = nodes.filter((n) => n.status === "error");

  for (const errorNode of errorNodes) {
    const downstreamIds = computeDownstreamDescendants(dataset, errorNode.id, outAdj);
    const affectedNodes = downstreamIds
      .map((id) => nodeMap.get(id))
      .filter(
        (n): n is GraphNodeData =>
          n !== undefined &&
          (n.status === "skipped" || n.status === "error" || n.status === "pending"),
      );

    if (affectedNodes.length > 0) {
      const blastRadiusRatio = nodes.length > 0 ? affectedNodes.length / nodes.length : 0;
      const isCritical = affectedNodes.length >= 3 || blastRadiusRatio >= 0.35;

      findings.push({
        id: `anomaly-error-cascade-${errorNode.id}`,
        type: "error_cascade",
        category: "quality",
        severity: isCritical ? "critical" : "error",
        title: `Error Cascade & Blast Radius from ${errorNode.name || errorNode.id}`,
        description: `Primary failure on node "${errorNode.name || errorNode.id}" cascaded downstream, affecting ${affectedNodes.length} dependent tasks (${(blastRadiusRatio * 100).toFixed(0)}% graph blast radius).`,
        nodeIds: [errorNode.id, ...affectedNodes.map((n) => n.id)],
        impactScore: Math.min(100, Math.round(50 + blastRadiusRatio * 50)),
        metricValue: affectedNodes.length,
        thresholdValue: 1,
        unit: "affected nodes",
        remediation: {
          action: "Fix Root Cause Failure & Resubmit Downstream Subgraph",
          suggestion: `Remediate error in root task ${errorNode.id} to unblock downstream tasks: ${affectedNodes.map((n) => n.name || n.id).join(", ")}.`,
          autoFixable: false,
        },
        evidence: {
          metrics: {
            rootErrorNode: errorNode.id,
            affectedNodeCount: affectedNodes.length,
            blastRadiusPercentage: Number((blastRadiusRatio * 100).toFixed(1)),
          },
          relatedNodes: [errorNode.id, ...affectedNodes.map((n) => n.id)],
          logs: errorNode.logs ? [errorNode.logs.slice(-200)] : [],
          confidence: 0.96,
        },
        timestamp: Date.now(),
      });
    }
  }

  // 2. Contract & Integrity Violations
  for (const node of nodes) {
    // Check 2a: Node marked "success" but commands failed with non-zero exit codes
    const commands = node.metadata?.commands || [];
    const failedCommands = commands.filter(
      (cmd) => typeof cmd.exitCode === "number" && cmd.exitCode !== 0,
    );

    if (node.status === "success" && failedCommands.length > 0) {
      findings.push({
        id: `anomaly-contract-exitcode-${node.id}`,
        type: "contract_violation",
        category: "quality",
        severity: "critical",
        title: `Contract Violation: False Success with Failed Commands on ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" reported status "success", but ${failedCommands.length} underlying shell command(s) exited with non-zero exit code (${failedCommands.map((c) => `exit ${c.exitCode}`).join(", ")}).`,
        nodeIds: [node.id],
        impactScore: 90,
        metricValue: failedCommands.length,
        thresholdValue: 0,
        unit: "failed commands",
        remediation: {
          action: "Audit Command Execution & Enforce Exit Gates",
          suggestion: `Node ${node.id} swallowed command errors without proper error handling. Update task status to reflect actual command exit status.`,
          autoFixable: true,
          quickFix: {
            type: "reset_retries",
            targetId: node.id,
            patch: {
              status: "error",
            },
          },
        },
        evidence: {
          metrics: {
            failedCommandCount: failedCommands.length,
            exitCodes: failedCommands.map((c) => c.exitCode).join(", "),
          },
          logs: failedCommands.map(
            (c) => c.stderrSnippet || c.stdoutSnippet || `Command ${c.id} failed`,
          ),
          relatedNodes: [node.id],
          confidence: 0.99,
        },
        timestamp: Date.now(),
      });
    }

    // Check 2b: Node marked "success" but has open critical findings
    const findingsList = node.metadata?.findings || [];
    const openCriticalFindings = findingsList.filter(
      (f) => f.severity === "critical" && f.status === "open",
    );

    if (node.status === "success" && openCriticalFindings.length > 0) {
      findings.push({
        id: `anomaly-contract-findings-${node.id}`,
        type: "contract_violation",
        category: "quality",
        severity: "critical",
        title: `Contract Violation: Unresolved Critical Findings on ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" completed with status "success" while retaining ${openCriticalFindings.length} open critical audit finding(s): ${openCriticalFindings.map((f) => f.observation).join("; ")}.`,
        nodeIds: [node.id],
        impactScore: 95,
        metricValue: openCriticalFindings.length,
        thresholdValue: 0,
        unit: "critical findings",
        remediation: {
          action: "Require Audit Finding Resolution Before Signoff",
          suggestion: `Resolve all open critical findings on node ${node.id} before advancing graph execution.`,
          autoFixable: false,
        },
        evidence: {
          metrics: {
            openCriticalFindingCount: openCriticalFindings.length,
          },
          relatedNodes: [node.id],
          confidence: 1.0,
        },
        timestamp: Date.now(),
      });
    }
  }

  return findings;
};
