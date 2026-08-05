import { beforeEach, describe, expect, it } from "bun:test";
import { localDb } from "../../utils/localDb";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

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

describe("DeveloperSettings Component with local database viewer", () => {
  beforeEach(() => {
    localDb.clearDatabase();
    store.clear();
  });

  it("stores and clears database layout records for DeveloperSettings viewer", () => {
    localDb.saveGraphLayout("sig-test", "layered", [], []);
    const layout = localDb.getGraphLayout("sig-test", "layered");

    expect(layout).not.toBeNull();
    expect(layout?.file_signature).toBe("sig-test");

    localDb.clearDatabase();
    expect(localDb.getGraphLayout("sig-test", "layered")).toBeNull();
  });
});
