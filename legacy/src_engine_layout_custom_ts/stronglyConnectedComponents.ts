import type { NormalizedGraph } from "./types";

export interface DetailedSCCResult {
  components: string[][];
  componentByNodeId: Map<string, string>;
  cyclicComponentIds: Set<string>;
  condensationOutgoing: Map<string, Set<string>>;
}

export function detectStronglyConnectedComponents(graph: NormalizedGraph): DetailedSCCResult {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const rawComponents: string[][] = [];

  // Deterministic Tarjan DFS visit
  function strongconnect(nodeId: string) {
    indices.set(nodeId, index);
    lowlinks.set(nodeId, index);
    index++;
    stack.push(nodeId);
    onStack.add(nodeId);

    const outgoing = graph.outgoingMap.get(nodeId) ?? [];
    for (const edge of outgoing) {
      const targetId = edge.target;
      if (!indices.has(targetId)) {
        strongconnect(targetId);
        lowlinks.set(nodeId, Math.min(lowlinks.get(nodeId)!, lowlinks.get(targetId)!));
      } else if (onStack.has(targetId)) {
        lowlinks.set(nodeId, Math.min(lowlinks.get(nodeId)!, indices.get(targetId)!));
      }
    }

    if (lowlinks.get(nodeId) === indices.get(nodeId)) {
      const compNodes: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        compNodes.push(w);
      } while (w !== nodeId);

      compNodes.sort((a, b) => a.localeCompare(b));
      rawComponents.push(compNodes);
    }
  }

  // Visit nodes in ID order
  for (const node of graph.nodes) {
    if (!indices.has(node.id)) {
      strongconnect(node.id);
    }
  }

  // Sort components by their first node ID for deterministic order
  rawComponents.sort((a, b) => a[0].localeCompare(b[0]));

  const componentByNodeId = new Map<string, string>();
  const cyclicComponentIds = new Set<string>();
  const condensationOutgoing = new Map<string, Set<string>>();

  // Check self loops
  const selfLoopNodes = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      selfLoopNodes.add(edge.source);
    }
  }

  for (const comp of rawComponents) {
    const compId = comp.join(",");
    condensationOutgoing.set(compId, new Set<string>());

    for (const nodeId of comp) {
      componentByNodeId.set(nodeId, compId);
    }

    if (comp.length > 1 || (comp.length === 1 && selfLoopNodes.has(comp[0]))) {
      cyclicComponentIds.add(compId);
    }
  }

  // Build condensation DAG adjacency between SCCs
  for (const edge of graph.edges) {
    const srcComp = componentByNodeId.get(edge.source)!;
    const tgtComp = componentByNodeId.get(edge.target)!;
    if (srcComp !== tgtComp) {
      condensationOutgoing.get(srcComp)?.add(tgtComp);
    }
  }

  return {
    components: rawComponents,
    componentByNodeId,
    cyclicComponentIds,
    condensationOutgoing,
  };
}
