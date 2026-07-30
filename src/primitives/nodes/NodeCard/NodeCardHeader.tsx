import type { FC, MouseEvent } from "react";
import type { NodeStatusVariant } from "./NodeCard.types";

export interface NodeCardHeaderProps {
  id: string;
  name: string;
  type?: string;
  statusVariant?: NodeStatusVariant;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
}

export const NodeCardHeader: FC<NodeCardHeaderProps> = ({
  id,
  name,
  type,
  statusVariant = "info",
  isCollapsed,
  onToggleCollapse,
}) => {
  const handleToggle = (e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    onToggleCollapse(id);
  };

  return (
    <header className="node-card-header">
      <div className="node-card-header-main">
        <span
          className={`node-card-status-dot status-${statusVariant}`}
          title={`Status: ${statusVariant}`}
        />
        <h3 className="node-card-title">{name}</h3>
        {type ? <span className="node-card-type-tag">{type}</span> : null}
      </div>
      <button
        type="button"
        className="node-card-toggle-btn"
        onClick={handleToggle}
        aria-label={isCollapsed ? "Expand node" : "Collapse node"}
      >
        {isCollapsed ? "►" : "▼"}
      </button>
    </header>
  );
};
