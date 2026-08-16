import { beforeEach, describe, expect, it } from "bun:test";
import { useCanvasLensStore } from "../../../store/useCanvasLensStore";

describe("useCanvasLensStore", () => {
  beforeEach(() => {
    useCanvasLensStore.getState().resetAllConfigs();
  });

  it("initializes with default state", () => {
    const state = useCanvasLensStore.getState();
    expect(state.activeLens).toBe("none");
    expect(state.isToolbarExpanded).toBe(true);
    expect(state.isLegendVisible).toBe(true);
    expect(state.smoothTransitions).toBe(true);
  });

  it("sets and toggles active lens", () => {
    useCanvasLensStore.getState().setActiveLens("heatmap");
    expect(useCanvasLensStore.getState().activeLens).toBe("heatmap");

    useCanvasLensStore.getState().toggleLens("heatmap");
    expect(useCanvasLensStore.getState().activeLens).toBe("none");

    useCanvasLensStore.getState().toggleLens("critical-path");
    expect(useCanvasLensStore.getState().activeLens).toBe("critical-path");
  });

  it("updates per-lens metrics independently", () => {
    useCanvasLensStore.getState().setHeatmapMetric("cognitiveLatency");
    expect(useCanvasLensStore.getState().configs.heatmap.heatmapMetric).toBe("cognitiveLatency");

    useCanvasLensStore.getState().setCriticalPathMetric("slack");
    expect(useCanvasLensStore.getState().configs["critical-path"].criticalPathMetric).toBe("slack");

    useCanvasLensStore.getState().setRiskMetric("retryCount");
    expect(useCanvasLensStore.getState().configs.risk.riskMetric).toBe("retryCount");

    useCanvasLensStore.getState().setTokenMetric("costUsd");
    expect(useCanvasLensStore.getState().configs.token.tokenMetric).toBe("costUsd");
  });

  it("modifies thresholds, color ramps, and toggles", () => {
    useCanvasLensStore.getState().setActiveLens("heatmap");
    useCanvasLensStore.getState().setThresholds(0.2, 0.8);
    expect(useCanvasLensStore.getState().configs.heatmap.minThreshold).toBe(0.2);
    expect(useCanvasLensStore.getState().configs.heatmap.maxThreshold).toBe(0.8);

    useCanvasLensStore.getState().setColorRamp("plasma");
    expect(useCanvasLensStore.getState().configs.heatmap.colorRamp).toBe("plasma");

    useCanvasLensStore.getState().setShowGlow(false);
    expect(useCanvasLensStore.getState().configs.heatmap.showGlow).toBe(false);
  });

  it("handles node pinning", () => {
    useCanvasLensStore.getState().togglePinNode("node-a");
    expect(useCanvasLensStore.getState().pinnedNodeIds.has("node-a")).toBe(true);

    useCanvasLensStore.getState().togglePinNode("node-a");
    expect(useCanvasLensStore.getState().pinnedNodeIds.has("node-a")).toBe(false);

    useCanvasLensStore.getState().togglePinNode("node-b");
    useCanvasLensStore.getState().clearPinnedNodes();
    expect(useCanvasLensStore.getState().pinnedNodeIds.size).toBe(0);
  });

  it("exports and imports configuration JSON", () => {
    useCanvasLensStore.getState().setActiveLens("token");
    useCanvasLensStore.getState().setTokenMetric("costIntensity");
    useCanvasLensStore.getState().setColorRamp("cyber-heat");

    const jsonStr = useCanvasLensStore.getState().exportConfigJson();
    expect(jsonStr).toContain('"version": "1.0.0"');
    expect(jsonStr).toContain('"costIntensity"');

    // Reset all
    useCanvasLensStore.getState().resetAllConfigs();
    expect(useCanvasLensStore.getState().activeLens).toBe("none");

    // Import back
    const success = useCanvasLensStore.getState().importConfigJson(jsonStr);
    expect(success).toBe(true);
    expect(useCanvasLensStore.getState().activeLens).toBe("token");
    expect(useCanvasLensStore.getState().configs.token.tokenMetric).toBe("costIntensity");
  });

  it("returns false for invalid JSON import", () => {
    const success = useCanvasLensStore.getState().importConfigJson("invalid json {}");
    expect(success).toBe(false);
  });
});
