import React, { useId, useMemo } from "react";
import type { PositionedNode } from "../../types/graphData";
import type { SubgraphPreviewCanvasProps } from "./types";

interface NodeVisualBox {
  id: string;
  name: string;
  kind?: string;
  status?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SubgraphPreviewCanvas: React.FC<SubgraphPreviewCanvasProps> = ({
  extracted,
  width = "100%",
  height = "100%",
  showBoundaryEdges = true,
  showBookmarks = true,
  className = "",
}) => {
  const patternId = useId();
  const markerId = useId();
  const boundaryMarkerId = useId();

  const { dataset, boundaryEdges, annotations, positionedNodes } = extracted;
  const nodes = dataset.nodes;
  const edges = dataset.edges;

  // Compute layout bounding box & positions
  const { nodeBoxes, viewBox } = useMemo(() => {
    if (nodes.length === 0) {
      return { nodeBoxes: [], viewBox: "0 0 400 300" };
    }

    const posMap = new Map<string, PositionedNode>();
    for (const pn of positionedNodes) {
      posMap.set(pn.id, pn);
    }

    const boxes: NodeVisualBox[] = [];

    // Check if we have valid positions for most nodes
    const hasPositions = nodes.some((n) => posMap.has(n.id));

    if (hasPositions) {
      for (const node of nodes) {
        const pn = posMap.get(node.id);
        const x = pn ? pn.x : 0;
        const y = pn ? pn.y : 0;
        const w = pn ? Math.max(120, pn.width) : 140;
        const h = pn ? Math.max(60, pn.height) : 70;
        boxes.push({
          id: node.id,
          name: node.name || node.id,
          kind: node.kind,
          status: node.status,
          x,
          y,
          width: w,
          height: h,
        });
      }
    } else {
      // Synthetic grid layout
      const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length * 1.5)));
      const boxW = 140;
      const boxH = 70;
      const gapX = 60;
      const gapY = 60;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        boxes.push({
          id: node.id,
          name: node.name || node.id,
          kind: node.kind,
          status: node.status,
          x: 40 + col * (boxW + gapX),
          y: 40 + row * (boxH + gapY),
          width: boxW,
          height: boxH,
        });
      }
    }

    // Calculate bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const b of boxes) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.width > maxX) maxX = b.x + b.width;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    }

    const padding = 50;
    const vbX = Math.floor(minX - padding);
    const vbY = Math.floor(minY - padding);
    const vbW = Math.max(400, Math.ceil(maxX - minX + padding * 2));
    const vbH = Math.max(300, Math.ceil(maxY - minY + padding * 2));

    return {
      nodeBoxes: boxes,
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    };
  }, [nodes, positionedNodes]);

  const boxMap = useMemo(() => {
    const map = new Map<string, NodeVisualBox>();
    for (const b of nodeBoxes) {
      map.set(b.id, b);
    }
    return map;
  }, [nodeBoxes]);

  if (nodes.length === 0) {
    return (
      <div className={`subgraph-canvas-empty ${className}`}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <span>No nodes selected in current subgraph filter</span>
      </div>
    );
  }

  return (
    <div className={`subgraph-canvas-wrap ${className}`}>
      <svg
        className="subgraph-svg-canvas"
        style={{ width, height }}
        viewBox={viewBox}
        role="img"
        aria-label="Subgraph preview diagram"
      >
        <defs>
          <pattern id={patternId} width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#27272a" />
          </pattern>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
          </marker>
          <marker
            id={boundaryMarkerId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Background Grid */}
        <rect x="-10000" y="-10000" width="20000" height="20000" fill={`url(#${patternId})`} />

        {/* Internal Edges */}
        {edges.map((edge) => {
          const srcBox = boxMap.get(edge.source);
          const tgtBox = boxMap.get(edge.target);
          if (!srcBox || !tgtBox) return null;

          const sx = srcBox.x + srcBox.width / 2;
          const sy = srcBox.y + srcBox.height / 2;
          const tx = tgtBox.x + tgtBox.width / 2;
          const ty = tgtBox.y + tgtBox.height / 2;

          const dx = tx - sx;
          const dy = ty - sy;
          const cx1 = sx + dx * 0.25;
          const cy1 = sy + dy * 0.1;
          const cx2 = sx + dx * 0.75;
          const cy2 = ty - dy * 0.1;

          const isDashed = edge.kind === "spawn" || edge.kind === "dispatch";
          const strokeColor =
            edge.kind === "pushback" || edge.kind === "critic"
              ? "#f43f5e"
              : edge.kind === "data" || edge.kind === "handoff"
                ? "#a855f7"
                : "#64748b";

          return (
            <g key={edge.id} className="subgraph-edge-group">
              <path
                d={`M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth="1.8"
                strokeDasharray={isDashed ? "4 4" : undefined}
                markerEnd={`url(#${markerId})`}
              />
              {edge.label && (
                <text
                  x={(sx + tx) / 2}
                  y={(sy + ty) / 2 - 4}
                  fill="#94a3b8"
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Boundary Edges (Crossings) */}
        {showBoundaryEdges &&
          boundaryEdges.map((be) => {
            const isOut = be.boundaryType === "outgoing";
            const intBox = boxMap.get(be.internalNodeId);
            if (!intBox) return null;

            const ix = intBox.x + intBox.width / 2;
            const iy = intBox.y + intBox.height / 2;
            const stubLen = 40;
            const angle = isOut ? -Math.PI / 4 : (3 * Math.PI) / 4;
            const ex = ix + Math.cos(angle) * (intBox.width / 2 + stubLen);
            const ey = iy + Math.sin(angle) * (intBox.height / 2 + stubLen);

            const startX = isOut ? ix : ex;
            const startY = isOut ? iy : ey;
            const endX = isOut ? ex : ix;
            const endY = isOut ? ey : iy;

            return (
              <g key={`be-${be.edge.id}-${be.boundaryType}`} className="subgraph-boundary-stub">
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke="#94a3b8"
                  strokeWidth="1.4"
                  strokeDasharray="3 3"
                  markerEnd={`url(#${boundaryMarkerId})`}
                />
                <circle cx={ex} cy={ey} r="10" fill="#18181b" stroke="#64748b" strokeWidth="1.2" />
                <text
                  x={ex}
                  y={ey + 3}
                  fontSize="8"
                  fill="#94a3b8"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  {isOut ? "OUT" : "IN"}
                </text>
              </g>
            );
          })}

        {/* Nodes */}
        {nodeBoxes.map((box) => {
          const statusBg =
            box.status === "success"
              ? "#064e3b"
              : box.status === "error"
                ? "#7f1d1d"
                : box.status === "running"
                  ? "#164e63"
                  : "#18181b";

          const statusBorder =
            box.status === "success"
              ? "#10b981"
              : box.status === "error"
                ? "#ef4444"
                : box.status === "running"
                  ? "#06b6d4"
                  : "#3f3f46";

          return (
            <g key={box.id} transform={`translate(${box.x}, ${box.y})`}>
              {/* Card Base */}
              <rect
                width={box.width}
                height={box.height}
                rx="6"
                fill={statusBg}
                stroke={statusBorder}
                strokeWidth="1.5"
              />
              {/* Kind Pill / Indicator */}
              <rect x="8" y="8" width="40" height="14" rx="3" fill="#27272a" />
              <text
                x="28"
                y="18"
                fontSize="8"
                fill="#a1a1aa"
                textAnchor="middle"
                fontFamily="sans-serif"
              >
                {box.kind || "agent"}
              </text>
              {/* Node Name */}
              <text
                x="8"
                y="38"
                fontSize="11"
                fontWeight="600"
                fill="#ffffff"
                fontFamily="sans-serif"
              >
                {box.name.length > 16 ? `${box.name.slice(0, 15)}…` : box.name}
              </text>
              {/* Node ID */}
              <text x="8" y="52" fontSize="9" fill="#94a3b8" fontFamily="monospace">
                {box.id.length > 18 ? `${box.id.slice(0, 17)}…` : box.id}
              </text>
            </g>
          );
        })}

        {/* Bookmark Pins */}
        {showBookmarks &&
          annotations.map((ann, idx) => {
            let px = 0;
            let py = 0;

            if (ann.nodeId && boxMap.has(ann.nodeId)) {
              const box = boxMap.get(ann.nodeId);
              if (box) {
                px = box.x + box.width - 12;
                py = box.y - 6;
              }
            } else if (ann.coordinates) {
              px = ann.coordinates.x;
              py = ann.coordinates.y;
            } else {
              return null;
            }

            const pinColor =
              ann.priority === "critical"
                ? "#ef4444"
                : ann.priority === "high"
                  ? "#f97316"
                  : ann.priority === "medium"
                    ? "#eab308"
                    : "#3b82f6";

            return (
              <g key={ann.id || `pin-${idx}`} transform={`translate(${px}, ${py})`}>
                <circle cx="0" cy="0" r="7" fill={pinColor} stroke="#ffffff" strokeWidth="1.5" />
                <text
                  x="0"
                  y="3"
                  fontSize="8"
                  fontWeight="bold"
                  fill="#ffffff"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  ★
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );
};
