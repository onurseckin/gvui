import type { FC } from "react";
import { memo } from "react";
import type { GraphNodeData } from "../../../types/graphData";

export interface NodeCardTitleProps {
  node: GraphNodeData;
}

export const NodeCardTitle: FC<NodeCardTitleProps> = memo(({ node }) => {
  if (!node.name) return null;

  return (
    <h3 className="node-card-title" title={node.name}>
      {node.name}
    </h3>
  );
});

NodeCardTitle.displayName = "NodeCardTitle";
