import { describe, expect, it } from "bun:test";
import { deriveSearchStateBudgets } from "./layoutOptimizerState";
import k8sData from "../../../../public/data/graphs/kubernetes_cluster_topology.json";

describe("layoutOptimizerState performance budget derivation", () => {
  it("bounds maxLayoutStates to <= 15 for dense graphs with >= 10 nodes", () => {
    const nodes = k8sData.nodes.map((n) => ({ id: n.id, width: 200, height: 70 }));
    const edges = k8sData.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: Boolean(e.isCycle),
    }));
    const config = { nodeGap: 50, rankGap: 80 } as any;

    const budgets = deriveSearchStateBudgets(nodes as any, edges as any, config);
    expect(budgets.maxLayoutStates).toBeLessThanOrEqual(15);
  });
});
