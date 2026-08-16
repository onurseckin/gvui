import type { FC } from "react";
import { worldToMinimap } from "./minimapMath";
import type { MinimapDensityHeatmapProps } from "./types";

export const MinimapDensityHeatmap: FC<MinimapDensityHeatmapProps> = ({
  densityGrid,
  transform,
  opacity = 0.75,
  visible = true,
  className = "",
}) => {
  if (!visible || !densityGrid || densityGrid.cells.length === 0 || densityGrid.maxCount === 0) {
    return null;
  }

  return (
    <g
      className={`minimap-density-heatmap ${className}`.trim()}
      opacity={opacity}
      data-testid="minimap-density-heatmap"
    >
      <defs>
        <filter id="minimap-heatmap-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Render blurred glow underlay */}
      <g filter="url(#minimap-heatmap-blur)" opacity={0.6}>
        {densityGrid.cells.map((cell) => {
          if (cell.count === 0 || cell.density <= 0) return null;
          const pos = worldToMinimap(cell.x, cell.y, transform);
          const cellW = cell.width * transform.scale;
          const cellH = cell.height * transform.scale;

          return (
            <rect
              key={`blur-${cell.row}-${cell.col}`}
              x={pos.x}
              y={pos.y}
              width={Math.max(1, cellW)}
              height={Math.max(1, cellH)}
              rx={4}
              ry={4}
              fill={cell.color}
            />
          );
        })}
      </g>

      {/* Render structured grid overlay */}
      <g>
        {densityGrid.cells.map((cell) => {
          if (cell.count === 0 || cell.density <= 0) return null;
          const pos = worldToMinimap(cell.x, cell.y, transform);
          const cellW = cell.width * transform.scale;
          const cellH = cell.height * transform.scale;

          return (
            <rect
              key={`cell-${cell.row}-${cell.col}`}
              x={pos.x}
              y={pos.y}
              width={Math.max(1, cellW)}
              height={Math.max(1, cellH)}
              rx={2}
              ry={2}
              fill={cell.color}
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={0.5}
            >
              <title>{`Density: ${cell.count} nodes (${Math.round(cell.density * 100)}%)`}</title>
            </rect>
          );
        })}
      </g>
    </g>
  );
};

export default MinimapDensityHeatmap;
