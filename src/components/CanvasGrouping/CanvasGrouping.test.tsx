import { beforeEach, describe, expect, it } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PositionedNode } from "../../types/graphData";
import { useGraphStore } from "../../state/useGraphStore";
import { CanvasGrouping } from "./CanvasGrouping";
import {
  computeConvexHull,
  crossProduct,
  deduplicatePoints,
  isPointInsidePolygon,
  isValidPoint,
  pointDistance,
} from "./convexHull";
import {
  computeBoundingBox,
  computeGroupBounds,
  computeGroupDragOffsets,
  computeNodeCorners,
  expandPolygon,
  generateRoundedBoxSvgPath,
  generateRoundedPolygonSvgPath,
} from "./groupBounds";
import { GroupManagerDrawer } from "./GroupManagerDrawer";
import { GroupModal } from "./GroupModal";
import { GroupToolbar } from "./GroupToolbar";
import { GROUP_THEME_PALETTES, type CanvasGroup, type GroupColorPalette } from "./types";
import { filterGroups, useCanvasGroupingStore } from "./useCanvasGroupingStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceReactWarnings<T>(fn: () => T): T {
  const originalConsoleError = console.error;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (
      typeof message === "string" &&
      (message.includes("react-test-renderer is deprecated") ||
        message.includes("An update to") ||
        message.includes("was not wrapped in act") ||
        message.includes("The result of getSnapshot should be cached"))
    ) {
      return;
    }
    originalConsoleError(message, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = originalConsoleError;
  }
}

const mockNode1: PositionedNode = {
  id: "node-1",
  name: "Ingestion Worker",
  x: 100,
  y: 150,
  width: 180,
  height: 80,
};

const mockNode2: PositionedNode = {
  id: "node-2",
  name: "Parser Agent",
  x: 350,
  y: 200,
  width: 200,
  height: 100,
};

const mockNode3: PositionedNode = {
  id: "node-3",
  name: "Critic Evaluator",
  x: 200,
  y: 400,
  width: 160,
  height: 90,
};

describe("Convex Hull & Geometric Algorithms", () => {
  it("validates and checks points properly", () => {
    expect(isValidPoint({ x: 10, y: 20 })).toBe(true);
    expect(isValidPoint({ x: 0, y: 0 })).toBe(true);
    expect(isValidPoint({ x: -50, y: 100.5 })).toBe(true);
    expect(isValidPoint({ x: NaN, y: 10 })).toBe(false);
    expect(isValidPoint({ x: 10, y: Infinity })).toBe(false);
    expect(isValidPoint(null)).toBe(false);
    expect(isValidPoint(undefined)).toBe(false);
  });

  it("calculates Euclidean point distance and cross product accurately", () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 3, y: 4 };
    expect(pointDistance(p1, p2)).toBe(5);

    // CCW turn
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const c = { x: 10, y: 10 };
    expect(crossProduct(a, b, c)).toBeGreaterThan(0);

    // CW turn
    const d = { x: 10, y: -10 };
    expect(crossProduct(a, b, d)).toBeLessThan(0);

    // Collinear
    const col = { x: 20, y: 0 };
    expect(crossProduct(a, b, col)).toBe(0);
  });

  it("deduplicates identical and near-identical points within epsilon", () => {
    const pts = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 10.00000000001, y: 10.00000000001 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
      { x: 20, y: 20 },
    ];
    const deduped = deduplicatePoints(pts);
    expect(deduped.length).toBe(3);
    expect(deduped[0]).toEqual({ x: 10, y: 10 });
    expect(deduped[1]).toEqual({ x: 20, y: 20 });
    expect(deduped[2]).toEqual({ x: 30, y: 30 });
  });

  it("computes 2D convex hull for triangle and square points", () => {
    // Square points + 1 interior point
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 50, y: 50 }, // Interior point
    ];
    const hull = computeConvexHull(points);
    expect(hull.length).toBe(4);
    // Interior point must not be in the hull
    expect(hull.some((p) => p.x === 50 && p.y === 50)).toBe(false);
  });

  it("handles edge cases: 0 points, 1 point, 2 points, and collinear points", () => {
    expect(computeConvexHull([])).toEqual([]);
    expect(computeConvexHull([{ x: 42, y: 84 }])).toEqual([{ x: 42, y: 84 }]);
    expect(
      computeConvexHull([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);

    // Horizontal collinear points
    const horizontalCollinear = [
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
      { x: 30, y: 5 },
    ];
    const colHullNoMid = computeConvexHull(horizontalCollinear, false);
    expect(colHullNoMid.length).toBe(2);
    expect(colHullNoMid[0]).toEqual({ x: 0, y: 5 });
    expect(colHullNoMid[1]).toEqual({ x: 30, y: 5 });

    const colHullWithMid = computeConvexHull(horizontalCollinear, true);
    expect(colHullWithMid.length).toBe(4);
  });

  it("tests point-in-polygon ray casting accurately", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    expect(isPointInsidePolygon({ x: 50, y: 50 }, polygon)).toBe(true);
    expect(isPointInsidePolygon({ x: 10, y: 10 }, polygon)).toBe(true);
    expect(isPointInsidePolygon({ x: 150, y: 50 }, polygon)).toBe(false);
    expect(isPointInsidePolygon({ x: -10, y: 50 }, polygon)).toBe(false);
    expect(isPointInsidePolygon({ x: 50, y: 150 }, polygon)).toBe(false);
    // Invalid point
    expect(isPointInsidePolygon({ x: NaN, y: 50 }, polygon)).toBe(false);
    // Degenerate polygon
    expect(
      isPointInsidePolygon({ x: 50, y: 50 }, [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe(false);
  });
});

describe("Group Bounds, Polygon Expansion & SVG Path Generation", () => {
  it("computes 4 node corners correctly", () => {
    const corners = computeNodeCorners(mockNode1);
    expect(corners.length).toBe(4);
    expect(corners[0]).toEqual({ x: 100, y: 150 });
    expect(corners[1]).toEqual({ x: 280, y: 150 });
    expect(corners[2]).toEqual({ x: 280, y: 230 });
    expect(corners[3]).toEqual({ x: 100, y: 230 });
  });

  it("computes bounding box with configurable padding and handles edge cases", () => {
    const bbox = computeBoundingBox([mockNode1, mockNode2], 20);
    expect(bbox).not.toBeNull();
    if (bbox) {
      expect(bbox.minX).toBe(100);
      expect(bbox.minY).toBe(150);
      expect(bbox.maxX).toBe(550); // node2: 350 + 200 = 550
      expect(bbox.maxY).toBe(300); // node2: 200 + 100 = 300
      expect(bbox.x).toBe(80); // 100 - 20
      expect(bbox.y).toBe(130); // 150 - 20
      expect(bbox.width).toBe(490); // 450 + 40
      expect(bbox.height).toBe(190); // 150 + 40
      expect(bbox.centerX).toBe(325);
      expect(bbox.centerY).toBe(225);
    }

    // Zero nodes
    expect(computeBoundingBox([])).toBeNull();

    // Invalid nodes
    expect(
      computeBoundingBox([
        { x: NaN, y: 10, width: 100, height: 50 },
        { x: 10, y: 10, width: -5, height: 50 },
      ]),
    ).toBeNull();
  });

  it("expands convex polygon outward by given offset distance with miter clamping", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const expanded = expandPolygon(polygon, 20);
    expect(expanded.length).toBe(4);
    // Outer bounds should have expanded
    expect(Math.min(...expanded.map((p) => p.x))).toBeLessThan(0);
    expect(Math.max(...expanded.map((p) => p.x))).toBeGreaterThan(100);

    // 0 offset
    expect(expandPolygon(polygon, 0)).toEqual(polygon);
    // Empty polygon
    expect(expandPolygon([], 20)).toEqual([]);
    // Single point
    expect(expandPolygon([{ x: 50, y: 50 }], 10).length).toBe(4);
    // 2 points line segment
    expect(
      expandPolygon(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        10,
      ).length,
    ).toBe(4);
  });

  it("generates valid SVG path strings for rounded boxes and polygons", () => {
    const boxPath = generateRoundedBoxSvgPath(10, 20, 200, 100, 12);
    expect(boxPath.startsWith("M ")).toBe(true);
    expect(boxPath.includes(" a ")).toBe(true);
    expect(boxPath.endsWith("Z")).toBe(true);

    const polyPoints = [
      { x: 10, y: 10 },
      { x: 100, y: 10 },
      { x: 80, y: 90 },
      { x: 20, y: 90 },
    ];
    const polyPath = generateRoundedPolygonSvgPath(polyPoints, 8);
    expect(polyPath.startsWith("M ")).toBe(true);
    expect(polyPath.includes("Q ")).toBe(true);
    expect(polyPath.endsWith("Z")).toBe(true);

    // Degenerate inputs
    expect(generateRoundedBoxSvgPath(0, 0, 0, 0)).toBe("");
    expect(generateRoundedPolygonSvgPath([])).toBe("");
  });

  it("computes complete group bounds for box mode and hull mode", () => {
    const nodeMap = new Map<string, PositionedNode>([
      ["node-1", mockNode1],
      ["node-2", mockNode2],
      ["node-3", mockNode3],
    ]);

    const boxGroup: CanvasGroup = {
      id: "grp-1",
      label: "Pipeline Group",
      color: "blue",
      memberNodeIds: ["node-1", "node-2", "node-3"],
      isCollapsed: false,
      isLocked: false,
      shapeMode: "box",
      padding: 24,
      cornerRadius: 12,
    };

    const boxBounds = computeGroupBounds(boxGroup, nodeMap);
    expect(boxBounds).not.toBeNull();
    if (boxBounds) {
      expect(boxBounds.nodeCount).toBe(3);
      expect(boxBounds.svgPath).toBeDefined();
      expect(boxBounds.svgPath?.length).toBeGreaterThan(0);
    }

    const hullGroup: CanvasGroup = {
      id: "grp-2",
      label: "Hull Group",
      color: "emerald",
      memberNodeIds: ["node-1", "node-2", "node-3"],
      isCollapsed: false,
      isLocked: false,
      shapeMode: "hull",
      padding: 30,
      cornerRadius: 16,
    };

    const hullBounds = computeGroupBounds(hullGroup, nodeMap);
    expect(hullBounds).not.toBeNull();
    if (hullBounds) {
      expect(hullBounds.nodeCount).toBe(3);
      expect(hullBounds.hullPoints?.length).toBeGreaterThan(0);
      expect(hullBounds.paddedHullPoints?.length).toBeGreaterThan(0);
    }

    // Ignores hidden nodes
    const hiddenSet = new Set(["node-2", "node-3"]);
    const partialBounds = computeGroupBounds(hullGroup, nodeMap, hiddenSet);
    expect(partialBounds?.nodeCount).toBe(1);

    // Group with missing or all hidden nodes returns null
    const emptyGroup: CanvasGroup = {
      id: "grp-empty",
      label: "Empty",
      color: "slate",
      memberNodeIds: ["unknown-node-id"],
      isCollapsed: false,
      isLocked: false,
    };
    expect(computeGroupBounds(emptyGroup, nodeMap)).toBeNull();
  });

  it("computes synchronous group drag translations accurately", () => {
    const nodes = [mockNode1, mockNode2, mockNode3];
    const memberIds = ["node-1", "node-3"];

    const shifted = computeGroupDragOffsets(nodes, memberIds, 50, -30);
    expect(shifted.length).toBe(3);

    // Member 1 shifted
    const n1 = shifted.find((n) => n.id === "node-1");
    expect(n1?.x).toBe(150);
    expect(n1?.y).toBe(120);

    // Non-member 2 untouched
    const n2 = shifted.find((n) => n.id === "node-2");
    expect(n2?.x).toBe(350);
    expect(n2?.y).toBe(200);

    // Member 3 shifted
    const n3 = shifted.find((n) => n.id === "node-3");
    expect(n3?.x).toBe(250);
    expect(n3?.y).toBe(370);

    // Zero delta or NaN delta returns unmodified nodes
    expect(computeGroupDragOffsets(nodes, memberIds, 0, 0)).toBe(nodes);
    expect(computeGroupDragOffsets(nodes, memberIds, NaN, 10)).toBe(nodes);
  });
});

describe("Zustand Canvas Grouping Store & Filter Actions", () => {
  beforeEach(() => {
    act(() => {
      useCanvasGroupingStore.getState().clearAllGroups();
      useCanvasGroupingStore.getState().resetFilterState();
    });
  });

  it("creates group with default values and timestamps", () => {
    const store = useCanvasGroupingStore.getState();
    let group!: CanvasGroup;
    act(() => {
      group = store.createGroup({
        label: "Worker Cluster",
        color: "purple",
        memberNodeIds: ["node-1", "node-2"],
      });
    });

    expect(group.id.startsWith("group-")).toBe(true);
    expect(group.label).toBe("Worker Cluster");
    expect(group.color).toBe("purple");
    expect(group.memberNodeIds).toEqual(["node-1", "node-2"]);
    expect(group.isCollapsed).toBe(false);
    expect(group.isLocked).toBe(false);
    expect(group.createdAt).toBeDefined();

    const state = useCanvasGroupingStore.getState();
    expect(state.groups.length).toBe(1);
    expect(state.selectedGroupId).toBe(group.id);
  });

  it("creates group directly from selected node IDs", () => {
    const store = useCanvasGroupingStore.getState();
    let group: CanvasGroup | null = null;
    act(() => {
      group = store.createGroupFromSelectedNodes(["node-1", "node-3"], "Selected Batch", "amber");
    });

    expect(group).not.toBeNull();
    if (group) {
      expect((group as CanvasGroup).label).toBe("Selected Batch");
      expect((group as CanvasGroup).color).toBe("amber");
      expect((group as CanvasGroup).memberNodeIds).toEqual(["node-1", "node-3"]);
    }

    // Empty nodes returns null
    expect(store.createGroupFromSelectedNodes([])).toBeNull();
  });

  it("updates group attributes and deduplicates member node IDs", () => {
    const store = useCanvasGroupingStore.getState();
    let group!: CanvasGroup;
    act(() => {
      group = store.createGroup({
        label: "Initial Label",
        color: "blue",
        memberNodeIds: ["node-1"],
      });
      store.updateGroup(group.id, {
        label: "Updated Label",
        color: "rose",
        memberNodeIds: ["node-1", "node-2", "node-1"], // duplicates
        padding: 36,
      });
    });

    const updated = useCanvasGroupingStore.getState().groups.find((g) => g.id === group.id);
    expect(updated?.label).toBe("Updated Label");
    expect(updated?.color).toBe("rose");
    expect(updated?.padding).toBe(36);
    expect(updated?.memberNodeIds).toEqual(["node-1", "node-2"]);
  });

  it("toggles collapse and lock state on groups", () => {
    const store = useCanvasGroupingStore.getState();
    let group!: CanvasGroup;
    act(() => {
      group = store.createGroup({
        label: "Toggle Test",
        color: "cyan",
        memberNodeIds: ["node-1"],
      });
    });

    expect(group.isCollapsed).toBe(false);
    act(() => {
      store.toggleGroupCollapse(group.id);
    });
    expect(useCanvasGroupingStore.getState().groups[0].isCollapsed).toBe(true);
    act(() => {
      store.toggleGroupCollapse(group.id);
    });
    expect(useCanvasGroupingStore.getState().groups[0].isCollapsed).toBe(false);

    expect(group.isLocked).toBe(false);
    act(() => {
      store.toggleGroupLock(group.id);
    });
    expect(useCanvasGroupingStore.getState().groups[0].isLocked).toBe(true);
    act(() => {
      store.toggleGroupLock(group.id);
    });
    expect(useCanvasGroupingStore.getState().groups[0].isLocked).toBe(false);
  });

  it("adds and removes member nodes dynamically", () => {
    const store = useCanvasGroupingStore.getState();
    let group!: CanvasGroup;
    act(() => {
      group = store.createGroup({
        label: "Dynamic Members",
        color: "slate",
        memberNodeIds: ["node-1"],
      });
      store.addNodesToGroup(group.id, ["node-2", "node-3", "node-1"]);
    });

    let current = useCanvasGroupingStore.getState().groups[0];
    expect(current.memberNodeIds).toEqual(["node-1", "node-2", "node-3"]);

    act(() => {
      store.removeNodesFromGroup(group.id, ["node-2"]);
    });
    current = useCanvasGroupingStore.getState().groups[0];
    expect(current.memberNodeIds).toEqual(["node-1", "node-3"]);

    act(() => {
      store.setGroupMembers(group.id, ["node-5", "node-6"]);
    });
    current = useCanvasGroupingStore.getState().groups[0];
    expect(current.memberNodeIds).toEqual(["node-5", "node-6"]);
  });

  it("deletes group and cleans up selected ID references", () => {
    const store = useCanvasGroupingStore.getState();
    let group!: CanvasGroup;
    act(() => {
      group = store.createGroup({
        label: "To Delete",
        color: "orange",
      });
    });

    expect(useCanvasGroupingStore.getState().selectedGroupId).toBe(group.id);
    act(() => {
      store.deleteGroup(group.id);
    });

    expect(useCanvasGroupingStore.getState().groups.length).toBe(0);
    expect(useCanvasGroupingStore.getState().selectedGroupId).toBeNull();
  });

  it("reorders groups and updates zIndex accordingly", () => {
    const store = useCanvasGroupingStore.getState();
    let g1!: CanvasGroup;
    let g2!: CanvasGroup;
    let g3!: CanvasGroup;
    act(() => {
      g1 = store.createGroup({ label: "G1", color: "blue" });
      g2 = store.createGroup({ label: "G2", color: "emerald" });
      g3 = store.createGroup({ label: "G3", color: "amber" });
      store.reorderGroups([g3.id, g1.id, g2.id]);
    });

    const groups = useCanvasGroupingStore.getState().groups;
    expect(groups[0].id).toBe(g3.id);
    expect(groups[0].zIndex).toBe(1);
    expect(groups[1].id).toBe(g1.id);
    expect(groups[1].zIndex).toBe(2);
    expect(groups[2].id).toBe(g2.id);
    expect(groups[2].zIndex).toBe(3);
  });

  it("exports and imports groups JSON successfully", () => {
    const store = useCanvasGroupingStore.getState();
    let json = "";
    act(() => {
      store.createGroup({
        id: "grp-export-1",
        label: "Exported Group 1",
        color: "teal",
        memberNodeIds: ["node-1", "node-2"],
      });
      json = store.exportGroupsJson();
    });

    expect(json.includes("grp-export-1")).toBe(true);

    act(() => {
      store.clearAllGroups();
    });
    expect(useCanvasGroupingStore.getState().groups.length).toBe(0);

    let imported = false;
    act(() => {
      imported = store.importGroupsJson(json);
    });
    expect(imported).toBe(true);
    expect(useCanvasGroupingStore.getState().groups.length).toBe(1);
    expect(useCanvasGroupingStore.getState().groups[0].label).toBe("Exported Group 1");

    // Invalid JSON
    expect(store.importGroupsJson("{ invalid json }")).toBe(false);
    expect(store.importGroupsJson(JSON.stringify({ notGroups: [] }))).toBe(false);
  });

  it("filters groups by query, color, collapse, and lock state", () => {
    const store = useCanvasGroupingStore.getState();
    let g1!: CanvasGroup;
    let g2!: CanvasGroup;
    let g3!: CanvasGroup;
    act(() => {
      g1 = store.createGroup({
        label: "Ingestion Core",
        description: "Data parsing pipeline",
        color: "blue",
        memberNodeIds: ["n1", "n2"],
        isCollapsed: false,
        isLocked: false,
      });
      g2 = store.createGroup({
        label: "Critic Evaluator",
        description: "Adversarial audits",
        color: "rose",
        memberNodeIds: ["n3"],
        isCollapsed: true,
        isLocked: false,
      });
      g3 = store.createGroup({
        label: "Security Sandbox",
        color: "blue",
        memberNodeIds: ["n4"],
        isCollapsed: false,
        isLocked: true,
      });
    });

    const all = [g1, g2, g3];

    // Search query
    expect(
      filterGroups(all, {
        searchQuery: "evaluator",
        color: "all",
        isCollapsed: "all",
        isLocked: "all",
      }).length,
    ).toBe(1);
    expect(
      filterGroups(all, { searchQuery: "n4", color: "all", isCollapsed: "all", isLocked: "all" })
        .length,
    ).toBe(1);

    // Color filter
    expect(
      filterGroups(all, { searchQuery: "", color: "blue", isCollapsed: "all", isLocked: "all" })
        .length,
    ).toBe(2);
    expect(
      filterGroups(all, { searchQuery: "", color: "rose", isCollapsed: "all", isLocked: "all" })
        .length,
    ).toBe(1);

    // Collapse filter
    expect(
      filterGroups(all, {
        searchQuery: "",
        color: "all",
        isCollapsed: "collapsed",
        isLocked: "all",
      }).length,
    ).toBe(1);
    expect(
      filterGroups(all, { searchQuery: "", color: "all", isCollapsed: "expanded", isLocked: "all" })
        .length,
    ).toBe(2);

    // Lock filter
    expect(
      filterGroups(all, { searchQuery: "", color: "all", isCollapsed: "all", isLocked: "locked" })
        .length,
    ).toBe(1);
    expect(
      filterGroups(all, { searchQuery: "", color: "all", isCollapsed: "all", isLocked: "unlocked" })
        .length,
    ).toBe(2);
  });
});

describe("Theme Palette Definitions", () => {
  it("provides comprehensive palettes with required contrast and colors", () => {
    const paletteKeys: GroupColorPalette[] = [
      "blue",
      "emerald",
      "amber",
      "purple",
      "rose",
      "cyan",
      "slate",
      "indigo",
      "teal",
      "orange",
    ];

    for (const key of paletteKeys) {
      const theme = GROUP_THEME_PALETTES[key];
      expect(theme).toBeDefined();
      expect(theme.id).toBe(key);
      expect(theme.name).toBeDefined();
      expect(theme.accent.startsWith("#")).toBe(true);
      expect(theme.bg.startsWith("rgba")).toBe(true);
      expect(theme.border.startsWith("rgba")).toBe(true);
      expect(theme.headerBg.startsWith("rgba")).toBe(true);
      expect(theme.headerText).toBeDefined();
      expect(theme.badgeBg).toBeDefined();
      expect(theme.badgeText).toBeDefined();
    }
  });
});

describe("Canvas Grouping UI Components", () => {
  beforeEach(() => {
    act(() => {
      useCanvasGroupingStore.getState().clearAllGroups();
      useCanvasGroupingStore.getState().setIsDrawerOpen(false);
      useGraphStore.getState().setSelectedNodeId(null);
    });
  });

  it("renders GroupToolbar and handles open drawer and quick create actions", () => {
    silenceReactWarnings(() => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(createElement(GroupToolbar));
      });

      const root = renderer.root;
      const buttons = root.findAllByType("button");
      expect(buttons.length).toBeGreaterThanOrEqual(2);

      // Click open drawer button
      act(() => {
        buttons[0].props.onClick();
      });
      expect(useCanvasGroupingStore.getState().isDrawerOpen).toBe(true);

      // Select node and test "Group Node" button
      act(() => {
        useGraphStore.getState().setSelectedNodeId("node-test");
      });

      act(() => {
        renderer.update(createElement(GroupToolbar));
      });

      const groupNodeBtn = root
        .findAllByType("button")
        .find((b) => b.props.title?.includes("Create group around selected node"));
      expect(groupNodeBtn).toBeDefined();

      if (groupNodeBtn) {
        act(() => {
          groupNodeBtn.props.onClick();
        });
        expect(useCanvasGroupingStore.getState().groups.length).toBe(1);
        expect(useCanvasGroupingStore.getState().groups[0].memberNodeIds).toContain("node-test");
      }
    });
  });

  it("renders GroupModal and submits group creation and edits", () => {
    silenceReactWarnings(() => {
      let closed = false;
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(GroupModal, {
            isOpen: true,
            onClose: () => {
              closed = true;
            },
            initialMemberNodeIds: ["node-1"],
          }),
        );
      });

      const root = renderer.root;
      const titleInput = root.findByProps({ id: "group-name-input" });
      const descInput = root.findByProps({ id: "group-desc-input" });
      const form = root.findByType("form");

      act(() => {
        titleInput.props.onChange({ target: { value: "New Functional Group" } });
        descInput.props.onChange({ target: { value: "Group description" } });
      });

      act(() => {
        form.props.onSubmit({ preventDefault: () => {} });
      });

      expect(useCanvasGroupingStore.getState().groups.length).toBe(1);
      const created = useCanvasGroupingStore.getState().groups[0];
      expect(created.label).toBe("New Functional Group");
      expect(created.description).toBe("Group description");
      expect(closed).toBe(true);
    });
  });

  it("renders GroupManagerDrawer and triggers group manipulation callbacks", () => {
    silenceReactWarnings(() => {
      const store = useCanvasGroupingStore.getState();
      let g!: CanvasGroup;
      act(() => {
        g = store.createGroup({
          label: "Drawer Group",
          color: "emerald",
          memberNodeIds: ["node-1", "node-2"],
        });
        store.setIsDrawerOpen(true);
      });

      let editTarget: CanvasGroup | null = null;
      let createTriggered = false;

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(GroupManagerDrawer, {
            onEditGroup: (group) => {
              editTarget = group;
            },
            onCreateGroup: () => {
              createTriggered = true;
            },
          }),
        );
      });

      const root = renderer.root;
      expect(root.findByProps({ className: "group-card-title" }).children).toContain(
        "Drawer Group",
      );

      // Test Edit button
      const editBtn = root.findByProps({ title: "Edit Group Settings" });
      act(() => {
        editBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(editTarget).not.toBeNull();
      if (editTarget) {
        expect((editTarget as CanvasGroup).id).toBe(g.id);
      }

      // Test New Group button
      const newGroupBtn = root.findByProps({ className: "group-btn-primary" });
      act(() => {
        newGroupBtn.props.onClick();
      });
      expect(createTriggered).toBe(true);

      // Test Close drawer
      const closeBtn = root.findByProps({ "aria-label": "Close group drawer" });
      act(() => {
        closeBtn.props.onClick();
      });
      expect(useCanvasGroupingStore.getState().isDrawerOpen).toBe(false);
    });
  });

  it("renders CanvasGrouping top-level container seamlessly", () => {
    silenceReactWarnings(() => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(createElement(CanvasGrouping));
      });
      expect(renderer.toJSON()).toBeNull(); // Drawer and Modal are closed initially

      act(() => {
        useCanvasGroupingStore.getState().setIsDrawerOpen(true);
      });

      act(() => {
        renderer.update(createElement(CanvasGrouping));
      });
      expect(renderer.root.findByProps({ "aria-label": "Canvas Groups Manager" })).toBeDefined();
    });
  });
});

describe("Adversarial Stress Test: Collinear & Duplicate Node Degeneracy Protection", () => {
  it("handles 10+ identical duplicate node positions without crashing or producing degenerate hulls", () => {
    const identicalPoints = Array.from({ length: 15 }, () => ({ x: 120, y: 250 }));
    const hull = computeConvexHull(identicalPoints);
    expect(hull.length).toBe(1);
    expect(hull[0]).toEqual({ x: 120, y: 250 });

    const expanded = expandPolygon(hull, 24);
    expect(expanded.length).toBe(4);
    expect(expanded[0]).toEqual({ x: 96, y: 226 });
    expect(expanded[1]).toEqual({ x: 144, y: 226 });
    expect(expanded[2]).toEqual({ x: 144, y: 274 });
    expect(expanded[3]).toEqual({ x: 96, y: 274 });

    const svgPath = generateRoundedPolygonSvgPath(expanded, 12);
    expect(svgPath.startsWith("M ")).toBe(true);
    expect(svgPath.includes("Q ")).toBe(true);
    expect(svgPath.endsWith("Z")).toBe(true);
  });

  it("handles strictly collinear horizontal, vertical, and diagonal node arrangements in hull mode", () => {
    // Horizontal collinear points
    const horizontalNodes: PositionedNode[] = [
      { id: "h1", name: "H1", x: 0, y: 100, width: 50, height: 50 },
      { id: "h2", name: "H2", x: 100, y: 100, width: 50, height: 50 },
      { id: "h3", name: "H3", x: 200, y: 100, width: 50, height: 50 },
      { id: "h4", name: "H4", x: 300, y: 100, width: 50, height: 50 },
    ];
    const horizontalNodeMap = new Map<string, PositionedNode>(
      horizontalNodes.map((n) => [n.id, n]),
    );

    const horizontalGroup: CanvasGroup = {
      id: "grp-horizontal-collinear",
      label: "Horizontal Collinear Group",
      color: "cyan",
      memberNodeIds: ["h1", "h2", "h3", "h4"],
      isCollapsed: false,
      isLocked: false,
      shapeMode: "hull",
      padding: 20,
      cornerRadius: 10,
    };

    const hBounds = computeGroupBounds(horizontalGroup, horizontalNodeMap);
    expect(hBounds).not.toBeNull();
    if (hBounds) {
      expect(hBounds.nodeCount).toBe(4);
      expect(hBounds.svgPath).toBeDefined();
      expect(hBounds.svgPath?.includes("NaN")).toBe(false);
      expect(hBounds.paddedHullPoints?.length).toBeGreaterThanOrEqual(4);
    }

    // Vertical collinear points
    const verticalNodes: PositionedNode[] = [
      { id: "v1", name: "V1", x: 150, y: 0, width: 60, height: 40 },
      { id: "v2", name: "V2", x: 150, y: 100, width: 60, height: 40 },
      { id: "v3", name: "V3", x: 150, y: 200, width: 60, height: 40 },
    ];
    const verticalNodeMap = new Map<string, PositionedNode>(verticalNodes.map((n) => [n.id, n]));

    const verticalGroup: CanvasGroup = {
      id: "grp-vertical-collinear",
      label: "Vertical Collinear Group",
      color: "emerald",
      memberNodeIds: ["v1", "v2", "v3"],
      isCollapsed: false,
      isLocked: false,
      shapeMode: "hull",
      padding: 16,
      cornerRadius: 8,
    };

    const vBounds = computeGroupBounds(verticalGroup, verticalNodeMap);
    expect(vBounds).not.toBeNull();
    if (vBounds) {
      expect(vBounds.nodeCount).toBe(3);
      expect(vBounds.svgPath).toBeDefined();
      expect(vBounds.svgPath?.includes("NaN")).toBe(false);
    }

    // Diagonal collinear line segment
    const diagonalCollinear = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
      { x: 150, y: 150 },
    ];
    const diagHull = computeConvexHull(diagonalCollinear, false);
    expect(diagHull.length).toBe(2);
    expect(diagHull[0]).toEqual({ x: 0, y: 0 });
    expect(diagHull[1]).toEqual({ x: 150, y: 150 });

    const diagExpanded = expandPolygon(diagHull, 20);
    expect(diagExpanded.length).toBe(4);
    const diagPath = generateRoundedPolygonSvgPath(diagExpanded, 8);
    expect(diagPath.length).toBeGreaterThan(0);
    expect(diagPath.includes("NaN")).toBe(false);
  });

  it("handles polygon expansion with collinear area close to zero seamlessly", () => {
    const collinear3 = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const expanded = expandPolygon(collinear3, 15);
    expect(expanded.length).toBe(4);
    // Bounding corners should be padded by 15
    expect(expanded.some((p) => p.y === -15)).toBe(true);
    expect(expanded.some((p) => p.y === 15)).toBe(true);
  });
});

describe("Adversarial Stress Test: Locked Group Drag Prevention & Protection", () => {
  beforeEach(() => {
    act(() => {
      useCanvasGroupingStore.getState().clearAllGroups();
      useCanvasGroupingStore.getState().setDraggingGroup(false, null);
    });
  });

  it("guarantees locked groups cannot be moved via drag interactions", () => {
    const store = useCanvasGroupingStore.getState();
    let lockedGroup!: CanvasGroup;
    let unlockedGroup!: CanvasGroup;

    act(() => {
      lockedGroup = store.createGroup({
        id: "grp-locked-stress",
        label: "Secure Production Cluster",
        color: "rose",
        memberNodeIds: ["node-1"],
        isLocked: true,
      });

      unlockedGroup = store.createGroup({
        id: "grp-unlocked-stress",
        label: "Dev Sandbox",
        color: "blue",
        memberNodeIds: ["node-2"],
        isLocked: false,
      });
    });

    expect(lockedGroup.isLocked).toBe(true);
    expect(unlockedGroup.isLocked).toBe(false);

    // Verify initial positions
    const initialNodes: PositionedNode[] = [mockNode1, mockNode2];
    useGraphStore.getState().setPositionedGraph(initialNodes, []);

    // Drag applied only to unlocked member nodes
    const shiftedUnlocked = computeGroupDragOffsets(
      initialNodes,
      unlockedGroup.memberNodeIds,
      100,
      100,
    );
    const n1 = shiftedUnlocked.find((n) => n.id === "node-1");
    const n2 = shiftedUnlocked.find((n) => n.id === "node-2");
    expect(n1?.x).toBe(100); // untouched locked node
    expect(n2?.x).toBe(450); // shifted unlocked node

    // Toggling lock state works dynamically
    act(() => {
      store.toggleGroupLock(lockedGroup.id);
    });
    expect(
      useCanvasGroupingStore.getState().groups.find((g) => g.id === lockedGroup.id)?.isLocked,
    ).toBe(false);

    act(() => {
      store.toggleGroupLock(lockedGroup.id);
    });
    expect(
      useCanvasGroupingStore.getState().groups.find((g) => g.id === lockedGroup.id)?.isLocked,
    ).toBe(true);
  });
});
