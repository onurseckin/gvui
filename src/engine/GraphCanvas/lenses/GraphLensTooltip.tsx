import type { FC } from "react";
import { memo, useMemo } from "react";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { useCanvasLensStore } from "../../../store/useCanvasLensStore";
import { evaluateCanvasLens } from "./lensEvaluator";
import "./GraphLensStyles.css";

export interface GraphLensTooltipProps {
  positionedNodes: readonly PositionedNode[];
  positionedEdges: readonly PositionedEdge[];
  cursorPos?: { x: number; y: number } | null;
}

export const GraphLensTooltip: FC<GraphLensTooltipProps> = memo(function GraphLensTooltip({
  positionedNodes,
  positionedEdges,
  cursorPos,
}) {
  const activeLens = useCanvasLensStore((s) => s.activeLens);
  const isTooltipEnabled = useCanvasLensStore((s) => s.isTooltipEnabled);
  const hoveredNodeId = useCanvasLensStore((s) => s.hoveredLensNodeId);
  const configs = useCanvasLensStore((s) => s.configs);

  const activeConfig = useMemo(() => {
    return configs[activeLens] ?? configs.none;
  }, [configs, activeLens]);

  const evaluation = useMemo(() => {
    return evaluateCanvasLens(positionedNodes, positionedEdges, activeConfig);
  }, [positionedNodes, positionedEdges, activeConfig]);

  if (activeLens === "none" || !isTooltipEnabled || !hoveredNodeId) {
    return null;
  }

  const overlay = evaluation.nodeOverlays.get(hoveredNodeId);
  if (!overlay) return null;

  const tooltip = overlay.tooltipContent;

  const style = cursorPos
    ? {
        left: `${cursorPos.x}px`,
        top: `${cursorPos.y}px`,
      }
    : undefined;

  return (
    <div className="graph-lens-tooltip" style={style} data-testid="graph-lens-tooltip">
      <div className="graph-lens-tooltip-title">{tooltip.title}</div>
      {tooltip.subtitle && <div className="graph-lens-tooltip-subtitle">{tooltip.subtitle}</div>}

      {/* Primary Highlight Value */}
      <div className="graph-lens-tooltip-primary">
        <span className="graph-lens-tooltip-primary-label">{tooltip.primaryMetric.label}</span>
        <span className="graph-lens-tooltip-primary-val">{tooltip.primaryMetric.formatted}</span>
      </div>

      {/* Factors List */}
      {tooltip.factors.length > 0 && (
        <div className="graph-lens-tooltip-factors">
          {tooltip.factors.map((factor, idx) => (
            <div key={`factor-${idx}`} className="graph-lens-tooltip-factor-row">
              <span>{factor.label}:</span>
              <span className="graph-lens-tooltip-factor-val">{factor.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary Note */}
      {tooltip.summaryNote && <div className="graph-lens-tooltip-note">{tooltip.summaryNote}</div>}
    </div>
  );
});
