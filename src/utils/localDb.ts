import type { LayoutMode } from "../state/useGraphStore";
import type { PositionedEdge, PositionedNode } from "../types/graphData";

export type TableName = "graph_layouts";
export type SqlRow = Record<string, unknown>;

export interface GraphLayoutRow extends Record<string, unknown> {
  key: string;
  file_signature: string;
  layout_mode: LayoutMode | string;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  timestamp: number;
  created_at: string;
  updated_at: string;
}

export interface TableMetaData {
  name: TableName;
  primaryKey: string;
  columns: string[];
}

export const TABLE_METADATA: Record<TableName, TableMetaData> = {
  graph_layouts: {
    name: "graph_layouts",
    primaryKey: "key",
    columns: [
      "key",
      "file_signature",
      "layout_mode",
      "nodes",
      "edges",
      "timestamp",
      "created_at",
      "updated_at",
    ],
  },
};

const DB_STORAGE_KEY = "gvui_local_db_v1";

type DatabaseStore = {
  graph_layouts: Record<string, Record<string, unknown>>;
};

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  const storage =
    typeof localStorage !== "undefined"
      ? localStorage
      : (globalThis as unknown as { localStorage?: Storage }).localStorage;
  return storage ?? null;
}

function createEmptyDatabase(): DatabaseStore {
  return {
    graph_layouts: {},
  };
}

/**
 * The local cache of computed layouts.
 *
 * Not SQLite, despite what this was called until now — it is an in-memory object with a
 * table-shaped API (tables, primary keys, upsert) serialised as one JSON blob into localStorage.
 * The old name implied a second storage engine that never existed, and `sql.js` sat in
 * `package.json` for it without a single import.
 *
 * The whole point is to skip work: a layout is a pure function of a dataset plus a config, and the
 * engine is deterministic, so a cache hit saves recomputing geometry the user has already seen.
 * That also means every row here is disposable. `nodes` and `edges` are stored as opaque JSON so
 * their shape can change freely, and if the table shape itself ever changes the answer is to clear
 * the cache and let it refill — never to migrate it or to keep compatibility code around for an
 * older layout of a cache.
 */
export class LocalDatabase {
  private memoryDb: DatabaseStore;

  constructor() {
    this.memoryDb = this.loadFromStorage();
  }

  private loadFromStorage(): DatabaseStore {
    const storage = getLocalStorage();
    if (!storage) return createEmptyDatabase();
    try {
      const raw = storage.getItem(DB_STORAGE_KEY);
      if (!raw) return createEmptyDatabase();
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null) return createEmptyDatabase();
      const db = createEmptyDatabase();
      const candidate = parsed as Record<string, unknown>;

      for (const tableName of Object.keys(TABLE_METADATA) as TableName[]) {
        const tableContent = candidate[tableName];
        if (typeof tableContent === "object" && tableContent !== null) {
          db[tableName] = tableContent as Record<string, Record<string, unknown>>;
        }
      }
      return db;
    } catch {
      return createEmptyDatabase();
    }
  }

  private persistToStorage(): void {
    const storage = getLocalStorage();
    if (!storage) return;

    try {
      storage.setItem(DB_STORAGE_KEY, JSON.stringify(this.memoryDb));
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED")
      ) {
        this.evictOldestLayouts();
        try {
          storage.setItem(DB_STORAGE_KEY, JSON.stringify(this.memoryDb));
        } catch {
          console.warn("Failed to persist SQLite database after LRU eviction");
        }
      }
    }
  }

  public evictOldestLayouts(): void {
    const layoutsTable = this.memoryDb.graph_layouts;
    const entries = Object.entries(layoutsTable).map(([key, row], index) => ({
      key,
      index,
      timestamp: typeof row.timestamp === "number" ? row.timestamp : 0,
    }));

    entries.sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);
    const toRemoveCount = Math.floor(entries.length / 2);

    for (let i = 0; i < toRemoveCount; i++) {
      const entry = entries[i];
      delete layoutsTable[entry.key];
    }
  }

  public getTableNames(): TableName[] {
    return Object.keys(TABLE_METADATA) as TableName[];
  }

  public getTableColumns(tableName: TableName): { name: string; primaryKey: boolean }[] {
    const meta = TABLE_METADATA[tableName];
    if (!meta) return [];
    return meta.columns.map((col) => ({
      name: col,
      primaryKey: col === meta.primaryKey,
    }));
  }

  public getTableRows<T extends Record<string, unknown>>(tableName: TableName): T[] {
    const table = this.memoryDb[tableName] ?? {};
    return Object.values(table) as T[];
  }

  public getRow<T extends Record<string, unknown>>(
    tableName: TableName,
    primaryKeyValue: string,
  ): T | null {
    const table = this.memoryDb[tableName] ?? {};
    const row = table[primaryKeyValue];
    if (!row) return null;
    return row as T;
  }

  public upsertRow<T extends Record<string, unknown>>(tableName: TableName, row: T): T {
    const meta = TABLE_METADATA[tableName];
    const pkValue = String(row[meta.primaryKey] ?? "");
    if (!pkValue) {
      throw new Error(
        `Cannot insert row into table ${tableName} without primary key '${meta.primaryKey}'`,
      );
    }

    const table = this.memoryDb[tableName] ?? {};
    table[pkValue] = row as Record<string, unknown>;
    this.memoryDb[tableName] = table;
    this.persistToStorage();
    return row;
  }

  public updateRow<T extends Record<string, unknown>>(
    tableName: TableName,
    primaryKeyValue: string,
    updatedFields: Partial<T>,
  ): boolean {
    const table = this.memoryDb[tableName] ?? {};
    const existing = table[primaryKeyValue];
    if (!existing) return false;

    const merged = { ...existing, ...updatedFields, updated_at: new Date().toISOString() };
    table[primaryKeyValue] = merged;
    this.memoryDb[tableName] = table;
    this.persistToStorage();
    return true;
  }

  public deleteRow(tableName: TableName, primaryKeyValue: string): boolean {
    const table = this.memoryDb[tableName] ?? {};
    if (!(primaryKeyValue in table)) {
      return false;
    }
    delete table[primaryKeyValue];
    this.persistToStorage();
    return true;
  }

  public clearTable(tableName: TableName): void {
    this.memoryDb[tableName] = {};
    this.persistToStorage();
  }

  public clearDatabase(): void {
    this.memoryDb = createEmptyDatabase();
    const storage = getLocalStorage();
    if (storage) {
      try {
        storage.removeItem(DB_STORAGE_KEY);
      } catch {
        // Storage removal error
      }
    }
  }

  // Structured Graph Layout operations
  public getGraphLayout(fileSignature: string, layoutMode: string): GraphLayoutRow | null {
    const key = `${fileSignature}_${layoutMode}`;
    return this.getRow<GraphLayoutRow>("graph_layouts", key);
  }

  public saveGraphLayout(
    fileSignature: string,
    layoutMode: LayoutMode | string,
    nodes: PositionedNode[],
    edges: PositionedEdge[],
  ): GraphLayoutRow {
    const key = `${fileSignature}_${layoutMode}`;
    const nowIso = new Date().toISOString();
    const existing = this.getRow<GraphLayoutRow>("graph_layouts", key);
    const row: GraphLayoutRow = {
      key,
      file_signature: fileSignature,
      layout_mode: layoutMode,
      nodes,
      edges,
      timestamp: Date.now(),
      created_at: existing?.created_at ?? nowIso,
      updated_at: nowIso,
    };
    return this.upsertRow<GraphLayoutRow>("graph_layouts", row);
  }

  public deleteGraphLayout(fileSignature: string, layoutMode: string): boolean {
    const key = `${fileSignature}_${layoutMode}`;
    return this.deleteRow("graph_layouts", key);
  }

  public clearGraphLayouts(): void {
    this.clearTable("graph_layouts");
  }

  public reloadFromStorage(): void {
    this.memoryDb = this.loadFromStorage();
  }
}

export const localDb = new LocalDatabase();
