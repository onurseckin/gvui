import { sanitizeStepBadge } from "../../primitives/edges/GraphEdge/EdgeBadgeOverlay";
import { describeEdgeKind, resolveEdgeKind } from "../../primitives/edges/GraphEdge/edgeKinds";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import type { LayoutMode } from "../../state/useGraphStore";
import { getDefaultMeasurer } from "./measurement";
import { computeCustomLayout } from "./custom/computeCustomLayout";
import { computeCustomLayoutAsync } from "./custom/customLayoutWorkerClient";
import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "./custom/config";
import { buildEdgePath } from "./custom/edgePath";
import { pointAtPathRatio } from "./custom/geometry";
import type {
  CustomLayoutResult,
  NormalizedEdge,
  NormalizedNode,
  Point,
  RoutedPath,
} from "./custom/types";

/**
 * Constructs the composite single-line text for edge badge measurement without icon chrome.
 * Composes sanitized step number, action title / intent, bundle multiplier, and detail text.
 */
export function getEdgeCompositeBadgeText(edge: GraphDataset["edges"][number]): string | null {
  const rawTitle = edge.container?.title ?? edge.badge?.text ?? edge.label;
  const semanticKind = resolveEdgeKind(edge);
  const descriptor = describeEdgeKind(semanticKind);
  const step = sanitizeStepBadge(edge.container?.stepBadge ?? edge.stepNumber);
  const detail = edge.container?.detail;
  const bundle =
    typeof edge.bundleCount === "number" && edge.bundleCount > 1
      ? `x${edge.bundleCount}`
      : undefined;

  let title: string | undefined = rawTitle;
  // Measurement has to reserve room for the text the renderer will actually draw. The renderer
  // strips a leading CYCLE prefix and honours a declared kind over `isCycle`, so this does too.
  if (edge.isCycle && !edge.kind) {
    title = rawTitle?.trim() ? `CYCLE (${rawTitle.trim()})` : "CYCLE";
  } else if (!title && edge.kind) {
    title = descriptor.label;
  }

  const parts: string[] = [];
  if (step) parts.push(step);
  if (title?.trim()) parts.push(title.trim());
  if (bundle) parts.push(bundle);
  if (detail?.trim()) parts.push(detail.trim());

  if (parts.length === 0) return null;
  return parts.join(" ");
}

/**
 * Converts dataset nodes/edges into the engine's wire input. Node sizes and edge label boxes are
 * measured once, up front — the same `MeasurementProvider` used by the renderer's node cards —
 * so the Rust side never sees text and reserves *exact* space for every badge (Phase 1 of the
 * pipeline; see docs/engine/03-ingest-and-measurement.md).
 */
function buildEngineInputs(
  dataset: GraphDataset,
  config: CustomLayoutConfig,
): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
  const measurer = getDefaultMeasurer();
  const nodeSizes = measurer.measureNodes(dataset.nodes);

  const nodes: NormalizedNode[] = dataset.nodes.map((node, index) => {
    const size = nodeSizes[index] ?? { width: config.minNodeWidth, height: 0 };
    return {
      id: node.id,
      label: node.name,
      width: size.width,
      height: size.height,
      rank: node.rank,
      group: node.group,
    };
  });

  const edges: NormalizedEdge[] = dataset.edges.map((edge, index) => {
    const id = edge.id || `e-${edge.source}-${edge.target}-${index}`;
    const badgeText = getEdgeCompositeBadgeText(edge);
    const labelBox = badgeText
      ? measurer.measureLabel(badgeText, {
          maxWidth: Math.max(config.maxLabelWidth, 320),
          maxLines: 1,
        })
      : null;

    return {
      id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      isCycle: edge.isCycle,
      layoutRole: edge.layoutRole,
      weight: edge.weight,
      minLen: edge.minLen,
      labelWidth: labelBox ? Math.max(54, labelBox.width + 24) : undefined,
      labelHeight: labelBox ? 26 : undefined,
    };
  });

  return { nodes, edges };
}

/**
 * Maps the engine's `CustomLayoutResult` back onto `PositionedNode`/`PositionedEdge`.
 *
 * Builds `routeMap`/`badgeMap` once up front (O(E)) rather than the v1 pattern of calling
 * `layoutResult.edges.find(...)` inside `dataset.edges.map(...)`, which was O(E^2) — quadratic in
 * edge count for no reason, since every route is looked up by `edgeId` exactly once.
 */
function mapLayoutResultToPositioned(
  dataset: GraphDataset,
  layoutResult: CustomLayoutResult,
  config: CustomLayoutConfig,
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const nodePosMap = new Map(layoutResult.nodes.map((n) => [n.id, n]));
  const routeMap = new Map<string, RoutedPath>(layoutResult.edges.map((r) => [r.edgeId, r]));
  const badgeMap = new Map(layoutResult.badges.map((b) => [b.edgeId, b]));

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

    // Built via `buildEdgePath`, never string-concatenated here — see edgePath.ts for why
    // cornerRadius/edgeStyle rendering is a client-side concern independent of the route itself.
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

/**
 * Computes graph layout coordinates using the v2 layout engine, running synchronously on
 * whichever thread calls it (main thread in tests/SSR, or already inside a worker). Converts
 * `GraphDataset` nodes/edges into normalized engine inputs, runs the Rust/WASM pipeline, and maps
 * the resulting node positions, edge polylines, crossings, and badge placements back to
 * `PositionedNode`/`PositionedEdge` for rendering on `GraphCanvas`.
 */
export async function computeCustomEngineGraphLayout(
  dataset: GraphDataset,
  configPartial?: Partial<CustomLayoutConfig>,
  mode?: LayoutMode,
): Promise<{
  nodes: PositionedNode[];
  edges: PositionedEdge[];
}> {
  if (!dataset || dataset.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const config = resolveCustomLayoutConfig(configPartial);
  const { nodes, edges } = buildEngineInputs(dataset, config);
  const layoutResult = await computeCustomLayout(nodes, edges, config, mode);
  return mapLayoutResultToPositioned(dataset, layoutResult, config);
}

/**
 * Offloads graph layout calculation to a background Web Worker when running in the browser,
 * returning `PositionedNode[]`/`PositionedEdge[]` asynchronously without blocking the UI main
 * thread.
 */
export interface ComputeEngineLayoutOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  configPartial?: Partial<CustomLayoutConfig>;
  mode?: LayoutMode;
}

export async function computeCustomEngineGraphLayoutAsync(
  dataset: GraphDataset,
  options?: ComputeEngineLayoutOptions,
): Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] }> {
  if (!dataset || dataset.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const config = resolveCustomLayoutConfig(options?.configPartial);
  const { nodes, edges } = buildEngineInputs(dataset, config);

  const layoutResult = await computeCustomLayoutAsync({
    nodes,
    edges,
    configPartial: config,
    mode: options?.mode,
    timeoutMs: options?.timeoutMs,
    signal: options?.signal,
  });
  return mapLayoutResultToPositioned(dataset, layoutResult, config);
}
