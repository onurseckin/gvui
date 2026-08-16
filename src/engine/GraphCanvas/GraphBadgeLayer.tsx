import type { CSSProperties, FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useMemo } from "react";
import {
  describeEdgeKind,
  MAX_BADGE_WIDTH,
  resolveEdgeDisplayText,
  resolveEdgeKind,
  resolveSafeBadgePlacement as primitiveResolveSafeBadgePlacement,
  sanitizeStepBadge,
} from "../../primitives/edges/GraphEdge";
import type { SafeBadgePlacement } from "../../primitives/edges/GraphEdge";
import { describeNodeKind } from "../../primitives/nodes/NodeCard/nodeKinds";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";

export type { SafeBadgePlacement };

/**
 * GPU Anti-Smear & Strict Coordinate Placement Resolver for Graph Badges.
 *
 * ## Architecture & Rationale:
 * 1. **Eliminating `<foreignObject>` GPU Compositor Smearing**:
 *    In modern Chromium and WebKit rendering engines, `<foreignObject>` embedded within SVG layers
 *    frequently suffers from dirty-rect invalidation bugs, sub-pixel raster cache desynchronization,
 *    and trail smearing when the canvas viewport is panned, zoomed, or rapidly transformed.
 *    By decoupling edge badges into a dedicated HTML overlay layer (`.graph-html-badge-layer`)
 *    using hardware-accelerated CSS `translate3d(calc(${renderX}px - 50%), calc(${renderY}px - 50%), 0)`
 *    with `will-change: transform`, badges reside on isolated GPU compositor layers with zero
 *    dirty-rect smear or clipping artifacts.
 *
 * 2. **Strict Origin (0,0) Suppression**:
 *    Uninitialized or ghost edges often produce default `(0, 0)` coordinates before layout passes
 *    complete. This resolver strictly filters out any placement at `(0, 0)`, unanchored default
 *    bounding boxes, zero-length polylines, or missing/non-finite coordinates so ghost badges never render.
 *
 * 3. **DOM Layer Separation & Non-Blocking Overlay**:
 *    The layer renders HTML badge elements with `pointer-events: auto` for interactive clicks/focus,
 *    while any displaced leader lines are rendered in a background SVG with `pointer-events: none`,
 *    maintaining clean separation between vector graphics and interactive HTML cards.
 */
export function resolveSafeBadgePlacement(edge: PositionedEdge): SafeBadgePlacement | null {
  const placement = primitiveResolveSafeBadgePlacement(edge);
  if (!placement) return null;

  const renderX = placement.badgeRect
    ? placement.badgeRect.x + placement.badgeRect.width / 2
    : placement.x;
  const renderY = placement.badgeRect
    ? placement.badgeRect.y + placement.badgeRect.height / 2
    : placement.y;

  if (
    !Number.isFinite(renderX) ||
    !Number.isFinite(renderY) ||
    (renderX === 0 && renderY === 0) ||
    (placement.x === 0 && placement.y === 0)
  ) {
    return null;
  }

  if (placement.badgeRect) {
    if (
      !Number.isFinite(placement.badgeRect.width) ||
      !Number.isFinite(placement.badgeRect.height) ||
      placement.badgeRect.width <= 0 ||
      placement.badgeRect.height <= 0
    ) {
      return null;
    }
  }

  return placement;
}

export interface GraphBadgeLayerProps {
  positionedEdges: PositionedEdge[];
  hiddenNodeIds: Set<string>;
  selectedNodeId: string | null;
  positionedNodes?: PositionedNode[];
  nodeAccentMap?: Map<string, string>;
  onSelectEdge?: (edgeId: string, sourceNodeId?: string) => void;
}

export const GraphBadgeLayer: FC<GraphBadgeLayerProps> = memo(function GraphBadgeLayer({
  positionedEdges,
  hiddenNodeIds,
  selectedNodeId,
  positionedNodes,
  nodeAccentMap: propNodeAccentMap,
  onSelectEdge,
}) {
  const nodeAccentMap = useMemo(() => {
    if (propNodeAccentMap) return propNodeAccentMap;
    const map = new Map<string, string>();
    if (positionedNodes) {
      for (const node of positionedNodes) {
        map.set(node.id, describeNodeKind(node).accent);
      }
    }
    return map;
  }, [propNodeAccentMap, positionedNodes]);

  const badges = useMemo(() => {
    return positionedEdges
      .map((edge) => {
        if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) {
          return null;
        }

        const placement = resolveSafeBadgePlacement(edge);
        if (!placement) {
          return null;
        }

        const renderX = placement.badgeRect
          ? placement.badgeRect.x + placement.badgeRect.width / 2
          : placement.x;
        const renderY = placement.badgeRect
          ? placement.badgeRect.y + placement.badgeRect.height / 2
          : placement.y;

        if (
          !Number.isFinite(renderX) ||
          !Number.isFinite(renderY) ||
          (renderX === 0 && renderY === 0)
        ) {
          return null;
        }

        const semanticKind = resolveEdgeKind({ kind: edge.kind, isCycle: edge.isCycle });
        const descriptor = describeEdgeKind(semanticKind);

        const effectiveStep = sanitizeStepBadge(edge.container?.stepBadge ?? edge.stepNumber);
        const titleText = edge.container?.title ?? edge.badge?.text ?? edge.label;
        const detailText = edge.container?.detail;

        const hasTraffic = Boolean(edge.traffic || edge.isHighTraffic);
        const effectiveHighTraffic = Boolean(
          edge.isHighTraffic ||
          (edge.traffic &&
            ((edge.traffic.volume ?? 0) > 1 || (edge.traffic.messagesCount ?? 0) > 1)) ||
          edge.traffic?.status === "congested" ||
          edge.isCycle,
        );

        if (!titleText?.trim() && !effectiveStep && !edge.isCycle && !edge.kind && !hasTraffic) {
          return null;
        }

        const displayText = resolveEdgeDisplayText(
          titleText,
          descriptor.label,
          Boolean(edge.isCycle),
        );
        const variant = edge.isCycle
          ? "loop"
          : (edge.container?.variant ?? edge.badge?.variant ?? descriptor.badgeVariant);

        const bundleSnippet =
          typeof edge.bundleCount === "number" && edge.bundleCount > 1
            ? `x${edge.bundleCount}`
            : null;

        const computedWidth = Math.min(
          MAX_BADGE_WIDTH,
          Math.max(
            54,
            (effectiveStep ? effectiveStep.length * 7 + 14 : 0) +
              displayText.length * 6.8 +
              (detailText ? detailText.length * 6.0 + 10 : 0) +
              (bundleSnippet ? bundleSnippet.length * 6.2 + 12 : 0) +
              20,
          ),
        );
        const width = placement.badgeRect
          ? Math.max(placement.badgeRect.width, computedWidth)
          : computedWidth;
        const height = placement.badgeRect ? Math.max(placement.badgeRect.height, 26) : 26;

        const leaderPoints = placement.leaderPoints ?? edge.leaderPoints;
        const anchorPoint = placement.anchorPoint ?? edge.anchorPoint;
        const hasLeaderPoints = Boolean(leaderPoints && leaderPoints.length >= 2);
        const anchor =
          anchorPoint ?? (hasLeaderPoints && leaderPoints ? leaderPoints[0] : undefined);
        const isOutside =
          anchor !== undefined &&
          (anchor.x < renderX - width / 2 ||
            anchor.x > renderX + width / 2 ||
            anchor.y < renderY - height / 2 ||
            anchor.y > renderY + height / 2);
        const showLeaderPath = isOutside && hasLeaderPoints;
        const showLeaderLine = isOutside && !hasLeaderPoints && anchorPoint !== undefined;

        const isEdgeSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;
        const sourceAccentColor = nodeAccentMap.get(edge.source);

        return {
          edge,
          placement,
          renderX,
          renderY,
          width,
          height,
          semanticKind,
          descriptor,
          effectiveStep,
          displayText,
          variant,
          bundleSnippet,
          detailText,
          effectiveHighTraffic,
          isEdgeSelected,
          sourceAccentColor,
          showLeaderPath,
          showLeaderLine,
          leaderPoints,
          anchorPoint,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [positionedEdges, hiddenNodeIds, selectedNodeId, nodeAccentMap]);

  const hasLeaderLines = badges.some((b) => b.showLeaderPath || b.showLeaderLine);

  return (
    <div
      className="graph-html-badge-layer"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {hasLeaderLines && (
        <svg
          className="graph-badge-leader-lines"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          {badges.map((b) => {
            if (b.showLeaderPath && b.leaderPoints) {
              const d = b.leaderPoints
                .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                .join(" ");
              return (
                <path
                  key={`leader-path-${b.edge.id}`}
                  d={d}
                  stroke={b.sourceAccentColor || b.descriptor.accent || "#38bdf8"}
                  strokeWidth="1"
                  strokeDasharray="3,3"
                  fill="none"
                />
              );
            }
            if (b.showLeaderLine && b.anchorPoint) {
              return (
                <line
                  key={`leader-line-${b.edge.id}`}
                  x1={b.anchorPoint.x}
                  y1={b.anchorPoint.y}
                  x2={b.renderX}
                  y2={b.renderY}
                  stroke={b.sourceAccentColor || b.descriptor.accent || "#38bdf8"}
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
              );
            }
            return null;
          })}
        </svg>
      )}
      {badges.map((b) => {
        const isInteractive = Boolean(onSelectEdge || b.edge.badge?.clickable);
        const glowColor =
          b.edge.traffic?.glowColor ??
          b.sourceAccentColor ??
          (b.effectiveHighTraffic ? "#06b6d4" : undefined);

        const badgeStyle: CSSProperties = {
          position: "absolute",
          transform: `translate3d(calc(${b.renderX}px - 50%), calc(${b.renderY}px - 50%), 0)`,
          willChange: "transform",
          pointerEvents: "auto",
          width: `${b.width}px`,
          height: `${b.height}px`,
          cursor: isInteractive ? "pointer" : "default",
          ...(b.sourceAccentColor
            ? ({ "--edge-source-accent": b.sourceAccentColor } as CSSProperties)
            : {}),
          ...(glowColor ? { boxShadow: `0 0 8px ${glowColor}` } : {}),
        };

        const badgeClassName = [
          "graph-edge-badge-html",
          "edge-badge-group",
          `kind-${b.semanticKind}`,
          `variant-${b.variant}`,
          b.isEdgeSelected && "selected",
          b.edge.isCycle && "cycle",
          b.effectiveHighTraffic && "high-traffic",
          isInteractive && "is-clickable has-click",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={`badge-${b.edge.id}`}
            className={badgeClassName}
            style={badgeStyle}
            role={isInteractive ? "button" : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            aria-label={`Edge ${b.effectiveStep ? `${b.effectiveStep}: ` : ""}${b.displayText}`}
            onClick={
              isInteractive
                ? (e: MouseEvent<HTMLDivElement>) => {
                    e.stopPropagation();
                    onSelectEdge?.(b.edge.id, b.edge.source);
                  }
                : undefined
            }
            onKeyDown={
              isInteractive
                ? (e: KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectEdge?.(b.edge.id, b.edge.source);
                    }
                  }
                : undefined
            }
          >
            {b.effectiveStep && <span className="edge-step-badge">{b.effectiveStep}</span>}
            <span className="edge-badge-label">{b.displayText}</span>
            {b.bundleSnippet && (
              <span className="edge-bundle-chip" title={`Bundle size: ${b.edge.bundleCount}`}>
                {b.bundleSnippet}
              </span>
            )}
            {b.detailText && <span className="edge-badge-detail">{b.detailText}</span>}
          </div>
        );
      })}
    </div>
  );
});

GraphBadgeLayer.displayName = "GraphBadgeLayer";
