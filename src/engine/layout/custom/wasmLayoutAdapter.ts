import type { GraphDataset, PositionedEdge, PositionedNode } from "../../../types/graphData";
import type { LayoutMode } from "../../../state/useGraphStore";
import { getDefaultMeasurer } from "../measurement";
import initWasm, { compute_custom_layout_wasm } from "./wasm_pkg/gvui";
import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "./config";
import { buildEdgePath } from "./edgePath";
import { pointAtPathRatio } from "./geometry";
import { getEdgeCompositeBadgeText } from "../customLayoutAdapter";
import {
  validateWasmLayoutResult,
  type CustomLayoutResult,
  type NormalizedEdge,
  type NormalizedNode,
  type Point,
  type RoutedPath,
} from "./types";

let wasmInitPromise: Promise<unknown> | null = null;

export async function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = initWasm();
  }
  await wasmInitPromise;
}

export async function computeCustomLayoutWasm(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  configPartial?: Partial<CustomLayoutConfig>,
  mode?: string,
): Promise<CustomLayoutResult> {
  await ensureWasmInitialized();
  const input = { nodes, edges, options: configPartial, mode };
  const rawResult: unknown = compute_custom_layout_wasm(input as unknown as object);
  return validateWasmLayoutResult(rawResult);
}

export async function computeCustomEngineGraphLayoutWasm(
  dataset: GraphDataset,
  configPartial?: Partial<CustomLayoutConfig>,
  mode: LayoutMode = "layered",
): Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] }> {
  if (!dataset || dataset.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  await ensureWasmInitialized();
  const config = resolveCustomLayoutConfig(configPartial);
  const measurer = getDefaultMeasurer();
  const nodeSizes = measurer.measureNodes(dataset.nodes);

  const nodes: NormalizedNode[] = dataset.nodes.map((n, i) => {
    const dims = nodeSizes[i] ?? { width: config.minNodeWidth, height: 60 };
    return {
      id: n.id,
      label: n.name,
      width: dims.width,
      height: dims.height,
      rank: n.rank,
      group: n.group,
    };
  });

  const edges: NormalizedEdge[] = dataset.edges.map((e, idx) => {
    const id = e.id || `e-${e.source}-${e.target}-${idx}`;
    const badgeText = getEdgeCompositeBadgeText(e);
    const labelBox = badgeText
      ? measurer.measureLabel(badgeText, {
          maxWidth: Math.max(config.maxLabelWidth, 320),
          maxLines: 1,
        })
      : null;

    return {
      id,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
      layoutRole: e.layoutRole,
      weight: e.weight,
      minLen: e.minLen,
      labelWidth: labelBox ? Math.max(54, labelBox.width + 24) : undefined,
      labelHeight: labelBox ? 26 : undefined,
    };
  });

  const input = {
    nodes,
    edges,
    options: configPartial,
    mode,
  };

  const rawResult: unknown = compute_custom_layout_wasm(input as unknown as object);
  const res = validateWasmLayoutResult(rawResult);

  const nodePosMap = new Map((res.nodes ?? []).map((n) => [n.id, n]));
  const routeMap = new Map<string, RoutedPath>((res.edges ?? []).map((r) => [r.edgeId, r]));
  const badgeMap = new Map((res.badges ?? []).map((b) => [b.edgeId, b]));

  const positionedNodes: PositionedNode[] = dataset.nodes.map((node) => {
    const pos = nodePosMap.get(node.id) ?? { x: 0, y: 0, width: 120, height: 60 };
    return {
      ...node,
      x: pos.x,
      y: pos.y,
      width: pos.width,
      height: pos.height,
    };
  });

  const positionedEdges: PositionedEdge[] = dataset.edges.map((edge, idx) => {
    const edgeId = edge.id || `e-${edge.source}-${edge.target}-${idx}`;
    const route = routeMap.get(edgeId);
    const badge = badgeMap.get(edgeId);

    let points: Point[] = route && route.points.length >= 2 ? route.points : [];
    if (points.length === 0) {
      const srcNode = nodePosMap.get(edge.source);
      const tgtNode = nodePosMap.get(edge.target);
      if (srcNode && tgtNode) {
        points = [
          { x: srcNode.x + srcNode.width / 2, y: srcNode.y + srcNode.height / 2 },
          { x: tgtNode.x + tgtNode.width / 2, y: tgtNode.y + tgtNode.height / 2 },
        ];
      }
    }

    const path = buildEdgePath(points, config.edgeStyle, config.cornerRadius);
    const mid = points.length > 0 ? pointAtPathRatio(points, 0.5) : { x: 0, y: 0 };

    const labelX = badge ? badge.rect.x + badge.rect.width / 2 : mid.x;
    const labelY = badge ? badge.rect.y + badge.rect.height / 2 : mid.y;

    return {
      ...edge,
      id: edgeId,
      path,
      points,
      labelX,
      labelY,
      badgeRect: badge?.rect,
      anchorPoint: badge?.anchorPoint,
      leaderPoints: badge?.leaderPoints,
      sourcePort: route?.sourcePort,
      targetPort: route?.targetPort,
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}
