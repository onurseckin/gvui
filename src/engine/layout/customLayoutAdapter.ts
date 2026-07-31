import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import { computeCustomLayout } from "./custom";
import type { CustomLayoutConfig, CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./custom";
import { computeCustomLayoutAsync } from "./custom/customLayoutWorkerClient";
import type { LayoutProgressInfo } from "./custom/customLayoutWorkerPool";
import { renderPathWithCrossingBridges } from "./custom/svgPath";
import { calculateNodeDimensions } from "./nodeDimensions";

function mapLayoutResultToPositioned(
  dataset: GraphDataset,
  layoutResult: CustomLayoutResult,
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const nodePosMap = new Map(layoutResult.nodes.map((n) => [n.id, n]));

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

  const badgeMap = new Map(layoutResult.badges.map((b) => [b.edgeId, b]));
  const crossingPoints = (layoutResult.crossings ?? []).map((c) => c.point);

  const positionedEdges: PositionedEdge[] = dataset.edges.map((edge, idx) => {
    const edgeId = edge.id || `e-${edge.source}-${edge.target}-${idx}`;
    const route = layoutResult.edges.find((r) => r.edgeId === edgeId);
    const badge = badgeMap.get(edgeId);

    let path = "";
    if (route && route.points.length >= 2) {
      path = renderPathWithCrossingBridges(route.points, crossingPoints);
    } else {
      const srcNode = nodePosMap.get(edge.source);
      const tgtNode = nodePosMap.get(edge.target);
      if (srcNode && tgtNode) {
        const srcCx = srcNode.x + srcNode.width / 2;
        const srcCy = srcNode.y + srcNode.height / 2;
        const tgtCx = tgtNode.x + tgtNode.width / 2;
        const tgtCy = tgtNode.y + tgtNode.height / 2;
        path = `M ${srcCx} ${srcCy} L ${tgtCx} ${tgtCy}`;
      }
    }

    return {
      ...edge,
      path,
      labelX: badge ? badge.rect.x + badge.rect.width / 2 : undefined,
      labelY: badge ? badge.rect.y + badge.rect.height / 2 : undefined,
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}

/**
 * Computes graph layout coordinates using the custom directed layout and orthogonal routing engine.
 * Converts GraphDataset nodes and edges into normalized engine inputs, runs state-space optimization,
 * and maps the resulting node positions, orthogonal edge SVG paths, crossing bridges, and badge locations
 * back to standard PositionedNode and PositionedEdge outputs for rendering on GraphCanvas.
 */
export function computeCustomEngineGraphLayout(dataset: GraphDataset): {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
} {
  if (!dataset || dataset.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const normalizedNodes: NormalizedNode[] = dataset.nodes.map((node) => {
    const dims = calculateNodeDimensions(node);
    return {
      id: node.id,
      label: node.name,
      width: dims.width,
      height: dims.height,
    };
  });

  const normalizedEdges: NormalizedEdge[] = dataset.edges.map((edge, idx) => ({
    id: edge.id || `e-${edge.source}-${edge.target}-${idx}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    isCycle: edge.isCycle,
  }));

  const layoutResult = computeCustomLayout(normalizedNodes, normalizedEdges);
  return mapLayoutResultToPositioned(dataset, layoutResult);
}

/**
 * Offloads graph layout calculation to a background Web Worker when running in the browser,
 * returning PositionedNode[] and PositionedEdge[] asynchronously without blocking the UI main thread.
 */
export interface ComputeEngineLayoutOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  configPartial?: Partial<CustomLayoutConfig>;
  onProgress?: (progress: LayoutProgressInfo) => void;
}

export async function computeCustomEngineGraphLayoutAsync(
  dataset: GraphDataset,
  options?: ComputeEngineLayoutOptions,
): Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] }> {
  if (!dataset || dataset.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const normalizedNodes: NormalizedNode[] = dataset.nodes.map((node) => {
    const dims = calculateNodeDimensions(node);
    return {
      id: node.id,
      label: node.name,
      width: dims.width,
      height: dims.height,
    };
  });

  const normalizedEdges: NormalizedEdge[] = dataset.edges.map((edge, idx) => ({
    id: edge.id || `e-${edge.source}-${edge.target}-${idx}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    isCycle: edge.isCycle,
  }));

  const layoutResult = await computeCustomLayoutAsync({
    nodes: normalizedNodes,
    edges: normalizedEdges,
    configPartial: options?.configPartial,
    timeoutMs: options?.timeoutMs,
    signal: options?.signal,
    onProgress: options?.onProgress,
  });
  return mapLayoutResultToPositioned(dataset, layoutResult);
}
