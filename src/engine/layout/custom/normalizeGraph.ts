import type {
  NormalizedEdge,
  NormalizedGraph,
  NormalizedNode,
} from "./types";

export class LayoutInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutInputError";
  }
}

export interface NormalizedGraphResult extends NormalizedGraph {
  components: string[][];
}

export function normalizeGraph(
  inputNodes: NormalizedNode[],
  inputEdges: NormalizedEdge[]
): NormalizedGraphResult {
  const nodeMap = new Map<string, NormalizedNode>();
  const edgeMap = new Map<string, NormalizedEdge>();

  // Validate nodes
  for (const node of inputNodes) {
    if (!node.id || typeof node.id !== "string" || node.id.trim() === "") {
      throw new LayoutInputError("Node ID cannot be empty");
    }
    if (nodeMap.has(node.id)) {
      throw new LayoutInputError(`Duplicate node ID '${node.id}' found`);
    }
    if (
      typeof node.width !== "number" ||
      node.width <= 0 ||
      !Number.isFinite(node.width) ||
      typeof node.height !== "number" ||
      node.height <= 0 ||
      !Number.isFinite(node.height)
    ) {
      throw new LayoutInputError(
        `Node '${node.id}' must have positive finite width and height, got (${node.width}, ${node.height})`
      );
    }
    nodeMap.set(node.id, { ...node });
  }

  // Validate edges
  for (const edge of inputEdges) {
    if (!edge.id || typeof edge.id !== "string" || edge.id.trim() === "") {
      throw new LayoutInputError("Edge ID cannot be empty");
    }
    if (edgeMap.has(edge.id)) {
      throw new LayoutInputError(`Duplicate edge ID '${edge.id}' found`);
    }
    if (!nodeMap.has(edge.source)) {
      throw new LayoutInputError(`Edge '${edge.id}' references missing source node '${edge.source}'`);
    }
    if (!nodeMap.has(edge.target)) {
      throw new LayoutInputError(`Edge '${edge.id}' references missing target node '${edge.target}'`);
    }
    const layoutRole = edge.layoutRole ?? "auto";
    if (
      layoutRole !== "auto" &&
      layoutRole !== "forward" &&
      layoutRole !== "cross" &&
      layoutRole !== "feedback"
    ) {
      throw new LayoutInputError(`Edge '${edge.id}' has invalid layoutRole '${edge.layoutRole}'`);
    }
    edgeMap.set(edge.id, { ...edge, layoutRole });
  }

  // Sort nodes and edges deterministically by ID
  const sortedNodes = Array.from(nodeMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = Array.from(edgeMap.values()).sort((a, b) => a.id.localeCompare(b.id));

  // Build incoming/outgoing adjacency maps
  const outgoingMap = new Map<string, NormalizedEdge[]>();
  const incomingMap = new Map<string, NormalizedEdge[]>();

  for (const node of sortedNodes) {
    outgoingMap.set(node.id, []);
    incomingMap.set(node.id, []);
  }

  for (const edge of sortedEdges) {
    outgoingMap.get(edge.source)?.push(edge);
    incomingMap.get(edge.target)?.push(edge);
  }

  // Sort adjacency lists by edge ID
  for (const node of sortedNodes) {
    outgoingMap.get(node.id)?.sort((a, b) => a.id.localeCompare(b.id));
    incomingMap.get(node.id)?.sort((a, b) => a.id.localeCompare(b.id));
  }

  // Build weak components (undirected BFS/DFS)
  const undirectedAdj = new Map<string, Set<string>>();
  for (const node of sortedNodes) {
    undirectedAdj.set(node.id, new Set<string>());
  }
  for (const edge of sortedEdges) {
    undirectedAdj.get(edge.source)?.add(edge.target);
    undirectedAdj.get(edge.target)?.add(edge.source);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of sortedNodes) {
    if (visited.has(node.id)) continue;

    const component: string[] = [];
    const queue: string[] = [node.id];
    visited.add(node.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      component.push(curr);

      const neighbors = Array.from(undirectedAdj.get(curr) ?? []).sort((a, b) => a.localeCompare(b));
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    component.sort((a, b) => a.localeCompare(b));
    components.push(component);
  }

  // Sort components by their smallest node ID
  components.sort((a, b) => a[0].localeCompare(b[0]));

  return {
    nodes: sortedNodes,
    edges: sortedEdges,
    nodeMap,
    edgeMap,
    outgoingMap,
    incomingMap,
    components,
  };
}
