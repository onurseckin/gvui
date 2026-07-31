import { describe, expect, it } from "bun:test";
import { sortNodeSideEndpoints, type NodePortEndpoint } from "./portOrdering";

describe("portOrdering", () => {
  it("sorts top/bottom side ports left-to-right by target X center", () => {
    const nodeCenter = { x: 200, y: 200 };
    const endpoints: NodePortEndpoint[] = [
      {
        edgeId: "e2",
        endpointKind: "src",
        nodeId: "A",
        side: "bottom",
        otherNodeCenter: { x: 350, y: 400 },
      },
      {
        edgeId: "e1",
        endpointKind: "src",
        nodeId: "A",
        side: "bottom",
        otherNodeCenter: { x: 100, y: 400 },
      },
    ];

    const sorted = sortNodeSideEndpoints(endpoints, nodeCenter);
    expect(sorted.map((e) => e.edgeId)).toEqual(["e1", "e2"]);
  });

  it("sorts left/right side ports top-to-bottom by target Y center", () => {
    const nodeCenter = { x: 200, y: 200 };
    const endpoints: NodePortEndpoint[] = [
      {
        edgeId: "e2",
        endpointKind: "src",
        nodeId: "A",
        side: "right",
        otherNodeCenter: { x: 400, y: 300 },
      },
      {
        edgeId: "e1",
        endpointKind: "src",
        nodeId: "A",
        side: "right",
        otherNodeCenter: { x: 400, y: 100 },
      },
    ];

    const sorted = sortNodeSideEndpoints(endpoints, nodeCenter);
    expect(sorted.map((e) => e.edgeId)).toEqual(["e1", "e2"]);
  });

  it("respects explicit order overrides when provided", () => {
    const nodeCenter = { x: 200, y: 200 };
    const endpoints: NodePortEndpoint[] = [
      {
        edgeId: "e1",
        endpointKind: "src",
        nodeId: "A",
        side: "bottom",
        otherNodeCenter: { x: 100, y: 400 },
      },
      {
        edgeId: "e2",
        endpointKind: "src",
        nodeId: "A",
        side: "bottom",
        otherNodeCenter: { x: 350, y: 400 },
      },
    ];

    // Swap order explicitly: e2 before e1
    const explicitOrder = ["e2:src", "e1:src"];
    const sorted = sortNodeSideEndpoints(endpoints, nodeCenter, explicitOrder);
    expect(sorted.map((e) => e.edgeId)).toEqual(["e2", "e1"]);
  });
});
