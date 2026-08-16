import { describe, expect, it } from "bun:test";
import type { GraphDataset, PositionedNode } from "../../types/graphData";
import type { CanvasAnnotation } from "../../components/CanvasAnnotations/types";
import {
  BUNDLE_SCHEMA_VERSION,
  computeBundleChecksum,
  createBookmarkPack,
  isValidSemVer,
  parseBookmarkPack,
  serializeBookmarkPack,
  validateBookmarkPack,
  validateBundleChecksum,
} from "./bundlePack";
import {
  dotEscape,
  exportSubgraph,
  exportToGraphDatasetJson,
  exportToGraphvizDot,
  exportToJsonBundle,
  exportToMarkdownReport,
  exportToMermaid,
  sanitizeDotId,
  sanitizeMermaidId,
  sanitizeMermaidText,
} from "./exportFormats";
import {
  computePolygonBounds,
  computeTransitiveClosure,
  doesRectIntersectPolygon,
  doSegmentsIntersect,
  extractSubgraph,
  isNodeInPolygon,
  isPointInPolygon,
  isPointInRect,
} from "./extractSubgraph";
import type { ExportConfig, ExtractedSubgraph, Point, Rect } from "./types";

const mockDataset: GraphDataset = {
  id: "pipeline-main",
  title: "Multi-Agent Orchestration Workflow",
  description: "End-to-end multi-agent coding system",
  sections: [
    {
      id: "sec-planning",
      title: "Planning & Architecture",
      nodeIds: ["plan-01", "arch-01"],
    },
    {
      id: "sec-execution",
      title: "Worker Execution",
      nodeIds: ["worker-01", "worker-02", "tool-01"],
    },
    {
      id: "sec-validation",
      title: "Audit & Gatekeeping",
      nodeIds: ["gate-01", "audit-01"],
    },
  ],
  nodes: [
    {
      id: "plan-01",
      name: "Coordinator Planner",
      kind: "orchestrator",
      status: "success",
      metrics: { tokensIn: 1000, tokensOut: 500, durationMs: 1200, costUsd: 0.02 },
      description: "Dispatches tasks to workers",
    },
    {
      id: "arch-01",
      name: "System Architect",
      kind: "agent",
      status: "success",
      metrics: { tokensIn: 2000, tokensOut: 800, durationMs: 2500, costUsd: 0.04 },
      description: "Generates design specifications",
    },
    {
      id: "worker-01",
      name: "Frontend Implementer",
      kind: "agent",
      status: "running",
      metrics: { tokensIn: 3000, tokensOut: 1500, durationMs: 4000, costUsd: 0.06 },
      description: "Implements React UI components",
    },
    {
      id: "worker-02",
      name: "Backend Implementer",
      kind: "agent",
      status: "success",
      metrics: { tokensIn: 2500, tokensOut: 1200, durationMs: 3200, costUsd: 0.05 },
      description: "Implements engine algorithms",
    },
    {
      id: "tool-01",
      name: "Linter & Formatter Tool",
      kind: "tool",
      status: "success",
      metrics: { tokensIn: 400, tokensOut: 100, durationMs: 300, costUsd: 0.005 },
      description: "Runs code checks",
    },
    {
      id: "gate-01",
      name: "Validation Gate",
      kind: "gate",
      status: "warning",
      metrics: { tokensIn: 800, tokensOut: 300, durationMs: 900, costUsd: 0.01 },
      description: "Quality gate for submissions",
    },
    {
      id: "audit-01",
      name: "Security Critic",
      kind: "critic",
      status: "error",
      metrics: { tokensIn: 1500, tokensOut: 600, durationMs: 1800, costUsd: 0.03 },
      description: "Performs security audits",
    },
  ],
  edges: [
    {
      id: "e1",
      source: "plan-01",
      target: "arch-01",
      kind: "sequence",
      label: "Specifies Architecture",
    },
    { id: "e2", source: "arch-01", target: "worker-01", kind: "spawn", label: "Spawn UI Task" },
    { id: "e3", source: "arch-01", target: "worker-02", kind: "spawn", label: "Spawn Engine Task" },
    { id: "e4", source: "worker-01", target: "tool-01", kind: "data", label: "Lint Code" },
    { id: "e5", source: "worker-02", target: "gate-01", kind: "handoff", label: "Submit Engine" },
    { id: "e6", source: "worker-01", target: "gate-01", kind: "handoff", label: "Submit UI" },
    { id: "e7", source: "gate-01", target: "audit-01", kind: "pushback", label: "Audit Review" },
    {
      id: "e8",
      source: "audit-01",
      target: "worker-02",
      kind: "pushback",
      label: "Reject with Findings",
    },
  ],
};

const mockPositionedNodes: PositionedNode[] = [
  { ...mockDataset.nodes[0], x: 50, y: 50, width: 140, height: 70 },
  { ...mockDataset.nodes[1], x: 250, y: 50, width: 140, height: 70 },
  { ...mockDataset.nodes[2], x: 450, y: 50, width: 140, height: 70 },
  { ...mockDataset.nodes[3], x: 250, y: 200, width: 140, height: 70 },
  { ...mockDataset.nodes[4], x: 450, y: 200, width: 140, height: 70 },
  { ...mockDataset.nodes[5], x: 250, y: 350, width: 140, height: 70 },
  { ...mockDataset.nodes[6], x: 450, y: 350, width: 140, height: 70 },
];

const mockAnnotations: CanvasAnnotation[] = [
  {
    id: "ann-01",
    type: "bookmark",
    nodeId: "worker-02",
    title: "Engine Performance Benchmark",
    content: "Verify sub-millisecond extraction performance on 10,000 node graphs.",
    author: { name: "Lead Architect", role: "human" },
    color: "blue",
    priority: "critical",
    category: "performance",
    tags: ["perf", "subgraph"],
    createdAt: "2026-08-15T10:00:00Z",
    updatedAt: "2026-08-15T10:00:00Z",
  },
  {
    id: "ann-02",
    type: "sticky",
    coordinates: { x: 260, y: 210 },
    title: "Lasso Selection Note",
    content: "This area handles boundary crossings cleanly.",
    author: { name: "Validator Agent", role: "validator" },
    color: "amber",
    priority: "medium",
    category: "review",
    createdAt: "2026-08-15T10:05:00Z",
    updatedAt: "2026-08-15T10:05:00Z",
  },
];

describe("Polygon Mathematics & Geometry Algorithms", () => {
  const squarePolygon: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  const concaveLPolygon: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 50 },
    { x: 50, y: 100 },
    { x: 0, y: 100 },
  ];

  // Self-intersecting bowtie polygon: 2 triangular lobes crossing at (50, 50)
  const bowtiePolygon: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ];

  // Self-intersecting 5-pointed star polygon
  const starPolygon: Point[] = [
    { x: 50, y: 0 },
    { x: 80, y: 100 },
    { x: 0, y: 38 },
    { x: 100, y: 38 },
    { x: 20, y: 100 },
  ];

  it("calculates polygon bounding boxes correctly", () => {
    const bounds = computePolygonBounds(squarePolygon);
    expect(bounds).toEqual({ x: 0, y: 0, width: 100, height: 100 });

    const emptyBounds = computePolygonBounds([]);
    expect(emptyBounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("verifies point inside rectangle", () => {
    const rect: Rect = { x: 10, y: 10, width: 80, height: 80 };
    expect(isPointInRect({ x: 50, y: 50 }, rect)).toBe(true);
    expect(isPointInRect({ x: 10, y: 10 }, rect)).toBe(true);
    expect(isPointInRect({ x: 90, y: 90 }, rect)).toBe(true);
    expect(isPointInRect({ x: 5, y: 50 }, rect)).toBe(false);
    expect(isPointInRect({ x: 95, y: 50 }, rect)).toBe(false);
  });

  it("evaluates point-in-polygon ray-casting for convex polygons", () => {
    expect(isPointInPolygon({ x: 50, y: 50 }, squarePolygon)).toBe(true);
    expect(isPointInPolygon({ x: 150, y: 50 }, squarePolygon)).toBe(false);
    expect(isPointInPolygon({ x: -10, y: 50 }, squarePolygon)).toBe(false);
    expect(isPointInPolygon({ x: 50, y: -5 }, squarePolygon)).toBe(false);
    expect(isPointInPolygon({ x: 50, y: 105 }, squarePolygon)).toBe(false);
  });

  it("evaluates point-in-polygon for concave shapes", () => {
    // Inside the bottom-left of the L
    expect(isPointInPolygon({ x: 25, y: 75 }, concaveLPolygon)).toBe(true);
    // Inside the top of the L
    expect(isPointInPolygon({ x: 75, y: 25 }, concaveLPolygon)).toBe(true);
    // Inside the hollow cut-out of the L
    expect(isPointInPolygon({ x: 75, y: 75 }, concaveLPolygon)).toBe(false);
  });

  it("evaluates self-intersecting polygon lassos (bowtie & star) without crashing", () => {
    // Bowtie left lobe point
    expect(isPointInPolygon({ x: 25, y: 50 }, bowtiePolygon)).toBe(true);
    // Bowtie right lobe point
    expect(isPointInPolygon({ x: 75, y: 50 }, bowtiePolygon)).toBe(true);
    // Outside the bowtie lobes
    expect(isPointInPolygon({ x: 50, y: 10 }, bowtiePolygon)).toBe(false);
    expect(isPointInPolygon({ x: 50, y: 90 }, bowtiePolygon)).toBe(false);
    expect(isPointInPolygon({ x: -10, y: 50 }, bowtiePolygon)).toBe(false);

    // Star point and outside points
    expect(isPointInPolygon({ x: 50, y: 20 }, starPolygon)).toBe(true);
    expect(isPointInPolygon({ x: 10, y: 10 }, starPolygon)).toBe(false);
    expect(isPointInPolygon({ x: 90, y: 10 }, starPolygon)).toBe(false);
  });

  it("handles degenerate polygons (<3 vertices)", () => {
    expect(isPointInPolygon({ x: 10, y: 10 }, [])).toBe(false);
    expect(isPointInPolygon({ x: 10, y: 10 }, [{ x: 0, y: 0 }])).toBe(false);
    expect(
      isPointInPolygon({ x: 10, y: 10 }, [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe(false);
  });

  it("detects line segment intersections correctly", () => {
    // Intersecting cross
    expect(
      doSegmentsIntersect({ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 5, y: 0 }, { x: 5, y: 10 }),
    ).toBe(true);

    // Parallel segments
    expect(
      doSegmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }),
    ).toBe(false);

    // Disjoint non-parallel segments
    expect(
      doSegmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 5, y: 0 }, { x: 5, y: 5 }),
    ).toBe(false);
  });

  it("evaluates rectangle intersection with polygon", () => {
    const rectInside: Rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(doesRectIntersectPolygon(rectInside, squarePolygon)).toBe(true);

    const rectOverlapping: Rect = { x: 80, y: 80, width: 40, height: 40 };
    expect(doesRectIntersectPolygon(rectOverlapping, squarePolygon)).toBe(true);

    const rectOutside: Rect = { x: 150, y: 150, width: 20, height: 20 };
    expect(doesRectIntersectPolygon(rectOutside, squarePolygon)).toBe(false);
  });

  it("evaluates node containment in polygon with various modes", () => {
    const node: PositionedNode = {
      id: "n1",
      name: "Test Node",
      x: 20,
      y: 20,
      width: 40,
      height: 40,
    };

    expect(isNodeInPolygon(node, squarePolygon, "center")).toBe(true);
    expect(isNodeInPolygon(node, squarePolygon, "any_vertex")).toBe(true);
    expect(isNodeInPolygon(node, squarePolygon, "all_vertices")).toBe(true);
    expect(isNodeInPolygon(node, squarePolygon, "intersects")).toBe(true);

    const straddlingNode: PositionedNode = {
      id: "n2",
      name: "Straddling Node",
      x: 80,
      y: 20,
      width: 40,
      height: 40,
    };

    expect(isNodeInPolygon(straddlingNode, squarePolygon, "any_vertex")).toBe(true);
    expect(isNodeInPolygon(straddlingNode, squarePolygon, "all_vertices")).toBe(false);
    expect(isNodeInPolygon(straddlingNode, squarePolygon, "intersects")).toBe(true);
  });
});

describe("Transitive Closure Algorithms", () => {
  it("computes downstream reachability with unlimited hops", () => {
    const closure = computeTransitiveClosure(mockDataset, ["plan-01"], {
      direction: "downstream",
      maxDepth: Infinity,
    });

    expect(closure.has("plan-01")).toBe(true);
    expect(closure.has("arch-01")).toBe(true);
    expect(closure.has("worker-01")).toBe(true);
    expect(closure.has("worker-02")).toBe(true);
    expect(closure.has("gate-01")).toBe(true);
    expect(closure.has("audit-01")).toBe(true);
    expect(closure.size).toBe(7);
  });

  it("computes downstream reachability with 1 hop depth limit", () => {
    const closure = computeTransitiveClosure(mockDataset, ["plan-01"], {
      direction: "downstream",
      maxDepth: 1,
    });

    expect(closure.has("plan-01")).toBe(true);
    expect(closure.has("arch-01")).toBe(true);
    expect(closure.has("worker-01")).toBe(false);
    expect(closure.size).toBe(2);
  });

  it("computes upstream reachability (backward dependencies)", () => {
    const closure = computeTransitiveClosure(mockDataset, ["gate-01"], {
      direction: "upstream",
      maxDepth: 1,
    });

    expect(closure.has("gate-01")).toBe(true);
    expect(closure.has("worker-01")).toBe(true);
    expect(closure.has("worker-02")).toBe(true);
    expect(closure.has("arch-01")).toBe(false);
  });

  it("handles cyclic graphs gracefully during traversal", () => {
    const closure = computeTransitiveClosure(mockDataset, ["audit-01"], {
      direction: "downstream",
      maxDepth: 10,
    });

    expect(closure.has("audit-01")).toBe(true);
    expect(closure.has("worker-02")).toBe(true);
    expect(closure.has("gate-01")).toBe(true);
  });

  it("handles empty root set gracefully", () => {
    const closure = computeTransitiveClosure(mockDataset, [], { direction: "downstream" });
    expect(closure.size).toBe(0);
  });
});

describe("Subgraph Extraction Engine", () => {
  it("extracts explicit selection with internal and boundary edges", () => {
    const extracted = extractSubgraph({
      dataset: mockDataset,
      positionedNodes: mockPositionedNodes,
      mode: "selection",
      selectedNodeIds: ["worker-01", "worker-02"],
      boundaryEdgePolicy: "none",
      annotations: mockAnnotations,
    });

    expect(extracted.stats.nodeCount).toBe(2);
    expect(extracted.dataset.nodes.map((n) => n.id)).toEqual(["worker-01", "worker-02"]);
    expect(extracted.stats.internalEdgeCount).toBe(0);
    expect(extracted.boundaryEdges.length).toBe(6);
    expect(extracted.stats.boundaryIncomingCount).toBe(3);
    expect(extracted.stats.boundaryOutgoingCount).toBe(3);
  });

  it("includes boundary edges when configured by boundaryEdgePolicy", () => {
    const extractedAll = extractSubgraph({
      dataset: mockDataset,
      positionedNodes: mockPositionedNodes,
      mode: "selection",
      selectedNodeIds: ["worker-02", "gate-01"],
      boundaryEdgePolicy: "all",
    });

    expect(extractedAll.dataset.nodes.length).toBe(2);
    expect(extractedAll.dataset.edges.some((e) => e.id === "e5")).toBe(true);
    expect(extractedAll.dataset.edges.length).toBeGreaterThan(1);
  });

  it("extracts subgraph via lasso polygon containment", () => {
    const lassoPoly: Point[] = [
      { x: 200, y: 20 },
      { x: 620, y: 20 },
      { x: 620, y: 140 },
      { x: 200, y: 140 },
    ];

    const extracted = extractSubgraph({
      dataset: mockDataset,
      positionedNodes: mockPositionedNodes,
      mode: "polygon",
      lassoPolygon: lassoPoly,
    });

    expect(extracted.nodeIds.has("arch-01")).toBe(true);
    expect(extracted.nodeIds.has("worker-01")).toBe(true);
    expect(extracted.nodeIds.has("plan-01")).toBe(false);
  });

  it("extracts subgraph via section filters and prunes empty sections", () => {
    const extracted = extractSubgraph({
      dataset: mockDataset,
      mode: "section",
      sectionIds: ["sec-execution"],
    });

    expect(extracted.stats.nodeCount).toBe(3);
    expect(extracted.dataset.sections?.length).toBe(1);
    expect(extracted.dataset.sections?.[0].id).toBe("sec-execution");
  });

  it("calculates accurate total tokens, duration, and cost metrics", () => {
    const extracted = extractSubgraph({
      dataset: mockDataset,
      mode: "all",
    });

    expect(extracted.stats.nodeCount).toBe(7);
    expect(extracted.stats.totalDurationMs).toBe(13900);
    expect(extracted.stats.totalTokens).toBe(16200);
    expect(extracted.stats.totalCostUsd).toBeCloseTo(0.215, 3);
  });

  it("handles empty node selection and empty datasets gracefully", () => {
    const emptySelection = extractSubgraph({
      dataset: mockDataset,
      mode: "selection",
      selectedNodeIds: [],
    });

    expect(emptySelection.stats.nodeCount).toBe(0);
    expect(emptySelection.stats.internalEdgeCount).toBe(0);
    expect(emptySelection.stats.boundaryTotalCount).toBe(0);
    expect(emptySelection.dataset.nodes).toEqual([]);
    expect(emptySelection.dataset.edges).toEqual([]);

    const emptyDatasetExtract = extractSubgraph({
      dataset: { id: "empty-g", title: "Empty G", nodes: [], edges: [] },
      mode: "all",
    });
    expect(emptyDatasetExtract.stats.nodeCount).toBe(0);
  });
});

describe("Bookmark Pack Packaging, Validation & Checksums", () => {
  let extracted: ExtractedSubgraph;

  it("creates a valid BookmarkPackBundle with default and custom metadata", () => {
    extracted = extractSubgraph({
      dataset: mockDataset,
      mode: "selection",
      selectedNodeIds: ["worker-02", "gate-01", "audit-01"],
      annotations: mockAnnotations,
    });

    const pack = createBookmarkPack(extracted, {
      title: "Worker Validation Loop",
      description: "Sub-network capturing the implementation and audit loop",
      version: "2.1.0",
      author: {
        name: "Security Lead",
        role: "validator",
      },
      tags: ["security", "audit", "loop"],
    });

    expect(pack.schemaVersion).toBe(BUNDLE_SCHEMA_VERSION);
    expect(pack.metadata.title).toBe("Worker Validation Loop");
    expect(pack.metadata.version).toBe("2.1.0");
    expect(pack.metadata.author.name).toBe("Security Lead");
    expect(pack.metadata.tags).toContain("security");
    expect(pack.subgraph.nodes.length).toBe(3);
    expect(pack.bookmarks.length).toBe(1);
    expect(/^sha256-[0-9a-f]{16}$/.test(pack.checksum)).toBe(true);

    const manualChecksum = computeBundleChecksum(pack.metadata, pack.subgraph, pack.bookmarks);
    expect(manualChecksum).toBe(pack.checksum);
    expect(validateBundleChecksum(pack)).toBe(true);
  });

  it("detects corrupted checksums and bundle tampering", () => {
    const pack = createBookmarkPack(extracted, { title: "Tamper Test", version: "1.0.0" });
    expect(validateBundleChecksum(pack)).toBe(true);

    const tamperedPack = {
      ...pack,
      metadata: {
        ...pack.metadata,
        title: "Maliciously Modified Title",
      },
    };
    expect(validateBundleChecksum(tamperedPack)).toBe(false);
  });

  it("validates SemVer version format accurately", () => {
    expect(isValidSemVer("1.0.0")).toBe(true);
    expect(isValidSemVer("2.14.3-alpha.1")).toBe(true);
    expect(isValidSemVer("0.0.1")).toBe(true);
    expect(isValidSemVer("v1.0.0")).toBe(false);
    expect(isValidSemVer("1.0")).toBe(false);
    expect(isValidSemVer("invalid-version")).toBe(false);
  });

  it("serializes and parses Bookmark Pack bundles symmetrically", () => {
    const pack = createBookmarkPack(extracted, {
      title: "Roundtrip Test",
      version: "1.0.0",
    });

    const jsonString = serializeBookmarkPack(pack, true);
    expect(jsonString).toContain(`"schemaVersion": "${BUNDLE_SCHEMA_VERSION}"`);

    const parseResult = parseBookmarkPack(jsonString);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.bundle.metadata.title).toBe("Roundtrip Test");
      expect(parseResult.bundle.subgraph.nodes.length).toBe(3);
    }
  });

  it("detects malformed JSON strings safely", () => {
    const result = parseBookmarkPack("invalid { json [ string");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("JSON parse failure");
    }

    const truncated = parseBookmarkPack(`{"schemaVersion": "gvui-bookmark-pack/v1", "metadata":`);
    expect(truncated.success).toBe(false);
  });

  it("validates and rejects invalid bundle structures with comprehensive negative tests", () => {
    // Non-object root
    expect(validateBookmarkPack(null).valid).toBe(false);
    expect(validateBookmarkPack(12345).valid).toBe(false);
    expect(validateBookmarkPack("string").valid).toBe(false);
    expect(validateBookmarkPack([1, 2, 3]).valid).toBe(false);

    // Missing schemaVersion
    const invalid1 = validateBookmarkPack({
      metadata: { id: "p1", title: "T", version: "1.0.0", author: { name: "A" } },
      subgraph: { id: "s1", nodes: [], edges: [] },
      bookmarks: [],
      checksum: "sha256-1234567890abcdef",
    });
    expect(invalid1.valid).toBe(false);

    // Incompatible schemaVersion
    const invalidVersion = validateBookmarkPack({
      schemaVersion: "gvui-bookmark-pack/v99",
      metadata: { id: "p1", title: "T", version: "1.0.0", author: { name: "A" } },
      subgraph: { id: "s1", nodes: [], edges: [] },
      bookmarks: [],
      checksum: "sha256-1234567890abcdef",
    });
    expect(invalidVersion.valid).toBe(false);

    // Invalid version format
    const invalid2 = validateBookmarkPack({
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      metadata: { id: "p1", title: "T", version: "bad-ver", author: { name: "A" } },
      subgraph: { id: "s1", nodes: [], edges: [] },
      bookmarks: [],
      checksum: "sha256-1234567890abcdef",
    });
    expect(invalid2.valid).toBe(false);

    // Missing author name
    const invalid3 = validateBookmarkPack({
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      metadata: { id: "p1", title: "T", version: "1.0.0", author: {} },
      subgraph: { id: "s1", nodes: [], edges: [] },
      bookmarks: [],
      checksum: "sha256-1234567890abcdef",
    });
    expect(invalid3.valid).toBe(false);

    // Missing checksum
    const invalid4 = validateBookmarkPack({
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      metadata: { id: "p1", title: "T", version: "1.0.0", author: { name: "A" } },
      subgraph: { id: "s1", nodes: [], edges: [] },
      bookmarks: [],
    });
    expect(invalid4.valid).toBe(false);

    // Invalid nodes array element
    const invalidNodes = validateBookmarkPack({
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      metadata: { id: "p1", title: "T", version: "1.0.0", author: { name: "A" } },
      subgraph: { id: "s1", nodes: ["not-a-node-object"], edges: [] },
      bookmarks: [],
      checksum: "sha256-1234567890abcdef",
    });
    expect(invalidNodes.valid).toBe(false);

    // Invalid edges array element
    const invalidEdges = validateBookmarkPack({
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      metadata: { id: "p1", title: "T", version: "1.0.0", author: { name: "A" } },
      subgraph: { id: "s1", nodes: [], edges: [{ id: "e1" }] },
      bookmarks: [],
      checksum: "sha256-1234567890abcdef",
    });
    expect(invalidEdges.valid).toBe(false);

    // Invalid bookmark array element
    const invalidBookmarks = validateBookmarkPack({
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      metadata: { id: "p1", title: "T", version: "1.0.0", author: { name: "A" } },
      subgraph: { id: "s1", nodes: [], edges: [] },
      bookmarks: [{ id: 123, content: null }],
      checksum: "sha256-1234567890abcdef",
    });
    expect(invalidBookmarks.valid).toBe(false);
  });
});

describe("Multi-Format Exporters & Adversarial Stress Tests", () => {
  const extracted = extractSubgraph({
    dataset: mockDataset,
    mode: "selection",
    selectedNodeIds: ["worker-02", "gate-01", "audit-01"],
    boundaryEdgePolicy: "outgoing",
    annotations: mockAnnotations,
  });

  const pack = createBookmarkPack(extracted, {
    title: "Core Verification Subgraph",
    version: "1.0.0",
  });

  it("exports to JSON bundle with correct MIME type and metadata", () => {
    const res = exportToJsonBundle(pack);
    expect(res.format).toBe("json-bundle");
    expect(res.mimeType).toBe("application/json");
    expect(res.filename.endsWith(".json")).toBe(true);
    expect(res.content).toContain(`"schemaVersion": "${BUNDLE_SCHEMA_VERSION}"`);
  });

  it("exports raw GraphDataset JSON", () => {
    const res = exportToGraphDatasetJson(extracted.dataset);
    expect(res.format).toBe("graph-dataset");
    expect(res.mimeType).toBe("application/json");
    expect(res.content).toContain(`"nodes"`);
  });

  it("exports to Graphviz DOT format with valid digraph and styling", () => {
    const res = exportToGraphvizDot(extracted, {
      title: "Core_Verification_Subgraph",
      rankdir: "LR",
    });
    expect(res.format).toBe("dot");
    expect(res.mimeType).toBe("text/vnd.graphviz");
    expect(res.content).toContain(`digraph "Core_Verification_Subgraph" {`);
    expect(res.content).toContain(`rankdir="LR"`);
    expect(res.content).toContain(`"worker_02"`);
    expect(res.content).toContain(`"gate_01"`);
    expect(res.content).toContain(`"audit_01"`);
    expect(res.content).toContain(`}`);
  });

  it("exports to Mermaid flowchart syntax with subgraphs and classes", () => {
    const res = exportToMermaid(extracted, { direction: "TD" });
    expect(res.format).toBe("mermaid");
    expect(res.mimeType).toBe("text/vnd.mermaid");
    expect(res.content).toContain(`flowchart TD`);
    expect(res.content).toContain(`worker_02["Backend Implementer"]`);
    expect(res.content).toContain(`gate_01{"Validation Gate"}`);
    expect(res.content).toContain(`audit_01[["Security Critic"]]`);
    expect(res.content).toContain(`classDef successNode`);
  });

  it("exports comprehensive Markdown report with tables and embedded Mermaid", () => {
    const res = exportToMarkdownReport(extracted, pack);
    expect(res.format).toBe("markdown");
    expect(res.mimeType).toBe("text/markdown");
    expect(res.content).toContain(`# 📦 Subgraph Bookmark Pack: Core Verification Subgraph`);
    expect(res.content).toContain(`## 📋 Pack Metadata`);
    expect(res.content).toContain(`## 📊 Subgraph Metrics & Overview`);
    expect(res.content).toContain(`## 🧩 Extracted Nodes Inventory`);
    expect(res.content).toContain(`## 🔗 Internal Edge Connections`);
    expect(res.content).toContain(`## 🔖 Bookmark Annotations Catalog`);
    expect(res.content).toContain("```mermaid");
  });

  it("handles empty subgraph exports across all formats safely", () => {
    const emptyExtracted = extractSubgraph({
      dataset: { id: "empty", title: "Empty Subgraph", nodes: [], edges: [] },
      mode: "all",
    });
    const emptyPack = createBookmarkPack(emptyExtracted, { title: "Empty Pack", version: "1.0.0" });

    // JSON bundle
    const jsonRes = exportToJsonBundle(emptyPack);
    expect(jsonRes.content).toContain(`"nodes": []`);

    // Graphviz DOT
    const dotRes = exportToGraphvizDot(emptyExtracted);
    expect(dotRes.content).toContain("digraph");
    expect(dotRes.content).toContain("empty_subgraph");

    // Mermaid
    const mmdRes = exportToMermaid(emptyExtracted);
    expect(mmdRes.content).toContain("flowchart");
    expect(mmdRes.content).toContain("empty_subgraph");

    // Markdown
    const mdRes = exportToMarkdownReport(emptyExtracted, emptyPack);
    expect(mdRes.content).toContain("_No nodes present in this subgraph._");
  });

  it("sanitizes text safely against XSS, HTML script injection, and Mermaid special characters", () => {
    const toxicText = `<script>alert('pwned')</script> "quotes" [brackets] (parens) {braces} |pipe| #hash; ;semi \\backslash\nnewlines`;
    const sanitized = sanitizeMermaidText(toxicText);
    expect(sanitized).not.toContain("<script>");
    expect(sanitized).not.toContain("alert");
    expect(sanitized).not.toContain('"');
    expect(sanitized).not.toContain("[");
    expect(sanitized).not.toContain("]");
    expect(sanitized).not.toContain("(");
    expect(sanitized).not.toContain(")");
    expect(sanitized).not.toContain("{");
    expect(sanitized).not.toContain("}");
    expect(sanitized).not.toContain("|");
    expect(sanitized).not.toContain("#");
    expect(sanitized).not.toContain(";");
    expect(sanitized).not.toContain("\\");

    expect(sanitizeDotId("123-node-invalid.test")).toBe("node_123_node_invalid_test");
    expect(sanitizeMermaidId("456-invalid.id")).toBe("node_456_invalid_id");
    expect(dotEscape('Quote "here" and \\ slash \n newline')).toBe(
      'Quote \\"here\\" and \\\\ slash \\n newline',
    );
  });

  it("exports graph with toxic XSS and special characters to Mermaid without syntax breakage", () => {
    const toxicDataset: GraphDataset = {
      id: "toxic-graph",
      title: "Special <script> Characters Graph | test #1",
      nodes: [
        {
          id: "toxic-1",
          name: 'Node with "quotes" & [brackets] (parens)',
          kind: "orchestrator",
          status: "running",
          description: "Description with | pipes & # hashes ; semicolons \n and newlines",
        },
        {
          id: "toxic-2",
          name: "<svg onload=alert(1)> Agent",
          kind: "tool",
          status: "success",
        },
      ],
      edges: [
        {
          id: "e-toxic",
          source: "toxic-1",
          target: "toxic-2",
          kind: "sequence",
          label: 'Label with | "quotes" and # hashes ;',
        },
      ],
    };

    const toxicExtracted = extractSubgraph({ dataset: toxicDataset, mode: "all" });
    const toxicMmd = exportToMermaid(toxicExtracted);

    expect(toxicMmd.content).toContain("flowchart TD");
    expect(toxicMmd.content).not.toContain("<script>");
    expect(toxicMmd.content).not.toContain("<svg");
    expect(toxicMmd.content).toContain("toxic_1");
    expect(toxicMmd.content).toContain("toxic_2");
  });

  it("dispatches exportSubgraph universal function accurately", () => {
    const config: ExportConfig = {
      format: "mermaid",
      packMetadata: {},
      boundaryEdgePolicy: "none",
      includeAnnotations: true,
      includeMetrics: true,
      mermaidDirection: "LR",
    };

    const res = exportSubgraph(extracted, pack, config);
    expect(res.format).toBe("mermaid");
    expect(res.content).toContain("flowchart LR");
  });
});
