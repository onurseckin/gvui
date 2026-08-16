import { create } from "zustand";
import type { GraphDataset } from "../types/graphData";
import {
  computeGraphDiff,
  filterEdgeDiffs,
  filterNodeDiffs,
} from "../components/GraphDiff/diffEngine";
import type {
  DiffFilterMode,
  EdgeDiff,
  GraphDiffCounts,
  GraphDiffOptions,
  GraphDiffResult,
  GraphMetricSummary,
  NodeDiff,
  VisualComparisonMode,
} from "../components/GraphDiff/types";

export type DiffDrawerTab = "overview" | "nodes" | "edges" | "findings" | "raw";

export interface GraphDiffState {
  // Run Identification & Datasets
  baseRunId: string | null;
  comparisonRunId: string | null;
  baseDataset: GraphDataset | null;
  comparisonDataset: GraphDataset | null;

  // Computed Diff Result
  diffResult: GraphDiffResult;
  isComputing: boolean;
  options: GraphDiffOptions;

  // UI Presentation & Modes
  filterMode: DiffFilterMode;
  visualMode: VisualComparisonMode;
  overlayOpacity: number;
  searchQuery: string;
  splitRatio: number;
  showMetricBadges: boolean;

  // Interactive Selection & Drawers
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  isSummaryDrawerOpen: boolean;
  isLegendOpen: boolean;
  activeDrawerTab: DiffDrawerTab;

  // Actions
  setBaseRunId: (runId: string | null) => void;
  setComparisonRunId: (runId: string | null) => void;
  setBaseDataset: (dataset: GraphDataset | null) => void;
  setComparisonDataset: (dataset: GraphDataset | null) => void;
  setDatasets: (
    base: GraphDataset | null,
    comp: GraphDataset | null,
    baseRunId?: string,
    compRunId?: string,
  ) => void;
  setFilterMode: (mode: DiffFilterMode) => void;
  setVisualMode: (mode: VisualComparisonMode) => void;
  setOverlayOpacity: (opacity: number) => void;
  setSearchQuery: (query: string) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setSelectedEdgeId: (edgeId: string | null) => void;
  setSummaryDrawerOpen: (open: boolean) => void;
  toggleSummaryDrawer: () => void;
  setLegendOpen: (open: boolean) => void;
  toggleLegend: () => void;
  setShowMetricBadges: (show: boolean) => void;
  toggleMetricBadges: () => void;
  setSplitRatio: (ratio: number) => void;
  setActiveDrawerTab: (tab: DiffDrawerTab) => void;
  setOptions: (opts: Partial<GraphDiffOptions>) => void;
  swapRuns: () => void;
  recomputeDiff: () => void;
  reset: () => void;

  // Selectors / Query Helpers
  getFilteredNodes: () => NodeDiff[];
  getFilteredEdges: () => EdgeDiff[];
  getSelectedNodeDiff: () => NodeDiff | null;
  getSelectedEdgeDiff: () => EdgeDiff | null;
  getCounts: () => GraphDiffCounts;
  getMetrics: () => GraphMetricSummary;
}

const initialDiffResult = computeGraphDiff(null, null);

export const useGraphDiffStore = create<GraphDiffState>((set, get) => ({
  baseRunId: null,
  comparisonRunId: null,
  baseDataset: null,
  comparisonDataset: null,

  diffResult: initialDiffResult,
  isComputing: false,
  options: {
    toleranceMs: 0,
    toleranceTokens: 0,
    ignoreUnchangedNodes: false,
    ignoreVisualPositionChanges: true,
  },

  filterMode: "all",
  visualMode: "unified-overlay",
  overlayOpacity: 0.75,
  searchQuery: "",
  splitRatio: 0.5,
  showMetricBadges: true,

  selectedNodeId: null,
  selectedEdgeId: null,
  isSummaryDrawerOpen: false,
  isLegendOpen: true,
  activeDrawerTab: "overview",

  setBaseRunId: (runId) => {
    set({ baseRunId: runId });
    get().recomputeDiff();
  },

  setComparisonRunId: (runId) => {
    set({ comparisonRunId: runId });
    get().recomputeDiff();
  },

  setBaseDataset: (dataset) => {
    const baseRunId = dataset?.id ?? get().baseRunId;
    const diff = computeGraphDiff(dataset, get().comparisonDataset, {
      ...get().options,
      baseRunId: baseRunId ?? undefined,
      compRunId: get().comparisonRunId ?? undefined,
    });
    set({
      baseDataset: dataset,
      baseRunId,
      diffResult: diff,
    });
  },

  setComparisonDataset: (dataset) => {
    const compRunId = dataset?.id ?? get().comparisonRunId;
    const diff = computeGraphDiff(get().baseDataset, dataset, {
      ...get().options,
      baseRunId: get().baseRunId ?? undefined,
      compRunId: compRunId ?? undefined,
    });
    set({
      comparisonDataset: dataset,
      comparisonRunId: compRunId,
      diffResult: diff,
    });
  },

  setDatasets: (base, comp, baseRunId, compRunId) => {
    const finalBaseRunId = baseRunId ?? base?.id ?? get().baseRunId;
    const finalCompRunId = compRunId ?? comp?.id ?? get().comparisonRunId;
    const diff = computeGraphDiff(base, comp, {
      ...get().options,
      baseRunId: finalBaseRunId ?? undefined,
      compRunId: finalCompRunId ?? undefined,
    });
    set({
      baseDataset: base,
      comparisonDataset: comp,
      baseRunId: finalBaseRunId,
      comparisonRunId: finalCompRunId,
      diffResult: diff,
    });
  },

  setFilterMode: (mode) => {
    set({ filterMode: mode });
  },

  setVisualMode: (mode) => {
    set({ visualMode: mode });
  },

  setOverlayOpacity: (opacity) => {
    // Clamp opacity between 0.05 and 1.0
    const clamped = Math.max(0.05, Math.min(1.0, opacity));
    set({ overlayOpacity: clamped });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  setSelectedNodeId: (nodeId) => {
    set({
      selectedNodeId: nodeId,
      selectedEdgeId: null,
      isSummaryDrawerOpen: nodeId !== null ? true : get().isSummaryDrawerOpen,
      activeDrawerTab: nodeId !== null ? "nodes" : get().activeDrawerTab,
    });
  },

  setSelectedEdgeId: (edgeId) => {
    set({
      selectedEdgeId: edgeId,
      selectedNodeId: null,
      isSummaryDrawerOpen: edgeId !== null ? true : get().isSummaryDrawerOpen,
      activeDrawerTab: edgeId !== null ? "edges" : get().activeDrawerTab,
    });
  },

  setSummaryDrawerOpen: (open) => {
    set({ isSummaryDrawerOpen: open });
  },

  toggleSummaryDrawer: () => {
    set((state) => ({ isSummaryDrawerOpen: !state.isSummaryDrawerOpen }));
  },

  setLegendOpen: (open) => {
    set({ isLegendOpen: open });
  },

  toggleLegend: () => {
    set((state) => ({ isLegendOpen: !state.isLegendOpen }));
  },

  setShowMetricBadges: (show) => {
    set({ showMetricBadges: show });
  },

  toggleMetricBadges: () => {
    set((state) => ({ showMetricBadges: !state.showMetricBadges }));
  },

  setSplitRatio: (ratio) => {
    const clamped = Math.max(0.1, Math.min(0.9, ratio));
    set({ splitRatio: clamped });
  },

  setActiveDrawerTab: (tab) => {
    set({ activeDrawerTab: tab });
  },

  setOptions: (newOpts) => {
    const updatedOptions = { ...get().options, ...newOpts };
    set({ options: updatedOptions });
    get().recomputeDiff();
  },

  swapRuns: () => {
    const state = get();
    const newBase = state.comparisonDataset;
    const newComp = state.baseDataset;
    const newBaseId = state.comparisonRunId;
    const newCompId = state.baseRunId;

    const diff = computeGraphDiff(newBase, newComp, {
      ...state.options,
      baseRunId: newBaseId ?? undefined,
      compRunId: newCompId ?? undefined,
    });

    set({
      baseDataset: newBase,
      comparisonDataset: newComp,
      baseRunId: newBaseId,
      comparisonRunId: newCompId,
      diffResult: diff,
    });
  },

  recomputeDiff: () => {
    const state = get();
    const diff = computeGraphDiff(state.baseDataset, state.comparisonDataset, {
      ...state.options,
      baseRunId: state.baseRunId ?? undefined,
      compRunId: state.comparisonRunId ?? undefined,
    });
    set({ diffResult: diff });
  },

  reset: () => {
    set({
      baseRunId: null,
      comparisonRunId: null,
      baseDataset: null,
      comparisonDataset: null,
      diffResult: initialDiffResult,
      isComputing: false,
      filterMode: "all",
      visualMode: "unified-overlay",
      overlayOpacity: 0.75,
      searchQuery: "",
      splitRatio: 0.5,
      showMetricBadges: true,
      selectedNodeId: null,
      selectedEdgeId: null,
      isSummaryDrawerOpen: false,
      isLegendOpen: true,
      activeDrawerTab: "overview",
    });
  },

  getFilteredNodes: () => {
    const { diffResult, filterMode, searchQuery } = get();
    return filterNodeDiffs(diffResult.nodeDiffs, filterMode, searchQuery);
  },

  getFilteredEdges: () => {
    const { diffResult, filterMode, searchQuery } = get();
    return filterEdgeDiffs(diffResult.edgeDiffs, filterMode, searchQuery);
  },

  getSelectedNodeDiff: () => {
    const { selectedNodeId, diffResult } = get();
    if (!selectedNodeId) return null;
    return diffResult.nodeDiffMap[selectedNodeId] ?? null;
  },

  getSelectedEdgeDiff: () => {
    const { selectedEdgeId, diffResult } = get();
    if (!selectedEdgeId) return null;
    return diffResult.edgeDiffMap[selectedEdgeId] ?? null;
  },

  getCounts: () => {
    return get().diffResult.counts;
  },

  getMetrics: () => {
    return get().diffResult.metrics;
  },
}));
