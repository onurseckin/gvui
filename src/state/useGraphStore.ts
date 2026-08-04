import { create } from "zustand";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../types/graphData";
import {
  DEFAULT_CUSTOM_LAYOUT_CONFIG,
  LAYOUT_PRESETS,
  resolveCustomLayoutConfig,
  type CustomLayoutConfig,
  type LayoutPresetName,
} from "../engine/layout/custom/config";

/**
 * v2 engine modes. `layered`/`layered-spline` replace the old direction-baked-into-mode values
 * (`top-down`, `top-down-dagre`, `left-right`, `right-left` all used to be separate modes);
 * direction is now an orthogonal `CustomLayoutConfig.direction` knob, not a mode.
 */
export type LayoutMode = "layered" | "layered-spline" | "left-right" | "organic" | "radial" | "grid";

const LEGACY_LAYOUT_MODE_MAP: Record<string, LayoutMode> = {
  "top-down": "layered",
  "top-down-dagre": "layered",
  "left-right": "left-right",
  "right-left": "left-right",
  force: "organic",
  stress: "organic",
  organic: "organic",
  radial: "radial",
  grid: "grid",
  layered: "layered",
  "layered-spline": "layered-spline",
};

/**
 * Maps a possibly-legacy persisted layout mode string (from localStorage, a shared URL, or an
 * older client) onto the current `LayoutMode` union. Unknown values fall back to `"layered"`
 * rather than throwing, since a bad viewport string should degrade the layout, not the whole app.
 */
export function normalizeLayoutMode(mode: string): LayoutMode {
  return LEGACY_LAYOUT_MODE_MAP[mode] ?? "layered";
}

export type FilterCategory = "all" | "success" | "error" | "tools";

export interface GraphState {
  dataset: GraphDataset | null;
  currentFile: string;
  positionedNodes: PositionedNode[];
  positionedEdges: PositionedEdge[];
  selectedNodeId: string | null;
  searchQuery: string;
  activeFilter: FilterCategory;
  layoutMode: LayoutMode;
  layoutConfig: CustomLayoutConfig;
  layoutPreset: LayoutPresetName;
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
  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: FilterCategory) => void;
  setLayoutMode: (mode: LayoutMode | string) => void;
  setLayoutConfig: (
    config: Partial<CustomLayoutConfig> | ((prev: CustomLayoutConfig) => CustomLayoutConfig),
  ) => void;
  resetLayoutConfig: () => void;
  /** Replaces the layout config with the named preset merged over the defaults. */
  applyPreset: (name: LayoutPresetName) => void;
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

const initialPanOffset: { x: number; y: number } = { x: 0, y: 0 };

export const useGraphStore = create<GraphStore>()((set) => ({
  dataset: null,
  currentFile: "ai_agent_trace.json",
  positionedNodes: [],
  positionedEdges: [],
  selectedNodeId: null,
  searchQuery: "",
  activeFilter: "all",
  layoutMode: "layered",
  layoutConfig: { ...DEFAULT_CUSTOM_LAYOUT_CONFIG },
  layoutPreset: "readable",
  zoomLevel: 1,
  panOffset: initialPanOffset,
  collapsedNodeIds: new Set<string>(),
  shouldAutoFit: false,

  setDataset: (dataset) => set({ dataset }),
  setCurrentFile: (currentFile) => set({ currentFile }),
  setPositionedGraph: (nodes, edges) => set({ positionedNodes: nodes, positionedEdges: edges }),
  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setLayoutMode: (mode) => set({ layoutMode: normalizeLayoutMode(mode) }),
  setLayoutConfig: (config) =>
    set((state) => ({
      layoutConfig:
        typeof config === "function"
          ? config(state.layoutConfig)
          : { ...state.layoutConfig, ...config },
    })),
  resetLayoutConfig: () =>
    set({ layoutConfig: { ...DEFAULT_CUSTOM_LAYOUT_CONFIG }, layoutPreset: "readable" }),
  applyPreset: (name) =>
    set({
      layoutPreset: name,
      layoutConfig: resolveCustomLayoutConfig(LAYOUT_PRESETS[name]),
    }),
  setZoomLevel: (zoom) =>
    set((state) => ({
      zoomLevel: typeof zoom === "function" ? zoom(state.zoomLevel) : zoom,
    })),
  setPanOffset: (offset) =>
    set((state) => ({
      panOffset: typeof offset === "function" ? offset(state.panOffset) : offset,
    })),
  toggleNodeCollapse: (nodeId) =>
    set((state) => {
      const next = new Set(state.collapsedNodeIds);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return { collapsedNodeIds: next };
    }),
  resetViewport: () =>
    set({
      zoomLevel: 1,
      panOffset: { x: 0, y: 0 },
      collapsedNodeIds: new Set<string>(),
    }),
  centerNodeOnCanvas: (nodeId, viewportWidth, viewportHeight) =>
    set((state) => {
      const node = state.positionedNodes.find((n) => n.id === nodeId);
      if (!node) {
        return { selectedNodeId: nodeId };
      }

      const vw = viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1000);
      const vh = viewportHeight ?? (typeof window !== "undefined" ? window.innerHeight : 800);

      const nodeCenterX = node.x + node.width / 2;
      const nodeCenterY = node.y + node.height / 2;

      const panX = vw / 2 - nodeCenterX;
      const panY = vh / 2 - nodeCenterY;

      return {
        selectedNodeId: nodeId,
        zoomLevel: 1.0,
        panOffset: { x: panX, y: panY },
      };
    }),
  setShouldAutoFit: (shouldAutoFit) => set({ shouldAutoFit }),
}));

// Granular state selector hooks for re-render optimization
export const useDataset = () => useGraphStore((state) => state.dataset);
export const useCurrentFile = () => useGraphStore((state) => state.currentFile);
export const usePositionedNodes = () => useGraphStore((state) => state.positionedNodes);
export const usePositionedEdges = () => useGraphStore((state) => state.positionedEdges);
export const useSelectedNodeId = () => useGraphStore((state) => state.selectedNodeId);
export const useSearchQuery = () => useGraphStore((state) => state.searchQuery);
export const useActiveFilter = () => useGraphStore((state) => state.activeFilter);
export const useLayoutMode = () => useGraphStore((state) => state.layoutMode);
export const useLayoutConfig = () => useGraphStore((state) => state.layoutConfig);
export const useLayoutPreset = () => useGraphStore((state) => state.layoutPreset);
export const useZoomLevel = () => useGraphStore((state) => state.zoomLevel);
export const usePanOffset = () => useGraphStore((state) => state.panOffset);
export const useCollapsedNodeIds = () => useGraphStore((state) => state.collapsedNodeIds);
export const useShouldAutoFit = () => useGraphStore((state) => state.shouldAutoFit);
