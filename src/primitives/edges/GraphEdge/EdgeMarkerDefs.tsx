import type { FC } from "react";
import { memo } from "react";

import {
  EDGE_KIND_DESCRIPTORS,
  GENERATED_EDGE_MARKER_ID,
  type EdgeKindDescriptor,
} from "./edgeKinds";

/**
 * Arrowhead geometry per silhouette. `hollow` is drawn as an outline so a probe's arrowhead reads
 * as an open question, and `terminal` carries a stop bar so a signoff reads as a full stop.
 */
function renderMarkerPath(descriptor: EdgeKindDescriptor) {
  switch (descriptor.markerShape) {
    case "hollow":
      return (
        <path
          d="M 1 1.5 L 9 5 L 1 8.5 z"
          fill="none"
          stroke={descriptor.accent}
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      );
    case "terminal":
      return (
        <path
          d="M 0 1 L 7 5 L 0 9 z M 8 0.5 L 10 0.5 L 10 9.5 L 8 9.5 z"
          fill={descriptor.accent}
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      );
    case "heavy":
      return (
        <path
          d="M 0 0 L 10 5 L 0 10 L 2.5 5 z"
          fill={descriptor.accent}
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      );
    default:
      return (
        <path
          d="M 0 1 L 10 5 L 0 9 z"
          fill={descriptor.accent}
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
      );
  }
}

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

      {/* 6. Worker / Agent Source Node Archetype Marker (#06b6d4) */}
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

      {/* Cycle marker, referenced by the exported standalone SVG rather than by a descriptor. */}
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

      {/*
        The arrowhead for a kind with no preset. `context-stroke` takes the edge's own stroke, which
        is that kind's generated accent, so one marker serves every unfamiliar vocabulary.
      */}
      <marker
        id={getMarkerId(GENERATED_EDGE_MARKER_ID)}
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

      {/*
        One marker per preset edge kind, generated from EDGE_KIND_DESCRIPTORS so a kind can never
        be added to the table without also getting an arrowhead.
      */}
      {Object.values(EDGE_KIND_DESCRIPTORS).map((descriptor) => (
        <marker
          key={descriptor.markerId}
          id={getMarkerId(descriptor.markerId)}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth={descriptor.markerShape === "heavy" ? 7 : 6.5}
          markerHeight={descriptor.markerShape === "heavy" ? 7 : 6.5}
          orient="auto-start-reverse"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        >
          {renderMarkerPath(descriptor)}
        </marker>
      ))}

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
