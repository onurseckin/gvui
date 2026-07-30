import type { FC, MouseEvent } from "react";
import type { PositionedNode } from "../../../types/graphData";
import { NodeCardBadges } from "./NodeCardBadges";

import "./NodeCard.css";
import type { NodeCardProps, NodeStatusVariant } from "./NodeCard.types";
import { NodeCardContext } from "./NodeCardContext";
import { NodeCardDetails } from "./NodeCardDetails";
import { NodeCardHeader } from "./NodeCardHeader";
import { NodeCardTools } from "./NodeCardTools";

export type { NodeCardProps, NodeStatusVariant } from "./NodeCard.types";
export { NodeCardHeader } from "./NodeCardHeader";
export type { NodeCardHeaderProps } from "./NodeCardHeader";
export { NodeCardBadges } from "./NodeCardBadges";
export type { NodeCardBadgesProps } from "./NodeCardBadges";
export { NodeCardTools } from "./NodeCardTools";
export type { NodeCardToolsProps } from "./NodeCardTools";
export { NodeCardContext } from "./NodeCardContext";
export type { NodeCardContextProps } from "./NodeCardContext";
export { NodeCardDetails } from "./NodeCardDetails";
export type { NodeCardDetailsProps } from "./NodeCardDetails";

function deriveStatusVariant(node: PositionedNode): NodeStatusVariant {
  const statusBadge = node.badges?.find((b) => b.variant);
  if (statusBadge?.variant) {
    return statusBadge.variant;
  }
  const statusStr = String(node.metadata?.status ?? "").toLowerCase();
  if (statusStr.includes("complete") || statusStr.includes("success")) {
    return "success";
  }
  if (statusStr.includes("error") || statusStr.includes("fail")) {
    return "error";
  }
  if (statusStr.includes("running") || statusStr.includes("pending")) {
    return "amber";
  }
  return "info";
}

export const NodeCard: FC<NodeCardProps> = ({
  node,
  isSelected,
  isFiltered,
  isCollapsed,
  onSelect,
  onToggleCollapse,
}) => {
  const statusVariant = deriveStatusVariant(node);

  const handleClick = (e: MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    onSelect(node.id);
  };

  const cardClasses = [
    "node-card",
    isSelected ? "selected" : "",
    isFiltered ? "filtered" : "",
    `status-${statusVariant}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cardClasses}
      style={{
        width: node.width ? `${node.width}px` : undefined,
        minHeight: node.height ? `${node.height}px` : undefined,
      }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      <NodeCardHeader
        id={node.id}
        name={node.name}
        type={node.type}
        statusVariant={statusVariant}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!isCollapsed ? (
        <>
          <NodeCardBadges badges={node.badges} />
          <NodeCardTools tools={node.tools} />
          <NodeCardContext context={node.context} metadata={node.metadata} />
          <NodeCardDetails
            details={node.metadata}
            prompt={typeof node.metadata?.prompt === "string" ? node.metadata.prompt : undefined}
            logs={typeof node.metadata?.logs === "string" ? node.metadata.logs : undefined}
          />
        </>
      ) : null}
    </div>
  );
};
