import {
  IconChevronDown,
  IconChevronUp,
  IconDots,
  IconFolder,
  IconGitBranch,
  IconGripHorizontal,
  IconLock,
  IconLockOpen,
} from "@tabler/icons-react";
import type { CSSProperties, FC, MouseEvent as ReactMouseEvent } from "react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  GROUP_THEME_PALETTES,
  computeGroupBounds,
  computeGroupDragOffsets,
  useCanvasGroupingStore,
  type CanvasGroup,
  type GroupBounds,
} from "../../components/CanvasGrouping";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphSection, PositionedNode } from "../../types/graphData";
import { computeSectionDepths, describeSectionType, sectionStartsCollapsed } from "./sectionKinds";
import "../../components/CanvasGrouping/CanvasGrouping.css";

export interface GraphGroupingLayerProps {
  positionedNodes: PositionedNode[];
  hiddenNodeIds?: Set<string>;
  /** Dataset regions — a branch excursion is one of these. Rendered read-only beside user groups. */
  sections?: GraphSection[];
  selectedNodeId?: string | null;
  zoomLevel?: number;
  onSelectGroup?: (groupId: string) => void;
  onSelectNode?: (nodeId: string) => void;
}

export interface ResolvedGroupRenderData {
  group: CanvasGroup;
  bounds: GroupBounds;
  /** Why the region exists. For a branch region this is the recorded branch reason. */
  reason?: string;
  /** Dataset regions are structure, not user annotation: they cannot be dragged or edited. */
  isSection: boolean;
  /** How deeply the region is nested, shown in its header. Only dataset regions have one. */
  depth?: number;
  /** The region type's accent, generated when the type has no preset. */
  accent?: string;
}

/**
 * Colours a section by its recorded status so an abandoned excursion does not look like a collected
 * one. An unrecorded status stays neutral rather than borrowing a success colour.
 */
function sectionPalette(status?: string): CanvasGroup["color"] {
  switch (status) {
    case "collected":
      return "purple";
    case "collecting":
    case "open":
      return "cyan";
    case "abandoned":
      return "rose";
    default:
      return "slate";
  }
}

/** The layer's id for a dataset region, namespaced so it can never collide with a user group. */
export function sectionGroupId(sectionId: string): string {
  return `section:${sectionId}`;
}

/**
 * Projects a dataset section onto the group shape the layer already knows how to draw. The section
 * is locked, so none of the drag/edit affordances apply to it — collapsing is the one thing the
 * reader may do to it, and that state lives in this layer rather than in the user-group store.
 */
function sectionAsGroup(section: GraphSection, isCollapsed: boolean): CanvasGroup {
  return {
    id: sectionGroupId(section.id),
    label: section.title,
    description: section.description,
    color: sectionPalette(section.status),
    memberNodeIds: section.nodeIds,
    isCollapsed,
    isLocked: true,
    shapeMode: "box",
  };
}

/**
 * Hardware-accelerated Canvas Grouping Layer rendering custom functional boundary boxes/zones,
 * 2D convex hulls, region title headers, synchronous drag handles, and collapsed summary pills.
 */
export const GraphGroupingLayer: FC<GraphGroupingLayerProps> = memo(function GraphGroupingLayer({
  positionedNodes,
  hiddenNodeIds,
  sections,
  selectedNodeId: _selectedNodeId,
  zoomLevel = 1,
  onSelectGroup,
  onSelectNode: _onSelectNode,
}) {
  const groups = useCanvasGroupingStore((s) => s.groups);
  const isLayerVisible = useCanvasGroupingStore((s) => s.isGroupingLayerVisible);
  const selectedGroupId = useCanvasGroupingStore((s) => s.selectedGroupId);
  const setSelectedGroupId = useCanvasGroupingStore((s) => s.setSelectedGroupId);
  const setActiveEditingGroupId = useCanvasGroupingStore((s) => s.setActiveEditingGroupId);
  const toggleGroupCollapse = useCanvasGroupingStore((s) => s.toggleGroupCollapse);
  const toggleGroupLock = useCanvasGroupingStore((s) => s.toggleGroupLock);
  const setDraggingGroup = useCanvasGroupingStore((s) => s.setDraggingGroup);

  // Reader overrides for dataset regions, keyed by section group id. A region the reader has opened
  // stays open, and one they have folded stays folded, whatever its depth says by default.
  const [sectionCollapseOverrides, setSectionCollapseOverrides] = useState<
    Readonly<Record<string, boolean>>
  >({});

  const toggleSectionCollapse = useCallback((groupId: string, isCollapsed: boolean) => {
    setSectionCollapseOverrides((current) => ({ ...current, [groupId]: !isCollapsed }));
  }, []);

  const sectionDepths = useMemo(() => computeSectionDepths(sections ?? []), [sections]);

  // Map positioned nodes for fast O(1) lookups
  const nodesMap = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    for (const node of positionedNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [positionedNodes]);

  // Compute bounds and geometry for all visible regions: dataset sections first, then user groups,
  // so a user group drawn over a branch region sits on top of it.
  const resolvedGroups = useMemo(() => {
    if (!isLayerVisible) return [];

    const result: ResolvedGroupRenderData[] = [];
    for (const section of sections ?? []) {
      if (section.nodeIds.length === 0) continue;
      const depth = sectionDepths.get(section.id) ?? 1;
      const groupId = sectionGroupId(section.id);
      const isCollapsed =
        sectionCollapseOverrides[groupId] ?? sectionStartsCollapsed(section, depth);
      const group = sectionAsGroup(section, isCollapsed);
      const bounds = computeGroupBounds(group, nodesMap, hiddenNodeIds);
      if (bounds) {
        const descriptor = describeSectionType(section.type);
        result.push({
          group,
          bounds,
          reason: section.reason,
          isSection: true,
          depth,
          ...(descriptor === undefined ? {} : { accent: descriptor.accent }),
        });
      }
    }
    for (const group of groups) {
      const bounds = computeGroupBounds(group, nodesMap, hiddenNodeIds);
      if (bounds) {
        result.push({ group, bounds, isSection: false });
      }
    }
    return result;
  }, [
    isLayerVisible,
    sections,
    sectionDepths,
    sectionCollapseOverrides,
    groups,
    nodesMap,
    hiddenNodeIds,
  ]);

  // Drag interaction tracking ref
  const dragRef = useRef<{
    groupId: string;
    startX: number;
    startY: number;
    initialNodes: PositionedNode[];
  } | null>(null);

  const handleStartDrag = useCallback(
    (e: ReactMouseEvent<HTMLElement | SVGPathElement>, group: CanvasGroup) => {
      if (group.isLocked) return;
      e.stopPropagation();
      e.preventDefault();

      setSelectedGroupId(group.id);
      if (onSelectGroup) onSelectGroup(group.id);

      const startX = e.clientX;
      const startY = e.clientY;
      const currentNodes = useGraphStore.getState().positionedNodes;

      dragRef.current = {
        groupId: group.id,
        startX,
        startY,
        initialNodes: currentNodes,
      };

      setDraggingGroup(true, group.id);

      const handleMouseMove = (moveEvent: Event | MouseEvent) => {
        if (!dragRef.current) return;
        const currentZoom = useGraphStore.getState().zoomLevel || zoomLevel || 1;
        const clientX =
          "clientX" in moveEvent && typeof (moveEvent as { clientX: unknown }).clientX === "number"
            ? (moveEvent as { clientX: number }).clientX
            : dragRef.current.startX;
        const clientY =
          "clientY" in moveEvent && typeof (moveEvent as { clientY: unknown }).clientY === "number"
            ? (moveEvent as { clientY: number }).clientY
            : dragRef.current.startY;

        const deltaX = (clientX - dragRef.current.startX) / currentZoom;
        const deltaY = (clientY - dragRef.current.startY) / currentZoom;

        const updatedNodes = computeGroupDragOffsets(
          dragRef.current.initialNodes,
          group.memberNodeIds,
          deltaX,
          deltaY,
        );

        const currentEdges = useGraphStore.getState().positionedEdges;
        useGraphStore.getState().setPositionedGraph(updatedNodes, currentEdges);
      };

      const win =
        typeof window !== "undefined"
          ? window
          : (globalThis as unknown as {
              addEventListener?: (type: string, listener: (ev: unknown) => void) => void;
              removeEventListener?: (type: string, listener: (ev: unknown) => void) => void;
            });

      const handleMouseUp = () => {
        if (win && typeof win.removeEventListener === "function") {
          win.removeEventListener("mousemove", handleMouseMove as unknown as (ev: unknown) => void);
          win.removeEventListener("mouseup", handleMouseUp as unknown as (ev: unknown) => void);
        }
        dragRef.current = null;
        setDraggingGroup(false, null);
      };

      if (win && typeof win.addEventListener === "function") {
        win.addEventListener("mousemove", handleMouseMove as unknown as (ev: unknown) => void);
        win.addEventListener("mouseup", handleMouseUp as unknown as (ev: unknown) => void);
      }
    },
    [zoomLevel, onSelectGroup, setSelectedGroupId, setDraggingGroup],
  );

  if (!isLayerVisible || resolvedGroups.length === 0) {
    return null;
  }

  return (
    <div className="graph-grouping-layer-container">
      {/* SVG Zone Boundaries and Convex Hulls */}
      <svg className="graph-grouping-svg-layer">
        <defs>
          {Object.values(GROUP_THEME_PALETTES).map((theme) => (
            <filter
              key={theme.id}
              id={`glow-${theme.id}`}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="8"
                floodColor={theme.accent}
                floodOpacity="0.35"
              />
            </filter>
          ))}
        </defs>

        {resolvedGroups.map(({ group, bounds, isSection, accent }) => {
          if (group.isCollapsed) return null;
          const theme = GROUP_THEME_PALETTES[group.color] ?? GROUP_THEME_PALETTES.blue;
          const isSelected = selectedGroupId === group.id;
          const edgeColor = accent ?? (isSelected ? theme.accent : theme.border);

          const pathClass = [
            "group-boundary-path",
            group.isLocked ? "is-locked" : "is-draggable",
            isSection ? "is-section" : "",
            isSelected ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <path
              key={`group-path-${group.id}`}
              d={bounds.svgPath}
              fill={theme.bg}
              stroke={edgeColor}
              strokeWidth={isSelected ? 2 : 1.5}
              filter={isSelected ? `url(#glow-${theme.id})` : undefined}
              className={pathClass}
              onMouseDown={isSection ? undefined : (e) => handleStartDrag(e, group)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedGroupId(group.id);
                if (onSelectGroup) onSelectGroup(group.id);
              }}
            />
          );
        })}
      </svg>

      {/* HTML Headers and Collapsed Summary Pills */}
      {resolvedGroups.map(({ group, bounds, reason, isSection, depth, accent }) => {
        const theme = GROUP_THEME_PALETTES[group.color] ?? GROUP_THEME_PALETTES.blue;
        const isSelected = selectedGroupId === group.id;
        const dotColor = accent ?? theme.accent;
        const depthLabel = depth === undefined ? undefined : `Depth ${depth}`;

        if (group.isCollapsed) {
          // Collapsed Summary Pill
          const pillX = group.collapsedPosition?.x ?? bounds.centerX;
          const pillY = group.collapsedPosition?.y ?? bounds.centerY;

          const pillStyle: CSSProperties = {
            transform: `translate3d(${pillX}px, ${pillY}px, 0) translate(-50%, -50%)`,
            borderColor: accent ?? (isSelected ? theme.accent : theme.border),
          };

          const pillClass = [
            "group-collapsed-pill",
            isSection ? "is-section" : "",
            isSelected ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={`collapsed-pill-${group.id}`}
              className={pillClass}
              style={pillStyle}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedGroupId(group.id);
                if (onSelectGroup) onSelectGroup(group.id);
              }}
            >
              <div className="group-header-color-dot" style={{ backgroundColor: dotColor }} />
              <span className="group-collapsed-label">{group.label}</span>
              {depthLabel ? (
                <span className="group-header-depth" title={depthLabel}>
                  {depthLabel}
                </span>
              ) : null}
              {reason ? (
                <span className="group-header-reason" title={reason}>
                  {reason}
                </span>
              ) : null}
              <span
                className="group-collapsed-count"
                style={{
                  backgroundColor: theme.badgeBg,
                  color: theme.badgeText,
                }}
              >
                {bounds.nodeCount} {bounds.nodeCount === 1 ? "node" : "nodes"}
              </span>
              <button
                type="button"
                className="group-expand-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSection) toggleSectionCollapse(group.id, true);
                  else toggleGroupCollapse(group.id);
                }}
                title="Expand Group"
                aria-label="Expand Group"
              >
                <IconChevronDown size={14} />
              </button>
            </div>
          );
        }

        // Expanded Group Region Header
        const headerX = bounds.x + 8;
        const headerY = bounds.y - 34;

        const headerStyle: CSSProperties = {
          transform: `translate3d(${headerX}px, ${headerY}px, 0)`,
          borderColor: isSelected ? theme.accent : undefined,
        };

        const headerClass = [
          "group-region-header-container",
          group.isLocked ? "is-locked" : "",
          isSection ? "is-section" : "",
          isSelected ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={`group-header-${group.id}`}
            className={headerClass}
            style={headerStyle}
            onMouseDown={isSection ? undefined : (e) => handleStartDrag(e, group)}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedGroupId(group.id);
              if (onSelectGroup) onSelectGroup(group.id);
            }}
          >
            {!isSection && (
              <div
                className="group-header-handle"
                title={group.isLocked ? "Group is locked" : "Drag to move group"}
              >
                <IconGripHorizontal size={14} />
              </div>
            )}

            <div className="group-header-color-dot" style={{ backgroundColor: dotColor }} />

            {isSection ? (
              <IconGitBranch size={14} style={{ color: theme.headerText }} />
            ) : (
              <IconFolder size={14} style={{ color: theme.headerText }} />
            )}

            <span className="group-header-title">{group.label}</span>

            <span
              className="group-header-badge"
              style={{
                backgroundColor: theme.badgeBg,
                color: theme.badgeText,
              }}
            >
              {bounds.nodeCount}
            </span>

            {/* Depth says how far into a subdivision the reader has walked. */}
            {depthLabel ? (
              <span className="group-header-depth" title={depthLabel}>
                {depthLabel}
              </span>
            ) : null}

            {/* The recorded reason is the whole point of a branch region: why we went down here. */}
            {reason ? (
              <span className="group-header-reason" title={reason}>
                {reason}
              </span>
            ) : null}

            {/* Folding is the one thing a reader may do to a dataset region; editing it is not. */}
            {isSection && (
              <div className="group-section-actions">
                <button
                  type="button"
                  className="group-header-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSectionCollapse(group.id, false);
                  }}
                  title="Collapse Region into Summary Pill"
                  aria-label="Collapse Region"
                >
                  <IconChevronUp size={14} />
                </button>
              </div>
            )}

            {!isSection && (
              <div className="group-header-actions">
                <button
                  type="button"
                  className="group-header-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroupLock(group.id);
                  }}
                  title={group.isLocked ? "Unlock Group Position" : "Lock Group Position"}
                  aria-label={group.isLocked ? "Unlock Group" : "Lock Group"}
                >
                  {group.isLocked ? <IconLock size={13} /> : <IconLockOpen size={13} />}
                </button>

                <button
                  type="button"
                  className="group-header-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroupCollapse(group.id);
                  }}
                  title="Collapse Group into Summary Pill"
                  aria-label="Collapse Group"
                >
                  <IconChevronUp size={14} />
                </button>

                <button
                  type="button"
                  className="group-header-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveEditingGroupId(group.id);
                  }}
                  title="Edit Group"
                  aria-label="Edit Group"
                >
                  <IconDots size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default GraphGroupingLayer;
