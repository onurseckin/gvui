import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Minimap } from "./Minimap";
import { MinimapClusterOutlines } from "./MinimapClusterOutlines";
import { MinimapDensityHeatmap } from "./MinimapDensityHeatmap";
import { MinimapHudControls } from "./MinimapHudControls";
import { MinimapFrustumOverlay } from "../../engine/GraphCanvas/MinimapFrustumOverlay";
import {
  calculateConnectedClusters,
  calculateConvexHull,
  calculateDensityGrid,
  calculateFrustumRect,
  calculateGraphBounds,
  calculateMinimapTransform,
  calculatePanFromFrustumDrag,
  calculatePanFromWorldCenter,
  clampPanOffset,
  expandPolygon,
  getDensityColor,
  minimapToWorld,
  polygonToSvgPath,
  worldToMinimap,
} from "./minimapMath";
import { useGraphStore } from "../../state/useGraphStore";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import type { MinimapBounds, MinimapDockPosition, Point2D } from "./types";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class MockCustomMouseEvent extends Event {
  clientX: number;
  clientY: number;
  constructor(type: string, init?: { clientX?: number; clientY?: number }) {
    super(type);
    this.clientX = init?.clientX ?? 0;
    this.clientY = init?.clientY ?? 0;
  }
}

if (typeof (globalThis as unknown as { MouseEvent?: unknown }).MouseEvent === "undefined") {
  (globalThis as unknown as { MouseEvent: unknown }).MouseEvent = MockCustomMouseEvent;
}

// Global filter for React 19 test renderer notices
const originalConsoleError = console.error;
console.error = (msg?: unknown, ...args: unknown[]) => {
  if (typeof msg === "string") {
    if (
      msg.includes("react-test-renderer is deprecated") ||
      msg.includes("not wrapped in act") ||
      msg.includes("inside a test was not wrapped in act") ||
      msg.includes("When testing, code that causes React state updates")
    ) {
      return;
    }
  }
  originalConsoleError(msg, ...args);
};

const testNodes: PositionedNode[] = [
  {
    id: "node-1",
    name: "Entry Controller",
    status: "success",
    kind: "orchestrator",
    x: 100,
    y: 100,
    width: 140,
    height: 70,
  },
  {
    id: "node-2",
    name: "Worker Agent",
    status: "running",
    kind: "agent",
    x: 350,
    y: 100,
    width: 140,
    height: 70,
  },
  {
    id: "node-3",
    name: "Validator Signoff",
    status: "error",
    kind: "critic",
    x: 600,
    y: 250,
    width: 140,
    height: 70,
  },
];

const testEdges: PositionedEdge[] = [
  {
    id: "edge-1-2",
    source: "node-1",
    target: "node-2",
    path: "M 240 135 L 350 135",
    points: [
      { x: 240, y: 135 },
      { x: 350, y: 135 },
    ],
  },
  {
    id: "edge-2-3",
    source: "node-2",
    target: "node-3",
    path: "M 490 135 L 600 285",
    points: [
      { x: 490, y: 135 },
      { x: 600, y: 285 },
    ],
  },
];

describe("Minimap Subsystem Tests", () => {
  const initialStoreState = useGraphStore.getState();

  beforeEach(() => {
    useGraphStore.setState(initialStoreState);
    useGraphStore.setState({
      positionedNodes: testNodes,
      positionedEdges: testEdges,
      zoomLevel: 1.0,
      panOffset: { x: 0, y: 0 },
      selectedNodeId: null,
    });
  });

  afterEach(() => {
    useGraphStore.setState(initialStoreState);
  });

  describe("Minimap Math & Geometry Utilities", () => {
    it("calculateGraphBounds returns fallback default for empty nodes", () => {
      const bounds = calculateGraphBounds([]);
      expect(bounds.minX).toBe(0);
      expect(bounds.minY).toBe(0);
      expect(bounds.maxX).toBe(1000);
      expect(bounds.maxY).toBe(800);
      expect(bounds.width).toBe(1000);
      expect(bounds.height).toBe(800);
    });

    it("calculateGraphBounds calculates correct bounding box for multiple nodes", () => {
      const bounds = calculateGraphBounds(testNodes);
      expect(bounds.minX).toBe(100);
      expect(bounds.minY).toBe(100);
      expect(bounds.maxX).toBe(600 + 140); // 740
      expect(bounds.maxY).toBe(250 + 70); // 320
      expect(bounds.width).toBe(640);
      expect(bounds.height).toBe(220);
    });

    it("calculateGraphBounds handles edge labels and path points", () => {
      const bounds = calculateGraphBounds(testNodes, [
        {
          id: "e-ext",
          source: "node-1",
          target: "node-2",
          path: "M 0 0",
          points: [{ x: 50, y: 50 }],
          labelX: 850,
          labelY: 450,
        },
      ]);
      expect(bounds.minX).toBe(50);
      expect(bounds.minY).toBe(50);
      expect(bounds.maxX).toBeGreaterThanOrEqual(850);
      expect(bounds.maxY).toBeGreaterThanOrEqual(450);
    });

    it("calculateGraphBounds handles zero-size and non-finite coords safely", () => {
      const singleNode: PositionedNode[] = [
        { id: "n-zero", name: "Zero", x: 200, y: 200, width: 0, height: 0 },
      ];
      const bounds = calculateGraphBounds(singleNode);
      expect(bounds.minX).toBe(200);
      expect(bounds.minY).toBe(200);
      expect(bounds.width).toBeGreaterThanOrEqual(100);
      expect(bounds.height).toBeGreaterThanOrEqual(60);
    });

    it("calculateMinimapTransform creates uniform scale and offsets preserving aspect ratio", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 500,
        width: 1000,
        height: 500,
      };
      const transform = calculateMinimapTransform(bounds, 240, 160, 0);

      expect(transform.minimapWidth).toBe(240);
      expect(transform.minimapHeight).toBe(160);
      expect(transform.scale).toBeCloseTo(240 / 1000, 4); // Scale limited by width
      expect(transform.offsetX).toBeCloseTo(0, 4);
      expect(transform.offsetY).toBeGreaterThan(0); // Centered vertically
    });

    it("worldToMinimap and minimapToWorld are exact inverse transformations", () => {
      const bounds: MinimapBounds = {
        minX: 100,
        minY: 200,
        maxX: 900,
        maxY: 600,
        width: 800,
        height: 400,
      };
      const transform = calculateMinimapTransform(bounds, 260, 170, 40);

      const worldPoints: Point2D[] = [
        { x: 100, y: 200 },
        { x: 500, y: 400 },
        { x: 900, y: 600 },
        { x: -50, y: 750 },
      ];

      for (const pt of worldPoints) {
        const minimapPt = worldToMinimap(pt.x, pt.y, transform);
        const roundtripPt = minimapToWorld(minimapPt.x, minimapPt.y, transform);
        expect(roundtripPt.x).toBeCloseTo(pt.x, 3);
        expect(roundtripPt.y).toBeCloseTo(pt.y, 3);
      }
    });

    it("calculateFrustumRect converts viewport dimensions and pan/zoom to minimap coordinates", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 800,
        width: 1000,
        height: 800,
      };
      const transform = calculateMinimapTransform(bounds, 200, 160, 0);

      const frustum = calculateFrustumRect(800, 600, { x: -100, y: -50 }, 1.0, transform);
      expect(frustum.worldLeft).toBe(100);
      expect(frustum.worldTop).toBe(50);
      expect(frustum.worldWidth).toBe(800);
      expect(frustum.worldHeight).toBe(600);
      expect(frustum.width).toBeCloseTo(800 * transform.scale, 2);
      expect(frustum.height).toBeCloseTo(600 * transform.scale, 2);
    });

    it("calculateFrustumRect handles extreme zoom levels safely", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 800,
        width: 1000,
        height: 800,
      };
      const transform = calculateMinimapTransform(bounds, 200, 160, 0);

      const hugeZoom = calculateFrustumRect(800, 600, { x: 0, y: 0 }, 5.0, transform);
      expect(hugeZoom.worldWidth).toBe(800 / 5.0);
      expect(hugeZoom.width).toBeCloseTo((800 / 5.0) * transform.scale, 2);

      const tinyZoom = calculateFrustumRect(800, 600, { x: 0, y: 0 }, 0.1, transform);
      expect(tinyZoom.worldWidth).toBe(800 / 0.1);
      expect(tinyZoom.width).toBeCloseTo((800 / 0.1) * transform.scale, 2);

      const zeroZoom = calculateFrustumRect(800, 600, { x: 0, y: 0 }, 0, transform);
      expect(Number.isFinite(zeroZoom.width)).toBe(true);
    });

    it("clampPanOffset confines world viewport center within allowable graph region", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 800,
        width: 1000,
        height: 800,
      };
      const clamped = clampPanOffset({ x: -50000, y: -50000 }, bounds, 1000, 800, 1.0, 800);
      // Center cannot exceed bounds.maxX + maxOverscroll (1800)
      const centerX = 1000 / 2 - clamped.x;
      const centerY = 800 / 2 - clamped.y;
      expect(centerX).toBeLessThanOrEqual(1800);
      expect(centerY).toBeLessThanOrEqual(1600);
    });

    it("calculatePanFromWorldCenter computes exact pan offset to center on target", () => {
      const pan = calculatePanFromWorldCenter(500, 400, 1000, 800, 1.0);
      expect(pan.x).toBe(1000 / 2 - 500); // 0
      expect(pan.y).toBe(800 / 2 - 400); // 0

      const panZoomed = calculatePanFromWorldCenter(500, 400, 1000, 800, 2.0);
      expect(panZoomed.x).toBe(500 - 500 * 2.0); // -500
      expect(panZoomed.y).toBe(400 - 400 * 2.0); // -400
    });

    it("calculatePanFromFrustumDrag calculates pan offset translation during drag", () => {
      const initialPan = { x: 0, y: 0 };
      const scale = 0.25;
      const zoomLevel = 1.0;

      // Dragging frustum +25px on minimap should pan canvas -100px in world
      const newPan = calculatePanFromFrustumDrag(initialPan, 25, 25, scale, zoomLevel);
      expect(newPan.x).toBe(-100);
      expect(newPan.y).toBe(-100);
    });

    it("getDensityColor provides gradient colors based on density threshold", () => {
      expect(getDensityColor(0)).toBe("rgba(0, 0, 0, 0)");
      expect(getDensityColor(0.2)).toContain("rgba(56, 189, 248"); // Sky
      expect(getDensityColor(0.4)).toContain("rgba(16, 185, 129"); // Emerald
      expect(getDensityColor(0.65)).toContain("rgba(245, 158, 11"); // Amber
      expect(getDensityColor(0.9)).toContain("rgba(239, 68, 68"); // Red
    });

    it("calculateDensityGrid distributes nodes across 2D spatial cells", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 800,
        width: 1000,
        height: 800,
      };
      const grid = calculateDensityGrid(testNodes, bounds, 4, 4);

      expect(grid.cols).toBe(4);
      expect(grid.rows).toBe(4);
      expect(grid.cells.length).toBe(16);
      expect(grid.maxCount).toBeGreaterThan(0);

      // Verify empty nodes case
      const emptyGrid = calculateDensityGrid([], bounds, 4, 4);
      expect(emptyGrid.maxCount).toBe(0);
    });

    it("calculateConvexHull computes correct 2D outer boundary", () => {
      // Degenerate cases
      expect(calculateConvexHull([])).toEqual([]);
      expect(calculateConvexHull([{ x: 10, y: 10 }])).toEqual([{ x: 10, y: 10 }]);

      // Square with interior point
      const squarePoints: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 50, y: 50 }, // Interior point
      ];
      const hull = calculateConvexHull(squarePoints);
      expect(hull.length).toBe(4);
      expect(hull.some((p) => p.x === 50 && p.y === 50)).toBe(false);
    });

    it("expandPolygon and polygonToSvgPath generate valid boundary paths", () => {
      const hull: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const expanded = expandPolygon(hull, 10);
      expect(expanded.length).toBe(4);

      const pathString = polygonToSvgPath(expanded);
      expect(pathString.startsWith("M ")).toBe(true);
      expect(pathString.endsWith(" Z")).toBe(true);

      // Handles 0, 1, 2 points
      expect(polygonToSvgPath([])).toBe("");
      expect(expandPolygon([], 10)).toEqual([]);
      expect(expandPolygon([{ x: 0, y: 0 }], 10).length).toBe(4);
      expect(
        expandPolygon(
          [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
          10,
        ).length,
      ).toBe(4);
    });

    it("calculateConnectedClusters detects connected components and section groups", () => {
      const clusters = calculateConnectedClusters(testNodes, testEdges);
      expect(clusters.length).toBeGreaterThanOrEqual(1);

      // Test explicit sectionId
      const sectionNodes: PositionedNode[] = [
        { id: "s1", name: "Sec1", sectionId: "sec-a", x: 0, y: 0, width: 100, height: 50 },
        { id: "s2", name: "Sec2", sectionId: "sec-a", x: 150, y: 0, width: 100, height: 50 },
        { id: "s3", name: "Sec3", sectionId: "sec-b", x: 400, y: 0, width: 100, height: 50 },
      ];
      const sectionClusters = calculateConnectedClusters(sectionNodes);
      expect(sectionClusters.length).toBe(2);
      expect(sectionClusters.some((c) => c.id === "sec-a")).toBe(true);
      expect(sectionClusters.some((c) => c.id === "sec-b")).toBe(true);
    });
  });

  describe("Adversarial Stress Tests", () => {
    it("guarantees safe handling of zero-dimension and negative viewport inputs", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 500,
        maxY: 400,
        width: 500,
        height: 400,
      };

      // Zero and negative minimap transform inputs
      const zeroTransform = calculateMinimapTransform(bounds, 0, 0);
      expect(zeroTransform.scale).toBeGreaterThan(0);
      expect(Number.isFinite(zeroTransform.scale)).toBe(true);

      const negativeTransform = calculateMinimapTransform(bounds, -200, -150);
      expect(negativeTransform.scale).toBeGreaterThan(0);
      expect(Number.isFinite(negativeTransform.scale)).toBe(true);

      // Zero-dimension viewport in frustum calculation
      const zeroFrustum = calculateFrustumRect(0, 0, { x: 0, y: 0 }, 1.0, zeroTransform);
      expect(zeroFrustum.width).toBeGreaterThanOrEqual(1);
      expect(zeroFrustum.height).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(zeroFrustum.x)).toBe(true);
      expect(Number.isFinite(zeroFrustum.y)).toBe(true);

      // Zero-dimension viewport in pan centering & clamping
      const panZero = calculatePanFromWorldCenter(250, 200, 0, 0, 1.0, bounds);
      expect(Number.isFinite(panZero.x)).toBe(true);
      expect(Number.isFinite(panZero.y)).toBe(true);
    });

    it("clamps extreme zoom levels and wild coordinates strictly within finite ranges", () => {
      const bounds: MinimapBounds = {
        minX: -1000,
        minY: -1000,
        maxX: 1000,
        maxY: 1000,
        width: 2000,
        height: 2000,
      };
      const transform = calculateMinimapTransform(bounds, 260, 170);

      // Micro zoom (1e-7) and macro zoom (1e7)
      const microFrustum = calculateFrustumRect(1000, 800, { x: 0, y: 0 }, 1e-7, transform);
      expect(Number.isFinite(microFrustum.width)).toBe(true);
      expect(Number.isFinite(microFrustum.height)).toBe(true);

      const macroFrustum = calculateFrustumRect(1000, 800, { x: 0, y: 0 }, 1e7, transform);
      expect(Number.isFinite(macroFrustum.width)).toBe(true);
      expect(Number.isFinite(macroFrustum.height)).toBe(true);

      // Clamping wild pan offset (1e12)
      const clampedWildPan = clampPanOffset({ x: 1e12, y: -1e12 }, bounds, 1000, 800, 1.0, 500);
      expect(Number.isFinite(clampedWildPan.x)).toBe(true);
      expect(Number.isFinite(clampedWildPan.y)).toBe(true);

      // Frustum drag with non-finite parameters
      const safeDrag = calculatePanFromFrustumDrag({ x: 0, y: 0 }, Number.NaN, Infinity, 0, 1.0);
      expect(Number.isFinite(safeDrag.x)).toBe(true);
      expect(Number.isFinite(safeDrag.y)).toBe(true);
    });

    it("accurately normalizes density grid when 100 nodes are collocated at the exact same point", () => {
      const collocatedNodes: PositionedNode[] = Array.from({ length: 100 }, (_, i) => ({
        id: `collocated-node-${i}`,
        name: `Collocated ${i}`,
        x: 250,
        y: 250,
        width: 100,
        height: 50,
      }));

      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 1000,
        width: 1000,
        height: 1000,
      };

      const densityGrid = calculateDensityGrid(collocatedNodes, bounds, 10, 10);
      expect(densityGrid.maxCount).toBe(100);

      // Exactly 1 cell should have count 100 and density 1.0
      const congestedCell = densityGrid.cells.find((c) => c.count === 100);
      expect(congestedCell).toBeDefined();
      expect(congestedCell!.density).toBe(1.0);
      expect(congestedCell!.color).toContain("rgba(239, 68, 68"); // Crimson red

      // All other cells should have density 0.0
      const emptyCells = densityGrid.cells.filter((c) => c.count === 0);
      expect(emptyCells.length).toBe(99);
      for (const cell of emptyCells) {
        expect(cell.density).toBe(0.0);
        expect(cell.color).toBe("rgba(0, 0, 0, 0)");
      }
    });
  });

  describe("MinimapFrustumOverlay Component", () => {
    it("renders frustum rectangle and corner accent indicators", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 800,
        width: 1000,
        height: 800,
      };
      const transform = calculateMinimapTransform(bounds, 260, 170, 40);
      const frustum = calculateFrustumRect(1000, 800, { x: 0, y: 0 }, 1.0, transform);

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <svg>
            <MinimapFrustumOverlay
              frustumRect={frustum}
              transform={transform}
              zoomLevel={1.0}
              panOffset={{ x: 0, y: 0 }}
              viewportWidth={1000}
              viewportHeight={800}
              bounds={bounds}
            />
          </svg>,
        );
      });

      const root = renderer!.root;
      const overlay = root.findByProps({ "data-testid": "minimap-frustum" });
      expect(overlay).toBeDefined();

      const rect = root.findByProps({ className: "minimap-frustum-rect" });
      expect(rect).toBeDefined();
      expect(rect.props.width).toBeCloseTo(frustum.width, 1);
    });

    it("triggers pan changes on frustum mouse drag events", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 800,
        width: 1000,
        height: 800,
      };
      const transform = calculateMinimapTransform(bounds, 260, 170, 40);
      const frustum = calculateFrustumRect(1000, 800, { x: 0, y: 0 }, 1.0, transform);

      let updatedPan: Point2D | null = null;

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <svg>
            <MinimapFrustumOverlay
              frustumRect={frustum}
              transform={transform}
              zoomLevel={1.0}
              panOffset={{ x: 0, y: 0 }}
              viewportWidth={1000}
              viewportHeight={800}
              bounds={bounds}
              onPanChange={(p) => {
                updatedPan = p;
              }}
            />
          </svg>,
        );
      });

      const root = renderer!.root;
      const overlay = root.findByProps({ "data-testid": "minimap-frustum" });

      // Simulate mousedown
      act(() => {
        overlay.props.onMouseDown({
          button: 0,
          clientX: 100,
          clientY: 100,
          preventDefault: () => {},
          stopPropagation: () => {},
        });
      });

      // Simulate window mousemove
      act(() => {
        const mouseMoveEvt = new MockCustomMouseEvent("mousemove", {
          clientX: 130,
          clientY: 120,
        });
        window.dispatchEvent(mouseMoveEvt);
      });

      expect(updatedPan).not.toBeNull();

      // Simulate mouseup
      act(() => {
        const mouseUpEvt = new MockCustomMouseEvent("mouseup");
        window.dispatchEvent(mouseUpEvt);
      });
    });

    it("ignores non-interactive or non-left-click mouse events", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 800,
        width: 1000,
        height: 800,
      };
      const transform = calculateMinimapTransform(bounds, 260, 170, 40);
      const frustum = calculateFrustumRect(1000, 800, { x: 0, y: 0 }, 1.0, transform);

      let panChanged = false;
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <svg>
            <MinimapFrustumOverlay
              frustumRect={frustum}
              transform={transform}
              zoomLevel={1.0}
              panOffset={{ x: 0, y: 0 }}
              viewportWidth={1000}
              viewportHeight={800}
              bounds={bounds}
              interactive={false}
              onPanChange={() => {
                panChanged = true;
              }}
            />
          </svg>,
        );
      });

      const root = renderer!.root;
      const overlay = root.findByProps({ "data-testid": "minimap-frustum" });

      // Secondary mouse click
      act(() => {
        overlay.props.onMouseDown({
          button: 2,
          clientX: 100,
          clientY: 100,
        });
      });

      expect(panChanged).toBe(false);
    });
  });

  describe("MinimapDensityHeatmap Component", () => {
    it("renders heatmap layers when visible", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 800,
        width: 1000,
        height: 800,
      };
      const transform = calculateMinimapTransform(bounds, 260, 170, 40);
      const grid = calculateDensityGrid(testNodes, bounds, 4, 4);

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <svg>
            <MinimapDensityHeatmap densityGrid={grid} transform={transform} visible={true} />
          </svg>,
        );
      });

      const root = renderer!.root;
      const heatmap = root.findByProps({ "data-testid": "minimap-density-heatmap" });
      expect(heatmap).toBeDefined();
    });

    it("returns null when invisible or empty", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 800,
        width: 1000,
        height: 800,
      };
      const transform = calculateMinimapTransform(bounds, 260, 170, 40);
      const grid = calculateDensityGrid([], bounds, 4, 4);

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <MinimapDensityHeatmap densityGrid={grid} transform={transform} visible={false} />,
        );
      });

      expect((renderer as ReactTestRenderer | null)?.toJSON()).toBeNull();
    });
  });

  describe("MinimapClusterOutlines Component", () => {
    it("renders cluster polygons and labels when visible", () => {
      const bounds: MinimapBounds = {
        minX: 0,
        minY: 0,
        maxX: 1000,
        maxY: 800,
        width: 1000,
        height: 800,
      };
      const transform = calculateMinimapTransform(bounds, 260, 170, 40);
      const clusters = calculateConnectedClusters(testNodes, testEdges);

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <svg>
            <MinimapClusterOutlines clusters={clusters} transform={transform} visible={true} />
          </svg>,
        );
      });

      const root = renderer!.root;
      const clusterGroup = root.findByProps({ "data-testid": "minimap-cluster-outlines" });
      expect(clusterGroup).toBeDefined();
    });
  });

  describe("MinimapHudControls Component", () => {
    it("handles docking change, opacity change, layer toggles, and fast zoom", () => {
      let currentDock: MinimapDockPosition = "bottom-right";
      let currentOpacity = 0.9;
      let heatmapToggled = false;
      let clustersToggled = false;
      let zoomInCalled = false;
      let zoomOutCalled = false;
      let resetCalled = false;

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <MinimapHudControls
            dockPosition={currentDock}
            onDockChange={(d) => {
              currentDock = d;
            }}
            opacity={currentOpacity}
            onOpacityChange={(op) => {
              currentOpacity = op;
            }}
            showHeatmap={false}
            onToggleHeatmap={() => {
              heatmapToggled = true;
            }}
            showClusters={true}
            onToggleClusters={() => {
              clustersToggled = true;
            }}
            isCollapsed={false}
            onToggleCollapsed={() => {}}
            zoomLevel={1.5}
            onZoomIn={() => {
              zoomInCalled = true;
            }}
            onZoomOut={() => {
              zoomOutCalled = true;
            }}
            onResetView={() => {
              resetCalled = true;
            }}
          />,
        );
      });

      const root = renderer!.root;

      // Verify zoom badge
      const badge = root.findByProps({ className: "minimap-zoom-badge" });
      expect(badge.props.children).toBe("150%");

      // Toggle heatmap
      const heatmapBtn = root.findByProps({ "aria-label": "Show density heatmap" });
      act(() => {
        heatmapBtn.props.onClick();
      });
      expect(heatmapToggled).toBe(true);

      // Toggle clusters
      const clusterBtn = root.findByProps({ "aria-label": "Hide cluster boundaries" });
      act(() => {
        clusterBtn.props.onClick();
      });
      expect(clustersToggled).toBe(true);

      // Zoom In & Out
      const zoomInBtn = root.findByProps({ "aria-label": "Zoom In" });
      act(() => {
        zoomInBtn.props.onClick();
      });
      expect(zoomInCalled).toBe(true);

      const zoomOutBtn = root.findByProps({ "aria-label": "Zoom Out" });
      act(() => {
        zoomOutBtn.props.onClick();
      });
      expect(zoomOutCalled).toBe(true);

      const resetBtn = root.findByProps({ "aria-label": "Reset View" });
      act(() => {
        resetBtn.props.onClick();
      });
      expect(resetCalled).toBe(true);

      // Open settings tray
      const settingsBtn = root.findByProps({ "aria-label": "Minimap Settings" });
      act(() => {
        settingsBtn.props.onClick();
      });

      // Select top-left dock
      const tlBtn = root.findByProps({ title: "Top Left" });
      act(() => {
        tlBtn.props.onClick();
      });
      expect(currentDock).toBe("top-left");

      // Adjust opacity slider
      const slider = root.findByProps({ "aria-label": "Minimap Opacity" });
      act(() => {
        slider.props.onChange({ target: { value: "0.6" } });
      });
      expect(currentOpacity).toBe(0.6);
    });
  });

  describe("Minimap Component Full Integration", () => {
    it("renders full minimap container in default bottom-right position", () => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<Minimap />);
      });

      const root = renderer!.root;
      const container = root.findByProps({ "data-testid": "minimap-container" });
      expect(container).toBeDefined();
      expect(container.props.className).toContain("dock-bottom-right");

      // Node cards rendered on minimap
      expect(root.findByProps({ "data-testid": "minimap-node-node-1" })).toBeDefined();
      expect(root.findByProps({ "data-testid": "minimap-node-node-2" })).toBeDefined();
      expect(root.findByProps({ "data-testid": "minimap-node-node-3" })).toBeDefined();
    });

    it("supports click-to-center navigation on minimap background", () => {
      let navigatedWorldX: number | null = null;
      let navigatedWorldY: number | null = null;

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <Minimap
            viewportWidth={1000}
            viewportHeight={800}
            onNavigate={(x, y) => {
              navigatedWorldX = x;
              navigatedWorldY = y;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const svg = root.findByProps({ "data-testid": "minimap-svg" });

      // Click on center of SVG
      act(() => {
        svg.props.onClick({
          target: { closest: () => null },
          clientX: 130,
          clientY: 85,
        });
      });

      expect(navigatedWorldX).not.toBeNull();
      expect(navigatedWorldY).not.toBeNull();
    });

    it("can collapse and expand the minimap", () => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<Minimap defaultCollapsed={false} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "minimap-viewport-wrapper" })).toBeDefined();

      // Click collapse
      const collapseBtn = root.findByProps({ "aria-label": "Collapse Minimap" });
      act(() => {
        collapseBtn.props.onClick();
      });

      // Viewport wrapper hidden in collapsed state
      const container = root.findByProps({ "data-testid": "minimap-container" });
      expect(container.props.className).toContain("is-collapsed");
    });

    it("supports custom dimensions and dock positioning", () => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <Minimap width={320} height={200} dockPosition="top-left" opacity={0.8} />,
        );
      });

      const root = renderer!.root;
      const container = root.findByProps({ "data-testid": "minimap-container" });
      expect(container.props.className).toContain("dock-top-left");
      expect(container.props.style.width).toBe(320);
      expect(container.props.style.opacity).toBe(0.8);
    });

    it("handles huge graphs (1000 nodes) without crashing", () => {
      const hugeNodes: PositionedNode[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `node-${i}`,
        name: `Node ${i}`,
        x: (i % 50) * 120,
        y: Math.floor(i / 50) * 80,
        width: 100,
        height: 50,
      }));

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<Minimap nodes={hugeNodes} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "minimap-container" })).toBeDefined();
    });
  });
});
