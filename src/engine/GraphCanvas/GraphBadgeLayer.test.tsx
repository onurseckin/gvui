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

  it("strictly suppresses (returns null) for origin-crossing polyline whose midpoint lands at (0,0)", () => {
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
    expect(placement).toBeNull();
  });

  it("strictly suppresses (returns null) for zero-length polyline at origin (2 points)", () => {
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

  it("strictly suppresses (returns null) for multi-point zero-length polyline at origin (3+ points)", () => {
    const multiPointZeroPolylineEdge: PositionedEdge = {
      id: "zero-poly-multi",
      source: "n1",
      target: "n2",
      path: "",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    };

    const placement = resolveSafeBadgePlacement(multiPointZeroPolylineEdge);
    expect(placement).toBeNull();
  });

  it("strictly suppresses (returns null) for single-point polyline at origin", () => {
    const singlePointOriginEdge: PositionedEdge = {
      id: "single-pt-origin",
      source: "n1",
      target: "n2",
      path: "",
      points: [{ x: 0, y: 0 }],
    };

    const placement = resolveSafeBadgePlacement(singlePointOriginEdge);
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

  it("strictly suppresses (returns null) for origin badgeRect with zero dimensions", () => {
    const zeroDimOriginBadgeRectEdge: PositionedEdge = {
      id: "zero-dim-origin-rect",
      source: "n1",
      target: "n2",
      path: "",
      badgeRect: { x: 0, y: 0, width: 0, height: 0 },
    };

    const placement = resolveSafeBadgePlacement(zeroDimOriginBadgeRectEdge);
    expect(placement).toBeNull();
  });

  it("strictly suppresses (returns null) for negative dimension badgeRect", () => {
    const negativeDimBadgeRectEdge: PositionedEdge = {
      id: "negative-dim-rect",
      source: "n1",
      target: "n2",
      path: "",
      badgeRect: { x: 100, y: 100, width: -80, height: -26 },
    };

    const placement = resolveSafeBadgePlacement(negativeDimBadgeRectEdge);
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

    const negInfLabelEdge: PositionedEdge = {
      id: "neg-inf-label",
      source: "n1",
      target: "n2",
      path: "",
      labelX: Number.NEGATIVE_INFINITY,
      labelY: 50,
    };
    expect(resolveSafeBadgePlacement(negInfLabelEdge)).toBeNull();
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

describe("GraphBadgeLayer Native HTML Rendering & Anti-Smear", () => {
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

  it("strictly suppresses rendering for comprehensive list of ghost edges with (0,0) and zero polyline length", () => {
    const ghostEdges: PositionedEdge[] = [
      {
        id: "ghost-zero-coords",
        source: "n1",
        target: "n2",
        path: "",
        label: "Zero Coords",
        labelX: 0,
        labelY: 0,
      },
      {
        id: "ghost-zero-polyline-2pt",
        source: "n1",
        target: "n2",
        path: "",
        label: "Zero Length 2pt",
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
      {
        id: "ghost-zero-polyline-3pt",
        source: "n1",
        target: "n2",
        path: "",
        label: "Zero Length 3pt",
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
      {
        id: "ghost-empty-points",
        source: "n1",
        target: "n2",
        path: "",
        label: "Empty Points",
        points: [],
      },
      {
        id: "ghost-unpositioned",
        source: "n1",
        target: "n2",
        path: "",
        label: "Unpositioned",
      },
      {
        id: "ghost-origin-badgerect",
        source: "n1",
        target: "n2",
        path: "",
        label: "Origin BadgeRect",
        badgeRect: { x: 0, y: 0, width: 80, height: 26 },
      },
    ];

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: ghostEdges,
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

  it("strictly renders ONLY valid non-zero edges when mixed with ghost and zero-length polyline edges", () => {
    const mixedEdges: PositionedEdge[] = [
      {
        id: "ghost-1",
        source: "n1",
        target: "n2",
        path: "",
        label: "Ghost 1",
        labelX: 0,
        labelY: 0,
      },
      {
        id: "valid-edge-1",
        source: "n1",
        target: "n2",
        path: "M 100 100 L 300 100",
        label: "Valid Edge 1",
        labelX: 200,
        labelY: 100,
      },
      {
        id: "ghost-2",
        source: "n1",
        target: "n2",
        path: "",
        label: "Ghost 2",
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
      {
        id: "valid-edge-2",
        source: "n1",
        target: "n2",
        path: "M 200 200 L 400 400",
        label: "Valid Edge 2",
        badgeRect: { x: 260, y: 287, width: 80, height: 26 },
      },
      {
        id: "ghost-3",
        source: "n1",
        target: "n2",
        path: "",
        badgeRect: { x: 0, y: 0, width: 80, height: 26 },
      },
    ];

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: mixedEdges,
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const root = renderer?.root;
    const badgeElements = root?.findAll(
      (el) =>
        el.type === "div" &&
        typeof el.props.className === "string" &&
        el.props.className.includes("graph-edge-badge-html"),
    );

    expect(badgeElements).toHaveLength(2);

    const labels = badgeElements?.map((el) => {
      const labelSpan = el.find(
        (child) =>
          child.type === "span" &&
          typeof child.props.className === "string" &&
          child.props.className.includes("edge-badge-label"),
      );
      return labelSpan?.props.children;
    });

    expect(labels).toContain("Valid Edge 1");
    expect(labels).toContain("Valid Edge 2");
    renderer?.unmount();
  });

  it("renders badge as a native HTML element with hardware-accelerated translate3d transform", () => {
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
    const badgeElement = root?.find(
      (el) =>
        el.type === "div" &&
        typeof el.props.className === "string" &&
        el.props.className.includes("graph-edge-badge-html"),
    );
    expect(badgeElement).toBeDefined();
    expect(badgeElement?.props.style?.transform).toBe(
      "translate3d(calc(200px - 50%), calc(200px - 50%), 0)",
    );
    expect(badgeElement?.props.style?.willChange).toBe("transform");
    expect(badgeElement?.props.style?.pointerEvents).toBe("auto");
    expect(badgeElement?.props.style?.position).toBe("absolute");
    renderer?.unmount();
  });

  it("strictly suppresses (0 DOM elements) for origin-crossing polyline whose midpoint is (0, 0)", () => {
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
    const tree = renderer?.toJSON();
    if (tree && typeof tree === "object" && "children" in tree) {
      expect(tree.children).toBeNull();
    }
    renderer?.unmount();
  });

  it("contains zero foreignObject elements across the entire badge tree to eliminate GPU compositor smearing", () => {
    const edge: PositionedEdge = {
      id: "edge-no-foreign-object",
      source: "n1",
      target: "n2",
      path: "M 50 50 L 300 300",
      label: "Clean Native Badge",
      labelX: 175,
      labelY: 175,
      badge: { text: "Badge Text" },
      stepNumber: 1,
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [edge],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    const root = renderer?.root;
    const foreignObjects = root?.findAllByType("foreignObject" as unknown as React.ComponentType);
    expect(foreignObjects).toHaveLength(0);
    renderer?.unmount();
  });

  it("colours the HTML badge from the edge's own kind, never from the source node", () => {
    const edge: PositionedEdge = {
      id: "accent-edge",
      source: "prompt-node",
      target: "worker-node",
      kind: "pushback",
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
    const badgeElement = root?.find(
      (el) =>
        el.type === "div" &&
        typeof el.props.className === "string" &&
        el.props.className.includes("graph-edge-badge-html"),
    );
    expect(badgeElement).toBeDefined();
    // The input node's accent is #8b5cf6; a pushback edge must still read as a pushback.
    expect(badgeElement?.props.style?.["--edge-kind-stroke"]).toBe("#f43f5e");
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

  it("renders leader line in SVG overlay when displaced badge is present", () => {
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
    const badgeElement = root?.find(
      (el) =>
        el.type === "div" &&
        typeof el.props.className === "string" &&
        el.props.className.includes("graph-edge-badge-html"),
    );
    expect(badgeElement).toBeDefined();
    expect(badgeElement?.props.style?.transform).toBe(
      "translate3d(calc(250px - 50%), calc(200px - 50%), 0)",
    );

    const line = root?.find((el) => el.type === "line");
    expect(line).toBeDefined();
    expect(line?.props.x1).toBe(100);
    expect(line?.props.y1).toBe(100);
    expect(line?.props.x2).toBe(250);
    expect(line?.props.y2).toBe(200);
    renderer?.unmount();
  });

  it("renders leader path in SVG overlay when routed displaced points exist", () => {
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
    expect(path?.props.d).toBe("M 50 50 L 150 100 L 250 200");
    renderer?.unmount();
  });
});

describe("Interactive Event Handling & Accessibility Semantics", () => {
  it("propagates onSelectEdge with edgeId and sourceNodeId on click", () => {
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
    const badgeElement = root?.find(
      (el) =>
        el.type === "div" &&
        typeof el.props.className === "string" &&
        el.props.className.includes("graph-edge-badge-html"),
    );
    expect(badgeElement).toBeDefined();

    act(() => {
      badgeElement?.props.onClick({ stopPropagation: () => {} });
    });

    expect(selectedEdgeId).toBe("clickable-edge");
    expect(selectedSourceNode).toBe("src-1");
    renderer?.unmount();
  });

  it("handles keyboard Enter and Space / Spacebar activation for full accessibility", () => {
    const activations: Array<{ edgeId: string; sourceId?: string }> = [];

    const edge: PositionedEdge = {
      id: "kb-edge-a11y",
      source: "src-keyboard",
      target: "tgt-keyboard",
      path: "M 0 0 L 200 200",
      label: "Keyboard Nav Action",
      labelX: 120,
      labelY: 120,
      stepNumber: 3,
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
              activations.push({ edgeId, sourceId });
            },
          }),
        );
      });
    });

    const root = renderer?.root;
    const badgeElement = root?.find(
      (el) =>
        el.type === "div" &&
        typeof el.props.className === "string" &&
        el.props.className.includes("graph-edge-badge-html"),
    );
    expect(badgeElement).toBeDefined();
    expect(badgeElement?.props.role).toBe("button");
    expect(badgeElement?.props.tabIndex).toBe(0);
    expect(badgeElement?.props["aria-label"]).toBe("Edge 3: Keyboard Nav Action");

    // Test Enter key
    act(() => {
      badgeElement?.props.onKeyDown({
        key: "Enter",
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });

    // Test Space key
    act(() => {
      badgeElement?.props.onKeyDown({
        key: " ",
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });

    // Test Spacebar legacy key
    act(() => {
      badgeElement?.props.onKeyDown({
        key: "Spacebar",
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });

    expect(activations).toHaveLength(3);
    expect(activations[0]).toEqual({ edgeId: "kb-edge-a11y", sourceId: "src-keyboard" });
    expect(activations[1]).toEqual({ edgeId: "kb-edge-a11y", sourceId: "src-keyboard" });
    expect(activations[2]).toEqual({ edgeId: "kb-edge-a11y", sourceId: "src-keyboard" });
    renderer?.unmount();
  });

  it("omits interactive button semantics when onSelectEdge is not wired and badge is not clickable", () => {
    const edge: PositionedEdge = {
      id: "passive-edge",
      source: "src-1",
      target: "tgt-1",
      path: "M 0 0 L 200 200",
      label: "Read Only Badge",
      labelX: 100,
      labelY: 100,
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [edge],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
            // onSelectEdge omitted
          }),
        );
      });
    });

    const root = renderer?.root;
    const badgeElement = root?.find(
      (el) =>
        el.type === "div" &&
        typeof el.props.className === "string" &&
        el.props.className.includes("graph-edge-badge-html"),
    );
    expect(badgeElement).toBeDefined();
    expect(badgeElement?.props.role).toBe(undefined);
    expect(badgeElement?.props.tabIndex).toBe(undefined);
    expect(badgeElement?.props.onClick).toBe(undefined);
    expect(badgeElement?.props.onKeyDown).toBe(undefined);
    renderer?.unmount();
  });
});

describe("GraphBadgeLayer GPU Hardware Acceleration & DOM Layer Separation", () => {
  it("enforces dedicated HTML container layer with zIndex: 10 and pointerEvents: none", () => {
    const edge: PositionedEdge = {
      id: "layer-sep-edge",
      source: "n1",
      target: "n2",
      path: "M 100 100 L 300 300",
      label: "Layer Isolation",
      labelX: 200,
      labelY: 200,
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [edge],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const root = renderer?.root;
    const container = root?.find(
      (el) =>
        el.type === "div" &&
        typeof el.props.className === "string" &&
        el.props.className === "graph-html-badge-layer",
    );
    expect(container).toBeDefined();
    expect(container?.props.style?.position).toBe("absolute");
    expect(container?.props.style?.inset).toBe(0);
    expect(container?.props.style?.pointerEvents).toBe("none");
    expect(container?.props.style?.zIndex).toBe(10);
    renderer?.unmount();
  });

  it("strictly validates translate3d, will-change, and pointer-events styling on all rendered badges", () => {
    const edges: PositionedEdge[] = [
      {
        id: "hw-edge-1",
        source: "n1",
        target: "n2",
        path: "M 50 50 L 150 150",
        label: "HW Badge 1",
        labelX: 100,
        labelY: 100,
      },
      {
        id: "hw-edge-2",
        source: "n2",
        target: "n3",
        path: "M 200 200 L 400 400",
        label: "HW Badge 2",
        badgeRect: { x: 260, y: 287, width: 80, height: 26 },
      },
    ];

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: edges,
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const root = renderer?.root;
    const badgeElements = root?.findAll(
      (el) =>
        el.type === "div" &&
        typeof el.props.className === "string" &&
        el.props.className.includes("graph-edge-badge-html"),
    );
    expect(badgeElements).toHaveLength(2);

    for (const badge of badgeElements!) {
      const style = badge.props.style;
      expect(style.position).toBe("absolute");
      expect(style.willChange).toBe("transform");
      expect(style.pointerEvents).toBe("auto");
      expect(typeof style.transform).toBe("string");
      expect(
        /^translate3d\(calc\(-?\d+(\.\d+)?px - 50%\), calc\(-?\d+(\.\d+)?px - 50%\), 0\)$/.test(
          String(style.transform),
        ),
      ).toBe(true);
    }
    renderer?.unmount();
  });

  it("isolates leader line SVG from interactive HTML badges and ensures leader overlay is non-blocking", () => {
    const edgeWithLeader: PositionedEdge = {
      id: "leader-iso-edge",
      source: "n1",
      target: "n2",
      path: "M 0 0 L 300 300",
      label: "Isolated Leader",
      badgeRect: { x: 200, y: 187, width: 100, height: 26 },
      anchorPoint: { x: 100, y: 100 },
    };

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphBadgeLayer, {
            positionedEdges: [edgeWithLeader],
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    expect(renderer).toBeDefined();
    const root = renderer?.root;
    const leaderSvg = root?.find(
      (el) =>
        el.type === "svg" &&
        typeof el.props.className === "string" &&
        el.props.className.includes("graph-badge-leader-lines"),
    );
    expect(leaderSvg).toBeDefined();
    expect(leaderSvg?.props.style?.position).toBe("absolute");
    expect(leaderSvg?.props.style?.pointerEvents).toBe("none");
    expect(leaderSvg?.props.style?.overflow).toBe("visible");
    renderer?.unmount();
  });
});

describe("GraphSvgLayer Component & Edge Styling", () => {
  it("gives each edge its own accent and wires onSelectEdge", () => {
    let selectedEdgeId: string | null = null;
    let selectedSourceNode: string | null = null;

    const edge: PositionedEdge = {
      id: "svg-edge-1",
      source: "gate-node",
      target: "worker-node",
      kind: "probe",
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
    // The gate node's accent is #10b981; the probe edge keeps its own informational cyan.
    expect(edgeGroup?.props.style?.["--edge-kind-stroke"]).toBe("#38bdf8");

    act(() => {
      edgeGroup?.props.onClick({ stopPropagation: () => {} });
    });

    expect(selectedEdgeId).toBe("svg-edge-1");
    expect(selectedSourceNode).toBe("gate-node");
    renderer?.unmount();
  });

  it("does not let two edges leaving the same node share a colour when their meanings differ", () => {
    const edges: PositionedEdge[] = [
      { id: "e-signoff", source: "gate-node", target: "a", kind: "signoff", path: "M 0 0 L 10 10" },
      {
        id: "e-pushback",
        source: "gate-node",
        target: "b",
        kind: "pushback",
        path: "M 0 0 L 20 20",
      },
    ];

    let renderer: ReactTestRenderer | undefined;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          createElement(GraphSvgLayer, {
            styledEdges: edges,
            hiddenNodeIds: new Set<string>(),
            selectedNodeId: null,
          }),
        );
      });
    });

    const groups = renderer?.root.findAll(
      (el) =>
        typeof el.props.className === "string" && el.props.className.includes("graph-edge-group"),
    );
    expect(groups).toHaveLength(2);
    const accents = groups?.map((g) => g.props.style?.["--edge-kind-stroke"]);
    expect(accents).toEqual(["#eab308", "#f43f5e"]);
    renderer?.unmount();
  });
});
