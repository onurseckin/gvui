import { useMemo } from "react";
import { create } from "zustand";
import type {
  AnnotationFilterState,
  AnnotationStore,
  CanvasAnnotation,
  CanvasCoordinate,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from "./types";

export const INITIAL_FILTER_STATE: AnnotationFilterState = {
  searchQuery: "",
  authorRole: "all",
  type: "all",
  category: "all",
  status: "all",
  priority: "all",
  tags: [],
  nodeId: null,
};

function generateAnnotationId(): string {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).substring(2, 7);
  return `ann-${timestamp}-${rand}`;
}

function sanitizeCoordinates(coords?: CanvasCoordinate): CanvasCoordinate | undefined {
  if (!coords) return undefined;
  if (
    typeof coords.x === "number" &&
    typeof coords.y === "number" &&
    Number.isFinite(coords.x) &&
    Number.isFinite(coords.y)
  ) {
    return { x: coords.x, y: coords.y };
  }
  return undefined;
}

function sanitizeOffset(offset?: { x: number; y: number }): { x: number; y: number } | undefined {
  if (!offset) return undefined;
  if (
    typeof offset.x === "number" &&
    typeof offset.y === "number" &&
    Number.isFinite(offset.x) &&
    Number.isFinite(offset.y)
  ) {
    return { x: offset.x, y: offset.y };
  }
  return undefined;
}

function sanitizeTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t) => typeof t === "string")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
}

export const useAnnotationStore = create<AnnotationStore>()((set, get) => ({
  annotations: [],
  selectedAnnotationId: null,
  activeEditingId: null,
  isLayerVisible: true,
  showPins: true,
  showStickies: true,
  showBookmarks: true,
  showResolved: true,
  filterState: { ...INITIAL_FILTER_STATE },

  addAnnotation: (input: CreateAnnotationInput): CanvasAnnotation => {
    const now = new Date().toISOString();
    const id = input.id ? String(input.id).trim() : generateAnnotationId();
    const content = typeof input.content === "string" ? input.content.trim() : "";
    const title =
      input.title && typeof input.title === "string" ? input.title.trim() || undefined : undefined;
    const nodeId =
      input.nodeId && typeof input.nodeId === "string"
        ? input.nodeId.trim() || undefined
        : undefined;

    const annotation: CanvasAnnotation = {
      id,
      type: input.type ?? "sticky",
      nodeId,
      coordinates: sanitizeCoordinates(input.coordinates),
      offset: sanitizeOffset(input.offset),
      title,
      content,
      author: {
        name: input.author?.name ? String(input.author.name).trim() || "User" : "User",
        role: input.author?.role ?? "human",
        avatar: input.author?.avatar,
      },
      color:
        input.color ??
        (input.type === "bookmark" ? "rose" : input.type === "pin" ? "blue" : "yellow"),
      category: input.category ?? "note",
      priority: input.priority ?? "medium",
      status: input.status ?? (input.isResolved ? "resolved" : "open"),
      tags: sanitizeTags(input.tags),
      isResolved: Boolean(input.isResolved),
      isCollapsed: Boolean(input.isCollapsed),
      isPinned: Boolean(input.isPinned),
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : undefined,
    };

    set((state) => ({
      annotations: [annotation, ...state.annotations],
      selectedAnnotationId: annotation.id,
    }));

    return annotation;
  },

  updateAnnotation: (id: string, updates: UpdateAnnotationInput): void => {
    const now = new Date().toISOString();
    set((state) => ({
      annotations: state.annotations.map((ann) => {
        if (ann.id !== id) return ann;
        const isResolved =
          updates.isResolved !== undefined
            ? updates.isResolved
            : updates.status
              ? updates.status === "resolved"
              : ann.isResolved;

        const content =
          updates.content !== undefined && typeof updates.content === "string"
            ? updates.content.trim()
            : ann.content;

        const title =
          updates.title !== undefined
            ? (typeof updates.title === "string" && updates.title.trim()) || undefined
            : ann.title;

        const nodeId =
          updates.nodeId !== undefined
            ? (typeof updates.nodeId === "string" && updates.nodeId.trim()) || undefined
            : ann.nodeId;

        const coordinates =
          updates.coordinates !== undefined
            ? sanitizeCoordinates(updates.coordinates)
            : ann.coordinates;

        const offset = updates.offset !== undefined ? sanitizeOffset(updates.offset) : ann.offset;

        const tags = updates.tags !== undefined ? sanitizeTags(updates.tags) : ann.tags;

        return {
          ...ann,
          ...updates,
          title,
          content,
          nodeId,
          coordinates,
          offset,
          tags,
          isResolved,
          status: updates.status ?? (isResolved ? "resolved" : "open"),
          updatedAt: updates.updatedAt ?? now,
        };
      }),
    }));
  },

  deleteAnnotation: (id: string): void => {
    set((state) => ({
      annotations: state.annotations.filter((ann) => ann.id !== id),
      selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
      activeEditingId: state.activeEditingId === id ? null : state.activeEditingId,
    }));
  },

  toggleResolveAnnotation: (id: string): void => {
    const now = new Date().toISOString();
    set((state) => ({
      annotations: state.annotations.map((ann) => {
        if (ann.id !== id) return ann;
        const nextResolved = !ann.isResolved;
        return {
          ...ann,
          isResolved: nextResolved,
          status: nextResolved ? "resolved" : "open",
          updatedAt: now,
        };
      }),
    }));
  },

  toggleCollapseAnnotation: (id: string): void => {
    const now = new Date().toISOString();
    set((state) => ({
      annotations: state.annotations.map((ann) => {
        if (ann.id !== id) return ann;
        return {
          ...ann,
          isCollapsed: !ann.isCollapsed,
          updatedAt: now,
        };
      }),
    }));
  },

  togglePinAnnotation: (id: string): void => {
    const now = new Date().toISOString();
    set((state) => ({
      annotations: state.annotations.map((ann) => {
        if (ann.id !== id) return ann;
        return {
          ...ann,
          isPinned: !ann.isPinned,
          updatedAt: now,
        };
      }),
    }));
  },

  setSelectedAnnotationId: (id: string | null): void => {
    set({ selectedAnnotationId: id });
  },

  setActiveEditingId: (id: string | null): void => {
    set({ activeEditingId: id });
  },

  setFilterState: (filters: Partial<AnnotationFilterState>): void => {
    set((state) => ({
      filterState: { ...state.filterState, ...filters },
    }));
  },

  resetFilterState: (): void => {
    set({
      filterState: { ...INITIAL_FILTER_STATE },
      isLayerVisible: true,
      showPins: true,
      showStickies: true,
      showBookmarks: true,
      showResolved: true,
    });
  },

  setLayerVisible: (visible: boolean): void => {
    set({ isLayerVisible: visible });
  },

  setShowPins: (show: boolean): void => {
    set({ showPins: show });
  },

  setShowStickies: (show: boolean): void => {
    set({ showStickies: show });
  },

  setShowBookmarks: (show: boolean): void => {
    set({ showBookmarks: show });
  },

  setShowResolved: (show: boolean): void => {
    set({ showResolved: show });
  },

  importAnnotations: (newAnnotations: CanvasAnnotation[], replace = false): void => {
    set((state) => ({
      annotations: replace ? newAnnotations : [...newAnnotations, ...state.annotations],
    }));
  },

  clearAllAnnotations: (): void => {
    set({
      annotations: [],
      selectedAnnotationId: null,
      activeEditingId: null,
    });
  },

  exportAsMarkdown: (): string => {
    const { annotations } = get();
    if (annotations.length === 0) {
      return "# Canvas Annotations\n\nNo annotations recorded.\n";
    }

    const lines: string[] = ["# Canvas Annotations Report\n"];
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Total Annotations: ${annotations.length}\n`);

    const nodeGrouped = new Map<string, CanvasAnnotation[]>();
    const canvasGlobal: CanvasAnnotation[] = [];

    for (const ann of annotations) {
      if (ann.nodeId) {
        const existing = nodeGrouped.get(ann.nodeId) || [];
        existing.push(ann);
        nodeGrouped.set(ann.nodeId, existing);
      } else {
        canvasGlobal.push(ann);
      }
    }

    if (nodeGrouped.size > 0) {
      lines.push("## Node Attached Annotations\n");
      for (const [nodeId, list] of nodeGrouped.entries()) {
        lines.push(`### Node: \`${nodeId}\` (${list.length})\n`);
        for (const ann of list) {
          const statusMark = ann.isResolved ? "[RESOLVED]" : "[OPEN]";
          const title = ann.title ? `**${ann.title}**` : `*(${ann.type.toUpperCase()})*`;
          lines.push(`#### ${statusMark} ${title}`);
          lines.push(
            `- **Type:** ${ann.type} | **Author:** ${ann.author.name} (${ann.author.role}) | **Priority:** ${ann.priority ?? "medium"}`,
          );
          lines.push(`- **Created:** ${ann.createdAt}`);
          if (ann.tags && ann.tags.length > 0) {
            lines.push(`- **Tags:** ${ann.tags.map((t) => `\`#${t}\``).join(", ")}`);
          }
          lines.push("\n```markdown");
          lines.push(ann.content);
          lines.push("```\n");
        }
      }
    }

    if (canvasGlobal.length > 0) {
      lines.push("## Canvas Global Annotations\n");
      for (const ann of canvasGlobal) {
        const statusMark = ann.isResolved ? "[RESOLVED]" : "[OPEN]";
        const title = ann.title ? `**${ann.title}**` : `*(${ann.type.toUpperCase()})*`;
        const coords = ann.coordinates
          ? `(x: ${ann.coordinates.x}, y: ${ann.coordinates.y})`
          : "Unanchored";
        lines.push(`### ${statusMark} ${title}`);
        lines.push(
          `- **Type:** ${ann.type} | **Location:** ${coords} | **Author:** ${ann.author.name} (${ann.author.role})`,
        );
        lines.push(`- **Created:** ${ann.createdAt}`);
        if (ann.tags && ann.tags.length > 0) {
          lines.push(`- **Tags:** ${ann.tags.map((t) => `\`#${t}\``).join(", ")}`);
        }
        lines.push("\n```markdown");
        lines.push(ann.content);
        lines.push("```\n");
      }
    }

    return lines.join("\n");
  },

  exportAsJson: (): string => {
    const { annotations } = get();
    return JSON.stringify(annotations, null, 2);
  },
}));

export const useAnnotations = () => useAnnotationStore((state) => state.annotations);
export const useSelectedAnnotationId = () =>
  useAnnotationStore((state) => state.selectedAnnotationId);
export const useActiveEditingId = () => useAnnotationStore((state) => state.activeEditingId);
export const useAnnotationFilterState = () => useAnnotationStore((state) => state.filterState);

export function useNodeAnnotations(nodeId: string | undefined): CanvasAnnotation[] {
  const annotations = useAnnotationStore((state) => state.annotations);
  return useMemo(() => {
    if (!nodeId) return [];
    return annotations.filter((ann) => ann.nodeId === nodeId);
  }, [annotations, nodeId]);
}

export function filterAnnotations(
  annotations: CanvasAnnotation[],
  filters: AnnotationFilterState,
  visibility: {
    isLayerVisible: boolean;
    showPins: boolean;
    showStickies: boolean;
    showBookmarks: boolean;
    showResolved: boolean;
  },
): CanvasAnnotation[] {
  if (!visibility.isLayerVisible) {
    return [];
  }

  return annotations.filter((ann) => {
    // Visibility flags per type
    if (ann.type === "pin" && !visibility.showPins) return false;
    if (ann.type === "sticky" && !visibility.showStickies) return false;
    if (ann.type === "bookmark" && !visibility.showBookmarks) return false;

    // Resolved flag
    if (ann.isResolved && !visibility.showResolved) return false;

    // Status filter
    if (filters.status === "open" && ann.isResolved) return false;
    if (filters.status === "resolved" && !ann.isResolved) return false;

    // Author role filter
    if (filters.authorRole !== "all" && ann.author.role !== filters.authorRole) {
      return false;
    }

    // Type filter
    if (filters.type !== "all" && ann.type !== filters.type) {
      return false;
    }

    // Category filter
    if (filters.category !== "all" && ann.category !== filters.category) {
      return false;
    }

    // Priority filter
    if (filters.priority !== "all" && ann.priority !== filters.priority) {
      return false;
    }

    // Node ID filter
    if (filters.nodeId && ann.nodeId !== filters.nodeId) {
      return false;
    }

    // Tags filter
    if (filters.tags.length > 0) {
      const annTags = new Set(ann.tags ?? []);
      const matchesAllTags = filters.tags.every((t) => annTags.has(t));
      if (!matchesAllTags) return false;
    }

    // Search query filter
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase().trim();
      const matchTitle = (ann.title ?? "").toLowerCase().includes(query);
      const matchContent = ann.content.toLowerCase().includes(query);
      const matchAuthor = ann.author.name.toLowerCase().includes(query);
      const matchNode = (ann.nodeId ?? "").toLowerCase().includes(query);
      const matchTags = (ann.tags ?? []).some((t) => t.toLowerCase().includes(query));
      if (!matchTitle && !matchContent && !matchAuthor && !matchNode && !matchTags) {
        return false;
      }
    }

    return true;
  });
}

export function useFilteredAnnotations(): CanvasAnnotation[] {
  const annotations = useAnnotationStore((state) => state.annotations);
  const filterState = useAnnotationStore((state) => state.filterState);
  const isLayerVisible = useAnnotationStore((state) => state.isLayerVisible);
  const showPins = useAnnotationStore((state) => state.showPins);
  const showStickies = useAnnotationStore((state) => state.showStickies);
  const showBookmarks = useAnnotationStore((state) => state.showBookmarks);
  const showResolved = useAnnotationStore((state) => state.showResolved);

  return useMemo(() => {
    return filterAnnotations(annotations, filterState, {
      isLayerVisible,
      showPins,
      showStickies,
      showBookmarks,
      showResolved,
    });
  }, [
    annotations,
    filterState,
    isLayerVisible,
    showPins,
    showStickies,
    showBookmarks,
    showResolved,
  ]);
}
