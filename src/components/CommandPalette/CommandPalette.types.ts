import type { GraphNodeData } from "../../types/graphData";

export type SearchScope = "current" | "all";

export type CommandCategory = "current" | "all";

export type CommandPaletteScope = SearchScope;

export interface ShortcutBadgeProps {
  shortcut: string | string[];
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}

export interface SearchResultItem {
  id: string;
  title: string;
  description?: string;
  category: CommandCategory;
  score: number;
  matches: number[];
  descriptionMatches?: number[];
  nodeId: string;
  fileId: string;
  sourceFileName?: string;
  nodeStatus?: string;
  nodeKind?: string;
}

export interface SearchResultNode extends GraphNodeData {
  fileId: string;
  sourceFileName: string;
}

export interface CommandPaletteProps {
  isOpen?: boolean;
  onClose?: () => void;
  currentFile?: string;
  onNavigateNode?: (fileId: string, nodeId: string) => void;
  placeholder?: string;
  className?: string;
  maxResults?: number;
  defaultCategory?: CommandCategory;
  defaultScope?: SearchScope;
}
