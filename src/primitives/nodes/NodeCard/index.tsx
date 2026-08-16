import type { FC, MouseEvent } from "react";
import { memo, useCallback } from "react";

import "./NodeCard.css";
import type { NodeCardProps } from "./NodeCard.types";
import { NodeCardBadges } from "./NodeCardBadges";
import { NodeCardDescription } from "./NodeCardDescription";
import { NodeCardFiles } from "./NodeCardFiles";
import { NodeCardHeader } from "./NodeCardHeader";
import { NodeCardMetrics } from "./NodeCardMetrics";
import { NodeCardMiniChips } from "./NodeCardMiniChips";
import { NodeCardTitle } from "./NodeCardTitle";
import { NodeCardTools } from "./NodeCardTools";
import { describeNodeKind, resolveNodeStatus } from "./nodeKinds";

export type { NodeCardProps, NodeStatusVariant } from "./NodeCard.types";
export { NodeCardHeader } from "./NodeCardHeader";
export type { NodeCardHeaderProps } from "./NodeCardHeader";
export { NodeCardTitle } from "./NodeCardTitle";
export type { NodeCardTitleProps } from "./NodeCardTitle";
export { NodeCardDescription } from "./NodeCardDescription";
export type { NodeCardDescriptionProps } from "./NodeCardDescription";
export { NodeCardTools } from "./NodeCardTools";
export type { NodeCardToolsProps } from "./NodeCardTools";
export { NodeCardFiles } from "./NodeCardFiles";
export type { NodeCardFilesProps } from "./NodeCardFiles";
export { NodeCardMetrics } from "./NodeCardMetrics";
export type { NodeCardMetricsProps } from "./NodeCardMetrics";
export { NodeCardBadges } from "./NodeCardBadges";
export type { NodeCardBadgesProps } from "./NodeCardBadges";
export { NodeCardMiniChips } from "./NodeCardMiniChips";

const areNodeCardPropsEqual = (prevProps: NodeCardProps, nextProps: NodeCardProps): boolean => {
  return (
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isFiltered === nextProps.isFiltered &&
    prevProps.isCollapsed === nextProps.isCollapsed &&
    prevProps.onSelect === nextProps.onSelect &&
    prevProps.onToggleCollapse === nextProps.onToggleCollapse &&
    prevProps.node === nextProps.node
  );
};

export const NodeCard: FC<NodeCardProps> = memo(
  ({ node, isSelected, isFiltered, isCollapsed, onSelect, onToggleCollapse }) => {
    const handleClick = useCallback(
      (e: MouseEvent<HTMLDivElement>): void => {
        e.stopPropagation();
        onSelect(node.id);
      },
      [node.id, onSelect],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>): void => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        }
      },
      [node.id, onSelect],
    );

    const kind = describeNodeKind(node);
    const status = resolveNodeStatus(node);

    const cardClasses = [
      "node-card",
      `kind-${node.kind ?? "agent"}`,
      `status-${status}`,
      isSelected ? "selected" : "",
      isFiltered ? "filtered" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        className={cardClasses}
        style={
          {
            width: node.width ? `${node.width}px` : undefined,
            height: node.height ? `${node.height}px` : undefined,
            "--node-kind-accent": kind.accent,
          } as React.CSSProperties
        }
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <NodeCardHeader node={node} isCollapsed={isCollapsed} onToggleCollapse={onToggleCollapse} />
        {!isCollapsed ? (
          <div className="node-card-body">
            <NodeCardTitle node={node} />
            <NodeCardDescription node={node} />
            <NodeCardBadges badges={node.badges} />
            <NodeCardMiniChips node={node} />
            <NodeCardTools node={node} />
            <NodeCardFiles node={node} />
            <NodeCardMetrics node={node} />
          </div>
        ) : null}
      </div>
    );
  },
  areNodeCardPropsEqual,
);

NodeCard.displayName = "NodeCard";
