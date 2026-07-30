import type { FC } from "react";
import type { NodeContext } from "../../../types/graphData";

export interface NodeCardContextProps {
  context?: NodeContext;
  metadata?: Record<string, unknown>;
}

export const NodeCardContext: FC<NodeCardContextProps> = ({ context, metadata }) => {
  const rows: Array<{ key: string; value: string }> = [];

  if (context?.repoPath) {
    rows.push({ key: "Repo Path", value: context.repoPath });
  }

  if (context) {
    for (const [k, v] of Object.entries(context)) {
      if (k === "repoPath" || k === "previousOutputs") continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        rows.push({ key: k, value: String(v) });
      }
    }
  }

  if (metadata) {
    const skippedKeys = new Set(["prompt", "logs", "payload", "rawPayload", "status"]);
    for (const [k, v] of Object.entries(metadata)) {
      if (skippedKeys.has(k)) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        rows.push({ key: k, value: String(v) });
      }
    }
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="node-card-context">
      {rows.map((row, index) => (
        <div key={`${row.key}-${index}`} className="node-card-context-row">
          <span className="context-key">{row.key}:</span>
          <span className="context-value" title={row.value}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
};
