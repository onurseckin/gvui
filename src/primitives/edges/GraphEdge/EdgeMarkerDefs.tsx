import type { FC } from "react";
import { memo } from "react";

export interface EdgeMarkerDefsProps {
  idPrefix?: string;
}

export const EdgeMarkerDefs: FC<EdgeMarkerDefsProps> = memo(({ idPrefix = "" }) => {
  const getMarkerId = (id: string): string => (idPrefix ? `${idPrefix}-${id}` : id);

  return (
    <defs>
      <marker
        id={getMarkerId("edge-arrowhead")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <path
          d="M 0 1 L 10 5 L 0 9 z"
          fill="var(--border, #9ca3af)"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      <marker
        id={getMarkerId("edge-arrowhead-selected")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <path
          d="M 0 1 L 10 5 L 0 9 z"
          fill="var(--accent, #aa3bff)"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      <marker
        id={getMarkerId("edge-arrowhead-cycle")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <path
          d="M 0 1 L 10 5 L 0 9 z"
          fill="#f59e0b"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      <marker
        id={getMarkerId("edge-circle")}
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <circle
          cx="5"
          cy="5"
          r="3"
          fill="var(--bg, #ffffff)"
          stroke="var(--border, #9ca3af)"
          strokeWidth="1.5"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      <marker
        id={getMarkerId("edge-circle-connected")}
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <circle
          cx="5"
          cy="5"
          r="3.5"
          fill="var(--accent, #aa3bff)"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      <linearGradient id={getMarkerId("edge-flow-gradient")} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="var(--accent, #aa3bff)" stopOpacity="0.2" />
        <stop offset="50%" stopColor="var(--accent, #aa3bff)" stopOpacity="1.0" />
        <stop offset="100%" stopColor="var(--accent, #aa3bff)" stopOpacity="0.2" />
      </linearGradient>
    </defs>
  );
});

EdgeMarkerDefs.displayName = "EdgeMarkerDefs";
