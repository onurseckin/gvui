import { create } from "zustand";
import type {
  ColorScheme,
  FlamegraphFilterOptions,
  FlamegraphMetrics,
  FlamegraphNode,
  ProfileExportData,
  ProfileSpan,
  SpanCategory,
  SpanStatus,
  SpanTier,
  ViewportRange,
} from "../components/Flamegraph/types";
import {
  clampRange,
  computeFlamegraphLayout,
  computeMetrics,
  normalizeSpan,
  sanitizeNumber,
} from "../components/Flamegraph/flamegraphEngine";

export interface FlamegraphState {
  spans: ProfileSpan[];
  viewport: ViewportRange;
  timelineBounds: ViewportRange;
  zoom: number;
  panOffsetPct: number;
  selectedSpanId: string | null;
  hoveredSpanId: string | null;
  colorScheme: ColorScheme;
  filterOptions: FlamegraphFilterOptions;
  isDrawerOpen: boolean;
}

export interface FlamegraphActions {
  setSpans: (spans: ProfileSpan[]) => void;
  addSpan: (span: Partial<ProfileSpan>) => void;
  addSpans: (spans: Partial<ProfileSpan>[]) => void;
  updateSpan: (id: string, updates: Partial<ProfileSpan>) => void;
  removeSpan: (id: string) => void;
  clearSpans: () => void;
  setSelectedSpanId: (id: string | null) => void;
  setHoveredSpanId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setTierFilter: (tier: SpanTier | "all") => void;
  setStatusFilter: (status: SpanStatus | "all") => void;
  setCategoryFilter: (category: SpanCategory | "all") => void;
  setAgentFilter: (agentId: string | "all") => void;
  setMinDurationMs: (minDuration?: number) => void;
  setColorScheme: (scheme: ColorScheme) => void;
  setViewport: (range: Partial<ViewportRange>) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setPanOffset: (offsetPct: number) => void;
  resetScrubber: () => void;
  setIsDrawerOpen: (isOpen: boolean) => void;
  toggleDrawer: () => void;
  getSpanById: (id: string) => ProfileSpan | undefined;
  getNodeById: (id: string) => FlamegraphNode | undefined;
  getLayoutNodes: () => FlamegraphNode[];
  getMetrics: () => FlamegraphMetrics;
  getAncestry: (spanId: string) => ProfileSpan[];
  getChildren: (spanId: string) => ProfileSpan[];
  exportProfileJson: () => string;
  importProfileJson: (jsonStr: string) => boolean;
}

export type FlamegraphStore = FlamegraphState & FlamegraphActions;

const DEFAULT_FILTER_OPTIONS: FlamegraphFilterOptions = {
  tierFilter: "all",
  statusFilter: "all",
  categoryFilter: "all",
  agentFilter: "all",
  searchQuery: "",
  minDurationMs: 0,
};

function computeInitialBounds(spans: ProfileSpan[]): ViewportRange {
  if (spans.length === 0) {
    return { start: 0, end: 1000 };
  }
  let min = Number.MAX_SAFE_INTEGER;
  let max = Number.MIN_SAFE_INTEGER;
  for (const s of spans) {
    if (s.startTime < min) min = s.startTime;
    if (s.endTime > max) max = s.endTime;
  }
  if (min === Number.MAX_SAFE_INTEGER) min = 0;
  if (max === Number.MIN_SAFE_INTEGER) max = min + 1000;
  if (max <= min) max = min + 1000;
  return { start: min, end: max };
}

export const createFlamegraphStore = (initialSpans: ProfileSpan[] = []) => {
  const normalizedInitial = initialSpans.map(normalizeSpan);
  const initialBounds = computeInitialBounds(normalizedInitial);

  return create<FlamegraphStore>((set, get) => ({
    spans: normalizedInitial,
    viewport: { ...initialBounds },
    timelineBounds: { ...initialBounds },
    zoom: 1,
    panOffsetPct: 0,
    selectedSpanId: null,
    hoveredSpanId: null,
    colorScheme: "tier",
    filterOptions: { ...DEFAULT_FILTER_OPTIONS },
    isDrawerOpen: false,

    setSpans: (rawSpans: ProfileSpan[]) => {
      const spans = rawSpans.map(normalizeSpan);
      const bounds = computeInitialBounds(spans);
      set({
        spans,
        timelineBounds: bounds,
        viewport: { ...bounds },
        zoom: 1,
        panOffsetPct: 0,
        selectedSpanId: null,
      });
    },

    addSpan: (spanInput: Partial<ProfileSpan>) => {
      const span = normalizeSpan(spanInput);
      set((state) => {
        const spans = [...state.spans, span];
        const timelineBounds = computeInitialBounds(spans);
        const viewport = state.spans.length === 0 ? { ...timelineBounds } : state.viewport;
        return {
          spans,
          timelineBounds,
          viewport,
        };
      });
    },

    addSpans: (spansInput: Partial<ProfileSpan>[]) => {
      if (spansInput.length === 0) return;
      const newSpans = spansInput.map(normalizeSpan);
      set((state) => {
        const spans = [...state.spans, ...newSpans];
        const timelineBounds = computeInitialBounds(spans);
        return {
          spans,
          timelineBounds,
        };
      });
    },

    updateSpan: (id: string, updates: Partial<ProfileSpan>) => {
      set((state) => {
        const spans = state.spans.map((span) => {
          if (span.id !== id) return span;
          return normalizeSpan({
            ...span,
            ...updates,
            id: span.id,
          });
        });
        const timelineBounds = computeInitialBounds(spans);
        return {
          spans,
          timelineBounds,
        };
      });
    },

    removeSpan: (id: string) => {
      set((state) => {
        const spans = state.spans.filter((s) => s.id !== id);
        const timelineBounds = computeInitialBounds(spans);
        const selectedSpanId = state.selectedSpanId === id ? null : state.selectedSpanId;
        const isDrawerOpen = selectedSpanId ? state.isDrawerOpen : false;
        return {
          spans,
          timelineBounds,
          selectedSpanId,
          isDrawerOpen,
        };
      });
    },

    clearSpans: () => {
      const emptyBounds = { start: 0, end: 1000 };
      set({
        spans: [],
        timelineBounds: emptyBounds,
        viewport: emptyBounds,
        selectedSpanId: null,
        hoveredSpanId: null,
        zoom: 1,
        panOffsetPct: 0,
        isDrawerOpen: false,
      });
    },

    setSelectedSpanId: (id: string | null) => {
      set({
        selectedSpanId: id,
        isDrawerOpen: id !== null,
      });
    },

    setHoveredSpanId: (id: string | null) => {
      set({ hoveredSpanId: id });
    },

    setSearchQuery: (searchQuery: string) => {
      set((state) => ({
        filterOptions: {
          ...state.filterOptions,
          searchQuery,
        },
      }));
    },

    setTierFilter: (tierFilter: SpanTier | "all") => {
      set((state) => ({
        filterOptions: {
          ...state.filterOptions,
          tierFilter,
        },
      }));
    },

    setStatusFilter: (statusFilter: SpanStatus | "all") => {
      set((state) => ({
        filterOptions: {
          ...state.filterOptions,
          statusFilter,
        },
      }));
    },

    setCategoryFilter: (categoryFilter: SpanCategory | "all") => {
      set((state) => ({
        filterOptions: {
          ...state.filterOptions,
          categoryFilter,
        },
      }));
    },

    setAgentFilter: (agentFilter: string | "all") => {
      set((state) => ({
        filterOptions: {
          ...state.filterOptions,
          agentFilter,
        },
      }));
    },

    setMinDurationMs: (minDurationMs?: number) => {
      set((state) => ({
        filterOptions: {
          ...state.filterOptions,
          minDurationMs: sanitizeNumber(minDurationMs, 0, 0),
        },
      }));
    },

    setColorScheme: (colorScheme: ColorScheme) => {
      set({ colorScheme });
    },

    setViewport: (range: Partial<ViewportRange>) => {
      set((state) => {
        const start = range.start !== undefined ? range.start : state.viewport.start;
        const end = range.end !== undefined ? range.end : state.viewport.end;
        const clamped = clampRange({ start, end }, state.timelineBounds);
        return { viewport: clamped };
      });
    },

    setZoom: (zoom: number) => {
      const clampedZoom = Math.min(50, Math.max(1, sanitizeNumber(zoom, 1)));
      set({ zoom: clampedZoom });
    },

    zoomIn: () => {
      set((state) => ({
        zoom: Math.min(50, state.zoom * 1.3),
      }));
    },

    zoomOut: () => {
      set((state) => ({
        zoom: Math.max(1, state.zoom / 1.3),
      }));
    },

    resetZoom: () => {
      set((state) => ({
        zoom: 1,
        panOffsetPct: 0,
        viewport: { ...state.timelineBounds },
      }));
    },

    setPanOffset: (offsetPct: number) => {
      const clamped = Math.max(-200, Math.min(200, sanitizeNumber(offsetPct, 0)));
      set({ panOffsetPct: clamped });
    },

    resetScrubber: () => {
      set((state) => ({
        viewport: { ...state.timelineBounds },
        zoom: 1,
        panOffsetPct: 0,
      }));
    },

    setIsDrawerOpen: (isDrawerOpen: boolean) => {
      set({ isDrawerOpen });
    },

    toggleDrawer: () => {
      set((state) => ({ isDrawerOpen: !state.isDrawerOpen }));
    },

    getSpanById: (id: string) => {
      return get().spans.find((s) => s.id === id);
    },

    getNodeById: (id: string) => {
      const nodes = get().getLayoutNodes();
      return nodes.find((n) => n.id === id);
    },

    getLayoutNodes: () => {
      const state = get();
      const layout = computeFlamegraphLayout(state.spans, {
        viewport: state.viewport,
        zoom: state.zoom,
        panOffsetPct: state.panOffsetPct,
        colorScheme: state.colorScheme,
        filterOptions: state.filterOptions,
      });
      return layout.nodes;
    },

    getMetrics: () => {
      return computeMetrics(get().spans);
    },

    getAncestry: (spanId: string) => {
      const spans = get().spans;
      const spanMap = new Map<string, ProfileSpan>();
      for (const s of spans) spanMap.set(s.id, s);

      const ancestry: ProfileSpan[] = [];
      const visited = new Set<string>();
      let current = spanMap.get(spanId);

      while (current && current.parentId && !visited.has(current.parentId)) {
        visited.add(current.id);
        const parent = spanMap.get(current.parentId);
        if (parent) {
          ancestry.unshift(parent);
          current = parent;
        } else {
          break;
        }
      }

      return ancestry;
    },

    getChildren: (spanId: string) => {
      const spans = get().spans;
      return spans.filter((s) => s.parentId === spanId);
    },

    exportProfileJson: () => {
      const state = get();
      const exportData: ProfileExportData = {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        spans: state.spans,
        metrics: computeMetrics(state.spans),
      };
      return JSON.stringify(exportData, null, 2);
    },

    importProfileJson: (jsonStr: string) => {
      try {
        const parsed = JSON.parse(jsonStr) as unknown;
        if (!parsed || typeof parsed !== "object") return false;

        const maybeSpans = (parsed as { spans?: unknown }).spans;
        if (!Array.isArray(maybeSpans)) return false;

        const validSpans: ProfileSpan[] = [];
        for (const item of maybeSpans) {
          if (item && typeof item === "object" && "name" in item) {
            validSpans.push(normalizeSpan(item as Partial<ProfileSpan>));
          }
        }

        if (validSpans.length === 0 && maybeSpans.length > 0) return false;

        get().setSpans(validSpans);
        return true;
      } catch {
        return false;
      }
    },
  }));
};

export const useFlamegraphStore = createFlamegraphStore();
