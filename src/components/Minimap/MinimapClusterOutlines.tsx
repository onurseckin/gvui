import type { FC } from "react";
import { polygonToSvgPath, worldToMinimap } from "./minimapMath";
import type { MinimapClusterOutlinesProps, Point2D } from "./types";

export const MinimapClusterOutlines: FC<MinimapClusterOutlinesProps> = ({
  clusters,
  transform,
  visible = true,
  className = "",
}) => {
  if (!visible || !clusters || clusters.length === 0) {
    return null;
  }

  return (
    <g
      className={`minimap-cluster-outlines ${className}`.trim()}
      data-testid="minimap-cluster-outlines"
    >
      {clusters.map((cluster) => {
        if (cluster.hullPoints.length === 0) return null;

        // Map world hull points to minimap coordinate space
        const minimapHull: Point2D[] = cluster.hullPoints.map((p) =>
          worldToMinimap(p.x, p.y, transform),
        );

        const pathD = polygonToSvgPath(minimapHull);
        if (!pathD) return null;

        // Cluster center for label
        const centerPt = worldToMinimap(
          cluster.bounds.minX + cluster.bounds.width / 2,
          cluster.bounds.minY,
          transform,
        );

        return (
          <g key={cluster.id} className="minimap-cluster-group">
            {/* Translucent fill */}
            <path
              d={pathD}
              fill={cluster.color}
              fillOpacity={0.08}
              stroke={cluster.color}
              strokeWidth={1.2}
              strokeDasharray="3 2"
              strokeOpacity={0.7}
              className="minimap-cluster-path"
            >
              <title>{`${cluster.label} (${cluster.nodeIds.length} nodes)`}</title>
            </path>

            {/* Cluster Label Badge */}
            {cluster.nodeIds.length >= 2 && (
              <text
                x={centerPt.x}
                y={Math.max(10, centerPt.y - 4)}
                textAnchor="middle"
                fill={cluster.color}
                fontSize={8}
                fontWeight="bold"
                fontFamily="var(--font-mono, monospace)"
                opacity={0.85}
                className="minimap-cluster-label"
              >
                {cluster.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
};

export default MinimapClusterOutlines;
