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

describe("layoutCacheStorage mode isolation & LRU eviction", () => {
  beforeEach(() => {
    clearStoredLayoutCache();
  });

  it("stores and retrieves distinct layouts for top-down vs left-right vs force vs radial", () => {
    const signature = "sig_graph_alpha";
    const topDownNodes: PositionedNode[] = [{ id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 }];
    const leftRightNodes: PositionedNode[] = [{ id: "n1", name: "Node 1", x: 200, y: 50, width: 100, height: 50 }];

    saveStoredLayout("top-down", signature, { nodes: topDownNodes, edges: [] });
    saveStoredLayout("left-right", signature, { nodes: leftRightNodes, edges: [] });

    const cachedTopDown = loadStoredLayout("top-down", signature);
    const cachedLeftRight = loadStoredLayout("left-right", signature);
    const cachedForce = loadStoredLayout("force", signature);

    expect(cachedTopDown?.nodes[0].x).toBe(10);
    expect(cachedLeftRight?.nodes[0].x).toBe(200);
    expect(cachedForce).toBeNull();
  });

  it("evicts oldest half of entries on QuotaExceededError", () => {
    const node: PositionedNode = { id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 };
    saveStoredLayout("top-down", "sig1", { nodes: [node], edges: [] });
    saveStoredLayout("top-down", "sig2", { nodes: [node], edges: [] });
    saveStoredLayout("top-down", "sig3", { nodes: [node], edges: [] });
    saveStoredLayout("top-down", "sig4", { nodes: [node], edges: [] });

    const originalSetItem = localStorage.setItem;
    let throwOnce = true;
    localStorage.setItem = (key: string, value: string) => {
      if (throwOnce) {
        throwOnce = false;
        const err = new Error("Quota exceeded");
        err.name = "QuotaExceededError";
        throw err;
      }
      originalSetItem.call(localStorage, key, value);
    };

    saveStoredLayout("top-down", "sig5", { nodes: [node], edges: [] });
    localStorage.setItem = originalSetItem;

    expect(loadStoredLayout("top-down", "sig1")).toBeNull();
    expect(loadStoredLayout("top-down", "sig2")).toBeNull();
    expect(loadStoredLayout("top-down", "sig3")).not.toBeNull();
    expect(loadStoredLayout("top-down", "sig4")).not.toBeNull();
    expect(loadStoredLayout("top-down", "sig5")).not.toBeNull();
  });
});
