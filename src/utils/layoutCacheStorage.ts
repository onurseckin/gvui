import type { PositionedEdge, PositionedNode } from "../types/graphData";

const CACHE_PREFIX = "gvui_layout_cache_v1_";

export interface StoredLayoutPayload {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  timestamp: number;
}

function getLocalStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
    return (globalThis as unknown as { localStorage?: Storage }).localStorage ?? null;
  }
  return null;
}

export function loadStoredLayout(signature: string): { nodes: PositionedNode[]; edges: PositionedEdge[] } | null {
  const storage = getLocalStorage();
  if (!storage || !signature) {
    return null;
  }

  try {
    const raw = storage.getItem(`${CACHE_PREFIX}${signature}`);
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

export function saveStoredLayout(
  signature: string,
  layout: { nodes: PositionedNode[]; edges: PositionedEdge[] },
): void {
  const storage = getLocalStorage();
  if (!storage || !signature) {
    return;
  }

  try {
    const payload: StoredLayoutPayload = {
      nodes: layout.nodes,
      edges: layout.edges,
      timestamp: Date.now(),
    };
    storage.setItem(`${CACHE_PREFIX}${signature}`, JSON.stringify(payload));
  } catch (err) {
    console.warn("Failed to save layout to localStorage:", err);
  }
}

export function clearStoredLayoutCache(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
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
