import { create } from "zustand";
import {
  DEFAULT_RISK_WEIGHTS,
  type ColorRampPreset,
  type ColorStop,
  type CriticalPathMetric,
  type FilterMode,
  type HeatmapMetric,
  type LensConfig,
  type LensConfigExport,
  type LensMode,
  type RiskMetric,
  type RiskWeightConfig,
  type ScaleType,
  type TokenMetric,
} from "../engine/GraphCanvas/lenses/types";

// ============================================================================
// Default Per-Lens Configurations
// ============================================================================

export const DEFAULT_HEATMAP_CONFIG: Readonly<LensConfig> = Object.freeze({
  lens: "heatmap",
  colorRamp: "viridis",
  customStops: [],
  invertRamp: false,
  scaleType: "linear",
  minThreshold: 0.0,
  maxThreshold: 1.0,
  filterMode: "dim",
  dimOpacity: 0.18,
  showGlow: true,
  glowIntensity: 0.85,
  showBadges: true,
  showMetricLabels: true,
  heatmapMetric: "duration",
  criticalPathMetric: "duration",
  riskMetric: "composite",
  tokenMetric: "totalTokens",
  riskWeights: { ...DEFAULT_RISK_WEIGHTS },
  traceSubCriticalPaths: true,
  subCriticalThresholdPct: 15,
});

export const DEFAULT_CRITICAL_PATH_CONFIG: Readonly<LensConfig> = Object.freeze({
  lens: "critical-path",
  colorRamp: "inferno",
  customStops: [],
  invertRamp: false,
  scaleType: "linear",
  minThreshold: 0.0,
  maxThreshold: 1.0,
  filterMode: "dim",
  dimOpacity: 0.15,
  showGlow: true,
  glowIntensity: 0.9,
  showBadges: true,
  showMetricLabels: true,
  heatmapMetric: "duration",
  criticalPathMetric: "duration",
  riskMetric: "composite",
  tokenMetric: "totalTokens",
  riskWeights: { ...DEFAULT_RISK_WEIGHTS },
  traceSubCriticalPaths: true,
  subCriticalThresholdPct: 15,
});

export const DEFAULT_RISK_CONFIG: Readonly<LensConfig> = Object.freeze({
  lens: "risk",
  colorRamp: "risk-alert",
  customStops: [],
  invertRamp: false,
  scaleType: "linear",
  minThreshold: 0.0,
  maxThreshold: 1.0,
  filterMode: "dim",
  dimOpacity: 0.2,
  showGlow: true,
  glowIntensity: 0.95,
  showBadges: true,
  showMetricLabels: true,
  heatmapMetric: "duration",
  criticalPathMetric: "duration",
  riskMetric: "composite",
  tokenMetric: "totalTokens",
  riskWeights: { ...DEFAULT_RISK_WEIGHTS },
  traceSubCriticalPaths: true,
  subCriticalThresholdPct: 15,
});

export const DEFAULT_TOKEN_CONFIG: Readonly<LensConfig> = Object.freeze({
  lens: "token",
  colorRamp: "cyber-heat",
  customStops: [],
  invertRamp: false,
  scaleType: "log",
  minThreshold: 0.0,
  maxThreshold: 1.0,
  filterMode: "dim",
  dimOpacity: 0.18,
  showGlow: true,
  glowIntensity: 0.8,
  showBadges: true,
  showMetricLabels: true,
  heatmapMetric: "duration",
  criticalPathMetric: "duration",
  riskMetric: "composite",
  tokenMetric: "totalTokens",
  riskWeights: { ...DEFAULT_RISK_WEIGHTS },
  traceSubCriticalPaths: true,
  subCriticalThresholdPct: 15,
});

export const DEFAULT_NONE_CONFIG: Readonly<LensConfig> = Object.freeze({
  lens: "none",
  colorRamp: "viridis",
  customStops: [],
  invertRamp: false,
  scaleType: "linear",
  minThreshold: 0.0,
  maxThreshold: 1.0,
  filterMode: "dim",
  dimOpacity: 0.2,
  showGlow: false,
  glowIntensity: 0,
  showBadges: false,
  showMetricLabels: false,
  heatmapMetric: "duration",
  criticalPathMetric: "duration",
  riskMetric: "composite",
  tokenMetric: "totalTokens",
  riskWeights: { ...DEFAULT_RISK_WEIGHTS },
  traceSubCriticalPaths: false,
  subCriticalThresholdPct: 15,
});

// ============================================================================
// State & Actions Interface
// ============================================================================

export interface CanvasLensState {
  activeLens: LensMode;
  isToolbarExpanded: boolean;
  isLegendVisible: boolean;
  isTooltipEnabled: boolean;
  smoothTransitions: boolean;
  transitionDurationMs: number;
  hoveredLensNodeId: string | null;
  hoveredLensEdgeId: string | null;
  selectedLensNodeId: string | null;
  selectedLensEdgeId: string | null;
  pinnedNodeIds: Set<string>;
  configs: Record<LensMode, LensConfig>;
}

export interface CanvasLensActions {
  setActiveLens: (lens: LensMode) => void;
  toggleLens: (lens: LensMode) => void;
  setHeatmapMetric: (metric: HeatmapMetric) => void;
  setCriticalPathMetric: (metric: CriticalPathMetric) => void;
  setRiskMetric: (metric: RiskMetric) => void;
  setTokenMetric: (metric: TokenMetric) => void;
  setColorRamp: (ramp: ColorRampPreset, customStops?: ColorStop[]) => void;
  setColorRampForLens: (lens: LensMode, ramp: ColorRampPreset, customStops?: ColorStop[]) => void;
  setInvertRamp: (invert: boolean) => void;
  setScaleType: (scale: ScaleType) => void;
  setScaleTypeForLens: (lens: LensMode, scale: ScaleType) => void;
  setThresholds: (min: number, max: number) => void;
  setThresholdsForLens: (lens: LensMode, min: number, max: number) => void;
  setFilterMode: (mode: FilterMode) => void;
  setDimOpacity: (opacity: number) => void;
  setShowGlow: (show: boolean) => void;
  setGlowIntensity: (intensity: number) => void;
  setShowBadges: (show: boolean) => void;
  setShowMetricLabels: (show: boolean) => void;
  setRiskWeights: (weights: Partial<RiskWeightConfig>) => void;
  setTraceSubCriticalPaths: (trace: boolean, thresholdPct?: number) => void;
  setIsToolbarExpanded: (expanded: boolean) => void;
  toggleToolbarExpanded: () => void;
  setIsLegendVisible: (visible: boolean) => void;
  toggleLegendVisible: () => void;
  setIsTooltipEnabled: (enabled: boolean) => void;
  setSmoothTransitions: (enabled: boolean) => void;
  setTransitionDurationMs: (ms: number) => void;
  setHoveredLensNodeId: (id: string | null) => void;
  setHoveredLensEdgeId: (id: string | null) => void;
  setSelectedLensNodeId: (id: string | null) => void;
  setSelectedLensEdgeId: (id: string | null) => void;
  togglePinNode: (nodeId: string) => void;
  clearPinnedNodes: () => void;
  resetLensConfig: (lens?: LensMode) => void;
  resetAllConfigs: () => void;
  exportConfigJson: () => string;
  importConfigJson: (jsonStr: string) => boolean;
  getActiveConfig: () => LensConfig;
}

export type CanvasLensStore = CanvasLensState & CanvasLensActions;

// ============================================================================
// Store Implementation
// ============================================================================

export const useCanvasLensStore = create<CanvasLensStore>()((set, get) => ({
  activeLens: "none",
  isToolbarExpanded: true,
  isLegendVisible: true,
  isTooltipEnabled: true,
  smoothTransitions: true,
  transitionDurationMs: 300,
  hoveredLensNodeId: null,
  hoveredLensEdgeId: null,
  selectedLensNodeId: null,
  selectedLensEdgeId: null,
  pinnedNodeIds: new Set<string>(),

  configs: {
    none: { ...DEFAULT_NONE_CONFIG },
    heatmap: { ...DEFAULT_HEATMAP_CONFIG },
    "critical-path": { ...DEFAULT_CRITICAL_PATH_CONFIG },
    risk: { ...DEFAULT_RISK_CONFIG },
    token: { ...DEFAULT_TOKEN_CONFIG },
  },

  setActiveLens: (lens) => set({ activeLens: lens }),

  toggleLens: (lens) =>
    set((state) => ({
      activeLens: state.activeLens === lens ? "none" : lens,
    })),

  setHeatmapMetric: (metric) =>
    set((state) => ({
      configs: {
        ...state.configs,
        heatmap: { ...state.configs.heatmap, heatmapMetric: metric },
      },
    })),

  setCriticalPathMetric: (metric) =>
    set((state) => ({
      configs: {
        ...state.configs,
        "critical-path": { ...state.configs["critical-path"], criticalPathMetric: metric },
      },
    })),

  setRiskMetric: (metric) =>
    set((state) => ({
      configs: {
        ...state.configs,
        risk: { ...state.configs.risk, riskMetric: metric },
      },
    })),

  setTokenMetric: (metric) =>
    set((state) => ({
      configs: {
        ...state.configs,
        token: { ...state.configs.token, tokenMetric: metric },
      },
    })),

  setColorRamp: (ramp, customStops) => {
    const active = get().activeLens;
    if (active === "none") return;
    get().setColorRampForLens(active, ramp, customStops);
  },

  setColorRampForLens: (lens, ramp, customStops) =>
    set((state) => ({
      configs: {
        ...state.configs,
        [lens]: {
          ...state.configs[lens],
          colorRamp: ramp,
          customStops: customStops ? [...customStops] : state.configs[lens].customStops,
        },
      },
    })),

  setInvertRamp: (invert) => {
    const active = get().activeLens;
    if (active === "none") return;
    set((state) => ({
      configs: {
        ...state.configs,
        [active]: { ...state.configs[active], invertRamp: invert },
      },
    }));
  },

  setScaleType: (scale) => {
    const active = get().activeLens;
    if (active === "none") return;
    get().setScaleTypeForLens(active, scale);
  },

  setScaleTypeForLens: (lens, scale) =>
    set((state) => ({
      configs: {
        ...state.configs,
        [lens]: { ...state.configs[lens], scaleType: scale },
      },
    })),

  setThresholds: (min, max) => {
    const active = get().activeLens;
    if (active === "none") return;
    get().setThresholdsForLens(active, min, max);
  },

  setThresholdsForLens: (lens, min, max) =>
    set((state) => ({
      configs: {
        ...state.configs,
        [lens]: {
          ...state.configs[lens],
          minThreshold: Math.max(0, min),
          maxThreshold: Math.min(1, max),
        },
      },
    })),

  setFilterMode: (mode) => {
    const active = get().activeLens;
    if (active === "none") return;
    set((state) => ({
      configs: {
        ...state.configs,
        [active]: { ...state.configs[active], filterMode: mode },
      },
    }));
  },

  setDimOpacity: (opacity) => {
    const active = get().activeLens;
    if (active === "none") return;
    set((state) => ({
      configs: {
        ...state.configs,
        [active]: { ...state.configs[active], dimOpacity: Math.max(0, Math.min(1, opacity)) },
      },
    }));
  },

  setShowGlow: (show) => {
    const active = get().activeLens;
    if (active === "none") return;
    set((state) => ({
      configs: {
        ...state.configs,
        [active]: { ...state.configs[active], showGlow: show },
      },
    }));
  },

  setGlowIntensity: (intensity) => {
    const active = get().activeLens;
    if (active === "none") return;
    set((state) => ({
      configs: {
        ...state.configs,
        [active]: {
          ...state.configs[active],
          glowIntensity: Math.max(0, Math.min(1, intensity)),
        },
      },
    }));
  },

  setShowBadges: (show) => {
    const active = get().activeLens;
    if (active === "none") return;
    set((state) => ({
      configs: {
        ...state.configs,
        [active]: { ...state.configs[active], showBadges: show },
      },
    }));
  },

  setShowMetricLabels: (show) => {
    const active = get().activeLens;
    if (active === "none") return;
    set((state) => ({
      configs: {
        ...state.configs,
        [active]: { ...state.configs[active], showMetricLabels: show },
      },
    }));
  },

  setRiskWeights: (weights) =>
    set((state) => ({
      configs: {
        ...state.configs,
        risk: {
          ...state.configs.risk,
          riskWeights: { ...state.configs.risk.riskWeights, ...weights },
        },
      },
    })),

  setTraceSubCriticalPaths: (trace, thresholdPct) =>
    set((state) => ({
      configs: {
        ...state.configs,
        "critical-path": {
          ...state.configs["critical-path"],
          traceSubCriticalPaths: trace,
          subCriticalThresholdPct:
            thresholdPct !== undefined
              ? thresholdPct
              : state.configs["critical-path"].subCriticalThresholdPct,
        },
      },
    })),

  setIsToolbarExpanded: (expanded) => set({ isToolbarExpanded: expanded }),
  toggleToolbarExpanded: () => set((state) => ({ isToolbarExpanded: !state.isToolbarExpanded })),
  setIsLegendVisible: (visible) => set({ isLegendVisible: visible }),
  toggleLegendVisible: () => set((state) => ({ isLegendVisible: !state.isLegendVisible })),
  setIsTooltipEnabled: (enabled) => set({ isTooltipEnabled: enabled }),
  setSmoothTransitions: (enabled) => set({ smoothTransitions: enabled }),
  setTransitionDurationMs: (ms) => set({ transitionDurationMs: Math.max(0, ms) }),

  setHoveredLensNodeId: (id) => set({ hoveredLensNodeId: id }),
  setHoveredLensEdgeId: (id) => set({ hoveredLensEdgeId: id }),
  setSelectedLensNodeId: (id) => set({ selectedLensNodeId: id }),
  setSelectedLensEdgeId: (id) => set({ selectedLensEdgeId: id }),

  togglePinNode: (nodeId) =>
    set((state) => {
      const next = new Set(state.pinnedNodeIds);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return { pinnedNodeIds: next };
    }),

  clearPinnedNodes: () => set({ pinnedNodeIds: new Set<string>() }),

  resetLensConfig: (lens) => {
    const targetLens = lens ?? get().activeLens;
    switch (targetLens) {
      case "heatmap":
        set((state) => ({ configs: { ...state.configs, heatmap: { ...DEFAULT_HEATMAP_CONFIG } } }));
        break;
      case "critical-path":
        set((state) => ({
          configs: { ...state.configs, "critical-path": { ...DEFAULT_CRITICAL_PATH_CONFIG } },
        }));
        break;
      case "risk":
        set((state) => ({ configs: { ...state.configs, risk: { ...DEFAULT_RISK_CONFIG } } }));
        break;
      case "token":
        set((state) => ({ configs: { ...state.configs, token: { ...DEFAULT_TOKEN_CONFIG } } }));
        break;
      default:
        break;
    }
  },

  resetAllConfigs: () =>
    set({
      activeLens: "none",
      configs: {
        none: { ...DEFAULT_NONE_CONFIG },
        heatmap: { ...DEFAULT_HEATMAP_CONFIG },
        "critical-path": { ...DEFAULT_CRITICAL_PATH_CONFIG },
        risk: { ...DEFAULT_RISK_CONFIG },
        token: { ...DEFAULT_TOKEN_CONFIG },
      },
    }),

  exportConfigJson: () => {
    const state = get();
    const payload: LensConfigExport = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      activeLens: state.activeLens,
      smoothTransitions: state.smoothTransitions,
      transitionDurationMs: state.transitionDurationMs,
      configs: state.configs,
    };
    return JSON.stringify(payload, null, 2);
  },

  importConfigJson: (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr) as unknown;
      if (!parsed || typeof parsed !== "object") return false;

      const obj = parsed as Record<string, unknown>;
      if (obj.version !== "1.0.0" || !obj.configs || typeof obj.configs !== "object") {
        return false;
      }

      const importedConfigs = obj.configs as Record<LensMode, LensConfig>;
      const activeLens = (obj.activeLens as LensMode) || "none";
      const smoothTransitions =
        typeof obj.smoothTransitions === "boolean" ? obj.smoothTransitions : true;
      const transitionDurationMs =
        typeof obj.transitionDurationMs === "number" ? obj.transitionDurationMs : 300;

      set({
        activeLens,
        smoothTransitions,
        transitionDurationMs,
        configs: {
          none: importedConfigs.none ?? { ...DEFAULT_NONE_CONFIG },
          heatmap: importedConfigs.heatmap ?? { ...DEFAULT_HEATMAP_CONFIG },
          "critical-path": importedConfigs["critical-path"] ?? { ...DEFAULT_CRITICAL_PATH_CONFIG },
          risk: importedConfigs.risk ?? { ...DEFAULT_RISK_CONFIG },
          token: importedConfigs.token ?? { ...DEFAULT_TOKEN_CONFIG },
        },
      });

      return true;
    } catch {
      return false;
    }
  },

  getActiveConfig: () => {
    const state = get();
    return state.configs[state.activeLens] ?? state.configs.none;
  },
}));
