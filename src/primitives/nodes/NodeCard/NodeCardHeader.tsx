import type { FC, MouseEvent } from "react";
import { memo, useCallback } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { describeNodeKind, resolveModelTier } from "./nodeKinds";

export interface NodeCardHeaderProps {
  node: GraphNodeData;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
}

export const NodeCardHeader: FC<NodeCardHeaderProps> = memo(
  ({ node, isCollapsed, onToggleCollapse }) => {
    const handleToggle = useCallback(
      (e: MouseEvent<HTMLButtonElement>): void => {
        e.stopPropagation();
        onToggleCollapse(node.id);
      },
      [node.id, onToggleCollapse],
    );

    const kind = describeNodeKind(node);
    const tier = resolveModelTier(node);
    const IconComp = kind.IconComponent;

    return (
      <header className="node-card-header">
        <div className="node-card-header-main">
          <span className="node-card-kind-icon" style={{ color: kind.accent }}>
            <IconComp size={14} color={kind.accent} />
          </span>
          <h3 className="node-card-title" title={node.name}>
            {node.name}
          </h3>
          {node.type ? <span className="node-card-type-tag">{node.type}</span> : null}
        </div>
        <div className="node-card-header-aside">
          {node.step !== undefined ? (
            <span className="node-card-step-badge" title={`Execution Step ${node.step}`}>
              Step {node.step}
            </span>
          ) : null}
          {node.badge ? (
            <span className={`node-card-badge-chip variant-${node.badge.variant ?? "info"}`}>
              {node.badge.text}
            </span>
          ) : null}
          {node.model ? (
            <span
              className={`node-card-model-chip ${tier ? `tier-${tier}` : ""}`.trim()}
              title={
                node.harnessModel ? `${node.model} · harness: ${node.harnessModel}` : node.model
              }
            >
              {node.model}
            </span>
          ) : null}
          <button
            type="button"
            className="node-card-toggle-btn"
            onClick={handleToggle}
            aria-label={isCollapsed ? "Expand node" : "Collapse node"}
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {isCollapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M6 9l6 6 6-6" />}
            </svg>
          </button>
        </div>
      </header>
    );
  },
);

NodeCardHeader.displayName = "NodeCardHeader";
