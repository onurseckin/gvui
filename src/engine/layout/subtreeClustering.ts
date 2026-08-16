import type {
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  GraphSection,
  PositionedEdge,
  PositionedNode,
} from "../../types/graphData";

/**
 * Geometric bounding box for a cluster with min/max extents and dimensions.
 */
export interface ClusterBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Represents a grouped subtree or multi-agent cluster.
 */
export interface SubtreeCluster {
  id: string;
  label: string;
  rootNodeId?: string;
  nodeIds: string[];
  isCollapsed: boolean;
  bounds: ClusterBoundingBox;
  color?: string;
  archetype?: string;
  childClusterIds?: string[];
  parentClusterId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Coordinate position for a manually pinned node.
 */
export interface PinnedCoordinate {
  x: number;
  y: number;
}

/**
 * Map of node IDs to their pinned (x, y) coordinates.
 */
export type PinnedNodeMap = Record<string, PinnedCoordinate>;

/**
 * Supported clustering grouping strategies.
 */
export type ClusterGroupingStrategy = "subtree" | "section" | "agent" | "custom";

/**
 * Configuration options for subtree clustering and layout.
 */
export interface ClusteringOptions {
  padding?: number;
  headerHeight?: number;
  strategy?: ClusterGroupingStrategy;
  collapsedClusterIds?: Set<string> | readonly string[];
  pinnedNodes?: PinnedNodeMap | Map<string, PinnedCoordinate>;
  customGroupAssigner?: (node: PositionedNode | GraphNodeData) => string | null;
  clusterColorPalette?: readonly string[];
  sections?: readonly GraphSection[];
}

/**
 * Result of computing a clustered layout.
 */
export interface ClusteredGraphResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  clusters: SubtreeCluster[];
  pinnedNodes: PinnedNodeMap;
  collapsedClusterIds: Set<string>;
}

const DEFAULT_CLUSTER_COLORS: readonly string[] = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#8b5cf6", // Purple
  "#f59e0b", // Amber
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#6366f1", // Indigo
  "#14b8a6", // Teal
];

/**
 * Detects subtrees within a directed graph by finding root nodes (in-degree 0 or orchestrators)
 * and traversing their descendants via BFS.
 */
export function detectSubtrees(
  nodes: readonly (GraphNodeData | PositionedNode)[],
  edges: readonly (GraphEdgeData | PositionedEdge)[],
): Map<string, string[]> {
  const nodeMap = new Map<string, GraphNodeData | PositionedNode>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    if (adjacency.has(edge.source)) {
      adjacency.get(edge.source)!.push(edge.target);
    }
    if (inDegree.has(edge.target)) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  // Identify root candidates: in-degree 0, or kind === 'orchestrator'
  const rootCandidates: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    const node = nodeMap.get(id);
    if (deg === 0 || node?.kind === "orchestrator") {
      rootCandidates.push(id);
    }
  }

  // If no root candidate found (e.g. cycle), use the first node as root
  if (rootCandidates.length === 0 && nodes.length > 0) {
    rootCandidates.push(nodes[0].id);
  }

  // Multi-source BFS to assign each node to its closest root candidate
  const assignedCluster = new Map<string, string>();
  const distanceToRoot = new Map<string, number>();
  const clusterMembers = new Map<string, string[]>();

  const queue: Array<{ nodeId: string; rootId: string; dist: number }> = [];

  for (const rootId of rootCandidates) {
    clusterMembers.set(rootId, [rootId]);
    assignedCluster.set(rootId, rootId);
    distanceToRoot.set(rootId, 0);
    queue.push({ nodeId: rootId, rootId, dist: 0 });
  }

  while (queue.length > 0) {
    const { nodeId, rootId, dist } = queue.shift()!;
    const neighbors = adjacency.get(nodeId) ?? [];

    for (const neighbor of neighbors) {
      // Don't traverse into another root candidate
      if (rootCandidates.includes(neighbor) && neighbor !== rootId) {
        continue;
      }

      const existingDist = distanceToRoot.get(neighbor);
      const newDist = dist + 1;

      if (existingDist === undefined || newDist < existingDist) {
        const prevRoot = assignedCluster.get(neighbor);
        if (prevRoot && clusterMembers.has(prevRoot)) {
          const arr = clusterMembers.get(prevRoot)!;
          const idx = arr.indexOf(neighbor);
          if (idx !== -1) arr.splice(idx, 1);
        }

        assignedCluster.set(neighbor, rootId);
        distanceToRoot.set(neighbor, newDist);
        clusterMembers.get(rootId)!.push(neighbor);
        queue.push({ nodeId: neighbor, rootId, dist: newDist });
      }
    }
  }

  // Group any remaining unvisited disconnected components or isolated cycles
  for (const node of nodes) {
    if (!assignedCluster.has(node.id)) {
      const seedRootId = node.id;
      clusterMembers.set(seedRootId, [seedRootId]);
      assignedCluster.set(seedRootId, seedRootId);
      distanceToRoot.set(seedRootId, 0);

      const componentQueue: Array<{ nodeId: string; dist: number }> = [
        { nodeId: seedRootId, dist: 0 },
      ];

      while (componentQueue.length > 0) {
        const { nodeId, dist } = componentQueue.shift()!;
        const neighbors = adjacency.get(nodeId) ?? [];

        for (const neighbor of neighbors) {
          if (!assignedCluster.has(neighbor)) {
            assignedCluster.set(neighbor, seedRootId);
            distanceToRoot.set(neighbor, dist + 1);
            clusterMembers.get(seedRootId)!.push(neighbor);
            componentQueue.push({ nodeId: neighbor, dist: dist + 1 });
          }
        }
      }
    }
  }

  // Filter out any empty clusters
  const finalClusters = new Map<string, string[]>();
  for (const [rootId, members] of clusterMembers.entries()) {
    if (members.length > 0) {
      finalClusters.set(rootId, members);
    }
  }

  return finalClusters;
}

/**
 * Groups nodes according to the selected strategy: subtree, section, agent, or custom.
 */
export function groupNodesByStrategy(
  nodes: readonly (GraphNodeData | PositionedNode)[],
  edges: readonly (GraphEdgeData | PositionedEdge)[],
  strategy: ClusterGroupingStrategy = "subtree",
  customAssigner?: (node: GraphNodeData | PositionedNode) => string | null,
  sections?: readonly GraphSection[],
): Map<string, { label: string; nodeIds: string[]; rootNodeId?: string }> {
  const groups = new Map<string, { label: string; nodeIds: string[]; rootNodeId?: string }>();
  const nodeMap = new Map<string, GraphNodeData | PositionedNode>(nodes.map((n) => [n.id, n]));

  if (strategy === "subtree") {
    const subtreeMap = detectSubtrees(nodes, edges);
    let clusterIndex = 1;

    for (const [rootId, memberIds] of subtreeMap.entries()) {
      const rootNode = nodeMap.get(rootId);
      const label = rootNode?.name ? `${rootNode.name} Cluster` : `Subtree Cluster ${clusterIndex}`;
      groups.set(`cluster-subtree-${rootId}`, {
        label,
        nodeIds: memberIds,
        rootNodeId: rootId,
      });
      clusterIndex++;
    }
    return groups;
  }

  if (strategy === "section") {
    // 1. Group by dataset sections if provided
    if (sections && sections.length > 0) {
      for (const sec of sections) {
        groups.set(`cluster-sec-${sec.id}`, {
          label: sec.title || `Section ${sec.id}`,
          nodeIds: [...sec.nodeIds],
          rootNodeId: sec.nodeIds[0],
        });
      }
    }

    // 2. Group any nodes with sectionId or unassigned
    for (const node of nodes) {
      const sectionId = node.sectionId || (node.group ? `group-${node.group}` : undefined);
      if (sectionId) {
        const clusterId = `cluster-sec-${sectionId}`;
        const existing = groups.get(clusterId);
        if (existing) {
          if (!existing.nodeIds.includes(node.id)) {
            existing.nodeIds.push(node.id);
          }
        } else {
          groups.set(clusterId, {
            label: node.sectionId ? `Section ${node.sectionId}` : `Group ${node.group}`,
            nodeIds: [node.id],
            rootNodeId: node.id,
          });
        }
      } else if (!sections || sections.length === 0) {
        // Default cluster for unassigned nodes
        const defaultClusterId = "cluster-sec-default";
        const existing = groups.get(defaultClusterId);
        if (existing) {
          existing.nodeIds.push(node.id);
        } else {
          groups.set(defaultClusterId, {
            label: "Default Section",
            nodeIds: [node.id],
            rootNodeId: node.id,
          });
        }
      }
    }
    return groups;
  }

  if (strategy === "agent") {
    for (const node of nodes) {
      const hostAgentName = node.hostAgent?.name;
      const leaseAgent =
        typeof node.metadata?.leaseAgent === "string" ? node.metadata.leaseAgent : undefined;
      const actorId = node.provenance?.actorId;
      const role = typeof node.metadata?.role === "string" ? node.metadata.role : undefined;

      const agentKey =
        hostAgentName || leaseAgent || actorId || role || node.kind || "General Agent";
      const clusterId = `cluster-agent-${agentKey.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

      const existing = groups.get(clusterId);
      if (existing) {
        existing.nodeIds.push(node.id);
      } else {
        groups.set(clusterId, {
          label: `${agentKey} Cluster`,
          nodeIds: [node.id],
          rootNodeId: node.id,
        });
      }
    }
    return groups;
  }

  if (strategy === "custom" && customAssigner) {
    for (const node of nodes) {
      const assigned = customAssigner(node);
      const clusterKey = assigned || "default";
      const clusterId = `cluster-custom-${clusterKey.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

      const existing = groups.get(clusterId);
      if (existing) {
        existing.nodeIds.push(node.id);
      } else {
        groups.set(clusterId, {
          label: `${clusterKey} Cluster`,
          nodeIds: [node.id],
          rootNodeId: node.id,
        });
      }
    }
    return groups;
  }

  // Fallback: single cluster
  groups.set("cluster-all", {
    label: "Main Cluster",
    nodeIds: nodes.map((n) => n.id),
    rootNodeId: nodes[0]?.id,
  });
  return groups;
}

/**
 * Computes the bounding box for a set of nodes within a cluster.
 */
export function computeClusterBounds(
  nodeIds: readonly string[],
  nodeMap: Map<string, PositionedNode>,
  padding = 24,
  headerHeight = 0,
): ClusterBoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let validCount = 0;

  for (const id of nodeIds) {
    const node = nodeMap.get(id);
    if (!node) continue;

    validCount++;
    const nodeLeft = node.x;
    const nodeTop = node.y;
    const nodeRight = node.x + (node.width > 0 ? node.width : 200);
    const nodeBottom = node.y + (node.height > 0 ? node.height : 100);

    if (nodeLeft < minX) minX = nodeLeft;
    if (nodeTop < minY) minY = nodeTop;
    if (nodeRight > maxX) maxX = nodeRight;
    if (nodeBottom > maxY) maxY = nodeBottom;
  }

  if (validCount === 0 || minX === Infinity) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    };
  }

  const boundedMinX = minX - padding;
  const boundedMinY = minY - padding - headerHeight;
  const boundedMaxX = maxX + padding;
  const boundedMaxY = maxY + padding;

  return {
    x: boundedMinX,
    y: boundedMinY,
    width: boundedMaxX - boundedMinX,
    height: boundedMaxY - boundedMinY,
    minX: boundedMinX,
    minY: boundedMinY,
    maxX: boundedMaxX,
    maxY: boundedMaxY,
  };
}

/**
 * Applies manually pinned node coordinates to a set of positioned nodes.
 */
export function applyPinnedCoordinates(
  nodes: readonly PositionedNode[],
  pinnedMap: PinnedNodeMap | Map<string, PinnedCoordinate>,
): PositionedNode[] {
  const isMap = pinnedMap instanceof Map;

  return nodes.map((node) => {
    const pin = isMap ? pinnedMap.get(node.id) : pinnedMap[node.id];
    if (pin && Number.isFinite(pin.x) && Number.isFinite(pin.y)) {
      return {
        ...node,
        x: pin.x,
        y: pin.y,
      };
    }
    return node;
  });
}

/**
 * Preserves pinned coordinates across re-layout cycles.
 */
export function preservePinnedNodes(
  newLayoutNodes: readonly PositionedNode[],
  previousPinnedMap: PinnedNodeMap | Map<string, PinnedCoordinate>,
): PositionedNode[] {
  return applyPinnedCoordinates(newLayoutNodes, previousPinnedMap);
}

/**
 * Sets or updates a pinned coordinate for a node.
 */
export function pinNode(
  currentPins: PinnedNodeMap,
  nodeId: string,
  pos: PinnedCoordinate,
): PinnedNodeMap {
  return {
    ...currentPins,
    [nodeId]: { x: pos.x, y: pos.y },
  };
}

/**
 * Unpins a specific node.
 */
export function unpinNode(currentPins: PinnedNodeMap, nodeId: string): PinnedNodeMap {
  const next: PinnedNodeMap = { ...currentPins };
  delete next[nodeId];
  return next;
}

/**
 * Toggles the pinned status of a node.
 */
export function togglePinNode(
  currentPins: PinnedNodeMap,
  nodeId: string,
  pos?: PinnedCoordinate,
): PinnedNodeMap {
  if (currentPins[nodeId]) {
    return unpinNode(currentPins, nodeId);
  }
  if (pos) {
    return pinNode(currentPins, nodeId, pos);
  }
  return currentPins;
}

/**
 * Pins all currently positioned nodes.
 */
export function pinAllNodes(nodes: readonly PositionedNode[]): PinnedNodeMap {
  const next: PinnedNodeMap = {};
  for (const node of nodes) {
    next[node.id] = { x: node.x, y: node.y };
  }
  return next;
}

/**
 * Clears all pinned coordinates.
 */
export function clearAllPins(): PinnedNodeMap {
  return {};
}

/**
 * Collapses a cluster by adding its ID to the collapsed set.
 */
export function collapseCluster(clusterId: string, collapsedSet: ReadonlySet<string>): Set<string> {
  const next = new Set(collapsedSet);
  next.add(clusterId);
  return next;
}

/**
 * Expands a cluster by removing its ID from the collapsed set.
 */
export function expandCluster(clusterId: string, collapsedSet: ReadonlySet<string>): Set<string> {
  const next = new Set(collapsedSet);
  next.delete(clusterId);
  return next;
}

/**
 * Toggles a cluster's collapsed state.
 */
export function toggleClusterCollapse(
  clusterId: string,
  collapsedSet: ReadonlySet<string>,
): Set<string> {
  const next = new Set(collapsedSet);
  if (next.has(clusterId)) {
    next.delete(clusterId);
  } else {
    next.add(clusterId);
  }
  return next;
}

/**
 * Collapses all specified clusters.
 */
export function collapseAllClusters(clusterIds: readonly string[]): Set<string> {
  return new Set(clusterIds);
}

/**
 * Expands all clusters.
 */
export function expandAllClusters(): Set<string> {
  return new Set();
}

/**
 * Generates an SVG path string between two points.
 */
function buildSimpleEdgePath(
  source: { x: number; y: number },
  target: { x: number; y: number },
): string {
  const midY = (source.y + target.y) / 2;
  return `M ${source.x} ${source.y} C ${source.x} ${midY}, ${target.x} ${midY}, ${target.x} ${target.y}`;
}

/**
 * Transforms nodes and edges based on collapsed cluster states:
 * - Members of a collapsed cluster are collapsed into the representative root node.
 * - Root node receives a badge showing child count.
 * - Edges to/from child nodes inside the collapsed cluster are remapped to the root node.
 * - Internal intra-cluster edges are omitted when collapsed.
 */
export function applyClusterCollapse(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
  clusters: readonly SubtreeCluster[],
  collapsedClusterIds: ReadonlySet<string>,
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  if (collapsedClusterIds.size === 0) {
    return { nodes: [...nodes], edges: [...edges] };
  }

  const nodeToClusterMap = new Map<string, SubtreeCluster>();
  const collapsedClusterMap = new Map<string, SubtreeCluster>();

  for (const cluster of clusters) {
    if (collapsedClusterIds.has(cluster.id)) {
      collapsedClusterMap.set(cluster.id, cluster);
    }
    for (const nodeId of cluster.nodeIds) {
      nodeToClusterMap.set(nodeId, cluster);
    }
  }

  // Node ID mapping: childNodeId -> representativeRootNodeId
  const nodeRemap = new Map<string, string>();
  const hiddenNodeIds = new Set<string>();

  for (const cluster of collapsedClusterMap.values()) {
    const rootId = cluster.rootNodeId || cluster.nodeIds[0];
    for (const nodeId of cluster.nodeIds) {
      if (nodeId !== rootId) {
        hiddenNodeIds.add(nodeId);
        nodeRemap.set(nodeId, rootId);
      } else {
        nodeRemap.set(nodeId, rootId);
      }
    }
  }

  // Filter and decorate nodes
  const resultNodes: PositionedNode[] = [];
  for (const node of nodes) {
    if (hiddenNodeIds.has(node.id)) {
      continue;
    }

    const cluster = nodeToClusterMap.get(node.id);
    if (
      cluster &&
      collapsedClusterIds.has(cluster.id) &&
      node.id === (cluster.rootNodeId || cluster.nodeIds[0])
    ) {
      const childCount = cluster.nodeIds.length - 1;
      const updatedBadges = [...(node.badges ?? [])];
      if (childCount > 0) {
        updatedBadges.push({
          label: `+${childCount} sub-agents`,
          variant: "info",
        });
      }

      resultNodes.push({
        ...node,
        badges: updatedBadges,
        metadata: {
          ...node.metadata,
          isClusterCollapsed: true,
          collapsedClusterId: cluster.id,
          clusterChildCount: childCount,
        },
      });
    } else {
      resultNodes.push(node);
    }
  }

  const nodeMap = new Map<string, PositionedNode>(resultNodes.map((n) => [n.id, n]));

  // Remap and filter edges
  const resultEdges: PositionedEdge[] = [];
  const edgeKeySet = new Set<string>();

  for (const edge of edges) {
    const effectiveSource = nodeRemap.get(edge.source) ?? edge.source;
    const effectiveTarget = nodeRemap.get(edge.target) ?? edge.target;

    // If both source and target are inside the same collapsed cluster, prune intra-cluster edge
    if (
      effectiveSource === effectiveTarget &&
      nodeRemap.has(edge.source) &&
      nodeRemap.has(edge.target)
    ) {
      continue;
    }

    // Deduplicate parallel remapped edges
    const edgeKey = `${effectiveSource}->${effectiveTarget}:${edge.kind ?? "default"}`;
    if (edgeKeySet.has(edgeKey)) {
      continue;
    }
    edgeKeySet.add(edgeKey);

    const sourceNode = nodeMap.get(effectiveSource);
    const targetNode = nodeMap.get(effectiveTarget);

    let path = edge.path;
    let points = edge.points;

    // If edge was remapped, recalculate clean connector path
    if (
      (effectiveSource !== edge.source || effectiveTarget !== edge.target) &&
      sourceNode &&
      targetNode
    ) {
      const sourcePt = {
        x: sourceNode.x + sourceNode.width / 2,
        y: sourceNode.y + sourceNode.height,
      };
      const targetPt = {
        x: targetNode.x + targetNode.width / 2,
        y: targetNode.y,
      };
      path = buildSimpleEdgePath(sourcePt, targetPt);
      points = [sourcePt, targetPt];
    }

    resultEdges.push({
      ...edge,
      source: effectiveSource,
      target: effectiveTarget,
      path,
      points,
    });
  }

  return { nodes: resultNodes, edges: resultEdges };
}

/**
 * Computes the full clustered graph layout:
 * 1. Preserves pinned node coordinates.
 * 2. Groups nodes into clusters according to the grouping strategy.
 * 3. Calculates cluster bounding boxes.
 * 4. Applies cluster collapse and edge routing.
 */
export function computeClusteredLayout(
  datasetOrGraph:
    | GraphDataset
    | { nodes: PositionedNode[]; edges: PositionedEdge[]; sections?: GraphSection[] },
  options: ClusteringOptions = {},
): ClusteredGraphResult {
  const {
    padding = 24,
    headerHeight = 28,
    strategy = "subtree",
    collapsedClusterIds: inputCollapsed = new Set<string>(),
    pinnedNodes: inputPinned = {},
    customGroupAssigner,
    clusterColorPalette = DEFAULT_CLUSTER_COLORS,
    sections = "sections" in datasetOrGraph ? datasetOrGraph.sections : undefined,
  } = options;

  const collapsedSet: Set<string> =
    inputCollapsed instanceof Set ? new Set(inputCollapsed) : new Set(inputCollapsed ?? []);

  const pinnedMap: PinnedNodeMap =
    inputPinned instanceof Map ? Object.fromEntries(inputPinned.entries()) : { ...inputPinned };

  // 1. Apply pinned coordinates
  const initialNodes: PositionedNode[] = datasetOrGraph.nodes.map((n) => {
    const isPositioned = "x" in n && typeof (n as PositionedNode).x === "number";
    return isPositioned
      ? (n as PositionedNode)
      : {
          ...n,
          x: 0,
          y: 0,
          width: 200,
          height: 100,
        };
  });

  const pinnedNodes = applyPinnedCoordinates(initialNodes, pinnedMap);
  const nodeMap = new Map<string, PositionedNode>(pinnedNodes.map((n) => [n.id, n]));

  // Ensure edges are PositionedEdge
  const initialEdges: PositionedEdge[] = datasetOrGraph.edges.map((e) => {
    const isPositioned = "path" in e && typeof (e as PositionedEdge).path === "string";
    return isPositioned
      ? (e as PositionedEdge)
      : {
          ...e,
          path: "",
        };
  });

  // 2. Group nodes into clusters
  const grouped = groupNodesByStrategy(
    pinnedNodes,
    initialEdges,
    strategy,
    customAssignerOrNull(customGroupAssigner),
    sections,
  );

  // 3. Compute cluster structures and bounding boxes
  const clusters: SubtreeCluster[] = [];
  let colorIdx = 0;

  for (const [clusterId, group] of grouped.entries()) {
    const bounds = computeClusterBounds(group.nodeIds, nodeMap, padding, headerHeight);
    const color = clusterColorPalette[colorIdx % clusterColorPalette.length];
    colorIdx++;

    clusters.push({
      id: clusterId,
      label: group.label,
      rootNodeId: group.rootNodeId,
      nodeIds: group.nodeIds,
      isCollapsed: collapsedSet.has(clusterId),
      bounds,
      color,
    });
  }

  // 4. Apply collapse & edge routing
  const collapsedResult = applyClusterCollapse(pinnedNodes, initialEdges, clusters, collapsedSet);

  return {
    nodes: collapsedResult.nodes,
    edges: collapsedResult.edges,
    clusters,
    pinnedNodes: pinnedMap,
    collapsedClusterIds: collapsedSet,
  };
}

function customAssignerOrNull(
  fn?: (node: PositionedNode | GraphNodeData) => string | null,
): ((node: GraphNodeData | PositionedNode) => string | null) | undefined {
  return fn;
}
