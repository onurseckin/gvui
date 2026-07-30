import type { PositionedNode } from "../../../types/graphData";

export type NodeStatusVariant = "success" | "error" | "amber" | "info" | "gray";

export interface NodeCardProps {
  node: PositionedNode;
  isSelected: boolean;
  isFiltered: boolean;
  isCollapsed: boolean;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}
