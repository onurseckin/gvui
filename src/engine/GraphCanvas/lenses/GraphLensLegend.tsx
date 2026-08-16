import type { FC } from "react";
import { memo, useMemo } from "react";
import { IconX } from "@tabler/icons-react";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { useCanvasLensStore } from "../../../store/useCanvasLensStore";
import { resolveColorStops } from "./colorRamps";
import { evaluateCanvasLens } from "./lensEvaluator";
import "./GraphLensStyles.css";

export interface GraphLensLegendProps {
  positionedNodes: readonly PositionedNode[];
  positionedEdges: readonly PositionedEdge[];
  className?: string;
}

export const GraphLensLegend: FC<GraphLensLegendProps> = memo(function GraphLensLegend({
  positionedNodes,
  positionedEdges,
  className = "",
}) {
  const activeLens = useCanvasLensStore((s) => s.activeLens);
  const isLegendVisible = useCanvasLensStore((s) => s.isLegendVisible);
  const toggleLegendVisible = useCanvasLensStore((s) => s.toggleLegendVisible);
  const configs = useCanvasLensStore((s) => s.configs);

  const activeConfig = useMemo(() => {
    return configs[activeLens] ?? configs.none;
  }, [configs, activeLens]);

  const evaluation = useMemo(() => {
    return evaluateCanvasLens(positionedNodes, positionedEdges, activeConfig);
  }, [positionedNodes, positionedEdges, activeConfig]);

  const legendData = evaluation.legendData;

  // Build CSS linear-gradient string from color stops
  const gradientStyle = useMemo(() => {
    const stops = resolveColorStops(activeConfig.colorRamp, activeConfig.customStops);
    if (!stops || stops.length === 0) return "linear-gradient(to right, #3b82f6, #ef4444)";

    const stopStrings = stops.map((s) => `${s.color} ${Math.round(s.stop * 100)}%`);
    return `linear-gradient(to right, ${stopStrings.join(", ")})`;
  }, [activeConfig.colorRamp, activeConfig.customStops]);

  if (activeLens === "none" || !isLegendVisible) {
    return null;
  }

  const maxHistogramCount = Math.max(1, ...legendData.histogramBuckets.map((b) => b.count));

  return (
    <div className={`graph-lens-legend ${className}`} data-testid="graph-lens-legend">
      <div className="graph-lens-legend-header">
        <div className="graph-lens-legend-title">{legendData.title}</div>
        <button
          type="button"
          className="graph-lens-toolbar-toggle-btn"
          onClick={toggleLegendVisible}
          aria-label="Hide lens legend"
        >
          <IconX size={14} />
        </button>
      </div>

      {/* Color Gradient Bar */}
      <div className="graph-lens-legend-bar" style={{ background: gradientStyle }} />

      {/* Min / Max Labels */}
      <div className="graph-lens-legend-labels">
        <span>{legendData.formattedMin}</span>
        <span>{legendData.formattedMax}</span>
      </div>

      {/* Distribution Histogram Mini Bars */}
      {legendData.histogramBuckets.length > 0 && (
        <div className="graph-lens-histogram-bars">
          {legendData.histogramBuckets.map((bucket, i) => {
            const heightPct = Math.max(8, (bucket.count / maxHistogramCount) * 100);
            return (
              <div
                key={`bucket-${i}`}
                className="graph-lens-histogram-bar"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: bucket.color,
                }}
                title={`${bucket.count} nodes in range`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});
