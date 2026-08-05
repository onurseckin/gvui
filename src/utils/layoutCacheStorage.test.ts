import { describe, expect, it, beforeEach } from "bun:test";
import { loadStoredLayout, saveStoredLayout, clearStoredLayoutCache } from "./layoutCacheStorage";
import type { PositionedNode } from "../types/graphData";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = mockLocalStorage;
}

describe("layoutCacheStorage local DB isolation", () => {
  beforeEach(() => {
    clearStoredLayoutCache();
  });

  it("stores and retrieves distinct layouts per dataset signature", () => {
    const sig1 = "sig_graph_alpha";
    const sig2 = "sig_graph_beta";
    const nodesForSig1: PositionedNode[] = [
      { id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 },
    ];
    const nodesForSig2: PositionedNode[] = [
      { id: "n1", name: "Node 1", x: 200, y: 50, width: 100, height: 50 },
    ];

    saveStoredLayout("layered", sig1, { nodes: nodesForSig1, edges: [] });
    saveStoredLayout("layered", sig2, { nodes: nodesForSig2, edges: [] });

    const cached1 = loadStoredLayout("layered", sig1);
    const cached2 = loadStoredLayout("layered", sig2);
    const cachedMiss = loadStoredLayout("layered", "sig_miss");

    expect(cached1?.nodes[0].x).toBe(10);
    expect(cached2?.nodes[0].x).toBe(200);
    expect(cachedMiss).toBeNull();
  });

  it("treats (mode, signature) as the whole key: same signature under a different mode misses", () => {
    // The cache key is `${mode}_${signature}` (see localDb.getGraphLayout). A layout computed
    // for "layered" must never satisfy a request for "radial" against the identical signature —
    // different engine modes produce structurally different output for the same dataset.
    const sig = "sig_shared_across_modes";
    const layeredNodes: PositionedNode[] = [
      { id: "n1", name: "Node 1", x: 0, y: 0, width: 100, height: 50 },
    ];

    saveStoredLayout("layered", sig, { nodes: layeredNodes, edges: [] });

    expect(loadStoredLayout("layered", sig)).not.toBeNull();
    expect(loadStoredLayout("radial", sig)).toBeNull();
  });

  it("re-hits the cache for a repeated identical signature (idempotent save/load)", () => {
    // The caller (`GraphCanvas`) folds every Tier-1/Tier-2/Tier-3 layout-affecting config field
    // into `signature` via its own config hash before calling into this module (see
    // `computeLayoutConfigHash` in `GraphCanvas/index.tsx`, covered end-to-end in
    // `GraphCanvasIntegration.test.tsx`, which also proves cornerRadius/edgeStyle/zoomSensitivity
    // are excluded from that hash). This module's own contract is simpler and is what's under test
    // here: an unchanged (mode, signature) pair is always a hit, regardless of how many times it's
    // requested or re-saved.
    const sig = "sig_stable_config";
    const node: PositionedNode = { id: "n1", name: "Node 1", x: 5, y: 5, width: 100, height: 50 };

    saveStoredLayout("layered", sig, { nodes: [node], edges: [] });
    expect(loadStoredLayout("layered", sig)?.nodes[0].x).toBe(5);
    expect(loadStoredLayout("layered", sig)?.nodes[0].x).toBe(5);

    saveStoredLayout("layered", sig, { nodes: [{ ...node, x: 9 }], edges: [] });
    expect(loadStoredLayout("layered", sig)?.nodes[0].x).toBe(9);
  });

  it("clears cached layouts cleanly", () => {
    const node: PositionedNode = { id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 };
    saveStoredLayout("layered", "sig1", { nodes: [node], edges: [] });
    expect(loadStoredLayout("layered", "sig1")).not.toBeNull();

    clearStoredLayoutCache();
    expect(loadStoredLayout("layered", "sig1")).toBeNull();
  });

  it("verifies zero localStorage key duplication for legacy prefix entries", () => {
    const node: PositionedNode = { id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 };
    saveStoredLayout("layered", "sig_dup_check", { nodes: [node], edges: [] });
    expect(loadStoredLayout("layered", "sig_dup_check")).not.toBeNull();

    let legacyCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("gvui_layout_cache_v3_")) {
        legacyCount++;
      }
    }
    expect(legacyCount).toBe(0);
  });
});
