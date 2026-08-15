import type { FC } from "react";
import { useMemo } from "react";
import type { GraphSection, PositionedNode } from "../../types/graphData";

interface GraphSectionsLayerProps {
  sections?: GraphSection[];
  positionedNodes: PositionedNode[];
  hiddenNodeIds: Set<string>;
}

interface SectionBounds {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GraphSectionsLayer: FC<GraphSectionsLayerProps> = ({
  sections,
  positionedNodes,
  hiddenNodeIds,
}) => {
  const nodeMap = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    for (const node of positionedNodes) {
      if (!hiddenNodeIds.has(node.id)) {
        map.set(node.id, node);
      }
    }
    return map;
  }, [positionedNodes, hiddenNodeIds]);

  const sectionBounds: SectionBounds[] = useMemo(() => {
    if (!sections || sections.length === 0) return [];

    const result: SectionBounds[] = [];
    const padding = 20;
    const headerHeight = 28;

    for (const section of sections) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let count = 0;

      for (const nodeId of section.nodeIds) {
        const node = nodeMap.get(nodeId);
        if (node) {
          count++;
          minX = Math.min(minX, node.x);
          minY = Math.min(minY, node.y);
          maxX = Math.max(maxX, node.x + node.width);
          maxY = Math.max(maxY, node.y + node.height);
        }
      }

      if (count > 0 && Number.isFinite(minX) && Number.isFinite(minY)) {
        result.push({
          id: section.id,
          title: section.title,
          x: minX - padding,
          y: minY - padding - headerHeight,
          width: maxX - minX + padding * 2,
          height: maxY - minY + padding * 2 + headerHeight,
        });
      }
    }

    return result;
  }, [sections, nodeMap]);

  if (sectionBounds.length === 0) return null;

  return (
    <div
      className="graph-sections-layer"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {sectionBounds.map((sb) => (
        <div
          key={sb.id}
          className="graph-section-boundary"
          style={{
            position: "absolute",
            left: `${sb.x}px`,
            top: `${sb.y}px`,
            width: `${sb.width}px`,
            height: `${sb.height}px`,
            border: "1px dashed rgba(63, 63, 70, 0.4)",
            borderRadius: "10px",
            backgroundColor: "rgba(24, 24, 27, 0.25)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "6px",
              left: "12px",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              color: "rgba(161, 161, 170, 0.65)",
            }}
          >
            {sb.title}
          </div>
        </div>
      ))}
    </div>
  );
};
