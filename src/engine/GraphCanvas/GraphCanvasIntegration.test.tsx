import { describe, expect, it } from "bun:test";
import type { GraphDataset } from "../../types/graphData";
import { generateDatasetSignature } from "../../utils/fileStorage";
import { loadStoredLayout, saveStoredLayout } from "../../utils/layoutCacheStorage";

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
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: mockLocalStorage,
  };
}

describe("GraphCanvas Storage Integration", () => {
  it("loads layout from storage instantly on signature hit", () => {
    const dataset: GraphDataset = {
      id: "test-ds",
      title: "Test Dataset",
      nodes: [{ id: "n1", name: "Node 1" }],
      edges: [],
    };
    const sig = generateDatasetSignature(dataset);

    const layout = {
      nodes: [{ id: "n1", name: "Node 1", x: 50, y: 50, width: 100, height: 50 }],
      edges: [],
    };

    saveStoredLayout(sig, layout);
    const cached = loadStoredLayout(sig);

    expect(cached).not.toBeNull();
    expect(cached?.nodes[0].x).toBe(50);
  });
});
