import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import { GraphBadgeLayer, resolveSafeBadgePlacement } from "./GraphBadgeLayer";
import { GraphSvgLayer } from "./GraphSvgLayer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceReactTestRendererDeprecationWarning<T>(fn: () => T): T {
  const originalConsoleError = console.error;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (
      typeof message === "string" &&
      (message.includes("react-test-renderer is deprecated") ||
        message.includes("<foreignObject /> is using incorrect casing") ||
        message.includes("An update to Root inside a test was not wrapped in act"))
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

describe("resolveSafeBadgePlacement (Strict Coordinate Validation)", () => {
  it("uses center of valid pre-computed badgeRect (Case 1)", () => {
    const edge: PositionedEdge = {
      id: "e1",
      source: "n1",
      target: "n2",
      path: "M 0 0 L 200 200",
      badgeRect: { x: 100, y: 200, width: 80, height: 30 },
      anchorPoint: { x: 140, y: 215 },
      leaderPoints: [
        { x: 140, y: 215 },
        { x: 140, y: 215 },
      ],
    };

    const placement = resolveSafeBadgePlacement(edge);
    expect(placement).not.toBeNull();
    expect(placement?.x).toBe(140);
    expect(placement?.y).toBe(215);
    expect(placement?.badgeRect).toEqual(edge.badgeRect);
    expect(placement?.anchorPoint).toEqual({ x: 140, y: 215 });
  });

  it("uses explicit non-zero label coordinates (Case 2)", () => {
    const edge: PositionedEdge = {
      id: "e2",
      source: "n1",
      target: "n2",
      path: "M 0 0 L 400 200",
      labelX: 320,
      labelY: 180,
    };

    const placement = resolveSafeBadgePlacement(edge);
    expect(placement).not.toBeNull();
    expect(placement?.x).toBe(320);
    expect(placement?.y).toBe(180);
  });

  it("calculates polyline arc-length midpoint when label coordinates are missing (Case 3)", () => {
    const edge: PositionedEdge = {
      id: "e3",
      source: "n1",
      target: "n2",
      path: "M 100 50 L 300 50",
      points: [
        { x: 100, y: 50 },
        { x: 300, y: 50 },
      ],
    };

    const placement = resolveSafeBadgePlacement(edge);
    expect(placement).not.toBeNull();
    expect(placement?.x).toBe(200);
    expect(placement?.y).toBe(50);
  });

  it("strictly suppresses (returns null) for (0,0) label coordinates without badgeRect or points (Strict Guard)", () => {
    const ghostEdge: PositionedEdge = {
      id: "ghost-1",
      source: "n1",
      target: "n2",
      path: "",
      labelX: 0,
      labelY: 0,
      points: [],
    };

    const placement = resolveSafeBadgePlacement(ghostEdge);
    expect(placement).toBeNull();
  });

  it("strictly suppresses (returns null) when no placement geometry is defined", () => {
    const unpositionedEdge: PositionedEdge = {
      id: "unpositioned-1",
      source: "n1",
      target: "n2",
      path: "",
    };

    const placement = resolveSafeBadgePlacement(unpositionedEdge);
    expect(placement).toBeNull();
  });

  it("retains valid origin-crossing polyline midpoints at (0,0) when total arc length > 0", () => {
    const originCrossingEdge: PositionedEdge = {
      id: "origin-cross-1",
      source: "n1",
      target: "n2",
      path: "M -100 0 L 100 0",
      points: [
        { x: -100, y: 0 },
        { x: 100, y: 0 },
      ],
    };

    const placement = resolveSafeBadgePlacement(originCrossingEdge);
    expect(placement).not.toBeNull();
    expect(placement?.x).toBe(0);
    expect(placement?.y).toBe(0);
  });

  it("strictly suppresses (returns null) for zero-length polyline at origin", () => {
    const zeroPolylineEdge: PositionedEdge = {
      id: "zero-poly-1",
      source: "n1",
      target: "n2",
      path: "",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    };

    const placement = resolveSafeBadgePlacement(zeroPolylineEdge);
    expect(placement).toBeNull();
  });

  it("strictly suppresses (returns null) for unpositioned default origin badgeRect without anchor", () => {
    const defaultOriginBadgeRectEdge: PositionedEdge = {
      id: "origin-rect-1",
      source: "n1",
      target: "n2",
      path: "",
      badgeRect: { x: 0, y: 0, width: 80, height: 26 },
    };

    const placement = resolveSafeBadgePlacement(defaultOriginBadgeRectEdge);
    expect(placement).toBeNull();
  });

  it("strictly suppresses (returns null) for NaN or Infinity labelX/labelY coordinates", () => {
    const nanLabelEdge: PositionedEdge = {
      id: "nan-label",
      source: "n1",
      target: "n2",
      path: "",
      labelX: Number.NaN,
      labelY: 50,
    };
    expect(resolveSafeBadgePlacement(nanLabelEdge)).toBeNull();

    const infLabelEdge: PositionedEdge = {
      id: "inf-label",
      source: "n1",
      target: "n2",
      path: "",
      labelX: 50,
      labelY: Number.POSITIVE_INFINITY,
    };
    expect(resolveSafeBadgePlacement(infLabelEdge)).toBeNull();
  });

  it("strictly suppresses (returns null) for non-finite or invalid badgeRect coordinates and dimensions", () => {
    const nanBadgeRectEdge: PositionedEdge = {
      id: "nan-rect",
      source: "n1",
      target: "n2",
      path: "",
      badgeRect: { x: Number.NaN, y: 10, width: 80, height: 26 },
    };
    expect(resolveSafeBadgePlacement(nanBadgeRectEdge)).toBeNull();

    const infBadgeRectEdge: PositionedEdge = {
      id: "inf-rect",
      source: "n1",
      target: "n2",
      path: "",
      badgeRect: { x: 10, y: 10, width: Number.POSITIVE_INFINITY, height: 26 },
    };
    expect(resolveSafeBadgePlacement(infBadgeRectEdge)).toBeNull();

    const zeroHeightBadgeRectEdge: PositionedEdge = {
      id: "zero-height-rect",
      source: "n1",
      target: "n2",
      path: "",
      badgeRect: { x: 10, y: 10, width: 80, height: 0 },
    };
    expect(resolveSafeBadgePlacement(zeroHeightBadgeRectEdge)).toBeNull();
  });

  it("strictly suppresses (returns null) for points array containing NaN or Infinity coordinates", () => {
    const nanPointsEdge: PositionedEdge = {
      id: "nan-points",
      source: "n1",
      target: "n2",
      path: "",
      points: [
        { x: Number.NaN, y: 0 },
        { x: 100, y: 100 },
      ],
    };
    expect(resolveSafeBadgePlacement(nanPointsEdge)).toBeNull();

    const infPointsEdge: PositionedEdge = {
      id: "inf-points",
      source: "n1",
      target: "n2",
      path: "",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: Number.POSITIVE_INFINITY },
      ],
    };
    expect(resolveSafeBadgePlacement(infPointsEdge)).toBeNull();
  });
});

describe("GraphBadgeLayer Component & Accent Propagation", () => {
  it("does not render any DOM nodes for ghost or unpositioned edges", () => {
    const ghostEdge: PositionedEdge = {
      id: "ghost-edge",
      source: "n1",
      target: "n2",
      path: "",
      label: "Ghost Action",
      labelX: 0,
      labelY: 0,
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [ghostEdge],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const tree = renderer?.toJSON();
    // SVG container should have no child <g> elements
    if (tree && typeof tree === "object" && "children" in tree) {
      expect(tree.children).toBeNull();
    }
    renderer?.unmount();
  });

  it("does not render any DOM nodes (0 DOM elements) for edges with NaN or Infinity coordinates", () => {
    const invalidEdges: PositionedEdge[] = [
      {
        id: "nan-edge-1",
        source: "n1",
        target: "n2",
        path: "",
        label: "NaN Label",
        labelX: Number.NaN,
        labelY: 100,
      },
      {
        id: "inf-edge-2",
        source: "n1",
        target: "n2",
        path: "",
        label: "Inf Rect",
        badgeRect: { x: 10, y: 10, width: Number.POSITIVE_INFINITY, height: 26 },
      },
      {
        id: "nan-pts-edge-3",
        source: "n1",
        target: "n2",
        path: "",
        label: "NaN Points",
        points: [
          { x: Number.NaN, y: 0 },
          { x: 100, y: 100 },
        ],
      },
    ];

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: invalidEdges,
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const tree = renderer?.toJSON();
    if (tree && typeof tree === "object" && "children" in tree) {
      expect(tree.children).toBeNull();
    }
    renderer?.unmount();
  });

  it("renders badge at polyline midpoint when label coordinates are unassigned", () => {
    const polylineEdge: PositionedEdge = {
      id: "poly-edge",
      source: "n1",
      target: "n2",
      path: "M 100 200 L 300 200",
      label: "Midpoint Action",
      points: [
        { x: 100, y: 200 },
        { x: 300, y: 200 },
      ],
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [polylineEdge],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const root = renderer?.root;
    const badgeGroup = root?.find(
      (el) =>
        typeof el.props.className === "string" && el.props.className.includes("edge-badge-group"),
    );
    expect(badgeGroup).toBeDefined();
    expect(badgeGroup?.props.transform).toBe("translate(200, 200)");
    renderer?.unmount();
  });

  it("renders badge at (0, 0) for valid origin-crossing polyline", () => {
    const originCrossingEdge: PositionedEdge = {
      id: "origin-poly-edge",
      source: "n1",
      target: "n2",
      path: "M -100 0 L 100 0",
      label: "Zero Midpoint Action",
      points: [
        { x: -100, y: 0 },
        { x: 100, y: 0 },
      ],
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [originCrossingEdge],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const root = renderer?.root;
    const badgeGroup = root?.find(
      (el) =>
        typeof el.props.className === "string" && el.props.className.includes("edge-badge-group"),
    );
    expect(badgeGroup).toBeDefined();
    expect(badgeGroup?.props.transform).toBe("translate(0, 0)");
    renderer?.unmount();
  });

  it("propagates sourceAccentColor from positionedNodes to EdgeBadgeOverlay", () => {
    const edge: PositionedEdge = {
      id: "accent-edge",
      source: "prompt-node",
      target: "worker-node",
      path: "M 50 50 L 200 200",
      label: "Prompt Input",
      labelX: 150,
      labelY: 100,
    };

    const nodes: PositionedNode[] = [
      {
        id: "prompt-node",
        name: "Prompt Input",
        kind: "input",
        x: 50,
        y: 50,
        width: 100,
        height: 50,
      },
    ];

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [edge],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
            positionedNodes: nodes,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const root = renderer?.root;
    const badgeGroup = root?.find(
      (el) =>
        typeof el.props.className === "string" && el.props.className.includes("edge-badge-group"),
    );
    expect(badgeGroup).toBeDefined();
    // Input node kind accent is #8b5cf6
    expect(badgeGroup?.props.style?.["--edge-source-accent"]).toBe("#8b5cf6");
    renderer?.unmount();
  });

  it("handles badge click event and notifies onSelectEdge", () => {
    let selectedEdgeId: string | null = null;
    let selectedSourceNode: string | null = null;

    const edge: PositionedEdge = {
      id: "clickable-edge",
      source: "src-1",
      target: "tgt-1",
      path: "M 0 0 L 200 200",
      label: "Click Me",
      labelX: 120,
      labelY: 120,
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [edge],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
            onSelectEdge: (edgeId: string, sourceId?: string) => {
              selectedEdgeId = edgeId;
              selectedSourceNode = sourceId ?? null;
            },
          }),
        );
      });
    });

    const root = renderer?.root;
    const badgeGroup = root?.find(
      (el) =>
        typeof el.props.className === "string" && el.props.className.includes("edge-badge-group"),
    );
    expect(badgeGroup).toBeDefined();

    act(() => {
      badgeGroup?.props.onClick({ stopPropagation: () => {} });
    });

    expect(selectedEdgeId).toBe("clickable-edge");
    expect(selectedSourceNode).toBe("src-1");
    renderer?.unmount();
  });

  it("does not render badge for unanchored origin default badgeRect", () => {
    const originBadgeRectEdge: PositionedEdge = {
      id: "origin-rect-edge",
      source: "n1",
      target: "n2",
      path: "",
      label: "Unanchored Action",
      badgeRect: { x: 0, y: 0, width: 80, height: 26 },
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [originBadgeRectEdge],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const tree = renderer?.toJSON();
    if (tree && typeof tree === "object" && "children" in tree) {
      expect(tree.children).toBeNull();
    }
    renderer?.unmount();
  });

  it("renders leader line with relative coordinates from anchor offset to (0, 0)", () => {
    const edgeWithLeaderLine: PositionedEdge = {
      id: "leader-line-edge",
      source: "n1",
      target: "n2",
      path: "M 0 0 L 300 300",
      label: "Displaced Badge",
      badgeRect: { x: 200, y: 187, width: 100, height: 26 },
      anchorPoint: { x: 100, y: 100 },
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [edgeWithLeaderLine],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const root = renderer?.root;
    const badgeGroup = root?.find(
      (el) =>
        typeof el.props.className === "string" && el.props.className.includes("edge-badge-group"),
    );
    expect(badgeGroup).toBeDefined();
    // renderX = 250, renderY = 200 -> group translated to (250, 200)
    expect(badgeGroup?.props.transform).toBe("translate(250, 200)");

    const line = root?.find((el) => el.type === "line");
    expect(line).toBeDefined();
    // anchorPoint: (100, 100) -> relative: (100 - 250, 100 - 200) = (-150, -100) to (0, 0)
    expect(line?.props.x1).toBe(-150);
    expect(line?.props.y1).toBe(-100);
    expect(line?.props.x2).toBe(0);
    expect(line?.props.y2).toBe(0);
    renderer?.unmount();
  });

  it("renders leader path with relative coordinates along displaced points", () => {
    const edgeWithLeaderPath: PositionedEdge = {
      id: "leader-path-edge",
      source: "n1",
      target: "n2",
      path: "M 0 0 L 300 300",
      label: "Routed Displaced Badge",
      badgeRect: { x: 200, y: 187, width: 100, height: 26 },
      anchorPoint: { x: 50, y: 50 },
      leaderPoints: [
        { x: 50, y: 50 },
        { x: 150, y: 100 },
        { x: 250, y: 200 },
      ],
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [edgeWithLeaderPath],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const root = renderer?.root;
    const path = root?.find((el) => el.type === "path" && el.props.strokeDasharray === "3,3");
    expect(path).toBeDefined();
    // renderX = 250, renderY = 200 -> relative points: (50-250, 50-200), (150-250, 100-200), (250-250, 200-200)
    // = (-200, -150), (-100, -100), (0, 0)
    expect(path?.props.d).toBe("M -200 -150 L -100 -100 L 0 0");
    expect(path?.props.transform).toBe(undefined);
    renderer?.unmount();
  });
});

describe("GraphSvgLayer Component & Edge Styling", () => {
  it("propagates sourceAccentColor to GraphEdge and wires onSelectEdge", () => {
    let selectedEdgeId: string | null = null;
    let selectedSourceNode: string | null = null;

    const edge: PositionedEdge = {
      id: "svg-edge-1",
      source: "gate-node",
      target: "worker-node",
      path: "M 0 0 L 100 100",
    };

    const nodes: PositionedNode[] = [
      {
        id: "gate-node",
        name: "Validation Gate",
        kind: "gate",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      },
    ];

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphSvgLayer, {
            styledEdges: [edge],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
            positionedNodes: nodes,
            onSelectEdge: (edgeId: string, sourceId?: string) => {
              selectedEdgeId = edgeId;
              selectedSourceNode = sourceId ?? null;
            },
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const root = renderer?.root;
    const edgeGroup = root?.find(
      (el) =>
        typeof el.props.className === "string" && el.props.className.includes("graph-edge-group"),
    );
    expect(edgeGroup).toBeDefined();
    // Gate node kind accent is #10b981
    expect(edgeGroup?.props.style?.["--edge-source-accent"]).toBe("#10b981");

    act(() => {
      edgeGroup?.props.onClick({ stopPropagation: () => {} });
    });

    expect(selectedEdgeId).toBe("svg-edge-1");
    expect(selectedSourceNode).toBe("gate-node");
    renderer?.unmount();
  });
});
