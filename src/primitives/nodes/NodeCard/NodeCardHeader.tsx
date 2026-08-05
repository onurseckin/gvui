import type { FC, MouseEvent } from "react";
import { memo, useCallback } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { describeNodeKind, describeNodeStatus, resolveModelTier } from "./nodeKinds";

export interface NodeCardHeaderProps {
  node: GraphNodeData;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
}

/**
 * `[status] [kind] Title … [model] [collapse]`.
 *
 * Three questions get three slots, left to right in the order you ask them: how did it go, what is
 * it, what is it called — then, right-aligned, what ran it. Status and kind never share a colour
 * channel, so a running orchestrator and a finished tool call stay distinguishable at a glance.
 */
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
    const status = describeNodeStatus(node);
    const tier = resolveModelTier(node);

    return (
      <header className="node-card-header">
        <div className="node-card-header-main">
          <span
            className={`node-card-status-dot ${status.animated ? "is-animated" : ""}`.trim()}
            // `color`, not `background-color`: the dot paints itself and its glow from
            // `currentColor`, so one value drives both.
            style={{ color: status.color }}
            title={`Status: ${status.label}`}
          />
          <svg
            className="node-card-kind-icon"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke={kind.accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {kind.icon}
          </svg>
          <h3 className="node-card-title" title={node.name}>
            {node.name}
          </h3>
          {node.type ? <span className="node-card-type-tag">{node.type}</span> : null}
        </div>
        <div className="node-card-header-aside">
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
