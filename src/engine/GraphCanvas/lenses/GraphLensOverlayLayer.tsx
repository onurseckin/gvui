import type { CSSProperties, FC, MouseEvent as ReactMouseEvent } from "react";
import { memo, useMemo } from "react";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { useCanvasLensStore } from "../../../store/useCanvasLensStore";
import { generateGlowStyle } from "./colorRamps";
import { evaluateCanvasLens } from "./lensEvaluator";
import "./GraphLensStyles.css";

export interface GraphLensOverlayLayerProps {
  positionedNodes: readonly PositionedNode[];
  positionedEdges: readonly PositionedEdge[];
  hiddenNodeIds?: ReadonlySet<string>;
  zoomLevel?: number;
  onSelectNode?: (nodeId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
}

export const GraphLensOverlayLayer: FC<GraphLensOverlayLayerProps> = memo(
  function GraphLensOverlayLayer({
    positionedNodes,
    positionedEdges,
    hiddenNodeIds,
    zoomLevel = 1,
    onSelectNode,
    onSelectEdge,
  }) {
    const activeLens = useCanvasLensStore((s) => s.activeLens);
    const configs = useCanvasLensStore((s) => s.configs);
    const setHoveredLensNodeId = useCanvasLensStore((s) => s.setHoveredLensNodeId);
    const setHoveredLensEdgeId = useCanvasLensStore((s) => s.setHoveredLensEdgeId);
    const setSelectedLensNodeId = useCanvasLensStore((s) => s.setSelectedLensNodeId);

    const activeConfig = useMemo(() => {
      return configs[activeLens] ?? configs.none;
    }, [configs, activeLens]);

    // Compute active lens overlays for all nodes & edges
    const evaluation = useMemo(() => {
      return evaluateCanvasLens(positionedNodes, positionedEdges, activeConfig);
    }, [positionedNodes, positionedEdges, activeConfig]);

    if (activeLens === "none") {
      return null;
    }

    return (
      <div className="graph-lens-overlay-layer" data-testid="graph-lens-overlay-layer">
        {/* SVG Layer for Edges, Glow Filters & Pulses */}
        <svg className="graph-lens-svg-stage">
          <defs>
            <filter id="lens-glow-critical" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="4"
                floodColor="#ef4444"
                floodOpacity="0.8"
              />
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="8"
                floodColor="#ef4444"
                floodOpacity="0.4"
              />
            </filter>
            <filter id="lens-glow-subcritical" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="3"
                floodColor="#f59e0b"
                floodOpacity="0.7"
              />
            </filter>
          </defs>

          {positionedEdges.map((edge) => {
            if (!edge.path) return null;
            if (hiddenNodeIds?.has(edge.source) || hiddenNodeIds?.has(edge.target)) {
              return null;
            }

            const overlay = evaluation.edgeOverlays.get(edge.id);
            if (!overlay || overlay.opacity <= 0) return null;

            const isCritical = overlay.isCritical;
            const isSubCritical = overlay.isSubCritical;

            return (
              <g key={`lens-edge-${edge.id}`}>
                {/* Background Thick Glow Path */}
                {(isCritical || isSubCritical) && (
                  <path
                    d={edge.path}
                    stroke={isCritical ? "#ef4444" : "#f59e0b"}
                    strokeWidth={overlay.strokeWidth + 4}
                    strokeOpacity={isCritical ? 0.4 : 0.25}
                    fill="none"
                    filter={isCritical ? "url(#lens-glow-critical)" : "url(#lens-glow-subcritical)"}
                  />
                )}

                {/* Primary Animated/Colored Path */}
                <path
                  d={edge.path}
                  stroke={overlay.color}
                  strokeWidth={overlay.strokeWidth}
                  strokeDasharray={overlay.strokeDasharray}
                  strokeOpacity={overlay.opacity}
                  fill="none"
                  className={`lens-edge-path ${isCritical ? "is-critical" : ""}`}
                  style={{
                    pointerEvents: "stroke",
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setHoveredLensEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredLensEdgeId(null)}
                  onClick={(e: ReactMouseEvent) => {
                    e.stopPropagation();
                    onSelectEdge?.(edge.id);
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* HTML Layer for Node Glows, Badges & Halos */}
        <div className="graph-lens-html-stage">
          {positionedNodes.map((node) => {
            if (hiddenNodeIds?.has(node.id)) return null;

            const overlay = evaluation.nodeOverlays.get(node.id);
            if (!overlay || overlay.opacity <= 0) return null;

            const isCritical = overlay.isCritical;
            const isRiskCritical = overlay.riskLevel === "critical";

            const glowBoxShadow =
              overlay.glowIntensity > 0 && !overlay.isFiltered
                ? generateGlowStyle(overlay.glowColor, overlay.glowIntensity, 12)
                : undefined;

            const nodeStyle: CSSProperties = {
              left: `${node.x}px`,
              top: `${node.y}px`,
              width: `${node.width}px`,
              height: `${node.height}px`,
              backgroundColor: overlay.fillColor,
              borderColor: overlay.borderColor,
              borderWidth: isCritical ? "2px" : "1.5px",
              borderStyle: "solid",
              boxShadow: glowBoxShadow,
              opacity: overlay.opacity,
            };

            return (
              <div
                key={`lens-node-${node.id}`}
                className={`lens-node-overlay ${overlay.isFiltered ? "is-filtered" : ""} ${
                  isCritical ? "is-critical" : ""
                } ${isRiskCritical ? "is-risk-critical" : ""}`}
                style={nodeStyle}
                data-node-id={node.id}
                onMouseEnter={() => setHoveredLensNodeId(node.id)}
                onMouseLeave={() => setHoveredLensNodeId(null)}
                onClick={(e: ReactMouseEvent) => {
                  e.stopPropagation();
                  setSelectedLensNodeId(node.id);
                  onSelectNode?.(node.id);
                }}
              >
                {/* Metric Badge Pill */}
                {activeConfig.showBadges && overlay.badgeText && (
                  <div
                    className={`lens-node-badge variant-${overlay.badgeVariant}`}
                    style={{ fontSize: zoomLevel < 0.6 ? "9px" : "11px" }}
                  >
                    {overlay.badgeText}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
