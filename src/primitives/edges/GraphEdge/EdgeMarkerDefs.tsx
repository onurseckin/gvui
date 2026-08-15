import type { FC } from "react";
import { memo } from "react";

export interface EdgeMarkerDefsProps {
  idPrefix?: string;
}

export const EdgeMarkerDefs: FC<EdgeMarkerDefsProps> = memo(({ idPrefix = "" }) => {
  const getMarkerId = (id: string): string => (idPrefix ? `${idPrefix}-${id}` : id);

  return (
    <defs>
      {/* Default Understated Neutral Marker */}
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
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* Selected Edge Marker */}
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
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* Highlighted Edge Marker */}
      <marker
        id={getMarkerId("edge-arrowhead-highlighted")}
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
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 1. Spawn / Dispatch Marker (Cyan) */}
      <marker
        id={getMarkerId("edge-arrowhead-spawn")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6.5"
        markerHeight="6.5"
        orient="auto-start-reverse"
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <path
          d="M 0 1 L 10 5 L 0 9 z"
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 2. Sequence Marker (Neutral Zinc) */}
      <marker
        id={getMarkerId("edge-arrowhead-sequence")}
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
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 3. Data Handoff Marker (Indigo) */}
      <marker
        id={getMarkerId("edge-arrowhead-data")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6.5"
        markerHeight="6.5"
        orient="auto-start-reverse"
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <path
          d="M 0 1 L 10 5 L 0 9 z"
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 4. Dependency Marker (Slate) */}
      <marker
        id={getMarkerId("edge-arrowhead-dependency")}
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
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 5. Loop / Pushback Marker (Crimson) */}
      <marker
        id={getMarkerId("edge-arrowhead-loop")}
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
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* Cycle Marker (Amber/Gold) */}
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
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 6. Validation Gate Marker (Emerald Green) */}
      <marker
        id={getMarkerId("edge-arrowhead-gate")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6.5"
        markerHeight="6.5"
        orient="auto-start-reverse"
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <path
          d="M 0 1 L 10 5 L 0 9 z"
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 7. Critic Signoff Marker (Metallic Gold) */}
      <marker
        id={getMarkerId("edge-arrowhead-critic")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6.5"
        markerHeight="6.5"
        orient="auto-start-reverse"
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <path
          d="M 0 1 L 10 5 L 0 9 z"
          fill="context-stroke"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* Port and Flow Markers */}
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
          fill="var(--bg, #18181b)"
          stroke="var(--border, #52525b)"
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
          fill="context-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      <linearGradient id={getMarkerId("edge-flow-gradient")} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="var(--accent, #818cf8)" stopOpacity="0.2" />
        <stop offset="50%" stopColor="var(--accent, #818cf8)" stopOpacity="1.0" />
        <stop offset="100%" stopColor="var(--accent, #818cf8)" stopOpacity="0.2" />
      </linearGradient>
    </defs>
  );
});

EdgeMarkerDefs.displayName = "EdgeMarkerDefs";
