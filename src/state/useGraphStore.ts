import { create } from "zustand";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../types/graphData";
import {
  DEFAULT_CUSTOM_LAYOUT_CONFIG,
  type CustomLayoutConfig,
  type Direction,
} from "../engine/layout/custom/config";

/**
 * The two engines the v3 layout pipeline ships: a layered pipeline and a radial one.
 *
 * Flow direction is deliberately NOT part of this union. It used to be — `top-down`,
 * `left-right`, `right-left` and `bottom-up` were separate "modes" — and because the client sends
 * a fully resolved config the mode's direction was always discarded by the engine, so picking
 * `left-right` silently drew top-down. Direction now lives in `layoutConfig.direction` and nowhere
 * else. `layered-spline` is likewise gone: it was the layered engine with `edgeStyle: "spline"`.
 */
export type LayoutMode = "layered" | "radial";

/**
 * Every mode string any client has ever persisted, mapped onto the surviving two engines.
 * Retired engines (`organic`, `grid`) and the retired stress aliases (`force`, `stress`) all land
 * on `layered`, which is the only engine that can draw an arbitrary graph without collisions.
 *
 * A `Map`, not an object literal: the lookup key is arbitrary text out of localStorage or a URL,
 * and an object would happily answer `"constructor"` with something off `Object.prototype`.
 */
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

/**
 * The direction that a legacy, direction-bearing mode string used to stand for. Only the three
 * non-default flows appear: `top-down` and every non-directional legacy value already resolve to
 * the config default, so mapping them would only overwrite a deliberate user choice with the same
 * value they would have got anyway.
 */
const LEGACY_MODE_DIRECTION_MAP: ReadonlyMap<string, Direction> = new Map<string, Direction>([
  ["bottom-up", "bottom-up"],
  ["left-right", "left-right"],
  ["right-left", "right-left"],
]);

/**
 * Maps a possibly-legacy persisted layout mode string (from localStorage, a shared URL, or an
 * older client) onto the current `LayoutMode` union. Unknown values fall back to `"layered"`
 * rather than throwing, since a bad viewport string should degrade the layout, not the whole app.
 */
export function normalizeLayoutMode(mode: string): LayoutMode {
  return LEGACY_LAYOUT_MODE_MAP.get(mode) ?? "layered";
}

/**
 * Recovers the flow direction a legacy mode string carried, or `null` when it carried none.
 *
 * Persisted viewports store only the mode, never the config, so a user who saved `left-right`
 * would otherwise come back to a top-down drawing after the modes collapsed to two. Callers that
 * restore persisted state must feed the raw stored string through here (or through
 * `setLayoutMode`, which does it for them) rather than through `normalizeLayoutMode` alone.
 */
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
  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: FilterCategory) => void;
  /**
   * Accepts a raw string so persisted/shared values reach exactly one normalisation point. A
   * legacy direction-bearing string additionally rewrites `layoutConfig.direction`.
   */
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

const initialPanOffset: { x: number; y: number } = { x: 0, y: 0 };

export const useGraphStore = create<GraphStore>()((set) => ({
  dataset: null,
  currentFile: "",
  positionedNodes: [],
  positionedEdges: [],
  selectedNodeId: null,
  searchQuery: "",
  activeFilter: "all",
  layoutMode: "layered",
  layoutConfig: { ...DEFAULT_CUSTOM_LAYOUT_CONFIG },
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
export const useZoomLevel = () => useGraphStore((state) => state.zoomLevel);
export const usePanOffset = () => useGraphStore((state) => state.panOffset);
export const useCollapsedNodeIds = () => useGraphStore((state) => state.collapsedNodeIds);
export const useShouldAutoFit = () => useGraphStore((state) => state.shouldAutoFit);
