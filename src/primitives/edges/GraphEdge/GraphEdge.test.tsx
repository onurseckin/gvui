import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import type { PositionedEdge } from "../../../types/graphData";
import { GraphEdge } from "./index";

describe("GraphEdge Primitive", () => {
  const baseEdge: PositionedEdge = {
    id: "e-test",
    source: "node-1",
    target: "node-2",
    path: "M 10 10 L 100 100",
    labelX: 55,
    labelY: 55,
  };

  it("renders neutral sequence edge by default (#3f3f46 understated)", () => {
    const html = renderToString(
      <svg>
        <GraphEdge edge={baseEdge} />
      </svg>,
    );

    expect(html).toContain("graph-edge-group");
    expect(html).toContain("kind-sequence");
    expect(html).toContain('marker-end="url(#edge-arrowhead-sequence)"');
  });

  it("renders spawn edge with cyan kind class and marker", () => {
    const spawnEdge: PositionedEdge = {
      ...baseEdge,
      kind: "spawn",
      label: "dispatch worker",
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={spawnEdge} />
      </svg>,
    );

    expect(html).toContain("kind-spawn");
    expect(html).toContain('marker-end="url(#edge-arrowhead-spawn)"');
    expect(html).toContain("dispatch worker");
  });

  it("renders data handoff edge with indigo kind class and marker", () => {
    const dataEdge: PositionedEdge = {
      ...baseEdge,
      kind: "data",
      label: "artifact.json",
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={dataEdge} />
      </svg>,
    );

    expect(html).toContain("kind-data");
    expect(html).toContain('marker-end="url(#edge-arrowhead-data)"');
    expect(html).toContain("artifact.json");
  });

  it("renders dependency edge with slate kind class and marker", () => {
    const depEdge: PositionedEdge = {
      ...baseEdge,
      kind: "dependency",
      label: "requires build",
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={depEdge} />
      </svg>,
    );

    expect(html).toContain("kind-dependency");
    expect(html).toContain('marker-end="url(#edge-arrowhead-dependency)"');
  });

  it("renders loop / pushback edge with crimson kind class and reverse animation", () => {
    const loopEdge: PositionedEdge = {
      ...baseEdge,
      kind: "loop",
      label: "retry on fail",
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={loopEdge} />
      </svg>,
    );

    expect(html).toContain("kind-loop");
    expect(html).toContain('marker-end="url(#edge-arrowhead-loop)"');
    expect(html).toContain("cycle");
  });

  it("renders validation gate edge with emerald green kind class and marker", () => {
    const gateEdge: PositionedEdge = {
      ...baseEdge,
      kind: "gate",
      label: "linter pass",
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={gateEdge} />
      </svg>,
    );

    expect(html).toContain("kind-gate");
    expect(html).toContain('marker-end="url(#edge-arrowhead-gate)"');
  });

  it("renders critic signoff edge with metallic gold kind class and marker", () => {
    const criticEdge: PositionedEdge = {
      ...baseEdge,
      kind: "critic",
      label: "signoff certified",
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={criticEdge} />
      </svg>,
    );

    expect(html).toContain("kind-critic");
    expect(html).toContain('marker-end="url(#edge-arrowhead-critic)"');
  });

  it("applies selected state and accent marker", () => {
    const html = renderToString(
      <svg>
        <GraphEdge edge={baseEdge} isSelected={true} />
      </svg>,
    );

    expect(html).toContain("selected");
    expect(html).toContain('marker-end="url(#edge-arrowhead-selected)"');
  });

  it("applies is-highlighted state and accent marker on highlight", () => {
    const html = renderToString(
      <svg>
        <GraphEdge edge={baseEdge} isHighlighted={true} />
      </svg>,
    );

    expect(html).toContain("is-highlighted");
    expect(html).toContain('marker-end="url(#edge-arrowhead-highlighted)"');
  });

  it("renders ports when showPorts is true", () => {
    const edgeWithPorts: PositionedEdge = {
      ...baseEdge,
      sourcePort: {
        nodeId: "node-1",
        side: "right",
        index: 0,
        point: { x: 10, y: 10 },
        stub: { x: 20, y: 10 },
      },
      targetPort: {
        nodeId: "node-2",
        side: "left",
        index: 0,
        point: { x: 100, y: 100 },
        stub: { x: 90, y: 100 },
      },
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={edgeWithPorts} showPorts={true} />
      </svg>,
    );

    expect(html).toContain("port-attachment-point source-port");
    expect(html).toContain("port-attachment-point target-port");
  });

  it("renders high-traffic glowing edge and shared anchor junction", () => {
    const highTrafficEdge: PositionedEdge = {
      ...baseEdge,
      isHighTraffic: true,
      traffic: {
        volume: 8,
        messagesCount: 8,
        tokens: 15400,
        status: "active",
        glowColor: "#06b6d4",
      },
      sharedAnchor: { x: 55, y: 55 },
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={highTrafficEdge} />
      </svg>,
    );

    expect(html).toContain("high-traffic");
    expect(html).toContain("edge-glow-backdrop");
    expect(html).toContain("shared-anchor-junction");
    expect(html).toContain('cx="55"');
    expect(html).toContain('cy="55"');
  });
});
