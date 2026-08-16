import type { CSSProperties, FC } from "react";
import { memo, useCallback, useMemo } from "react";
import {
  AnnotationPin,
  StickyNoteCard,
  useAnnotationStore,
  useFilteredAnnotations,
} from "../../components/CanvasAnnotations";
import type { CanvasAnnotation } from "../../components/CanvasAnnotations/types";
import type { PositionedNode } from "../../types/graphData";

export interface GraphAnnotationLayerProps {
  positionedNodes: PositionedNode[];
  hiddenNodeIds?: Set<string>;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  onSelectAnnotation?: (id: string) => void;
  onEditAnnotation?: (id: string) => void;
}

export interface ResolvedAnnotation {
  annotation: CanvasAnnotation;
  renderX: number;
  renderY: number;
  isAttachedToNode: boolean;
}

/**
 * Validates and resolves canvas / node coordinates for an annotation.
 * Supports node attachments with automatic fallback to explicit coordinates
 * when node is missing or removed. Strictly handles non-finite numbers.
 */
export function resolveAnnotationPlacement(
  annotation: CanvasAnnotation,
  nodeMap: Map<string, PositionedNode>,
  hiddenNodeIds?: Set<string>,
): ResolvedAnnotation | null {
  let renderX: number | null = null;
  let renderY: number | null = null;
  let isAttachedToNode = false;

  if (annotation.nodeId) {
    if (hiddenNodeIds && hiddenNodeIds.has(annotation.nodeId)) {
      return null;
    }
    const node = nodeMap.get(annotation.nodeId);
    if (node) {
      isAttachedToNode = true;
      const offsetX = annotation.offset?.x ?? 0;
      const offsetY =
        annotation.offset?.y ?? (annotation.type === "sticky" ? node.height + 12 : -16);
      renderX = node.x + node.width / 2 + offsetX;
      renderY = node.y + offsetY;
    }
    // If node was not found in nodeMap (e.g. unknown or deleted node),
    // fallback cleanly to coordinates if specified on the annotation.
  }

  if (renderX === null || renderY === null) {
    if (
      annotation.coordinates !== undefined &&
      annotation.coordinates !== null &&
      typeof annotation.coordinates.x === "number" &&
      typeof annotation.coordinates.y === "number" &&
      Number.isFinite(annotation.coordinates.x) &&
      Number.isFinite(annotation.coordinates.y)
    ) {
      renderX = annotation.coordinates.x + (annotation.offset?.x ?? 0);
      renderY = annotation.coordinates.y + (annotation.offset?.y ?? 0);
    }
  }

  if (
    renderX === null ||
    renderY === null ||
    !Number.isFinite(renderX) ||
    !Number.isFinite(renderY)
  ) {
    return null;
  }

  return {
    annotation,
    renderX,
    renderY,
    isAttachedToNode,
  };
}

/**
 * Hardware-accelerated Canvas Annotation Layer rendering pins, sticky notes,
 * and review bookmarks aligned to graph node and canvas coordinates.
 */
export const GraphAnnotationLayer: FC<GraphAnnotationLayerProps> = memo(
  function GraphAnnotationLayer({
    positionedNodes,
    hiddenNodeIds,
    selectedNodeId: _selectedNodeId,
    onSelectNode,
    onSelectAnnotation,
    onEditAnnotation,
  }) {
    const isLayerVisible = useAnnotationStore((state) => state.isLayerVisible);
    const selectedAnnotationId = useAnnotationStore((state) => state.selectedAnnotationId);
    const setSelectedAnnotationId = useAnnotationStore((state) => state.setSelectedAnnotationId);
    const setActiveEditingId = useAnnotationStore((state) => state.setActiveEditingId);
    const deleteAnnotation = useAnnotationStore((state) => state.deleteAnnotation);
    const toggleResolveAnnotation = useAnnotationStore((state) => state.toggleResolveAnnotation);
    const toggleCollapseAnnotation = useAnnotationStore((state) => state.toggleCollapseAnnotation);
    const togglePinAnnotation = useAnnotationStore((state) => state.togglePinAnnotation);
    const updateAnnotation = useAnnotationStore((state) => state.updateAnnotation);

    const filteredAnnotations = useFilteredAnnotations();

    const nodeMap = useMemo(() => {
      const map = new Map<string, PositionedNode>();
      for (const node of positionedNodes) {
        map.set(node.id, node);
      }
      return map;
    }, [positionedNodes]);

    const resolvedList: ResolvedAnnotation[] = useMemo(() => {
      if (!isLayerVisible || filteredAnnotations.length === 0) {
        return [];
      }
      return filteredAnnotations
        .map((ann) => resolveAnnotationPlacement(ann, nodeMap, hiddenNodeIds))
        .filter((item): item is ResolvedAnnotation => item !== null);
    }, [isLayerVisible, filteredAnnotations, nodeMap, hiddenNodeIds]);

    const handleSelect = useCallback(
      (id: string) => {
        setSelectedAnnotationId(id);
        onSelectAnnotation?.(id);
        const target = filteredAnnotations.find((a) => a.id === id);
        if (target?.nodeId && onSelectNode) {
          onSelectNode(target.nodeId);
        }
      },
      [setSelectedAnnotationId, onSelectAnnotation, filteredAnnotations, onSelectNode],
    );

    const handleEdit = useCallback(
      (id: string) => {
        setActiveEditingId(id);
        onEditAnnotation?.(id);
      },
      [setActiveEditingId, onEditAnnotation],
    );

    const handleUpdateContent = useCallback(
      (id: string, newContent: string) => {
        updateAnnotation(id, { content: newContent });
      },
      [updateAnnotation],
    );

    if (!isLayerVisible || resolvedList.length === 0) {
      return null;
    }

    return (
      <div
        className="graph-annotation-layer"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 15,
        }}
      >
        {resolvedList.map(({ annotation, renderX, renderY }) => {
          const isSelected = selectedAnnotationId === annotation.id;

          if (annotation.type === "sticky") {
            const stickyStyle: CSSProperties = {
              position: "absolute",
              transform: `translate3d(calc(${renderX}px - 50%), ${renderY}px, 0)`,
              willChange: "transform",
            };

            return (
              <StickyNoteCard
                key={annotation.id}
                annotation={annotation}
                isSelected={isSelected}
                onSelect={handleSelect}
                onEdit={handleEdit}
                onDelete={deleteAnnotation}
                onToggleResolve={toggleResolveAnnotation}
                onToggleCollapse={toggleCollapseAnnotation}
                onTogglePin={togglePinAnnotation}
                onUpdateContent={handleUpdateContent}
                style={stickyStyle}
              />
            );
          }

          // Pin or Bookmark
          const pinStyle: CSSProperties = {
            position: "absolute",
            transform: `translate3d(calc(${renderX}px - 50%), calc(${renderY}px - 50%), 0)`,
            willChange: "transform",
          };

          return (
            <AnnotationPin
              key={annotation.id}
              annotation={annotation}
              isSelected={isSelected}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onDelete={deleteAnnotation}
              onToggleResolve={toggleResolveAnnotation}
              style={pinStyle}
            />
          );
        })}
      </div>
    );
  },
);

GraphAnnotationLayer.displayName = "GraphAnnotationLayer";
