import type { FC } from "react";
import { memo } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { MAX_DESCRIPTION_LINES, selectDescription } from "./nodeCardModel";

export interface NodeCardDescriptionProps {
  node: GraphNodeData;
}

/**
 * The node's purpose, in prose, clamped to `MAX_DESCRIPTION_LINES`.
 *
 * This row is the reason the old card looked padded and empty: the measurer reserved three lines
 * for a description the DOM never rendered. It is rendered now, and both sides read the same
 * selector, so the reserved height and the drawn text always agree.
 */
export const NodeCardDescription: FC<NodeCardDescriptionProps> = memo(({ node }) => {
  const [description] = selectDescription(node);
  if (!description) {
    return null;
  }

  return (
    <p
      className="node-card-description"
      style={{ WebkitLineClamp: MAX_DESCRIPTION_LINES }}
      title={description}
    >
      {description}
    </p>
  );
});

NodeCardDescription.displayName = "NodeCardDescription";
