import type { ReactNode } from "react";
import type { GraphNodeData } from "../../types/graphData";

export type CommandCategory = "all" | "actions" | "nodes" | "navigation" | "layout" | "export";

export type ActionCategory = "actions" | "nodes" | "navigation" | "layout" | "export";

export type ActionHandler = () => Promise<void> | void;

export interface CommandAction {
  id: string;
  title: string;
  description?: string;
  category: ActionCategory | CommandCategory;
  shortcut?: string | string[];
  icon?: ReactNode | string;
  handler: ActionHandler;
  keywords?: string[];
  disabled?: boolean;
  isFavorite?: boolean;
}

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
  category: ActionCategory | CommandCategory;
  type: "action" | "node" | "navigation" | "layout" | "export";
  score: number;
  matches: number[];
  descriptionMatches?: number[];
  shortcut?: string | string[];
  icon?: ReactNode | string;
  nodeId?: string;
  fileId?: string;
  action?: CommandAction;
  handler?: ActionHandler;
  isFavorite?: boolean;
  nodeStatus?: string;
  nodeKind?: string;
}

export interface SearchResultNode extends GraphNodeData {
  fileId: string;
  sourceFileName: string;
}

export type CommandPaletteScope = "current" | "all";

export interface CommandPaletteProps {
  isOpen?: boolean;
  onClose?: () => void;
  currentFile?: string;
  onNavigateNode?: (fileId: string, nodeId: string) => void;
  actions?: CommandAction[];
  placeholder?: string;
  className?: string;
  maxResults?: number;
  defaultCategory?: CommandCategory;
}
