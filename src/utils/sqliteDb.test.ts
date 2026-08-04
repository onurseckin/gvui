import { describe, expect, it, beforeEach } from "bun:test";
import { sqliteDb } from "./sqliteDb";
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

describe("sqliteDb engine & table operations", () => {
  beforeEach(() => {
    sqliteDb.clearDatabase();
  });

  it("exposes expected structured database table names and column metadata", () => {
    const tables = sqliteDb.getTableNames();
    expect(tables).toEqual(["graph_layouts"]);

    const cols = sqliteDb.getTableColumns("graph_layouts");
    expect(cols).toEqual([
      { name: "key", primaryKey: true },
      { name: "file_signature", primaryKey: false },
      { name: "layout_mode", primaryKey: false },
      { name: "nodes", primaryKey: false },
      { name: "edges", primaryKey: false },
      { name: "timestamp", primaryKey: false },
      { name: "created_at", primaryKey: false },
      { name: "updated_at", primaryKey: false },
    ]);
  });

  it("stores, retrieves, updates, and deletes graph layout records", () => {
    const node: PositionedNode = {
      id: "node-1",
      name: "Alpha",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
    };
    sqliteDb.saveGraphLayout("sig-123", "layered", [node], []);

    const loaded = sqliteDb.getGraphLayout("sig-123", "layered");
    expect(loaded).not.toBeNull();
    expect(loaded?.file_signature).toBe("sig-123");
    expect(loaded?.nodes[0].name).toBe("Alpha");

    const rows = sqliteDb.getTableRows("graph_layouts");
    expect(rows.length).toBe(1);

    const updated = sqliteDb.updateRow("graph_layouts", "sig-123_layered", {
      nodes: [{ id: "node-1", name: "Alpha Updated", x: 50, y: 60, width: 80, height: 40 }],
    });
    expect(updated).toBe(true);

    const reloaded = sqliteDb.getGraphLayout("sig-123", "layered");
    expect(reloaded?.nodes[0].name).toBe("Alpha Updated");

    const deleted = sqliteDb.deleteGraphLayout("sig-123", "layered");
    expect(deleted).toBe(true);
    expect(sqliteDb.getGraphLayout("sig-123", "layered")).toBeNull();
  });

  it("clears individual tables or the entire database", () => {
    const node: PositionedNode = {
      id: "node-1",
      name: "Alpha",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
    };
    sqliteDb.saveGraphLayout("sig-1", "layered", [node], []);

    expect(sqliteDb.getTableRows("graph_layouts").length).toBe(1);

    sqliteDb.clearTable("graph_layouts");
    expect(sqliteDb.getTableRows("graph_layouts").length).toBe(0);

    // "organic" is v2's replacement for the removed v1 "force"/"stress" modes (see
    // normalizeLayoutMode's LEGACY_LAYOUT_MODE_MAP) — using it here exercises a second, distinct
    // key under the same signature rather than re-exercising "layered".
    sqliteDb.saveGraphLayout("sig-2", "organic", [node], []);
    expect(sqliteDb.getTableRows("graph_layouts").length).toBe(1);

    sqliteDb.clearDatabase();
    expect(sqliteDb.getTableRows("graph_layouts").length).toBe(0);
  });

  it("keys distinct layout modes for the same signature separately", () => {
    const node: PositionedNode = {
      id: "node-1",
      name: "Alpha",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
    };
    sqliteDb.saveGraphLayout("sig-multi", "layered", [node], []);
    sqliteDb.saveGraphLayout("sig-multi", "radial", [node], []);

    expect(sqliteDb.getTableRows("graph_layouts").length).toBe(2);
    expect(sqliteDb.getGraphLayout("sig-multi", "layered")).not.toBeNull();
    expect(sqliteDb.getGraphLayout("sig-multi", "radial")).not.toBeNull();
  });
});
