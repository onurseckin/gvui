import type { FC } from "react";
import { memo } from "react";

export interface EdgeMarkerDefsProps {
  idPrefix?: string;
}

export const EdgeMarkerDefs: FC<EdgeMarkerDefsProps> = memo(({ idPrefix = "" }) => {
  const getMarkerId = (id: string): string => (idPrefix ? `${idPrefix}-${id}` : id);

  return (
    <defs>
      {/* 1. Default Understated Neutral Marker (#94a3b8) */}
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
          fill="#94a3b8"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      <marker
        id={getMarkerId("edge-arrowhead-default")}
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
          fill="#94a3b8"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 2. Selected Edge Marker (#818cf8) */}
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
          fill="#818cf8"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 3. Highlighted Edge Marker (#818cf8) */}
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
          fill="#818cf8"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 4. Prompt Source Node Archetype Marker (#8b5cf6) */}
      <marker
        id={getMarkerId("edge-arrowhead-prompt")}
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
          fill="#8b5cf6"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 5. Planner / Orchestrator Source Node Archetype Marker (#3b82f6) */}
      <marker
        id={getMarkerId("edge-arrowhead-planner")}
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
          fill="#3b82f6"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      <marker
        id={getMarkerId("edge-arrowhead-orchestrator")}
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
          fill="#3b82f6"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 6. Worker / Agent / Spawn Source Node Archetype Marker (#06b6d4) */}
      <marker
        id={getMarkerId("edge-arrowhead-worker")}
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
          fill="#06b6d4"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      <marker
        id={getMarkerId("edge-arrowhead-agent")}
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
          fill="#06b6d4"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

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
          fill="#06b6d4"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 7. Gate / Validation Source Node Archetype Marker (#10b981) */}
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
          fill="#10b981"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      <marker
        id={getMarkerId("edge-arrowhead-validation")}
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
          fill="#10b981"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 8. Critic / Signoff Source Node Archetype Marker (#818cf8) */}
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
          fill="#818cf8"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 9. Loop / Pushback / Cycle Source Node Archetype Marker (#f43f5e) */}
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
          fill="#f43f5e"
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
          fill="#f43f5e"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 10. Semantic Data Handoff Marker (#6366f1) */}
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
          fill="#6366f1"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 11. Semantic Dependency Marker (#64748b) */}
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
          fill="#64748b"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      </marker>

      {/* 12. Semantic Sequence Marker (#94a3b8) */}
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
          fill="#94a3b8"
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
          fill="#94a3b8"
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
