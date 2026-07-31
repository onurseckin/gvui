import type { LayoutMode } from "../state/useGraphStore";
import type { PositionedEdge, PositionedNode } from "../types/graphData";

const CACHE_PREFIX_V2 = "gvui_layout_cache_v2_";

export interface StoredLayoutPayload {
  mode: LayoutMode;
  signature: string;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  timestamp: number;
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  const storage = typeof localStorage !== "undefined" ? localStorage : (globalThis as unknown as { localStorage?: Storage }).localStorage;
  return storage ?? null;
}

export function loadStoredLayout(
  mode: LayoutMode,
  signature: string,
): { nodes: PositionedNode[]; edges: PositionedEdge[] } | null {
  if (!signature) return null;
  const storage = getLocalStorage();
  if (!storage) return null;

  try {
    const key = `${CACHE_PREFIX_V2}${mode}_${signature}`;
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLayoutPayload;
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return { nodes: parsed.nodes, edges: parsed.edges };
  } catch (err) {
    console.warn("Failed to load stored layout cache:", err);
    return null;
  }
}

function purgeOldestCacheEntries(storage: Storage): void {
  try {
    const entries: { key: string; timestamp: number }[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(CACHE_PREFIX_V2)) {
        try {
          const raw = storage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as StoredLayoutPayload;
            entries.push({ key, timestamp: parsed.timestamp || 0 });
          }
        } catch {
          entries.push({ key, timestamp: 0 });
        }
      }
    }

    entries.sort((a, b) => a.timestamp - b.timestamp);
    const toRemoveCount = Math.ceil(entries.length / 2);
    for (let i = 0; i < toRemoveCount; i++) {
      storage.removeItem(entries[i].key);
    }
  } catch (err) {
    console.warn("Failed to purge layout cache:", err);
  }
}

export function saveStoredLayout(
  mode: LayoutMode,
  signature: string,
  layout: { nodes: PositionedNode[]; edges: PositionedEdge[] },
): void {
  if (!signature) return;
  const storage = getLocalStorage();
  if (!storage) return;

  const key = `${CACHE_PREFIX_V2}${mode}_${signature}`;
  const payload: StoredLayoutPayload = {
    mode,
    signature,
    nodes: layout.nodes,
    edges: layout.edges,
    timestamp: Date.now(),
  };

  try {
    storage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    if (err instanceof Error && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      purgeOldestCacheEntries(storage);
      try {
        storage.setItem(key, JSON.stringify(payload));
      } catch {
        console.warn("Failed to save layout cache after LRU eviction");
      }
    }
  }
}

export function clearStoredLayoutCache(): void {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(CACHE_PREFIX_V2)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
  } catch (err) {
    console.warn("Failed to clear layout cache:", err);
  }
}
