import type { LayoutMode } from "../state/useGraphStore";
import type { PositionedEdge, PositionedNode } from "../types/graphData";
import { sqliteDb } from "./sqliteDb";

export interface StoredLayoutPayload {
  mode: LayoutMode;
  signature: string;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  timestamp: number;
}

export function loadStoredLayout(
  mode: LayoutMode,
  signature: string,
): { nodes: PositionedNode[]; edges: PositionedEdge[] } | null {
  if (!signature) return null;

  try {
    const row = sqliteDb.getGraphLayout(signature, mode);
    if (row && Array.isArray(row.nodes) && Array.isArray(row.edges)) {
      return { nodes: row.nodes, edges: row.edges };
    }
    return null;
  } catch (err) {
    console.warn("Failed to load stored layout cache:", err);
    return null;
  }
}

export function saveStoredLayout(
  mode: LayoutMode,
  signature: string,
  layout: { nodes: PositionedNode[]; edges: PositionedEdge[] },
): void {
  if (!signature) return;

  sqliteDb.saveGraphLayout(signature, mode, layout.nodes, layout.edges);
}

export function clearStoredLayoutCache(): void {
  sqliteDb.clearGraphLayouts();
}
