import { beforeEach, describe, expect, it } from "bun:test";
import {
  directionFromLegacyLayoutMode,
  normalizeLayoutMode,
  useGraphStore,
  type LayoutMode,
} from "./useGraphStore";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "../engine/layout/custom/config";

/** Every mode string this app, or any version of it, has ever written to persisted state. */
const LEGACY_MODE_EXPECTATIONS: { mode: string; engine: LayoutMode }[] = [
  { mode: "layered", engine: "layered" },
  { mode: "layered-spline", engine: "layered" },
  { mode: "top-down", engine: "layered" },
  { mode: "top-down-dagre", engine: "layered" },
  { mode: "bottom-up", engine: "layered" },
  { mode: "left-right", engine: "layered" },
  { mode: "right-left", engine: "layered" },
  { mode: "force", engine: "layered" },
  { mode: "stress", engine: "layered" },
  { mode: "organic", engine: "layered" },
  { mode: "grid", engine: "layered" },
  { mode: "radial", engine: "radial" },
];

describe("normalizeLayoutMode", () => {
  for (const { mode, engine } of LEGACY_MODE_EXPECTATIONS) {
    it(`maps "${mode}" onto the "${engine}" engine`, () => {
      expect(normalizeLayoutMode(mode)).toBe(engine);
    });
  }

  it("falls back to layered for a string no client ever wrote", () => {
    expect(normalizeLayoutMode("not-a-real-mode")).toBe("layered");
    expect(normalizeLayoutMode("")).toBe("layered");
  });

  it("is not fooled by inherited Object.prototype keys", () => {
    // The map is a plain object, so a lookup of "constructor" would return a function if the
    // implementation used a bare property read without a fallback of the right shape.
    expect(normalizeLayoutMode("constructor")).toBe("layered");
    expect(normalizeLayoutMode("toString")).toBe("layered");
  });
});

describe("directionFromLegacyLayoutMode", () => {
  it("recovers the direction a direction-bearing legacy mode stood for", () => {
    expect(directionFromLegacyLayoutMode("left-right")).toBe("left-right");
    expect(directionFromLegacyLayoutMode("right-left")).toBe("right-left");
    expect(directionFromLegacyLayoutMode("bottom-up")).toBe("bottom-up");
  });

  it("returns null for modes that never carried a direction", () => {
    expect(directionFromLegacyLayoutMode("layered")).toBeNull();
    expect(directionFromLegacyLayoutMode("radial")).toBeNull();
    expect(directionFromLegacyLayoutMode("organic")).toBeNull();
    expect(directionFromLegacyLayoutMode("top-down")).toBeNull();
    expect(directionFromLegacyLayoutMode("nonsense")).toBeNull();
  });
});

describe("useGraphStore layout actions", () => {
  beforeEach(() => {
    useGraphStore.setState({
      layoutMode: "layered",
      layoutConfig: { ...DEFAULT_CUSTOM_LAYOUT_CONFIG },
    });
  });

  it("setLayoutMode normalizes and leaves direction alone for a plain engine name", () => {
    useGraphStore.getState().setLayoutMode("radial");
    expect(useGraphStore.getState().layoutMode).toBe("radial");
    expect(useGraphStore.getState().layoutConfig.direction).toBe("top-down");
  });

  it("setLayoutMode carries a legacy direction-bearing mode into config.direction", () => {
    useGraphStore.getState().setLayoutMode("left-right");
    expect(useGraphStore.getState().layoutMode).toBe("layered");
    expect(useGraphStore.getState().layoutConfig.direction).toBe("left-right");
  });

  it("setLayoutMode does not clobber a deliberate direction with a non-directional mode", () => {
    useGraphStore.getState().setLayoutConfig({ direction: "right-left" });
    useGraphStore.getState().setLayoutMode("layered");
    expect(useGraphStore.getState().layoutConfig.direction).toBe("right-left");
  });

  it("setLayoutConfig merges a partial over the current config", () => {
    useGraphStore.getState().setLayoutConfig({ nodeGap: 999 });
    expect(useGraphStore.getState().layoutConfig.nodeGap).toBe(999);
    expect(useGraphStore.getState().layoutConfig.rankGap).toBe(
      DEFAULT_CUSTOM_LAYOUT_CONFIG.rankGap,
    );
  });

  it("resetLayoutConfig restores every field to the engine defaults", () => {
    useGraphStore.getState().setLayoutConfig({ nodeGap: 999, direction: "bottom-up" });
    useGraphStore.getState().resetLayoutConfig();
    expect(useGraphStore.getState().layoutConfig).toEqual({ ...DEFAULT_CUSTOM_LAYOUT_CONFIG });
  });
});
