import { describe, expect, it } from "bun:test";
import {
  applyClusterCollapse,
  applyPinnedCoordinates,
  clearAllPins,
  collapseAllClusters,
  collapseCluster,
  computeClusteredLayout,
  computeClusterBounds,
  detectSubtrees,
  expandAllClusters,
  expandCluster,
  groupNodesByStrategy,
  pinAllNodes,
  pinNode,
  preservePinnedNodes,
  toggleClusterCollapse,
  togglePinNode,
  unpinNode,
  type PinnedNodeMap,
  type SubtreeCluster,
} from "./subtreeClustering";
import type {
  GraphDataset,
  GraphNodeData,
  PositionedEdge,
  PositionedNode,
} from "../../types/graphData";

const sampleNodes: PositionedNode[] = [
  {
    id: "orchestrator-1",
    name: "Lead Orchestrator",
    kind: "orchestrator",
    status: "running",
    x: 100,
    y: 50,
    width: 220,
    height: 110,
    hostAgent: { name: "CoordinatorAgent", role: "orchestrator" },
  },
  {
    id: "worker-1a",
    name: "Sub Implementer A",
    kind: "agent",
    status: "success",
    x: 50,
    y: 220,
    width: 200,
    height: 100,
    hostAgent: { name: "ImplementerAgentA", role: "implementer" },
  },
  {
    id: "worker-1b",
    name: "Sub Implementer B",
    kind: "agent",
    status: "success",
    x: 300,
    y: 220,
    width: 200,
    height: 100,
    hostAgent: { name: "ImplementerAgentA", role: "implementer" },
  },
  {
    id: "orchestrator-2",
    name: "Quality Orchestrator",
    kind: "orchestrator",
    status: "running",
    x: 650,
    y: 50,
    width: 220,
    height: 110,
    hostAgent: { name: "ValidatorAgent", role: "validator" },
  },
  {
    id: "worker-2a",
    name: "Adversarial Gate",
    kind: "gate",
    status: "error",
    x: 650,
    y: 220,
    width: 200,
    height: 100,
    hostAgent: { name: "ValidatorAgent", role: "validator" },
  },
];

const sampleEdges: PositionedEdge[] = [
  {
    id: "e1",
    source: "orchestrator-1",
    target: "worker-1a",
    path: "M 210 160 L 150 220",
  },
  {
    id: "e2",
    source: "orchestrator-1",
    target: "worker-1b",
    path: "M 210 160 L 400 220",
  },
  {
    id: "e3",
    source: "worker-1a",
    target: "worker-1b",
    path: "M 250 270 L 300 270",
  },
  {
    id: "e4",
    source: "orchestrator-2",
    target: "worker-2a",
    path: "M 760 160 L 750 220",
  },
  {
    id: "e5",
    source: "worker-1b",
    target: "worker-2a",
    path: "M 500 270 L 650 270",
  },
];

describe("subtreeClustering - detectSubtrees", () => {
  it("detects subtrees rooted at orchestrator nodes and in-degree 0 nodes", () => {
    const subtrees = detectSubtrees(sampleNodes, sampleEdges);
    expect(subtrees.size).toBe(2);

    const cluster1 = subtrees.get("orchestrator-1");
    expect(cluster1).toBeDefined();
    expect(cluster1).toContain("orchestrator-1");
    expect(cluster1).toContain("worker-1a");
    expect(cluster1).toContain("worker-1b");

    const cluster2 = subtrees.get("orchestrator-2");
    expect(cluster2).toBeDefined();
    expect(cluster2).toContain("orchestrator-2");
    expect(cluster2).toContain("worker-2a");
  });

  it("handles disconnected nodes and cycles safely", () => {
    const cyclicNodes: PositionedNode[] = [
      { id: "n1", name: "Node 1", x: 0, y: 0, width: 100, height: 50 },
      { id: "n2", name: "Node 2", x: 150, y: 0, width: 100, height: 50 },
    ];
    const cyclicEdges: PositionedEdge[] = [
      { id: "e1", source: "n1", target: "n2", path: "" },
      { id: "e2", source: "n2", target: "n1", path: "" },
    ];

    const subtrees = detectSubtrees(cyclicNodes, cyclicEdges);
    expect(subtrees.size).toBeGreaterThan(0);
    expect(Array.from(subtrees.values()).flat()).toContain("n1");
    expect(Array.from(subtrees.values()).flat()).toContain("n2");
  });
});

describe("subtreeClustering - groupNodesByStrategy", () => {
  it("groups nodes by subtree hierarchy", () => {
    const groups = groupNodesByStrategy(sampleNodes, sampleEdges, "subtree");
    expect(groups.size).toBe(2);
    expect(groups.has("cluster-subtree-orchestrator-1")).toBe(true);
    expect(groups.has("cluster-subtree-orchestrator-2")).toBe(true);
  });

  it("groups nodes by agent / hostAgent role", () => {
    const groups = groupNodesByStrategy(sampleNodes, sampleEdges, "agent");
    expect(groups.size).toBe(3); // CoordinatorAgent, ImplementerAgentA, ValidatorAgent
    expect(groups.has("cluster-agent-coordinatoragent")).toBe(true);
    expect(groups.has("cluster-agent-implementeragenta")).toBe(true);
    expect(groups.has("cluster-agent-validatoragent")).toBe(true);

    const implGroup = groups.get("cluster-agent-implementeragenta");
    expect(implGroup?.nodeIds).toHaveLength(2);
    expect(implGroup?.nodeIds).toContain("worker-1a");
    expect(implGroup?.nodeIds).toContain("worker-1b");
  });

  it("groups nodes by section", () => {
    const sections = [
      { id: "sec-core", title: "Core Pipeline", nodeIds: ["orchestrator-1", "worker-1a"] },
      { id: "sec-val", title: "Validation", nodeIds: ["orchestrator-2", "worker-2a"] },
    ];
    const groups = groupNodesByStrategy(sampleNodes, sampleEdges, "section", undefined, sections);
    expect(groups.has("cluster-sec-sec-core")).toBe(true);
    expect(groups.has("cluster-sec-sec-val")).toBe(true);
  });

  it("groups nodes by custom assigner function", () => {
    const customAssigner = (node: GraphNodeData | PositionedNode) =>
      node.status === "error" ? "failed" : "healthy";
    const groups = groupNodesByStrategy(sampleNodes, sampleEdges, "custom", customAssigner);
    expect(groups.has("cluster-custom-failed")).toBe(true);
    expect(groups.has("cluster-custom-healthy")).toBe(true);
    expect(groups.get("cluster-custom-failed")?.nodeIds).toEqual(["worker-2a"]);
  });
});

describe("subtreeClustering - computeClusterBounds", () => {
  it("computes accurate bounding box for a cluster with padding and headerHeight", () => {
    const nodeMap = new Map<string, PositionedNode>(sampleNodes.map((n) => [n.id, n]));
    const bounds = computeClusterBounds(
      ["orchestrator-1", "worker-1a", "worker-1b"],
      nodeMap,
      20,
      30,
    );

    // orchestrator-1: x=100, y=50, w=220, h=110 => right=320, bottom=160
    // worker-1a: x=50, y=220, w=200, h=100 => right=250, bottom=320
    // worker-1b: x=300, y=220, w=200, h=100 => right=500, bottom=320
    // minX = 50, minY = 50, maxX = 500, maxY = 320
    expect(bounds.minX).toBe(50 - 20); // 30
    expect(bounds.minY).toBe(50 - 20 - 30); // 0
    expect(bounds.maxX).toBe(500 + 20); // 520
    expect(bounds.maxY).toBe(320 + 20); // 340
    expect(bounds.width).toBe(490);
    expect(bounds.height).toBe(340);
  });

  it("returns zero bounds for empty or nonexistent node list", () => {
    const nodeMap = new Map<string, PositionedNode>();
    const bounds = computeClusterBounds(["nonexistent"], nodeMap);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);
  });
});

describe("subtreeClustering - Pinned Node Persistence", () => {
  it("applies pinned coordinates to matching nodes and keeps others intact", () => {
    const pins: PinnedNodeMap = {
      "worker-1a": { x: 999, y: 888 },
    };
    const result = applyPinnedCoordinates(sampleNodes, pins);
    const pinnedNode = result.find((n) => n.id === "worker-1a");
    const normalNode = result.find((n) => n.id === "worker-1b");

    expect(pinnedNode?.x).toBe(999);
    expect(pinnedNode?.y).toBe(888);
    expect(normalNode?.x).toBe(300);
    expect(normalNode?.y).toBe(220);
  });

  it("preserves pinned coordinates across re-layout cycles", () => {
    const pins: PinnedNodeMap = {
      "orchestrator-1": { x: 500, y: 500 },
    };
    // Simulate new engine computed layout resetting orchestrator-1 to (0, 0)
    const newLayoutNodes: PositionedNode[] = sampleNodes.map((n) => ({ ...n, x: 0, y: 0 }));
    const preserved = preservePinnedNodes(newLayoutNodes, pins);

    expect(preserved.find((n) => n.id === "orchestrator-1")?.x).toBe(500);
    expect(preserved.find((n) => n.id === "orchestrator-1")?.y).toBe(500);
    expect(preserved.find((n) => n.id === "worker-1a")?.x).toBe(0);
  });

  it("supports pinNode, unpinNode, togglePinNode, pinAllNodes, and clearAllPins", () => {
    let pins: PinnedNodeMap = {};

    pins = pinNode(pins, "node-1", { x: 10, y: 20 });
    expect(pins["node-1"]).toEqual({ x: 10, y: 20 });

    pins = unpinNode(pins, "node-1");
    expect(pins["node-1"]).toBeUndefined();

    pins = togglePinNode(pins, "node-2", { x: 30, y: 40 });
    expect(pins["node-2"]).toEqual({ x: 30, y: 40 });

    pins = togglePinNode(pins, "node-2");
    expect(pins["node-2"]).toBeUndefined();

    pins = pinAllNodes(sampleNodes);
    expect(Object.keys(pins)).toHaveLength(5);
    expect(pins["orchestrator-1"]).toEqual({ x: 100, y: 50 });

    pins = clearAllPins();
    expect(Object.keys(pins)).toHaveLength(0);
  });
});

describe("subtreeClustering - Subtree Collapse and Edge Routing", () => {
  it("collapses cluster, decorates root with child badge, hides child nodes, and remaps edges", () => {
    const clusters: SubtreeCluster[] = [
      {
        id: "cluster-1",
        label: "Subtree 1",
        rootNodeId: "orchestrator-1",
        nodeIds: ["orchestrator-1", "worker-1a", "worker-1b"],
        isCollapsed: true,
        bounds: { x: 0, y: 0, width: 500, height: 400, minX: 0, minY: 0, maxX: 500, maxY: 400 },
      },
    ];

    const collapsedSet = new Set<string>(["cluster-1"]);
    const { nodes, edges } = applyClusterCollapse(sampleNodes, sampleEdges, clusters, collapsedSet);

    // worker-1a and worker-1b should be collapsed (hidden from active node list)
    expect(nodes.map((n) => n.id)).toEqual(["orchestrator-1", "orchestrator-2", "worker-2a"]);

    const rootNode = nodes.find((n) => n.id === "orchestrator-1");
    expect(rootNode).toBeDefined();
    expect(rootNode?.badges?.some((b) => b.label.includes("+2 sub-agents"))).toBe(true);
    expect(rootNode?.metadata?.isClusterCollapsed).toBe(true);

    // Intra-cluster edges e1 (orch->1a), e2 (orch->1b), e3 (1a->1b) are internal to cluster-1
    // e1 & e2 remapped to orch->orch which is pruned as self-loop intra-cluster edge
    // e5 (1b -> 2a) is inter-cluster edge from collapsed cluster child to external node:
    // should be remapped to source = orchestrator-1
    const remappedEdge = edges.find((e) => e.id === "e5");
    expect(remappedEdge).toBeDefined();
    expect(remappedEdge?.source).toBe("orchestrator-1");
    expect(remappedEdge?.target).toBe("worker-2a");
    expect(remappedEdge?.path).toContain("M ");
  });

  it("handles cluster collapse toggle and expand all / collapse all", () => {
    let collapsed = new Set<string>();

    collapsed = collapseCluster("c1", collapsed);
    expect(collapsed.has("c1")).toBe(true);

    collapsed = toggleClusterCollapse("c2", collapsed);
    expect(collapsed.has("c2")).toBe(true);

    collapsed = expandCluster("c1", collapsed);
    expect(collapsed.has("c1")).toBe(false);

    collapsed = collapseAllClusters(["c1", "c2", "c3"]);
    expect(collapsed.size).toBe(3);

    collapsed = expandAllClusters();
    expect(collapsed.size).toBe(0);
  });
});

describe("subtreeClustering - computeClusteredLayout", () => {
  it("runs full clustered layout pipeline producing clusters, bound boxes, and processed nodes/edges", () => {
    const dataset: GraphDataset = {
      id: "test-ds",
      title: "Test Dataset",
      nodes: sampleNodes,
      edges: sampleEdges,
    };

    const result = computeClusteredLayout(dataset, {
      strategy: "subtree",
      padding: 30,
      pinnedNodes: {
        "orchestrator-1": { x: 120, y: 60 },
      },
    });

    expect(result.clusters.length).toBe(2);
    expect(result.pinnedNodes["orchestrator-1"]).toEqual({ x: 120, y: 60 });
    expect(result.nodes.find((n) => n.id === "orchestrator-1")?.x).toBe(120);

    const cluster1 = result.clusters.find((c) => c.rootNodeId === "orchestrator-1");
    expect(cluster1).toBeDefined();
    expect(cluster1?.bounds.width).toBeGreaterThan(0);
    expect(cluster1?.color).toBeDefined();
  });

  it("handles empty graphs and single-node graphs gracefully", () => {
    const emptyResult = computeClusteredLayout({ nodes: [], edges: [] });
    expect(emptyResult.nodes).toEqual([]);
    expect(emptyResult.edges).toEqual([]);
    expect(emptyResult.clusters).toEqual([]);

    const singleNode: PositionedNode = {
      id: "solo-node",
      name: "Solo Node",
      x: 50,
      y: 80,
      width: 180,
      height: 90,
    };
    const singleResult = computeClusteredLayout({ nodes: [singleNode], edges: [] });
    expect(singleResult.nodes).toHaveLength(1);
    expect(singleResult.clusters).toHaveLength(1);
    expect(singleResult.clusters[0].bounds.width).toBeGreaterThan(0);
  });

  it("handles multi-component disconnected cycles without hanging or dropping nodes", () => {
    const cycleNodes: PositionedNode[] = [
      { id: "c1-a", name: "C1 A", x: 0, y: 0, width: 100, height: 50 },
      { id: "c1-b", name: "C1 B", x: 150, y: 0, width: 100, height: 50 },
      { id: "c2-a", name: "C2 A", x: 400, y: 0, width: 100, height: 50 },
      { id: "c2-b", name: "C2 B", x: 550, y: 0, width: 100, height: 50 },
      { id: "orphan-1", name: "Orphan", x: 800, y: 0, width: 100, height: 50 },
    ];
    const cycleEdges: PositionedEdge[] = [
      { id: "ec1-1", source: "c1-a", target: "c1-b", path: "" },
      { id: "ec1-2", source: "c1-b", target: "c1-a", path: "" },
      { id: "ec2-1", source: "c2-a", target: "c2-b", path: "" },
      { id: "ec2-2", source: "c2-b", target: "c2-a", path: "" },
    ];

    const result = computeClusteredLayout({ nodes: cycleNodes, edges: cycleEdges });
    expect(result.clusters.length).toBeGreaterThanOrEqual(3);
    const allClusteredNodeIds = result.clusters.flatMap((c) => c.nodeIds);
    expect(allClusteredNodeIds).toContain("c1-a");
    expect(allClusteredNodeIds).toContain("c1-b");
    expect(allClusteredNodeIds).toContain("c2-a");
    expect(allClusteredNodeIds).toContain("c2-b");
    expect(allClusteredNodeIds).toContain("orphan-1");
  });

  it("preserves pinned coordinates across rapid simulated layout mode switches", () => {
    let currentPins: PinnedNodeMap = {};
    currentPins = pinNode(currentPins, "orchestrator-1", { x: 777, y: 888 });

    // Switch 1: Layered -> Radial simulation
    const radialNodes = sampleNodes.map((n) => ({ ...n, x: 10, y: 10 }));
    const preservedRadial = preservePinnedNodes(radialNodes, currentPins);
    expect(preservedRadial.find((n) => n.id === "orchestrator-1")?.x).toBe(777);
    expect(preservedRadial.find((n) => n.id === "orchestrator-1")?.y).toBe(888);

    // Switch 2: Radial -> Force simulation
    const forceNodes = sampleNodes.map((n) => ({ ...n, x: 200, y: 300 }));
    const preservedForce = preservePinnedNodes(forceNodes, currentPins);
    expect(preservedForce.find((n) => n.id === "orchestrator-1")?.x).toBe(777);
    expect(preservedForce.find((n) => n.id === "orchestrator-1")?.y).toBe(888);

    // Toggle collapse on cluster while pinned
    const clustered = computeClusteredLayout(
      { nodes: preservedForce, edges: sampleEdges },
      {
        collapsedClusterIds: new Set(["cluster-subtree-orchestrator-1"]),
        pinnedNodes: currentPins,
      },
    );
    expect(clustered.nodes.find((n) => n.id === "orchestrator-1")?.x).toBe(777);
    expect(clustered.nodes.find((n) => n.id === "orchestrator-1")?.y).toBe(888);
  });
});
