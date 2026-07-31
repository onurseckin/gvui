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

  it("orders ports by projected remote angle (Dispatcher right side -> W5, W6, W7)", () => {
    const dispatcher: NormalizedNode & Point = {
      id: "Dispatcher",
      x: 588,
      y: 67.5,
      width: 160,
      height: 90,
    };
    const W5: NormalizedNode & Point = { id: "W5", x: 794, y: 262.5, width: 100, height: 60 }; // center (844, 292.5)
    const W6: NormalizedNode & Point = { id: "W6", x: 970, y: 262.5, width: 100, height: 60 }; // center (1020, 292.5)
    const W7: NormalizedNode & Point = { id: "W7", x: 1146, y: 262.5, width: 100, height: 60 }; // center (1196, 292.5)

    const edges: NormalizedEdge[] = [
      { id: "e5", source: "Dispatcher", target: "W5" },
      { id: "e6", source: "Dispatcher", target: "W6" },
      { id: "e7", source: "Dispatcher", target: "W7" },
    ];

    const sideAssignments = new Map<string, { srcSide: Side; tgtSide: Side }>([
      ["e5", { srcSide: "right", tgtSide: "top" }],
      ["e6", { srcSide: "right", tgtSide: "top" }],
      ["e7", { srcSide: "right", tgtSide: "top" }],
    ]);

    const nodeMap = new Map<string, NormalizedNode & Point>([
      ["Dispatcher", dispatcher],
      ["W5", W5],
      ["W6", W6],
      ["W7", W7],
    ]);

    const config = resolveCustomLayoutConfig({ portEndpointPadding: 0 });
    const result = distributePorts(edges, sideAssignments, nodeMap, config);

    const port5 = result.portsByEdge.get("e5")?.sourcePort;
    const port6 = result.portsByEdge.get("e6")?.sourcePort;
    const port7 = result.portsByEdge.get("e7")?.sourcePort;

    expect(port7?.index).toBe(0);
    expect(port6?.index).toBe(1);
    expect(port5?.index).toBe(2);

    expect(port7!.point.y).toBeLessThan(port6!.point.y);
    expect(port6!.point.y).toBeLessThan(port5!.point.y);
  });

  it("applies tie-breaker sorting: remoteNodeId, edgeId, source before target", () => {
    const mainNode: NormalizedNode & Point = { id: "M", x: 100, y: 100, width: 100, height: 100 };
    const remoteA: NormalizedNode & Point = { id: "A", x: 100, y: 300, width: 100, height: 100 };
    const remoteB: NormalizedNode & Point = { id: "B", x: 100, y: 300, width: 100, height: 100 };

    const edges: NormalizedEdge[] = [
      { id: "e2", source: "M", target: "B" },
      { id: "e1", source: "M", target: "B" },
      { id: "e3", source: "A", target: "M" },
      { id: "e4", source: "M", target: "A" },
    ];

    const sideAssignments = new Map<string, { srcSide: Side; tgtSide: Side }>([
      ["e1", { srcSide: "bottom", tgtSide: "top" }],
      ["e2", { srcSide: "bottom", tgtSide: "top" }],
      ["e3", { srcSide: "bottom", tgtSide: "bottom" }],
      ["e4", { srcSide: "bottom", tgtSide: "top" }],
    ]);

    const nodeMap = new Map<string, NormalizedNode & Point>([
      ["M", mainNode],
      ["A", remoteA],
      ["B", remoteB],
    ]);

    const config = resolveCustomLayoutConfig();
    const result = distributePorts(edges, sideAssignments, nodeMap, config);

    // Attachments on M's bottom side:
    // e3: isSource=false (tgt on M), remoteNodeId="A", edgeId="e3"
    // e4: isSource=true (src on M), remoteNodeId="A", edgeId="e4"
    // e1: isSource=true (src on M), remoteNodeId="B", edgeId="e1"
    // e2: isSource=true (src on M), remoteNodeId="B", edgeId="e2"

    // Remote node A vs B -> A comes before B
    // Between e3 and e4: remoteNodeId both "A". Edge e3 vs e4 -> e3 comes before e4.
    // Between e1 and e2: remoteNodeId both "B". Edge e1 vs e2 -> e1 comes before e2.

    const portE3 = result.portsByEdge.get("e3")?.targetPort;
    const portE4 = result.portsByEdge.get("e4")?.sourcePort;
    const portE1 = result.portsByEdge.get("e1")?.sourcePort;
    const portE2 = result.portsByEdge.get("e2")?.sourcePort;

    expect(portE3?.index).toBe(0);
    expect(portE4?.index).toBe(1);
    expect(portE1?.index).toBe(2);
    expect(portE2?.index).toBe(3);
  });
});
