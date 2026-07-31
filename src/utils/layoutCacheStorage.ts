import type { PositionedEdge, PositionedNode } from "../types/graphData";

const CACHE_PREFIX = "gvui_layout_cache_v1_";

export interface StoredLayoutPayload {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  timestamp: number;
}

export function loadStoredLayout(signature: string): { nodes: PositionedNode[]; edges: PositionedEdge[] } | null {
  if (typeof window === "undefined" || !window.localStorage || !signature) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${signature}`);
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
  if (typeof window === "undefined" || !window.localStorage || !signature) {
    return;
  }

  try {
    const payload: StoredLayoutPayload = {
      nodes: layout.nodes,
      edges: layout.edges,
      timestamp: Date.now(),
    };
    window.localStorage.setItem(`${CACHE_PREFIX}${signature}`, JSON.stringify(payload));
  } catch (err) {
    console.warn("Failed to save layout to localStorage:", err);
  }
}

export function clearStoredLayoutCache(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn("Failed to clear layout cache:", err);
  }
}
