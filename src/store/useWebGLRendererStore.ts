import { create } from "zustand";

export type WebGLContextState = "uninitialized" | "ready" | "lost" | "restoring" | "fallback";

export interface RenderStats {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  nodeCount: number;
  edgeCount: number;
  visibleNodeCount: number;
  visibleEdgeCount: number;
  particleCount: number;
  gpuMemoryBytes: number;
  lastRenderTimestamp: number;
}

export interface WebGLRenderConfig {
  enabled: boolean;
  antialiasing: boolean;
  pixelRatio: number;
  particleCount: number;
  particleSpeed: number;
  particleSize: number;
  glowIntensity: number;
  pulseFrequency: number;
  bloomEnabled: boolean;
  targetFPS: number;
  debugStats: boolean;
  maxBatchSize: number;
  cullingMargin: number;
  highDpi: boolean;
  backgroundColor: [number, number, number, number];
  edgeColor: [number, number, number, number];
  edgeActiveColor: [number, number, number, number];
}

export const DEFAULT_WEBGL_CONFIG: WebGLRenderConfig = {
  enabled: true,
  antialiasing: true,
  pixelRatio: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  particleCount: 2000,
  particleSpeed: 1.0,
  particleSize: 3.0,
  glowIntensity: 0.8,
  pulseFrequency: 1.5,
  bloomEnabled: true,
  targetFPS: 60,
  debugStats: false,
  maxBatchSize: 65536,
  cullingMargin: 100,
  highDpi: true,
  backgroundColor: [0.05, 0.07, 0.11, 1.0],
  edgeColor: [0.3, 0.4, 0.5, 0.6],
  edgeActiveColor: [0.2, 0.7, 1.0, 0.9],
};

export const DEFAULT_RENDER_STATS: RenderStats = {
  fps: 60,
  frameTimeMs: 16.6,
  drawCalls: 0,
  nodeCount: 0,
  edgeCount: 0,
  visibleNodeCount: 0,
  visibleEdgeCount: 0,
  particleCount: 0,
  gpuMemoryBytes: 0,
  lastRenderTimestamp: 0,
};

export interface WebGLRendererStoreState {
  enabled: boolean;
  antialiasing: boolean;
  particleCount: number;
  particleSpeed: number;
  glowIntensity: number;
  bloomEnabled: boolean;
  pulseFrequency: number;
  targetFPS: number;
  debugStats: boolean;
  fallbackActive: boolean;
  contextState: WebGLContextState;
  config: WebGLRenderConfig;
  stats: RenderStats;

  // Actions
  setConfig: (partial: Partial<WebGLRenderConfig>) => void;
  updateStats: (stats: Partial<RenderStats>) => void;
  setFallbackActive: (active: boolean) => void;
  setContextState: (state: WebGLContextState) => void;
  toggleEnabled: () => void;
  setParticleCount: (count: number) => void;
  setGlowIntensity: (intensity: number) => void;
  setBloomEnabled: (enabled: boolean) => void;
  setAntialiasing: (enabled: boolean) => void;
  setDebugStats: (enabled: boolean) => void;
  resetConfig: () => void;
  resetStats: () => void;
}

export const useWebGLRendererStore = create<WebGLRendererStoreState>((set) => ({
  enabled: DEFAULT_WEBGL_CONFIG.enabled,
  antialiasing: DEFAULT_WEBGL_CONFIG.antialiasing,
  particleCount: DEFAULT_WEBGL_CONFIG.particleCount,
  particleSpeed: DEFAULT_WEBGL_CONFIG.particleSpeed,
  glowIntensity: DEFAULT_WEBGL_CONFIG.glowIntensity,
  bloomEnabled: DEFAULT_WEBGL_CONFIG.bloomEnabled,
  pulseFrequency: DEFAULT_WEBGL_CONFIG.pulseFrequency,
  targetFPS: DEFAULT_WEBGL_CONFIG.targetFPS,
  debugStats: DEFAULT_WEBGL_CONFIG.debugStats,
  fallbackActive: false,
  contextState: "uninitialized",
  config: { ...DEFAULT_WEBGL_CONFIG },
  stats: { ...DEFAULT_RENDER_STATS },

  setConfig: (partial: Partial<WebGLRenderConfig>): void =>
    set((state) => {
      const newConfig = { ...state.config, ...partial };
      return {
        config: newConfig,
        enabled: newConfig.enabled,
        antialiasing: newConfig.antialiasing,
        particleCount: newConfig.particleCount,
        particleSpeed: newConfig.particleSpeed,
        glowIntensity: newConfig.glowIntensity,
        bloomEnabled: newConfig.bloomEnabled,
        pulseFrequency: newConfig.pulseFrequency,
        targetFPS: newConfig.targetFPS,
        debugStats: newConfig.debugStats,
      };
    }),

  updateStats: (partial: Partial<RenderStats>): void =>
    set((state) => ({
      stats: { ...state.stats, ...partial },
    })),

  setFallbackActive: (fallbackActive: boolean): void =>
    set({
      fallbackActive,
      contextState: fallbackActive ? "fallback" : "ready",
    }),

  setContextState: (contextState: WebGLContextState): void =>
    set({
      contextState,
      fallbackActive: contextState === "fallback",
    }),

  toggleEnabled: (): void =>
    set((state) => {
      const nextEnabled = !state.enabled;
      return {
        enabled: nextEnabled,
        config: { ...state.config, enabled: nextEnabled },
      };
    }),

  setParticleCount: (particleCount: number): void =>
    set((state) => ({
      particleCount,
      config: { ...state.config, particleCount },
    })),

  setGlowIntensity: (glowIntensity: number): void =>
    set((state) => ({
      glowIntensity,
      config: { ...state.config, glowIntensity },
    })),

  setBloomEnabled: (bloomEnabled: boolean): void =>
    set((state) => ({
      bloomEnabled,
      config: { ...state.config, bloomEnabled },
    })),

  setAntialiasing: (antialiasing: boolean): void =>
    set((state) => ({
      antialiasing,
      config: { ...state.config, antialiasing },
    })),

  setDebugStats: (debugStats: boolean): void =>
    set((state) => ({
      debugStats,
      config: { ...state.config, debugStats },
    })),

  resetConfig: (): void =>
    set({
      config: { ...DEFAULT_WEBGL_CONFIG },
      enabled: DEFAULT_WEBGL_CONFIG.enabled,
      antialiasing: DEFAULT_WEBGL_CONFIG.antialiasing,
      particleCount: DEFAULT_WEBGL_CONFIG.particleCount,
      particleSpeed: DEFAULT_WEBGL_CONFIG.particleSpeed,
      glowIntensity: DEFAULT_WEBGL_CONFIG.glowIntensity,
      bloomEnabled: DEFAULT_WEBGL_CONFIG.bloomEnabled,
      pulseFrequency: DEFAULT_WEBGL_CONFIG.pulseFrequency,
      targetFPS: DEFAULT_WEBGL_CONFIG.targetFPS,
      debugStats: DEFAULT_WEBGL_CONFIG.debugStats,
    }),

  resetStats: (): void =>
    set({
      stats: { ...DEFAULT_RENDER_STATS },
    }),
}));
