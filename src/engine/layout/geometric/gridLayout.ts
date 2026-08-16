import type { SugiyamaEdge, SugiyamaNode } from "../sugiyama/types";

export interface GridLayoutOptions {
  columns?: number;
  rowGap?: number;
  columnGap?: number;
  sortBy?: "rank" | "group" | "name" | "id" | "none";
}

export interface GridLayoutResult {
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    row: number;
    col: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    points: Array<{ x: number; y: number }>;
  }>;
  width: number;
  height: number;
}

/**
 * Deterministic Matrix Grid Layout Engine.
 */
export function computeGridLayout(
  nodes: SugiyamaNode[],
  edges: SugiyamaEdge[],
  options: GridLayoutOptions = {},
): GridLayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const rowGap = options.rowGap ?? 50;
  const colGap = options.columnGap ?? 60;
  const numNodes = nodes.length;
  const cols = options.columns ?? Math.max(1, Math.ceil(Math.sqrt(numNodes * 1.5)));

  const sortedNodes = [...nodes];
  if (options.sortBy === "rank") {
    sortedNodes.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  } else if (options.sortBy === "name") {
    sortedNodes.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  } else if (options.sortBy === "group") {
    sortedNodes.sort((a, b) => (a.group ?? "").localeCompare(b.group ?? ""));
  } else if (options.sortBy === "id") {
    sortedNodes.sort((a, b) => a.id.localeCompare(b.id));
  }

  // Find max node width and height for uniform cell sizing
  let maxW = 120;
  let maxH = 60;
  for (const n of nodes) {
    if (n.width > maxW) maxW = n.width;
    if (n.height > maxH) maxH = n.height;
  }

  const cellW = maxW + colGap;
  const cellH = maxH + rowGap;

  const posMap = new Map<string, { x: number; y: number; row: number; col: number }>();

  for (let i = 0; i < sortedNodes.length; i++) {
    const n = sortedNodes[i]!;
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = c * cellW + maxW * 0.5;
    const y = r * cellH + maxH * 0.5;
    posMap.set(n.id, { x, y, row: r, col: c });
  }

  const resultNodes = sortedNodes.map((n) => {
    const pos = posMap.get(n.id) ?? { x: 0, y: 0, row: 0, col: 0 };
    return {
      id: n.id,
      x: pos.x,
      y: pos.y,
      width: n.width,
      height: n.height,
      row: pos.row,
      col: pos.col,
    };
  });

  const resultEdges = edges.map((e) => {
    const src = posMap.get(e.source) ?? { x: 0, y: 0 };
    const tgt = posMap.get(e.target) ?? { x: 0, y: 0 };
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      points: [
        { x: src.x, y: src.y },
        { x: tgt.x, y: tgt.y },
      ],
    };
  });

  const totalRows = Math.ceil(numNodes / cols);
  const totalWidth = cols * cellW + 40;
  const totalHeight = totalRows * cellH + 40;

  return {
    nodes: resultNodes,
    edges: resultEdges,
    width: totalWidth,
    height: totalHeight,
  };
}
