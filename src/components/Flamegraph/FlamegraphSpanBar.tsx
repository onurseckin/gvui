import React from "react";
import type { FlamegraphNode } from "./types";
import { formatDuration, formatTokens } from "./flamegraphEngine";

export interface FlamegraphSpanBarProps {
  node: FlamegraphNode;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export const FlamegraphSpanBar: React.FC<FlamegraphSpanBarProps> = ({
  node,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(node.id);
    }
  };

  const formattedDuration = formatDuration(node.duration);
  const formattedTokens = formatTokens(node.tokens.totalTokens);

  let className = "flamegraph-span-bar";
  if (isSelected) className += " selected";
  if (isHovered) className += " hovered";
  if (!node.isMatchedBySearch) className += " dimmed";
  if (node.status === "error") className += " status-error";
  if (node.status === "running") className += " status-running";

  const titleText = `${node.name} [${node.tier}] (${formattedDuration}) - ${formattedTokens} tokens - Agent: ${node.agentId}`;

  return (
    <div
      role="button"
      tabIndex={0}
      className={className}
      style={{
        left: `${node.xPct}%`,
        width: `${Math.max(0.2, node.widthPct)}%`,
        backgroundColor: node.color,
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      title={titleText}
      aria-label={titleText}
      data-testid={`flamegraph-span-${node.id}`}
      data-span-id={node.id}
    >
      <div className="span-bar-content">
        <span className="span-bar-name">{node.name}</span>
        {node.widthPct > 4 && (
          <span className="span-bar-meta">
            <span className="span-bar-duration">{formattedDuration}</span>
            {node.tokens.totalTokens > 0 && (
              <span className="span-bar-tokens">{formattedTokens} tok</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
};
