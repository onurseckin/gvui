import type { Point } from "../../engine/layout/custom/types";

export type GroupColorPalette =
  | "blue"
  | "emerald"
  | "amber"
  | "purple"
  | "rose"
  | "cyan"
  | "slate"
  | "indigo"
  | "teal"
  | "orange";

export type GroupShapeMode = "box" | "hull";

export interface ColorThemeConfig {
  id: GroupColorPalette;
  name: string;
  accent: string;
  bg: string;
  bgHover: string;
  border: string;
  borderHover: string;
  headerBg: string;
  headerText: string;
  badgeBg: string;
  badgeText: string;
  glow: string;
}

export const GROUP_THEME_PALETTES: Record<GroupColorPalette, ColorThemeConfig> = {
  blue: {
    id: "blue",
    name: "Blue",
    accent: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.08)",
    bgHover: "rgba(59, 130, 246, 0.14)",
    border: "rgba(59, 130, 246, 0.4)",
    borderHover: "rgba(59, 130, 246, 0.8)",
    headerBg: "rgba(30, 58, 138, 0.65)",
    headerText: "#bfdbfe",
    badgeBg: "rgba(59, 130, 246, 0.25)",
    badgeText: "#93c5fd",
    glow: "0 0 20px rgba(59, 130, 246, 0.25)",
  },
  emerald: {
    id: "emerald",
    name: "Emerald",
    accent: "#10b981",
    bg: "rgba(16, 185, 129, 0.08)",
    bgHover: "rgba(16, 185, 129, 0.14)",
    border: "rgba(16, 185, 129, 0.4)",
    borderHover: "rgba(16, 185, 129, 0.8)",
    headerBg: "rgba(6, 78, 59, 0.65)",
    headerText: "#a7f3d0",
    badgeBg: "rgba(16, 185, 129, 0.25)",
    badgeText: "#6ee7b7",
    glow: "0 0 20px rgba(16, 185, 129, 0.25)",
  },
  amber: {
    id: "amber",
    name: "Amber",
    accent: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.08)",
    bgHover: "rgba(245, 158, 11, 0.14)",
    border: "rgba(245, 158, 11, 0.4)",
    borderHover: "rgba(245, 158, 11, 0.8)",
    headerBg: "rgba(120, 53, 15, 0.65)",
    headerText: "#fde68a",
    badgeBg: "rgba(245, 158, 11, 0.25)",
    badgeText: "#fcd34d",
    glow: "0 0 20px rgba(245, 158, 11, 0.25)",
  },
  purple: {
    id: "purple",
    name: "Purple",
    accent: "#a855f7",
    bg: "rgba(168, 85, 247, 0.08)",
    bgHover: "rgba(168, 85, 247, 0.14)",
    border: "rgba(168, 85, 247, 0.4)",
    borderHover: "rgba(168, 85, 247, 0.8)",
    headerBg: "rgba(88, 28, 135, 0.65)",
    headerText: "#e9d5ff",
    badgeBg: "rgba(168, 85, 247, 0.25)",
    badgeText: "#d8b4fe",
    glow: "0 0 20px rgba(168, 85, 247, 0.25)",
  },
  rose: {
    id: "rose",
    name: "Rose",
    accent: "#f43f5e",
    bg: "rgba(244, 63, 94, 0.08)",
    bgHover: "rgba(244, 63, 94, 0.14)",
    border: "rgba(244, 63, 94, 0.4)",
    borderHover: "rgba(244, 63, 94, 0.8)",
    headerBg: "rgba(136, 19, 55, 0.65)",
    headerText: "#fecdd3",
    badgeBg: "rgba(244, 63, 94, 0.25)",
    badgeText: "#fda4af",
    glow: "0 0 20px rgba(244, 63, 94, 0.25)",
  },
  cyan: {
    id: "cyan",
    name: "Cyan",
    accent: "#06b6d4",
    bg: "rgba(6, 182, 212, 0.08)",
    bgHover: "rgba(6, 182, 212, 0.14)",
    border: "rgba(6, 182, 212, 0.4)",
    borderHover: "rgba(6, 182, 212, 0.8)",
    headerBg: "rgba(22, 78, 99, 0.65)",
    headerText: "#cffafe",
    badgeBg: "rgba(6, 182, 212, 0.25)",
    badgeText: "#a5f3fc",
    glow: "0 0 20px rgba(6, 182, 212, 0.25)",
  },
  slate: {
    id: "slate",
    name: "Slate",
    accent: "#94a3b8",
    bg: "rgba(148, 163, 184, 0.08)",
    bgHover: "rgba(148, 163, 184, 0.14)",
    border: "rgba(148, 163, 184, 0.4)",
    borderHover: "rgba(148, 163, 184, 0.8)",
    headerBg: "rgba(30, 41, 59, 0.65)",
    headerText: "#f1f5f9",
    badgeBg: "rgba(148, 163, 184, 0.25)",
    badgeText: "#e2e8f0",
    glow: "0 0 20px rgba(148, 163, 184, 0.25)",
  },
  indigo: {
    id: "indigo",
    name: "Indigo",
    accent: "#6366f1",
    bg: "rgba(99, 102, 241, 0.08)",
    bgHover: "rgba(99, 102, 241, 0.14)",
    border: "rgba(99, 102, 241, 0.4)",
    borderHover: "rgba(99, 102, 241, 0.8)",
    headerBg: "rgba(49, 46, 129, 0.65)",
    headerText: "#e0e7ff",
    badgeBg: "rgba(99, 102, 241, 0.25)",
    badgeText: "#c7d2fe",
    glow: "0 0 20px rgba(99, 102, 241, 0.25)",
  },
  teal: {
    id: "teal",
    name: "Teal",
    accent: "#14b8a6",
    bg: "rgba(20, 184, 166, 0.08)",
    bgHover: "rgba(20, 184, 166, 0.14)",
    border: "rgba(20, 184, 166, 0.4)",
    borderHover: "rgba(20, 184, 166, 0.8)",
    headerBg: "rgba(19, 78, 74, 0.65)",
    headerText: "#ccfbf1",
    badgeBg: "rgba(20, 184, 166, 0.25)",
    badgeText: "#99f6e4",
    glow: "0 0 20px rgba(20, 184, 166, 0.25)",
  },
  orange: {
    id: "orange",
    name: "Orange",
    accent: "#f97316",
    bg: "rgba(249, 115, 22, 0.08)",
    bgHover: "rgba(249, 115, 22, 0.14)",
    border: "rgba(249, 115, 22, 0.4)",
    borderHover: "rgba(249, 115, 22, 0.8)",
    headerBg: "rgba(124, 45, 18, 0.65)",
    headerText: "#ffedd5",
    badgeBg: "rgba(249, 115, 22, 0.25)",
    badgeText: "#fed7aa",
    glow: "0 0 20px rgba(249, 115, 22, 0.25)",
  },
};

export interface CanvasGroup {
  id: string;
  label: string;
  description?: string;
  color: GroupColorPalette;
  memberNodeIds: string[];
  isCollapsed: boolean;
  isLocked: boolean;
  shapeMode?: GroupShapeMode;
  padding?: number;
  cornerRadius?: number;
  zIndex?: number;
  collapsedPosition?: { x: number; y: number };
  icon?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface GroupBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  nodeCount: number;
  hullPoints?: Point[];
  paddedHullPoints?: Point[];
  svgPath?: string;
}

export interface CreateGroupInput {
  id?: string;
  label: string;
  description?: string;
  color?: GroupColorPalette;
  memberNodeIds?: string[];
  isCollapsed?: boolean;
  isLocked?: boolean;
  shapeMode?: GroupShapeMode;
  padding?: number;
  cornerRadius?: number;
  zIndex?: number;
  collapsedPosition?: { x: number; y: number };
  icon?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface GroupFilterState {
  searchQuery: string;
  color: "all" | GroupColorPalette;
  isCollapsed: "all" | "collapsed" | "expanded";
  isLocked: "all" | "locked" | "unlocked";
}

export interface CanvasGroupingStoreState {
  groups: CanvasGroup[];
  selectedGroupId: string | null;
  activeEditingGroupId: string | null;
  isGroupingLayerVisible: boolean;
  isDrawerOpen: boolean;
  filterState: GroupFilterState;
  defaultColor: GroupColorPalette;
  defaultPadding: number;
  defaultCornerRadius: number;
  defaultShapeMode: GroupShapeMode;
  isDraggingGroup: boolean;
  activeDragGroupId: string | null;
}

export interface CanvasGroupingStoreActions {
  createGroup: (input: CreateGroupInput) => CanvasGroup;
  createGroupFromSelectedNodes: (
    nodeIds: string[],
    label?: string,
    color?: GroupColorPalette,
  ) => CanvasGroup | null;
  updateGroup: (id: string, patch: Partial<Omit<CanvasGroup, "id">>) => void;
  deleteGroup: (id: string) => void;
  toggleGroupCollapse: (id: string) => void;
  toggleGroupLock: (id: string) => void;
  addNodesToGroup: (groupId: string, nodeIds: string[]) => void;
  removeNodesFromGroup: (groupId: string, nodeIds: string[]) => void;
  setGroupMembers: (groupId: string, nodeIds: string[]) => void;
  setSelectedGroupId: (id: string | null) => void;
  setActiveEditingGroupId: (id: string | null) => void;
  setIsGroupingLayerVisible: (visible: boolean) => void;
  setIsDrawerOpen: (open: boolean) => void;
  setFilterState: (patch: Partial<GroupFilterState>) => void;
  resetFilterState: () => void;
  reorderGroups: (groupIds: string[]) => void;
  exportGroupsJson: () => string;
  importGroupsJson: (json: string) => boolean;
  clearAllGroups: () => void;
  setDraggingGroup: (isDragging: boolean, groupId?: string | null) => void;
}

export type CanvasGroupingStore = CanvasGroupingStoreState & CanvasGroupingStoreActions;
