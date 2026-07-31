import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { distributePorts } from "./portDistribution";
import type { NormalizedEdge, NormalizedNode, Point, Side } from "./types";

describe("portDistribution", () => {
  it("uses exact side center for a single attachment on a node side", () => {
    const node: NormalizedNode & Point = { id: "A", width: 100, height: 60, x: 100, y: 50 };
    const remoteNode: NormalizedNode & Point = { id: "B", width: 100, height: 60, x: 100, y: 250 };

    const edge: NormalizedEdge = { id: "e1", source: "A", target: "B" };
    const sideAssignments = new Map<string, { srcSide: Side; tgtSide: Side }>([
      ["e1", { srcSide: "bottom", tgtSide: "top" }],
    ]);

    const nodeMap = new Map<string, NormalizedNode & Point>([
      ["A", node],
      ["B", remoteNode],
    ]);

    const config = resolveCustomLayoutConfig();
    const result = distributePorts([edge], sideAssignments, nodeMap, config);

    const portA = result.portsByEdge.get("e1")?.sourcePort;
    expect(portA).toBeDefined();
    expect(portA?.point).toEqual({ x: 150, y: 110 }); // Center of bottom side of A (x=100+50, y=50+60)
    expect(portA?.stub).toEqual({ x: 150, y: 130 }); // y + stubLength 20
  });

  it("distributes 2 attachments on a side at 1/3 and 2/3 fractions sorted by remote X", () => {
    const nodeA: NormalizedNode & Point = { id: "A", width: 300, height: 60, x: 0, y: 0 };
    const nodeB1: NormalizedNode & Point = { id: "B1", width: 100, height: 60, x: 0, y: 200 };
    const nodeB2: NormalizedNode & Point = { id: "B2", width: 100, height: 60, x: 200, y: 200 };

    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B1" },
      { id: "e2", source: "A", target: "B2" },
    ];

    const sideAssignments = new Map<string, { srcSide: Side; tgtSide: Side }>([
      ["e1", { srcSide: "bottom", tgtSide: "top" }],
      ["e2", { srcSide: "bottom", tgtSide: "top" }],
    ]);

    const nodeMap = new Map<string, NormalizedNode & Point>([
      ["A", nodeA],
      ["B1", nodeB1],
      ["B2", nodeB2],
    ]);

    const config = resolveCustomLayoutConfig({ portEndpointPadding: 0 });
    const result = distributePorts(edges, sideAssignments, nodeMap, config);

    const port1 = result.portsByEdge.get("e1")?.sourcePort;
    const port2 = result.portsByEdge.get("e2")?.sourcePort;

    expect(port1?.point.x).toBe(100); // 1/3 of 300
    expect(port2?.point.x).toBe(200); // 2/3 of 300
  });
});
