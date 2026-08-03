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

describe("layoutCacheStorage SQLite DB isolation", () => {
  beforeEach(() => {
    clearStoredLayoutCache();
  });

  it("stores and retrieves distinct layouts per dataset signature", () => {
    const sig1 = "sig_graph_alpha";
    const sig2 = "sig_graph_beta";
    const topDownNodes1: PositionedNode[] = [
      { id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 },
    ];
    const topDownNodes2: PositionedNode[] = [
      { id: "n1", name: "Node 1", x: 200, y: 50, width: 100, height: 50 },
    ];

    saveStoredLayout("top-down", sig1, { nodes: topDownNodes1, edges: [] });
    saveStoredLayout("top-down", sig2, { nodes: topDownNodes2, edges: [] });

    const cached1 = loadStoredLayout("top-down", sig1);
    const cached2 = loadStoredLayout("top-down", sig2);
    const cachedMiss = loadStoredLayout("top-down", "sig_miss");

    expect(cached1?.nodes[0].x).toBe(10);
    expect(cached2?.nodes[0].x).toBe(200);
    expect(cachedMiss).toBeNull();
  });

  it("clears cached layouts cleanly", () => {
    const node: PositionedNode = { id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 };
    saveStoredLayout("top-down", "sig1", { nodes: [node], edges: [] });
    expect(loadStoredLayout("top-down", "sig1")).not.toBeNull();

    clearStoredLayoutCache();
    expect(loadStoredLayout("top-down", "sig1")).toBeNull();
  });

  it("verifies zero localStorage key duplication for legacy prefix entries", () => {
    const node: PositionedNode = { id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 };
    saveStoredLayout("top-down", "sig_dup_check", { nodes: [node], edges: [] });
    expect(loadStoredLayout("top-down", "sig_dup_check")).not.toBeNull();

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
