import { create } from "zustand";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../types/graphData";

export type LayoutMode = "top-down" | "left-right" | "force" | "radial";
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
  setLayoutMode: (mode: LayoutMode) => void;
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
  layoutMode: "top-down",
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
  setLayoutMode: (mode) => set({ layoutMode: mode }),
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
