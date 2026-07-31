import { describe, expect, it } from "bun:test";
import aiAgentTrace from "../../../../public/data/graphs/ai_agent_trace.json";
import cyclicMesh from "../../../../public/data/graphs/cyclic_mesh.json";
import decisionTree from "../../../../public/data/graphs/decision_tree.json";
import distributedSagaWorkflow from "../../../../public/data/graphs/distributed_saga_workflow.json";
import kubernetesClusterTopology from "../../../../public/data/graphs/kubernetes_cluster_topology.json";
import type { GraphDataset, GraphNodeData } from "../../../types/graphData";
import { calculateNodeDimensions } from "../nodeDimensions";
import { computeCustomLayout } from "./computeCustomLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";

interface TestDatasetItem {
  filename: string;
  dataset: GraphDataset;
}

describe("Public Sample Datasets Quality Gate Suite", () => {
  const datasets: TestDatasetItem[] = [
    { filename: "ai_agent_trace.json", dataset: aiAgentTrace as unknown as GraphDataset },
    { filename: "cyclic_mesh.json", dataset: cyclicMesh as unknown as GraphDataset },
    { filename: "decision_tree.json", dataset: decisionTree as unknown as GraphDataset },
    { filename: "distributed_saga_workflow.json", dataset: distributedSagaWorkflow as unknown as GraphDataset },
    { filename: "kubernetes_cluster_topology.json", dataset: kubernetesClusterTopology as unknown as GraphDataset },
  ];

  for (const { filename, dataset } of datasets) {
    it(`Dataset '${filename}': asserts 100% strict layout validity & zero badge node overlaps`, async () => {
      const normalizedNodes: NormalizedNode[] = dataset.nodes.map((n: GraphNodeData) => {
        const dims = calculateNodeDimensions(n);
        return {
          id: n.id,
          label: n.name,
          width: dims.width,
          height: dims.height,
        };
      });

      const normalizedEdges: NormalizedEdge[] = dataset.edges.map((e, idx) => ({
        id: e.id || `e-${e.source}-${e.target}-${idx}`,
        source: e.source,
        target: e.target,
        label: e.label,
        isCycle: e.isCycle,
      }));

      const layoutResult = await computeCustomLayout(normalizedNodes, normalizedEdges);

      // Verify node count & route resolution
      expect(layoutResult.nodes.length).toBe(dataset.nodes.length);
      expect(layoutResult.edges.length).toBe(dataset.edges.length);
      expect(layoutResult.validation.metrics.unresolvedRouteCount).toBe(0);

      // Verify badges: every labeled or cycle edge MUST have a badge placement
      const requiredBadgeCount = dataset.edges.filter(
        (e) => e.isCycle || (e.label && e.label.trim().length > 0),
      ).length;
      expect(layoutResult.badges.length).toBe(requiredBadgeCount);
      expect(layoutResult.validation.metrics.unresolvedBadgeCount).toBe(0);

      // Hard Error Metrics Assertions
      const { metrics } = layoutResult.validation;
      expect(metrics.nodeNodeOverlaps).toBe(0);
      expect(metrics.edgeNodePenetrations).toBe(0);
      expect(metrics.badgeNodeOverlaps).toBe(0);
      expect(metrics.badgeBadgeOverlaps).toBe(0);

      const errors = layoutResult.validation.diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        console.error(`❌ Sample Dataset '${filename}' Validation Errors:`, errors);
      }

      expect(layoutResult.validation.isValid).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});
