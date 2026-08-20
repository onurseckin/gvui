import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { EDGE_KINDS, type PositionedEdge } from "../../../types/graphData";
import { describeEdgeKind, GENERATED_EDGE_MARKER_ID } from "./edgeKinds";
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

  it("applies is-hovered class on group, path, and badge overlay when isHovered is true", () => {
    const hoverEdge: PositionedEdge = {
      ...baseEdge,
      label: "hovered step",
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={hoverEdge} isHovered={true} />
      </svg>,
    );

    expect(html).toContain("is-hovered");
    expect(html).toContain("graph-edge-group");
    expect(html).toContain("graph-edge-path");
    expect(html).toContain("edge-badge-group");
  });

  it("colours an edge from its own kind, not from the node it left", () => {
    const pushbackEdge: PositionedEdge = { ...baseEdge, kind: "pushback", label: "defect" };
    const signoffEdge: PositionedEdge = { ...baseEdge, kind: "signoff", label: "approved" };

    const pushbackHtml = renderToString(
      <svg>
        <GraphEdge edge={pushbackEdge} />
      </svg>,
    );
    const signoffHtml = renderToString(
      <svg>
        <GraphEdge edge={signoffEdge} />
      </svg>,
    );

    // Same source node, opposite meanings: the treatments must not match.
    expect(pushbackHtml).toContain("--edge-kind-stroke:#f43f5e");
    expect(pushbackHtml).toContain('marker-end="url(#edge-arrowhead-pushback)"');
    expect(signoffHtml).toContain("--edge-kind-stroke:#eab308");
    expect(signoffHtml).toContain('marker-end="url(#edge-arrowhead-signoff)"');
  });

  it("honours a dataset-supplied per-edge accent", () => {
    const html = renderToString(
      <svg>
        <GraphEdge edge={{ ...baseEdge, kind: "data", accent: "#a855f7" }} />
      </svg>,
    );

    expect(html).toContain("--edge-kind-stroke:#a855f7");
  });

  it("distinguishes a probe from a pushback on the canvas", () => {
    const probeHtml = renderToString(
      <svg>
        <GraphEdge edge={{ ...baseEdge, kind: "probe", label: "prove it" }} />
      </svg>,
    );

    expect(probeHtml).toContain("kind-probe");
    expect(probeHtml).toContain('marker-end="url(#edge-arrowhead-probe)"');
    expect(probeHtml).not.toContain("#f43f5e");
  });

  it("keeps a declared kind on a cyclic edge", () => {
    const cyclePushback: PositionedEdge = {
      ...baseEdge,
      kind: "pushback",
      isCycle: true,
      label: "Validator Pushback",
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={cyclePushback} />
      </svg>,
    );

    expect(html).toContain("kind-pushback");
    expect(html).toContain('marker-end="url(#edge-arrowhead-pushback)"');
    expect(html).toContain("cycle");
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

  it("suppresses badge overlay rendering when edge is unpositioned or ghost edge (labelX: 0, labelY: 0 without points)", () => {
    const ghostEdge: PositionedEdge = {
      id: "ghost-edge-1",
      source: "n1",
      target: "n2",
      path: "M 0 0 L 100 100",
      label: "Ghost Action",
      labelX: 0,
      labelY: 0,
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={ghostEdge} />
      </svg>,
    );

    expect(html).toContain("graph-edge-group");
    expect(html).not.toContain("edge-badge-group");
    expect(html).not.toContain("Ghost Action");
  });

  it("renders badge overlay for valid origin-crossing polyline at (0, 0)", () => {
    const originPolyEdge: PositionedEdge = {
      id: "origin-poly-edge",
      source: "n1",
      target: "n2",
      path: "M -100 0 L 100 0",
      label: "Origin Action",
      points: [
        { x: -100, y: 0 },
        { x: 100, y: 0 },
      ],
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={originPolyEdge} />
      </svg>,
    );

    expect(html).toContain("graph-edge-group");
    expect(html).toContain("edge-badge-group");
    expect(html).toContain('transform="translate(0, 0)"');
    expect(html).toContain("Origin Action");
  });

  it("renders fallback midpoint badge when source/target coords are provided for unpositioned path", () => {
    const unpositionedEdge: PositionedEdge = {
      id: "fallback-edge",
      source: "n1",
      target: "n2",
      path: "",
      label: "Fallback Midpoint",
    };

    const html = renderToString(
      <svg>
        <GraphEdge
          edge={unpositionedEdge}
          sourceX={100}
          sourceY={100}
          targetX={300}
          targetY={300}
        />
      </svg>,
    );

    expect(html).toContain('d="M 100 100 L 300 300"');
    expect(html).toContain("edge-badge-group");
    expect(html).toContain('transform="translate(200, 200)"');
    expect(html).toContain("Fallback Midpoint");
  });

  it("does not attach button role or tabIndex when onClick is omitted", () => {
    const html = renderToString(
      <svg>
        <GraphEdge edge={baseEdge} />
      </svg>,
    );

    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('tabindex="0"');
    expect(html).not.toContain("is-clickable");
  });

  it("attaches role='button', tabIndex={0}, and aria-label when onClick is provided", () => {
    const edgeWithLabel: PositionedEdge = {
      ...baseEdge,
      label: "Workflow Step",
    };

    const htmlWithLabel = renderToString(
      <svg>
        <GraphEdge edge={edgeWithLabel} onClick={() => {}} />
      </svg>,
    );

    expect(htmlWithLabel).toContain('role="button"');
    expect(htmlWithLabel).toContain('tabindex="0"');
    expect(htmlWithLabel).toContain('aria-label="Edge Workflow Step"');
    expect(htmlWithLabel).toContain("is-clickable");

    const htmlWithoutLabel = renderToString(
      <svg>
        <GraphEdge edge={baseEdge} onClick={() => {}} />
      </svg>,
    );

    expect(htmlWithoutLabel).toContain('role="button"');
    expect(htmlWithoutLabel).toContain('tabindex="0"');
    expect(htmlWithoutLabel).toContain('aria-label="Edge e-test"');
  });

  it("handles keyboard Enter and Space activation via onKeyDown and click propagation", async () => {
    const { create, act } = await import("react-test-renderer");
    let clickedEdgeId: string | null = null;

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <svg>
          <GraphEdge
            edge={baseEdge}
            onClick={(id) => {
              clickedEdgeId = id;
            }}
          />
        </svg>,
      );
    });

    const root = renderer!.root;
    const group = root.findByProps({ className: "graph-edge-group kind-sequence is-clickable" });

    // Test Enter key
    clickedEdgeId = null;
    act(() => {
      group.props.onKeyDown({
        key: "Enter",
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });
    expect(clickedEdgeId).toBe("e-test");

    // Test Space key
    clickedEdgeId = null;
    act(() => {
      group.props.onKeyDown({
        key: " ",
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });
    expect(clickedEdgeId).toBe("e-test");

    // Test non-activation key (e.g. Tab)
    clickedEdgeId = null;
    act(() => {
      group.props.onKeyDown({
        key: "Tab",
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });
    expect(clickedEdgeId).toBeNull();

    // Test click event
    clickedEdgeId = null;
    act(() => {
      group.props.onClick({
        stopPropagation: () => {},
      });
    });
    expect(clickedEdgeId).toBe("e-test");
  });

  it("includes focus-visible outline indicator styling in GraphEdge.css", () => {
    const css = readFileSync(new URL("./GraphEdge.css", import.meta.url).pathname, "utf-8");
    expect(css).toContain(".graph-edge-group:focus-visible");
    expect(css).toContain("outline: 2px solid var(--accent-color, #818cf8)");
    expect(css).toContain("outline-offset: 2px");
  });

  it("renders compact edge badges with truncated detail on canvas", () => {
    const edgeWithLongDetail: PositionedEdge = {
      ...baseEdge,
      kind: "spawn",
      stepNumber: "Step 2",
      container: {
        title: "Dispatches Worker",
        detail: "Very long detailed description about the worker dispatched for task execution",
      },
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={edgeWithLongDetail} />
      </svg>,
    );

    expect(html).toContain("Dispatches Worker");
    expect(html).toContain("2");
    expect(html).toContain("Very long detailed de...");
    expect(html).not.toContain("Step 2: Dispatches Worker");
  });

  it("strictly suppresses badge rendering for unplaced zero-coordinate edges", () => {
    const unplacedEdge: PositionedEdge = {
      id: "unplaced-1",
      source: "n1",
      target: "n2",
      path: "",
      label: "Ghost Label",
      labelX: 0,
      labelY: 0,
    };

    const html = renderToString(
      <svg>
        <GraphEdge edge={unplacedEdge} />
      </svg>,
    );

    expect(html).not.toContain("Ghost Label");
    expect(html).not.toContain("edge-badge-group");
  });

  it("propagates edge clicks to onClick callback when badge is clicked", async () => {
    const { create, act } = await import("react-test-renderer");
    let clickedEdgeId: string | null = null;
    const edgeWithBadge: PositionedEdge = {
      ...baseEdge,
      label: "Clickable Badge Flow",
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <svg>
          <GraphEdge
            edge={edgeWithBadge}
            onClick={(id) => {
              clickedEdgeId = id;
            }}
          />
        </svg>,
      );
    });

    const root = renderer!.root;
    const badgeGroup = root.findByProps({
      className: "edge-badge-group kind-sequence is-clickable has-click",
    });

    clickedEdgeId = null;
    act(() => {
      badgeGroup.props.onClick({
        stopPropagation: () => {},
      });
    });
    expect(clickedEdgeId).toBe("e-test");
  });

  it("gives every preset kind its own arrowhead", () => {
    for (const kind of EDGE_KINDS) {
      const html = renderToString(
        <svg>
          <GraphEdge edge={{ ...baseEdge, kind }} />
        </svg>,
      );

      expect(html).toContain(`marker-end="url(#edge-arrowhead-${kind})"`);
      expect(html).toContain(`kind-${kind}`);
    }
  });

  it("draws a kind it has no preset for as itself, in its own generated colour", () => {
    const html = renderToString(
      <svg>
        <GraphEdge edge={{ ...baseEdge, kind: "supersedes" }} />
      </svg>,
    );

    expect(html).toContain("kind-supersedes");
    expect(html).not.toContain("kind-sequence");
    expect(html).toContain(`marker-end="url(#${GENERATED_EDGE_MARKER_ID})"`);
    expect(html).toContain(`--edge-kind-stroke:${describeEdgeKind("supersedes").accent}`);
  });
});
