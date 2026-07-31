import type { LayoutMode } from "../state/useGraphStore";
import type { GraphDataset } from "../types/graphData";

export interface SavedFileViewport {
  signature: string;
  zoomLevel: number;
  panOffset: { x: number; y: number };
  selectedNodeId: string | null;
  layoutMode: LayoutMode;
  collapsedNodeIds?: string[];
}

const STORAGE_PREFIX = "gvui_viewport_";

/**
 * Computes a deterministic hash signature based on dataset ID, title, node IDs/types/names, and edge sources/targets.
 */
export function generateDatasetSignature(dataset: GraphDataset): string {
  const nodeParts = dataset.nodes
    .map((node) => `${node.id}:${node.type ?? ""}:${node.name}`)
    .join(";");
  const edgeParts = dataset.edges.map((edge) => `${edge.source}->${edge.target}`).join(";");
  const payload = `${dataset.id}|${dataset.title}|${nodeParts}|${edgeParts}`;

  let h1 = 0x811c9dc5;
  let h2 = 0x55555555;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 0x27d4eb2d);
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

function isSavedFileViewport(obj: unknown): obj is SavedFileViewport {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const candidate = obj as Record<string, unknown>;
  if (
    typeof candidate.signature !== "string" ||
    typeof candidate.zoomLevel !== "number" ||
    typeof candidate.panOffset !== "object" ||
    candidate.panOffset === null
  ) {
    return false;
  }
  const pan = candidate.panOffset as Record<string, unknown>;
  if (typeof pan.x !== "number" || typeof pan.y !== "number") {
    return false;
  }
  if (candidate.selectedNodeId !== null && typeof candidate.selectedNodeId !== "string") {
    return false;
  }
  if (
    typeof candidate.layoutMode !== "string" ||
    !["top-down", "top-down-dagre", "left-right", "force", "radial"].includes(candidate.layoutMode)
  ) {
    return false;
  }
  if (
    candidate.collapsedNodeIds !== undefined &&
    (!Array.isArray(candidate.collapsedNodeIds) ||
      !candidate.collapsedNodeIds.every((id) => typeof id === "string"))
  ) {
    return false;
  }
  return true;
}

/**
 * Reads localStorage for the viewport state associated with fileId.
 * Returns SavedFileViewport if valid JSON and matching signature; otherwise clears storage entry and returns null.
 */
export function loadStoredViewport(
  fileId: string,
  currentSignature: string,
): SavedFileViewport | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  const key = STORAGE_PREFIX + fileId;
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSavedFileViewport(parsed) && parsed.signature === currentSignature) {
      return parsed;
    }
  } catch {
    // Parsing error or corrupt JSON
  }
  localStorage.removeItem(key);
  return null;
}

/**
 * Saves the given SavedFileViewport state to localStorage under gvui_viewport_<fileId>.
 */
export function saveStoredViewport(fileId: string, state: SavedFileViewport): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const key = STORAGE_PREFIX + fileId;
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Quota exceeded or restricted localStorage access
  }
}

/**
 * Removes the stored viewport state for fileId from localStorage.
 */
export function clearStoredViewport(fileId: string): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const key = STORAGE_PREFIX + fileId;
    localStorage.removeItem(key);
  } catch {
    // Error removing item
  }
}
