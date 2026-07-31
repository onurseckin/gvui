import { describe, expect, it, beforeEach } from "bun:test";
import { loadStoredLayout, saveStoredLayout, clearStoredLayoutCache } from "./layoutCacheStorage";
import type { PositionedNode, PositionedEdge } from "../types/graphData";

if (typeof window === "undefined") {
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

describe("layoutCacheStorage", () => {
  beforeEach(() => {
    clearStoredLayoutCache();
  });

  it("returns null on cache miss", () => {
    const result = loadStoredLayout("unknown_sig");
    expect(result).toBeNull();
  });

  it("saves and retrieves precomputed graph layout by signature", () => {
    const signature = "sig_12345";
    const nodes: PositionedNode[] = [{ id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 }];
    const edges: PositionedEdge[] = [{ id: "e1", source: "n1", target: "n1", path: "M 10 20 L 30 40" }];

    saveStoredLayout(signature, { nodes, edges });
    const cached = loadStoredLayout(signature);

    expect(cached).not.toBeNull();
    expect(cached?.nodes).toEqual(nodes);
    expect(cached?.edges).toEqual(edges);
  });
});
