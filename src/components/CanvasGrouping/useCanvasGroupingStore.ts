import { create } from "zustand";
import type {
  CanvasGroup,
  CanvasGroupingStore,
  CreateGroupInput,
  GroupColorPalette,
  GroupFilterState,
} from "./types";

const DEFAULT_FILTER_STATE: GroupFilterState = {
  searchQuery: "",
  color: "all",
  isCollapsed: "all",
  isLocked: "all",
};

/**
 * Filters a list of CanvasGroups according to the active filter state.
 */
export function filterGroups(groups: CanvasGroup[], filterState: GroupFilterState): CanvasGroup[] {
  return groups.filter((group) => {
    // Search query matches label, description, or tags
    if (filterState.searchQuery.trim()) {
      const q = filterState.searchQuery.toLowerCase().trim();
      const matchLabel = group.label.toLowerCase().includes(q);
      const matchDesc = group.description?.toLowerCase().includes(q) ?? false;
      const matchTags = group.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
      const matchMembers = group.memberNodeIds.some((id) => id.toLowerCase().includes(q));
      if (!matchLabel && !matchDesc && !matchTags && !matchMembers) {
        return false;
      }
    }

    // Color filter
    if (filterState.color !== "all" && group.color !== filterState.color) {
      return false;
    }

    // Collapse filter
    if (filterState.isCollapsed === "collapsed" && !group.isCollapsed) {
      return false;
    }
    if (filterState.isCollapsed === "expanded" && group.isCollapsed) {
      return false;
    }

    // Lock filter
    if (filterState.isLocked === "locked" && !group.isLocked) {
      return false;
    }
    if (filterState.isLocked === "unlocked" && group.isLocked) {
      return false;
    }

    return true;
  });
}

function generateGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useCanvasGroupingStore = create<CanvasGroupingStore>()((set, get) => ({
  groups: [],
  selectedGroupId: null,
  activeEditingGroupId: null,
  isGroupingLayerVisible: true,
  isDrawerOpen: false,
  filterState: { ...DEFAULT_FILTER_STATE },
  defaultColor: "blue",
  defaultPadding: 24,
  defaultCornerRadius: 12,
  defaultShapeMode: "box",
  isDraggingGroup: false,
  activeDragGroupId: null,

  createGroup: (input: CreateGroupInput): CanvasGroup => {
    const state = get();
    const now = new Date().toISOString();
    const id = input.id?.trim() || generateGroupId();
    const uniqueMemberNodeIds = Array.from(
      new Set(
        input.memberNodeIds?.filter((n): n is string => typeof n === "string" && n.length > 0) ??
          [],
      ),
    );

    const newGroup: CanvasGroup = {
      id,
      label: input.label.trim() || `Group ${state.groups.length + 1}`,
      description: input.description?.trim(),
      color: input.color ?? state.defaultColor,
      memberNodeIds: uniqueMemberNodeIds,
      isCollapsed: input.isCollapsed ?? false,
      isLocked: input.isLocked ?? false,
      shapeMode: input.shapeMode ?? state.defaultShapeMode,
      padding: input.padding ?? state.defaultPadding,
      cornerRadius: input.cornerRadius ?? state.defaultCornerRadius,
      zIndex: input.zIndex ?? state.groups.length + 1,
      collapsedPosition: input.collapsedPosition,
      icon: input.icon ?? "folder",
      tags: input.tags?.map((t) => t.trim()).filter((t) => t.length > 0),
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    set((s) => ({
      groups: [...s.groups, newGroup],
      selectedGroupId: newGroup.id,
    }));

    return newGroup;
  },

  createGroupFromSelectedNodes: (
    nodeIds: string[],
    label?: string,
    color?: GroupColorPalette,
  ): CanvasGroup | null => {
    const validIds = Array.from(new Set(nodeIds.filter((id) => Boolean(id && id.trim()))));
    if (validIds.length === 0) {
      return null;
    }

    const state = get();
    const groupName = label?.trim() || `Region (${validIds.length} Nodes)`;
    const groupColor = color ?? state.defaultColor;

    return state.createGroup({
      label: groupName,
      color: groupColor,
      memberNodeIds: validIds,
    });
  },

  updateGroup: (id: string, patch: Partial<Omit<CanvasGroup, "id">>): void => {
    const now = new Date().toISOString();
    set((s) => ({
      groups: s.groups.map((group) => {
        if (group.id !== id) return group;
        const memberNodeIds = patch.memberNodeIds
          ? Array.from(new Set(patch.memberNodeIds.filter((n) => Boolean(n && n.trim()))))
          : group.memberNodeIds;

        return {
          ...group,
          ...patch,
          memberNodeIds,
          updatedAt: now,
        };
      }),
    }));
  },

  deleteGroup: (id: string): void => {
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== id),
      selectedGroupId: s.selectedGroupId === id ? null : s.selectedGroupId,
      activeEditingGroupId: s.activeEditingGroupId === id ? null : s.activeEditingGroupId,
    }));
  },

  toggleGroupCollapse: (id: string): void => {
    const now = new Date().toISOString();
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === id ? { ...g, isCollapsed: !g.isCollapsed, updatedAt: now } : g,
      ),
    }));
  },

  toggleGroupLock: (id: string): void => {
    const now = new Date().toISOString();
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === id ? { ...g, isLocked: !g.isLocked, updatedAt: now } : g,
      ),
    }));
  },

  addNodesToGroup: (groupId: string, nodeIds: string[]): void => {
    if (nodeIds.length === 0) return;
    const now = new Date().toISOString();
    set((s) => ({
      groups: s.groups.map((g) => {
        if (g.id !== groupId) return g;
        const combined = Array.from(
          new Set([...g.memberNodeIds, ...nodeIds.filter((id) => Boolean(id && id.trim()))]),
        );
        return {
          ...g,
          memberNodeIds: combined,
          updatedAt: now,
        };
      }),
    }));
  },

  removeNodesFromGroup: (groupId: string, nodeIds: string[]): void => {
    if (nodeIds.length === 0) return;
    const removeSet = new Set(nodeIds);
    const now = new Date().toISOString();
    set((s) => ({
      groups: s.groups.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          memberNodeIds: g.memberNodeIds.filter((id) => !removeSet.has(id)),
          updatedAt: now,
        };
      }),
    }));
  },

  setGroupMembers: (groupId: string, nodeIds: string[]): void => {
    const unique = Array.from(new Set(nodeIds.filter((id) => Boolean(id && id.trim()))));
    const now = new Date().toISOString();
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, memberNodeIds: unique, updatedAt: now } : g,
      ),
    }));
  },

  setSelectedGroupId: (id: string | null): void => {
    set({ selectedGroupId: id });
  },

  setActiveEditingGroupId: (id: string | null): void => {
    set({ activeEditingGroupId: id });
  },

  setIsGroupingLayerVisible: (visible: boolean): void => {
    set({ isGroupingLayerVisible: visible });
  },

  setIsDrawerOpen: (open: boolean): void => {
    set({ isDrawerOpen: open });
  },

  setFilterState: (patch: Partial<GroupFilterState>): void => {
    set((s) => ({
      filterState: {
        ...s.filterState,
        ...patch,
      },
    }));
  },

  resetFilterState: (): void => {
    set({ filterState: { ...DEFAULT_FILTER_STATE } });
  },

  reorderGroups: (groupIds: string[]): void => {
    set((s) => {
      const groupMap = new Map<string, CanvasGroup>();
      for (const g of s.groups) {
        groupMap.set(g.id, g);
      }
      const reordered: CanvasGroup[] = [];
      for (let i = 0; i < groupIds.length; i++) {
        const g = groupMap.get(groupIds[i]);
        if (g) {
          reordered.push({ ...g, zIndex: i + 1 });
          groupMap.delete(groupIds[i]);
        }
      }
      // Add any remaining groups that weren't in groupIds
      for (const remaining of groupMap.values()) {
        reordered.push({ ...remaining, zIndex: reordered.length + 1 });
      }
      return { groups: reordered };
    });
  },

  exportGroupsJson: (): string => {
    const state = get();
    return JSON.stringify(
      {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        groups: state.groups,
      },
      null,
      2,
    );
  },

  importGroupsJson: (json: string): boolean => {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== "object") return false;

      let candidateGroups: unknown[] = [];
      if (Array.isArray(parsed)) {
        candidateGroups = parsed;
      } else if ("groups" in parsed && Array.isArray((parsed as { groups: unknown[] }).groups)) {
        candidateGroups = (parsed as { groups: unknown[] }).groups;
      } else {
        return false;
      }

      const validGroups: CanvasGroup[] = [];
      for (const item of candidateGroups) {
        if (typeof item !== "object" || item === null) continue;
        const candidate = item as Record<string, unknown>;
        if (typeof candidate.id !== "string" || !candidate.id) continue;
        if (typeof candidate.label !== "string") continue;

        const memberNodeIds = Array.isArray(candidate.memberNodeIds)
          ? (candidate.memberNodeIds.filter((id) => typeof id === "string") as string[])
          : [];

        const color =
          typeof candidate.color === "string" ? (candidate.color as GroupColorPalette) : "blue";

        validGroups.push({
          id: candidate.id,
          label: candidate.label,
          description:
            typeof candidate.description === "string" ? candidate.description : undefined,
          color,
          memberNodeIds,
          isCollapsed: Boolean(candidate.isCollapsed),
          isLocked: Boolean(candidate.isLocked),
          shapeMode: candidate.shapeMode === "hull" ? "hull" : "box",
          padding:
            typeof candidate.padding === "number" && Number.isFinite(candidate.padding)
              ? candidate.padding
              : 24,
          cornerRadius:
            typeof candidate.cornerRadius === "number" && Number.isFinite(candidate.cornerRadius)
              ? candidate.cornerRadius
              : 12,
          zIndex:
            typeof candidate.zIndex === "number" && Number.isFinite(candidate.zIndex)
              ? candidate.zIndex
              : 1,
          icon: typeof candidate.icon === "string" ? candidate.icon : "folder",
          tags: Array.isArray(candidate.tags)
            ? (candidate.tags.filter((t) => typeof t === "string") as string[])
            : undefined,
          createdAt:
            typeof candidate.createdAt === "string"
              ? candidate.createdAt
              : new Date().toISOString(),
          updatedAt:
            typeof candidate.updatedAt === "string"
              ? candidate.updatedAt
              : new Date().toISOString(),
        });
      }

      if (validGroups.length === 0 && candidateGroups.length > 0) {
        return false;
      }

      set({ groups: validGroups, selectedGroupId: null });
      return true;
    } catch {
      return false;
    }
  },

  clearAllGroups: (): void => {
    set({ groups: [], selectedGroupId: null, activeEditingGroupId: null });
  },

  setDraggingGroup: (isDragging: boolean, groupId: string | null = null): void => {
    set({ isDraggingGroup: isDragging, activeDragGroupId: groupId });
  },
}));

export const useFilteredGroups = (): CanvasGroup[] => {
  const groups = useCanvasGroupingStore((s) => s.groups);
  const filterState = useCanvasGroupingStore((s) => s.filterState);
  return filterGroups(groups, filterState);
};

export const useGroupById = (id: string | null | undefined): CanvasGroup | null => {
  return useCanvasGroupingStore((s) => (id ? (s.groups.find((g) => g.id === id) ?? null) : null));
};

export const useNodeGroups = (nodeId: string): CanvasGroup[] => {
  return useCanvasGroupingStore((s) => s.groups.filter((g) => g.memberNodeIds.includes(nodeId)));
};
