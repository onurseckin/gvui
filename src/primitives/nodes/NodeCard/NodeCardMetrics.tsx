import type { FC } from "react";
import { memo } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { selectMetricsLine } from "./nodeCardModel";

export interface NodeCardMetricsProps {
  node: GraphNodeData;
}

/**
 * The cost footer: tokens in/out, wall time, dollars, retries.
 *
 * Rendered dim and monospace, and last, because it is reference material rather than identity —
 * you read it once you have already found the node you care about. A node with no metrics (a plan
 * that has not run) renders nothing and costs no height.
 */
export const NodeCardMetrics: FC<NodeCardMetricsProps> = memo(({ node }) => {
  const [line] = selectMetricsLine(node);
  if (!line) {
    return null;
  }

  const hasRetries = typeof node.metrics?.retries === "number" && node.metrics.retries > 0;

  return (
    <div className={`node-card-metrics ${hasRetries ? "has-retries" : ""}`.trim()} title={line}>
      {line}
    </div>
  );
});

NodeCardMetrics.displayName = "NodeCardMetrics";
