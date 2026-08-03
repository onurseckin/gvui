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
    const node: PositionedNode = { id: "node-1", name: "Alpha", x: 10, y: 20, width: 80, height: 40 };
    sqliteDb.saveGraphLayout("sig-123", "top-down", [node], []);

    const loaded = sqliteDb.getGraphLayout("sig-123", "top-down");
    expect(loaded).not.toBeNull();
    expect(loaded?.file_signature).toBe("sig-123");
    expect(loaded?.nodes[0].name).toBe("Alpha");

    const rows = sqliteDb.getTableRows("graph_layouts");
    expect(rows.length).toBe(1);

    const updated = sqliteDb.updateRow("graph_layouts", "sig-123_top-down", {
      nodes: [{ id: "node-1", name: "Alpha Updated", x: 50, y: 60, width: 80, height: 40 }],
    });
    expect(updated).toBe(true);

    const reloaded = sqliteDb.getGraphLayout("sig-123", "top-down");
    expect(reloaded?.nodes[0].name).toBe("Alpha Updated");

    const deleted = sqliteDb.deleteGraphLayout("sig-123", "top-down");
    expect(deleted).toBe(true);
    expect(sqliteDb.getGraphLayout("sig-123", "top-down")).toBeNull();
  });

  it("clears individual tables or the entire database", () => {
    const node: PositionedNode = { id: "node-1", name: "Alpha", x: 10, y: 20, width: 80, height: 40 };
    sqliteDb.saveGraphLayout("sig-1", "top-down", [node], []);

    expect(sqliteDb.getTableRows("graph_layouts").length).toBe(1);

    sqliteDb.clearTable("graph_layouts");
    expect(sqliteDb.getTableRows("graph_layouts").length).toBe(0);

    sqliteDb.saveGraphLayout("sig-2", "force", [node], []);
    expect(sqliteDb.getTableRows("graph_layouts").length).toBe(1);

    sqliteDb.clearDatabase();
    expect(sqliteDb.getTableRows("graph_layouts").length).toBe(0);
  });
});
