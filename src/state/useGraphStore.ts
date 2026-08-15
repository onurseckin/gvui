import { create } from "zustand";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../types/graphData";
import {
  DEFAULT_CUSTOM_LAYOUT_CONFIG,
  type CustomLayoutConfig,
  type Direction,
} from "../engine/layout/custom/config";

export type LayoutMode = "layered" | "radial";

const LEGACY_LAYOUT_MODE_MAP: ReadonlyMap<string, LayoutMode> = new Map<string, LayoutMode>([
  ["layered", "layered"],
  ["layered-spline", "layered"],
  ["top-down", "layered"],
  ["top-down-dagre", "layered"],
  ["bottom-up", "layered"],
  ["left-right", "layered"],
  ["right-left", "layered"],
  ["force", "layered"],
  ["stress", "layered"],
  ["organic", "layered"],
  ["grid", "layered"],
  ["radial", "radial"],
]);

const LEGACY_MODE_DIRECTION_MAP: ReadonlyMap<string, Direction> = new Map<string, Direction>([
  ["bottom-up", "bottom-up"],
  ["left-right", "left-right"],
  ["right-left", "right-left"],
]);

export function normalizeLayoutMode(mode: string): LayoutMode {
  return LEGACY_LAYOUT_MODE_MAP.get(mode) ?? "layered";
}

export function directionFromLegacyLayoutMode(mode: string): Direction | null {
  return LEGACY_MODE_DIRECTION_MAP.get(mode) ?? null;
}

export type FilterCategory = "all" | "success" | "error" | "tools";

export interface GraphState {
  dataset: GraphDataset | null;
  currentFile: string;
  positionedNodes: PositionedNode[];
  positionedEdges: PositionedEdge[];
  selectedNodeId: string | null;
  selectedStep: number | null;
  selectedSteps: Set<number>;
  searchQuery: string;
  activeFilter: FilterCategory;
  layoutMode: LayoutMode;
  layoutConfig: CustomLayoutConfig;
  zoomLevel: number;
  panOffset: { x: number; y: number };
  collapsedNodeIds: Set<string>;
  shouldAutoFit: boolean;
}

export interface GraphActions {
  setDataset: (dataset: GraphDataset | null) => void;
  setCurrentFile: (fileId: string) => void;
  setPositionedGraph: (nodes: PositionedNode[], edges: PositionedEdge[]) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setSelectedStep: (step: number | null | ((prev: number | null) => number | null)) => void;
  toggleSelectedStep: (step: number) => void;
  selectAllSteps: () => void;
  clearSelectedSteps: () => void;
  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: FilterCategory) => void;
  setLayoutMode: (mode: LayoutMode | string) => void;
  setLayoutConfig: (
    config: Partial<CustomLayoutConfig> | ((prev: CustomLayoutConfig) => CustomLayoutConfig),
  ) => void;
  resetLayoutConfig: () => void;
  setZoomLevel: (zoom: number | ((prev: number) => number)) => void;
  setPanOffset: (
    offset:
      | { x: number; y: number }
      | ((prev: { x: number; y: number }) => { x: number; y: number }),
  ) => void;
  toggleNodeCollapse: (nodeId: string) => void;
  resetViewport: () => void;
  centerNodeOnCanvas: (nodeId: string, viewportWidth?: number, viewportHeight?: number) => void;
  setShouldAutoFit: (shouldFit: boolean) => void;
}

export type GraphStore = GraphState & GraphActions;

export const useGraphStore = create<GraphStore>()((set) => ({
  dataset: null,
  currentFile: "",
  positionedNodes: [],
  positionedEdges: [],
  selectedNodeId: null,
  selectedStep: null,
  selectedSteps: new Set<number>(),
  searchQuery: "",
  activeFilter: "all",
  layoutMode: "layered",
  layoutConfig: { ...DEFAULT_CUSTOM_LAYOUT_CONFIG },
  zoomLevel: 1,
  panOffset: { x: 0, y: 0 },
  collapsedNodeIds: new Set<string>(),
  shouldAutoFit: false,

  setDataset: (dataset) => set({ dataset }),
  setCurrentFile: (currentFile) => set({ currentFile }),
  setPositionedGraph: (nodes, edges) => set({ positionedNodes: nodes, positionedEdges: edges }),
  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
  setSelectedStep: (step) =>
    set((state) => ({
      selectedStep: typeof step === "function" ? step(state.selectedStep) : step,
    })),
  toggleSelectedStep: (step) =>
    set((state) => {
      const next = new Set(state.selectedSteps);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return { selectedSteps: next, selectedStep: null };
    }),
  selectAllSteps: () => set({ selectedSteps: new Set<number>(), selectedStep: null }),
  clearSelectedSteps: () => set({ selectedSteps: new Set<number>([-999]), selectedStep: null }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setLayoutMode: (mode) =>
    set((state) => {
      const direction = directionFromLegacyLayoutMode(mode);
      return {
        layoutMode: normalizeLayoutMode(mode),
        layoutConfig:
          direction === null ? state.layoutConfig : { ...state.layoutConfig, direction },
      };
    }),
  setLayoutConfig: (config) =>
    set((state) => ({
      layoutConfig:
        typeof config === "function"
          ? config(state.layoutConfig)
          : { ...state.layoutConfig, ...config },
    })),
  resetLayoutConfig: () => set({ layoutConfig: { ...DEFAULT_CUSTOM_LAYOUT_CONFIG } }),
  setZoomLevel: (zoom) =>
    set((state) => ({ zoomLevel: typeof zoom === "function" ? zoom(state.zoomLevel) : zoom })),
  setPanOffset: (offset) =>
    set((state) => ({
      panOffset: typeof offset === "function" ? offset(state.panOffset) : offset,
    })),
  toggleNodeCollapse: (nodeId) =>
    set((state) => {
      const next = new Set(state.collapsedNodeIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { collapsedNodeIds: next };
    }),
  resetViewport: () =>
    set({ zoomLevel: 1, panOffset: { x: 0, y: 0 }, collapsedNodeIds: new Set<string>() }),
  centerNodeOnCanvas: (nodeId, viewportWidth, viewportHeight) =>
    set((state) => {
      const node = state.positionedNodes.find((n) => n.id === nodeId);
      if (!node) return { selectedNodeId: nodeId };
      const vw = viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1000);
      const vh = viewportHeight ?? (typeof window !== "undefined" ? window.innerHeight : 800);
      return {
        selectedNodeId: nodeId,
        zoomLevel: 1.0,
        panOffset: {
          x: vw / 2 - (node.x + node.width / 2),
          y: vh / 2 - (node.y + node.height / 2),
        },
      };
    }),
  setShouldAutoFit: (shouldAutoFit) => set({ shouldAutoFit }),
}));

export const useDataset = () => useGraphStore((state) => state.dataset);
export const useCurrentFile = () => useGraphStore((state) => state.currentFile);
export const usePositionedNodes = () => useGraphStore((state) => state.positionedNodes);
export const usePositionedEdges = () => useGraphStore((state) => state.positionedEdges);
export const useSelectedNodeId = () => useGraphStore((state) => state.selectedNodeId);
export const useSelectedStep = () => useGraphStore((state) => state.selectedStep);
export const useSelectedSteps = () => useGraphStore((state) => state.selectedSteps);
export const useSearchQuery = () => useGraphStore((state) => state.searchQuery);
export const useActiveFilter = () => useGraphStore((state) => state.activeFilter);
export const useLayoutMode = () => useGraphStore((state) => state.layoutMode);
export const useLayoutConfig = () => useGraphStore((state) => state.layoutConfig);
export const useZoomLevel = () => useGraphStore((state) => state.zoomLevel);
export const usePanOffset = () => useGraphStore((state) => state.panOffset);
export const useCollapsedNodeIds = () => useGraphStore((state) => state.collapsedNodeIds);
export const useShouldAutoFit = () => useGraphStore((state) => state.shouldAutoFit);
