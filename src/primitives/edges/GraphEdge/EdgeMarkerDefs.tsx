import type { FC } from "react";

export interface EdgeMarkerDefsProps {
  idPrefix?: string;
}

export const EdgeMarkerDefs: FC<EdgeMarkerDefsProps> = ({ idPrefix = "" }) => {
  const getMarkerId = (id: string): string => (idPrefix ? `${idPrefix}-${id}` : id);

  return (
    <defs>
      {/* Standard Arrowhead */}
      <marker
        id={getMarkerId("edge-arrowhead")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--border, #9ca3af)" />
      </marker>

      {/* Selected Arrowhead */}
      <marker
        id={getMarkerId("edge-arrowhead-selected")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--accent, #aa3bff)" />
      </marker>

      {/* Cycle Arrowhead */}
      <marker
        id={getMarkerId("edge-arrowhead-cycle")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
      </marker>

      {/* Circle Endpoint */}
      <marker
        id={getMarkerId("edge-circle")}
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
      >
        <circle
          cx="5"
          cy="5"
          r="3"
          fill="var(--bg, #ffffff)"
          stroke="var(--border, #9ca3af)"
          strokeWidth="1.5"
        />
      </marker>

      {/* Connected Circle Endpoint */}
      <marker
        id={getMarkerId("edge-circle-connected")}
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
      >
        <circle cx="5" cy="5" r="3.5" fill="var(--accent, #aa3bff)" />
      </marker>

      {/* Flow Gradient for Animated Edges */}
      <linearGradient id={getMarkerId("edge-flow-gradient")} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="var(--accent, #aa3bff)" stopOpacity="0.2" />
        <stop offset="50%" stopColor="var(--accent, #aa3bff)" stopOpacity="1.0" />
        <stop offset="100%" stopColor="var(--accent, #aa3bff)" stopOpacity="0.2" />
      </linearGradient>
    </defs>
  );
};
