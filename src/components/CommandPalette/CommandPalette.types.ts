import type { GraphNodeData } from "../../types/graphData";

export interface SearchResultNode extends GraphNodeData {
  fileId: string;
  sourceFileName: string;
}

export type CommandPaletteScope = "current" | "all";

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  currentFile: string;
  onNavigateNode: (fileId: string, nodeId: string) => void;
}
