import type { FC } from "react";
import { memo } from "react";
import { IconFiles } from "@tabler/icons-react";
import type { GraphNodeData } from "../../../types/graphData";

export interface NodeCardFilesProps {
  node: GraphNodeData;
}

/**
 * Condensed high-signal line churn summary chip (+900, -300 lines in N files).
 * Exhaustive file lists and syntax-highlighted diffs are housed in the detail drawer.
 */
export const NodeCardFiles: FC<NodeCardFilesProps> = memo(({ node }) => {
  const filesCount = node.files?.length ?? 0;
  const writeScope = (node.metadata?.writeScope as string[]) ?? [];
  if (filesCount === 0 && writeScope.length === 0) {
    return null;
  }

  const totalAdd = node.files?.reduce((acc, f) => acc + (f.additions ?? 0), 0) ?? 0;
  const totalDel = node.files?.reduce((acc, f) => acc + (f.deletions ?? 0), 0) ?? 0;

  let churnText = "";
  if (totalAdd > 0 || totalDel > 0) {
    churnText = `+${totalAdd}, -${totalDel} lines (${filesCount} file${filesCount > 1 ? "s" : ""})`;
  } else if (filesCount > 0) {
    churnText = `${filesCount} file${filesCount > 1 ? "s" : ""} modified`;
  } else {
    churnText = `${writeScope.length} write scope${writeScope.length > 1 ? "s" : ""}`;
  }

  return (
    <div className="node-card-chip-row">
      <span
        className="node-chip node-chip--file-churn"
        title="Click node to view full file tree & diffs in drawer"
      >
        <IconFiles size={12} className="node-chip-icon" />
        <span className="node-chip-label">{churnText}</span>
      </span>
    </div>
  );
});

NodeCardFiles.displayName = "NodeCardFiles";
