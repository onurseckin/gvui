import { describe, expect, it } from "bun:test";
import type { GraphDataset } from "../../types/graphData";
import { computeCustomEngineGraphLayout, getEdgeCompositeBadgeText } from "./customLayoutAdapter";
import { computeCustomLayoutWasm, ensureWasmInitialized } from "./custom/wasmLayoutAdapter";
import type { BkAlign, Direction } from "./custom/config";
import type { NormalizedEdge, NormalizedNode, Side } from "./custom/types";

describe("Layered Inverted Transforms Invariants (T-04)", () => {
  const directions: Direction[] = ["top-down", "bottom-up", "left-right", "right-left"];

  const pipelineDataset: GraphDataset = {
    id: "pipeline-ds",
    title: "Sequential Pipeline",
    nodes: [
      { id: "A", name: "Source A", description: "First stage" },
      { id: "B", name: "Transform B", description: "Second stage" },
      { id: "C", name: "Sink C", description: "Third stage" },
    ],
    edges: [
      {
        id: "e1",
        source: "A",
        target: "B",
        stepNumber: "01",
        container: { title: "Fetch", detail: "Payload" },
      },
      {
        id: "e2",
        source: "B",
        target: "C",
        stepNumber: "02",
        container: { title: "Store", detail: "Database" },
      },
    ],
  };

  it("ensures WASM engine is initialized", async () => {
    await ensureWasmInitialized();
    expect(true).toBe(true);
  });

  describe("1. Cardinal Flow Directions & Rank Progression", () => {
    it("progresses downward (+y) for top-down", async () => {
      const result = await computeCustomEngineGraphLayout(pipelineDataset, {
        direction: "top-down",
      });
      const nodeA = result.nodes.find((n) => n.id === "A")!;
      const nodeB = result.nodes.find((n) => n.id === "B")!;
      const nodeC = result.nodes.find((n) => n.id === "C")!;

      expect(nodeA.y).toBeLessThan(nodeB.y);
      expect(nodeB.y).toBeLessThan(nodeC.y);
      expect(result.edges).toHaveLength(2);
    });

    it("progresses upward (-y) for bottom-up and accepts bottom-top alias", async () => {
      const resultBU = await computeCustomEngineGraphLayout(pipelineDataset, {
        direction: "bottom-up",
      });
      const nodeA_BU = resultBU.nodes.find((n) => n.id === "A")!;
      const nodeB_BU = resultBU.nodes.find((n) => n.id === "B")!;
      const nodeC_BU = resultBU.nodes.find((n) => n.id === "C")!;

      expect(nodeA_BU.y).toBeGreaterThan(nodeB_BU.y);
      expect(nodeB_BU.y).toBeGreaterThan(nodeC_BU.y);

      // Verify alias "bottom-top" resolves identical coordinate structure
      const resultBT = await computeCustomEngineGraphLayout(pipelineDataset, {
        direction: "bottom-top" as unknown as Direction,
      });
      const nodeA_BT = resultBT.nodes.find((n) => n.id === "A")!;
      const nodeB_BT = resultBT.nodes.find((n) => n.id === "B")!;
      const nodeC_BT = resultBT.nodes.find((n) => n.id === "C")!;

      expect(nodeA_BT.y).toBe(nodeA_BU.y);
      expect(nodeB_BT.y).toBe(nodeB_BU.y);
      expect(nodeC_BT.y).toBe(nodeC_BU.y);
    });

    it("progresses rightward (+x) for left-right", async () => {
      const result = await computeCustomEngineGraphLayout(pipelineDataset, {
        direction: "left-right",
      });
      const nodeA = result.nodes.find((n) => n.id === "A")!;
      const nodeB = result.nodes.find((n) => n.id === "B")!;
      const nodeC = result.nodes.find((n) => n.id === "C")!;

      expect(nodeA.x).toBeLessThan(nodeB.x);
      expect(nodeB.x).toBeLessThan(nodeC.x);
    });

    it("progresses leftward (-x) for right-left", async () => {
      const result = await computeCustomEngineGraphLayout(pipelineDataset, {
        direction: "right-left",
      });
      const nodeA = result.nodes.find((n) => n.id === "A")!;
      const nodeB = result.nodes.find((n) => n.id === "B")!;
      const nodeC = result.nodes.find((n) => n.id === "C")!;

      expect(nodeA.x).toBeGreaterThan(nodeB.x);
      expect(nodeB.x).toBeGreaterThan(nodeC.x);
    });
  });

  describe("2. Brandes-Koepf Coordinate Inversion & Candidate Alignments", () => {
    const diamondDataset: GraphDataset = {
      id: "diamond-ds",
      title: "Diamond Graph",
      nodes: [
        { id: "root", name: "Root" },
        { id: "left", name: "Left Branch" },
        { id: "right", name: "Right Branch" },
        { id: "join", name: "Join Node" },
      ],
      edges: [
        { id: "e1", source: "root", target: "left", label: "to left" },
        { id: "e2", source: "root", target: "right", label: "to right" },
        { id: "e3", source: "left", target: "join", label: "from left" },
        { id: "e4", source: "right", target: "join", label: "from right" },
      ],
    };

    const bkAlignments: BkAlign[] = [
      "median",
      "leftmost",
      "rightmost",
      "up-left",
      "up-right",
      "down-left",
      "down-right",
    ];

    for (const dir of directions) {
      for (const align of bkAlignments) {
        it(`computes valid coordinates for direction '${dir}' with bkAlign '${align}'`, async () => {
          const result = await computeCustomEngineGraphLayout(diamondDataset, {
            direction: dir,
            bkAlign: align,
          });

          expect(result.nodes).toHaveLength(4);
          expect(result.edges).toHaveLength(4);

          for (const node of result.nodes) {
            expect(Number.isFinite(node.x)).toBe(true);
            expect(Number.isFinite(node.y)).toBe(true);
            expect(node.width).toBeGreaterThan(0);
            expect(node.height).toBeGreaterThan(0);
          }

          // Invariants: Left and right branches are horizontally separated in TD/BT, vertically in LR/RL
          const leftNode = result.nodes.find((n) => n.id === "left")!;
          const rightNode = result.nodes.find((n) => n.id === "right")!;

          if (dir === "top-down" || dir === "bottom-up") {
            const horizontalDistance = Math.abs(
              leftNode.x + leftNode.width / 2 - (rightNode.x + rightNode.width / 2),
            );
            expect(horizontalDistance).toBeGreaterThan(50);
          } else {
            const verticalDistance = Math.abs(
              leftNode.y + leftNode.height / 2 - (rightNode.y + rightNode.height / 2),
            );
            expect(verticalDistance).toBeGreaterThan(50);
          }
        });
      }
    }
  });

  describe("3. Composite Badge Measurement Propagation Across All Directions", () => {
    const complexBadgeDataset: GraphDataset = {
      id: "badge-ds",
      title: "Badge Propagation Test",
      nodes: [
        { id: "n1", name: "Dispatcher" },
        { id: "n2", name: "Worker" },
      ],
      edges: [
        {
          id: "edge-rich-badge",
          source: "n1",
          target: "n2",
          stepNumber: "Step 04",
          container: {
            title: "Process Batch",
            detail: "5.2k tokens / 12 items",
          },
          bundleCount: 4,
        },
      ],
    };

    it("verifies composite text composition", () => {
      const text = getEdgeCompositeBadgeText(complexBadgeDataset.edges[0]);
      expect(text).toBe("04 Process Batch x4 5.2k tokens / 12 items");
    });

    for (const dir of directions) {
      it(`propagates measured badge geometry correctly in direction '${dir}'`, async () => {
        const result = await computeCustomEngineGraphLayout(complexBadgeDataset, {
          direction: dir,
        });

        const edge = result.edges[0];
        expect(edge).toBeDefined();
        expect(edge.badgeRect).toBeDefined();
        expect(edge.badgeRect!.width).toBeGreaterThan(100);
        expect(edge.badgeRect!.height).toBeGreaterThanOrEqual(20);
        expect(edge.anchorPoint).toBeDefined();
        expect(Number.isFinite(edge.labelX)).toBe(true);
        expect(Number.isFinite(edge.labelY)).toBe(true);

        // Label center must match badge rect center
        const expectedX = edge.badgeRect!.x + edge.badgeRect!.width / 2;
        const expectedY = edge.badgeRect!.y + edge.badgeRect!.height / 2;
        expect(Math.abs(edge.labelX! - expectedX)).toBeLessThan(1.0);
        expect(Math.abs(edge.labelY! - expectedY)).toBeLessThan(1.0);
      });
    }
  });

  describe("4. Outward Port Normal Vectors & Side Invariants", () => {
    const multiEdgeDataset: GraphDataset = {
      id: "multi-edge-ds",
      title: "Multi Edge Ports",
      nodes: [
        { id: "A", name: "Node A" },
        { id: "B", name: "Node B" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B", label: "forward" },
        { id: "e2", source: "B", target: "A", label: "feedback", isCycle: true },
      ],
    };

    function assertOutwardPortNormal(
      side: Side,
      point: { x: number; y: number },
      stub: { x: number; y: number },
    ): void {
      const dx = stub.x - point.x;
      const dy = stub.y - point.y;

      switch (side) {
        case "top":
          expect(Math.abs(dx)).toBeLessThan(0.01);
          expect(dy).toBeLessThan(0); // Stub points up
          break;
        case "bottom":
          expect(Math.abs(dx)).toBeLessThan(0.01);
          expect(dy).toBeGreaterThan(0); // Stub points down
          break;
        case "left":
          expect(dx).toBeLessThan(0); // Stub points left
          expect(Math.abs(dy)).toBeLessThan(0.01);
          break;
        case "right":
          expect(dx).toBeGreaterThan(0); // Stub points right
          expect(Math.abs(dy)).toBeLessThan(0.01);
          break;
      }
    }

    for (const dir of directions) {
      it(`guarantees outward normal vectors for direction '${dir}'`, async () => {
        const result = await computeCustomEngineGraphLayout(multiEdgeDataset, {
          direction: dir,
        });

        for (const edge of result.edges) {
          if (edge.sourcePort) {
            assertOutwardPortNormal(
              edge.sourcePort.side,
              edge.sourcePort.point,
              edge.sourcePort.stub,
            );
          }
          if (edge.targetPort) {
            assertOutwardPortNormal(
              edge.targetPort.side,
              edge.targetPort.point,
              edge.targetPort.stub,
            );
          }
        }
      });
    }
  });

  describe("5. Channel Lane Depth Preservation & Collinear Avoidance Invariants", () => {
    const meshDataset: GraphDataset = {
      id: "mesh-ds",
      title: "Mesh 6 Nodes 8 Edges",
      nodes: [
        { id: "n1", name: "Input 1" },
        { id: "n2", name: "Input 2" },
        { id: "n3", name: "Mid 1" },
        { id: "n4", name: "Mid 2" },
        { id: "n5", name: "Sink 1" },
        { id: "n6", name: "Sink 2" },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n3", label: "1->3" },
        { id: "e2", source: "n1", target: "n4", label: "1->4" },
        { id: "e3", source: "n2", target: "n3", label: "2->3" },
        { id: "e4", source: "n2", target: "n4", label: "2->4" },
        { id: "e5", source: "n3", target: "n5", label: "3->5" },
        { id: "e6", source: "n3", target: "n6", label: "3->6" },
        { id: "e7", source: "n4", target: "n5", label: "4->5" },
        { id: "e8", source: "n4", target: "n6", label: "4->6" },
      ],
    };

    it("preserves channel lane depth and zero collinear overlaps in TD and BT", async () => {
      const normalizedNodes: NormalizedNode[] = meshDataset.nodes.map((n) => ({
        id: n.id,
        label: n.name,
        width: 160,
        height: 60,
      }));
      const normalizedEdges: NormalizedEdge[] = meshDataset.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        labelWidth: 80,
        labelHeight: 24,
      }));

      const resTD = await computeCustomLayoutWasm(normalizedNodes, normalizedEdges, {
        direction: "top-down",
      });
      const resBT = await computeCustomLayoutWasm(normalizedNodes, normalizedEdges, {
        direction: "bottom-up",
      });

      expect(resTD.validation.metrics.collinearEdgeOverlaps).toBe(0);
      expect(resBT.validation.metrics.collinearEdgeOverlaps).toBe(0);
      expect(resTD.validation.metrics.laneDepthMax).toBe(resBT.validation.metrics.laneDepthMax);
      expect(resTD.validation.metrics.nodeNodeOverlaps).toBe(0);
      expect(resBT.validation.metrics.nodeNodeOverlaps).toBe(0);
      expect(resTD.validation.metrics.edgeNodePenetrations).toBe(0);
      expect(resBT.validation.metrics.edgeNodePenetrations).toBe(0);
      expect(resTD.validation.metrics.badgeNodeOverlaps).toBe(0);
      expect(resBT.validation.metrics.badgeNodeOverlaps).toBe(0);
      expect(resTD.validation.metrics.unresolvedRouteCount).toBe(0);
      expect(resBT.validation.metrics.unresolvedRouteCount).toBe(0);
    });

    it("preserves channel lane depth and zero collinear overlaps in LR and RL", async () => {
      const normalizedNodes: NormalizedNode[] = meshDataset.nodes.map((n) => ({
        id: n.id,
        label: n.name,
        width: 160,
        height: 60,
      }));
      const normalizedEdges: NormalizedEdge[] = meshDataset.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        labelWidth: 80,
        labelHeight: 24,
      }));

      const resLR = await computeCustomLayoutWasm(normalizedNodes, normalizedEdges, {
        direction: "left-right",
      });
      const resRL = await computeCustomLayoutWasm(normalizedNodes, normalizedEdges, {
        direction: "right-left",
      });

      expect(resLR.validation.metrics.collinearEdgeOverlaps).toBe(0);
      expect(resRL.validation.metrics.collinearEdgeOverlaps).toBe(0);
      expect(resLR.validation.metrics.laneDepthMax).toBe(resRL.validation.metrics.laneDepthMax);
      expect(resLR.validation.metrics.nodeNodeOverlaps).toBe(0);
      expect(resRL.validation.metrics.nodeNodeOverlaps).toBe(0);
      expect(resLR.validation.metrics.edgeNodePenetrations).toBe(0);
      expect(resRL.validation.metrics.edgeNodePenetrations).toBe(0);
      expect(resLR.validation.metrics.badgeNodeOverlaps).toBe(0);
      expect(resRL.validation.metrics.badgeNodeOverlaps).toBe(0);
      expect(resLR.validation.metrics.unresolvedRouteCount).toBe(0);
      expect(resRL.validation.metrics.unresolvedRouteCount).toBe(0);
    });
  });

  describe("6. Exact Affine Coordinate Symmetry & Isometry Invariants", () => {
    const symmetryDataset: GraphDataset = {
      id: "symmetry-ds",
      title: "Affine Symmetry Verification",
      nodes: [
        { id: "A", name: "Alpha", description: "Root" },
        { id: "B", name: "Beta", description: "Branch 1" },
        { id: "C", name: "Gamma", description: "Branch 2" },
        { id: "D", name: "Delta", description: "Sink" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B", label: "A->B" },
        { id: "e2", source: "A", target: "C", label: "A->C" },
        { id: "e3", source: "B", target: "D", label: "B->D" },
        { id: "e4", source: "C", target: "D", label: "C->D" },
      ],
    };

    it("verifies exact affine isomorphism between TopDown and BottomUp", async () => {
      const resTD = await computeCustomEngineGraphLayout(symmetryDataset, {
        direction: "top-down",
      });
      const resBT = await computeCustomEngineGraphLayout(symmetryDataset, {
        direction: "bottom-up",
      });

      let minY_TD = Infinity;
      let maxY_TD = -Infinity;
      for (const n of resTD.nodes) {
        minY_TD = Math.min(minY_TD, n.y);
        maxY_TD = Math.max(maxY_TD, n.y + n.height);
      }
      const sumY = minY_TD + maxY_TD;

      for (const nTD of resTD.nodes) {
        const nBT = resBT.nodes.find((n) => n.id === nTD.id)!;
        expect(nBT).toBeDefined();
        // x coordinate and dimensions are invariant under vertical mirror
        expect(Math.abs(nBT.x - nTD.x)).toBeLessThan(0.01);
        expect(Math.abs(nBT.width - nTD.width)).toBeLessThan(0.01);
        expect(Math.abs(nBT.height - nTD.height)).toBeLessThan(0.01);

        // y coordinate mirrors about bounding box extent: y_BT = sumY - (y_TD + height)
        const expectedY_BT = sumY - (nTD.y + nTD.height);
        expect(Math.abs(nBT.y - expectedY_BT)).toBeLessThan(0.01);
      }

      // Verify edge waypoint symmetry
      for (const eTD of resTD.edges) {
        const eBT = resBT.edges.find((e) => e.id === eTD.id)!;
        expect(eBT).toBeDefined();
        expect(eTD.points).toBeDefined();
        expect(eBT.points).toBeDefined();
        expect(eBT.points!.length).toBe(eTD.points!.length);

        for (let i = 0; i < eTD.points!.length; i++) {
          const ptTD = eTD.points![i]!;
          const ptBT = eBT.points![i]!;
          expect(Math.abs(ptBT.x - ptTD.x)).toBeLessThan(0.01);
          expect(Math.abs(ptBT.y - (sumY - ptTD.y))).toBeLessThan(0.01);
        }
      }
    });

    it("verifies port points lie on boundary and stubs project strictly outward", async () => {
      for (const dir of directions) {
        const result = await computeCustomEngineGraphLayout(symmetryDataset, {
          direction: dir,
        });

        const nodeMap = new Map(result.nodes.map((n) => [n.id, n]));

        for (const edge of result.edges) {
          const ports = [
            { port: edge.sourcePort, nodeId: edge.source },
            { port: edge.targetPort, nodeId: edge.target },
          ];

          for (const { port, nodeId } of ports) {
            if (!port) continue;
            const node = nodeMap.get(nodeId)!;
            expect(node).toBeDefined();

            // Port boundary attachment checks
            switch (port.side) {
              case "top":
                expect(Math.abs(port.point.y - node.y)).toBeLessThan(0.01);
                expect(port.point.x).toBeGreaterThanOrEqual(node.x - 0.01);
                expect(port.point.x).toBeLessThanOrEqual(node.x + node.width + 0.01);
                // Stub is strictly above node
                expect(port.stub.y).toBeLessThan(node.y);
                break;
              case "bottom":
                expect(Math.abs(port.point.y - (node.y + node.height))).toBeLessThan(0.01);
                expect(port.point.x).toBeGreaterThanOrEqual(node.x - 0.01);
                expect(port.point.x).toBeLessThanOrEqual(node.x + node.width + 0.01);
                // Stub is strictly below node
                expect(port.stub.y).toBeGreaterThan(node.y + node.height);
                break;
              case "left":
                expect(Math.abs(port.point.x - node.x)).toBeLessThan(0.01);
                expect(port.point.y).toBeGreaterThanOrEqual(node.y - 0.01);
                expect(port.point.y).toBeLessThanOrEqual(node.y + node.height + 0.01);
                // Stub is strictly left of node
                expect(port.stub.x).toBeLessThan(node.x);
                break;
              case "right":
                expect(Math.abs(port.point.x - (node.x + node.width))).toBeLessThan(0.01);
                expect(port.point.y).toBeGreaterThanOrEqual(node.y - 0.01);
                expect(port.point.y).toBeLessThanOrEqual(node.y + node.height + 0.01);
                // Stub is strictly right of node
                expect(port.stub.x).toBeGreaterThan(node.x + node.width);
                break;
            }
          }
        }
      }
    });
  });

  describe("7. Reciprocal Aspect Ratio Invariance, Isometry, & Total Area Conservation", () => {
    const generalTopologies: {
      name: string;
      nodes: NormalizedNode[];
      edges: NormalizedEdge[];
    }[] = [
      {
        name: "Linear Pipeline (General)",
        nodes: [
          { id: "A", label: "Stage 1", width: 140, height: 60 },
          { id: "B", label: "Stage 2", width: 140, height: 60 },
          { id: "C", label: "Stage 3", width: 140, height: 60 },
        ],
        edges: [
          { id: "e1", source: "A", target: "B" },
          { id: "e2", source: "B", target: "C" },
        ],
      },
      {
        name: "Diamond DAG (General)",
        nodes: [
          { id: "root", label: "Root", width: 140, height: 60 },
          { id: "left", label: "Left", width: 140, height: 60 },
          { id: "right", label: "Right", width: 140, height: 60 },
          { id: "join", label: "Join", width: 140, height: 60 },
        ],
        edges: [
          { id: "e1", source: "root", target: "left" },
          { id: "e2", source: "root", target: "right" },
          { id: "e3", source: "left", target: "join" },
          { id: "e4", source: "right", target: "join" },
        ],
      },
      {
        name: "Multi-rank Mesh Graph (General)",
        nodes: [
          { id: "m1", label: "M1", width: 150, height: 60 },
          { id: "m2", label: "M2", width: 150, height: 60 },
          { id: "m3", label: "M3", width: 150, height: 60 },
          { id: "m4", label: "M4", width: 150, height: 60 },
        ],
        edges: [
          { id: "e1", source: "m1", target: "m3" },
          { id: "e2", source: "m1", target: "m4" },
          { id: "e3", source: "m2", target: "m3" },
          { id: "e4", source: "m2", target: "m4" },
        ],
      },
    ];

    for (const topo of generalTopologies) {
      it(`preserves vertical mirror isometry (TD == BT) and horizontal mirror isometry (LR == RL) for ${topo.name}`, async () => {
        const resTD = await computeCustomLayoutWasm(topo.nodes, topo.edges, {
          direction: "top-down",
        });
        const resBT = await computeCustomLayoutWasm(topo.nodes, topo.edges, {
          direction: "bottom-up",
        });
        const resLR = await computeCustomLayoutWasm(topo.nodes, topo.edges, {
          direction: "left-right",
        });
        const resRL = await computeCustomLayoutWasm(topo.nodes, topo.edges, {
          direction: "right-left",
        });

        // Vertical reflection symmetry (TD == BT)
        expect(
          Math.abs(resBT.validation.metrics.aspectRatio - resTD.validation.metrics.aspectRatio),
        ).toBeLessThan(0.01);
        expect(
          Math.abs(resBT.validation.metrics.area - resTD.validation.metrics.area),
        ).toBeLessThan(0.01);
        expect(
          Math.abs(resBT.validation.metrics.totalLength - resTD.validation.metrics.totalLength),
        ).toBeLessThan(0.01);

        // Horizontal reflection symmetry (LR == RL)
        expect(
          Math.abs(resRL.validation.metrics.aspectRatio - resLR.validation.metrics.aspectRatio),
        ).toBeLessThan(0.01);
        expect(
          Math.abs(resRL.validation.metrics.area - resLR.validation.metrics.area),
        ).toBeLessThan(0.01);
        expect(
          Math.abs(resRL.validation.metrics.totalLength - resLR.validation.metrics.totalLength),
        ).toBeLessThan(0.01);
      });
    }

    const isotropicTopologies: {
      name: string;
      nodes: NormalizedNode[];
      edges: NormalizedEdge[];
    }[] = [
      {
        name: "Isotropic Linear Pipeline",
        nodes: [
          { id: "A", label: "Stage 1", width: 80, height: 80 },
          { id: "B", label: "Stage 2", width: 80, height: 80 },
          { id: "C", label: "Stage 3", width: 80, height: 80 },
        ],
        edges: [
          { id: "e1", source: "A", target: "B" },
          { id: "e2", source: "B", target: "C" },
        ],
      },
      {
        name: "Isotropic Diamond DAG",
        nodes: [
          { id: "root", label: "Root", width: 80, height: 80 },
          { id: "left", label: "Left", width: 80, height: 80 },
          { id: "right", label: "Right", width: 80, height: 80 },
          { id: "join", label: "Join", width: 80, height: 80 },
        ],
        edges: [
          { id: "e1", source: "root", target: "left" },
          { id: "e2", source: "root", target: "right" },
          { id: "e3", source: "left", target: "join" },
          { id: "e4", source: "right", target: "join" },
        ],
      },
      {
        name: "Isotropic 4-Node Mesh",
        nodes: [
          { id: "m1", label: "M1", width: 80, height: 80 },
          { id: "m2", label: "M2", width: 80, height: 80 },
          { id: "m3", label: "M3", width: 80, height: 80 },
          { id: "m4", label: "M4", width: 80, height: 80 },
        ],
        edges: [
          { id: "e1", source: "m1", target: "m3" },
          { id: "e2", source: "m1", target: "m4" },
          { id: "e3", source: "m2", target: "m3" },
          { id: "e4", source: "m2", target: "m4" },
        ],
      },
    ];

    for (const topo of isotropicTopologies) {
      it(`preserves reciprocal aspect ratio (AR_LR * AR_TD = 1.0) and total area conservation across all 4 directions for ${topo.name}`, async () => {
        const isoConfig = { rankSeparation: 60, nodeSeparation: 60 };
        const resTD = await computeCustomLayoutWasm(topo.nodes, topo.edges, {
          ...isoConfig,
          direction: "top-down",
        });
        const resBT = await computeCustomLayoutWasm(topo.nodes, topo.edges, {
          ...isoConfig,
          direction: "bottom-up",
        });
        const resLR = await computeCustomLayoutWasm(topo.nodes, topo.edges, {
          ...isoConfig,
          direction: "left-right",
        });
        const resRL = await computeCustomLayoutWasm(topo.nodes, topo.edges, {
          ...isoConfig,
          direction: "right-left",
        });

        const arTD = resTD.validation.metrics.aspectRatio;
        const arBT = resBT.validation.metrics.aspectRatio;
        const arLR = resLR.validation.metrics.aspectRatio;
        const arRL = resRL.validation.metrics.aspectRatio;

        const areaTD = resTD.validation.metrics.area;
        const areaBT = resBT.validation.metrics.area;
        const areaLR = resLR.validation.metrics.area;
        const areaRL = resRL.validation.metrics.area;

        // Vertical reflection symmetry
        expect(Math.abs(arBT - arTD)).toBeLessThan(0.01);
        expect(Math.abs(areaBT - areaTD)).toBeLessThan(0.01);

        // Horizontal transposition area conservation
        expect(Math.abs(areaLR - areaTD)).toBeLessThan(0.01);
        expect(Math.abs(areaRL - areaTD)).toBeLessThan(0.01);

        // Reciprocal aspect ratio invariance
        expect(Math.abs(arLR * arTD - 1.0)).toBeLessThan(0.01);
        expect(Math.abs(arRL * arTD - 1.0)).toBeLessThan(0.01);

        // Total path wirelength isometry
        const lenTD = resTD.validation.metrics.totalLength;
        const lenBT = resBT.validation.metrics.totalLength;
        const lenLR = resLR.validation.metrics.totalLength;
        const lenRL = resRL.validation.metrics.totalLength;

        expect(Math.abs(lenBT - lenTD)).toBeLessThan(0.01);
        expect(Math.abs(lenLR - lenTD)).toBeLessThan(0.01);
        expect(Math.abs(lenRL - lenTD)).toBeLessThan(0.01);
      });
    }
  });
});
