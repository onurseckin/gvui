import { describe, expect, test } from "bun:test";
import React from "react";
import ReactTestRenderer from "react-test-renderer";
import { GraphSectionsLayer } from "../src/engine/GraphCanvas/GraphSectionsLayer";
import type { GraphSection, PositionedNode } from "../src/types/graphData";

describe("GraphSectionsLayer rendering", () => {
  const sections: GraphSection[] = [
    {
      id: "sec-planning",
      title: "Phase 1: Planning",
      nodeIds: ["n1", "n2"],
    },
  ];

  const positionedNodes: PositionedNode[] = [
    {
      id: "n1",
      name: "Prompt",
      kind: "input",
      status: "success",
      x: 100,
      y: 100,
      width: 200,
      height: 80,
    },
    {
      id: "n2",
      name: "Plan",
      kind: "orchestrator",
      status: "success",
      x: 350,
      y: 100,
      width: 200,
      height: 80,
    },
  ];

  test("computes bounding box and renders section boundary", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <GraphSectionsLayer
          sections={sections}
          positionedNodes={positionedNodes}
          hiddenNodeIds={new Set()}
        />,
      );
    });

    expect(renderer).toBeDefined();
    const boundaries = renderer!.root.findAllByProps({ className: "graph-section-boundary" });
    expect(boundaries).toHaveLength(1);
  });

  test("renders nothing if no sections or matching nodes", () => {
    let tree: ReactTestRenderer.ReactTestRendererJSON | null = null;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <GraphSectionsLayer
          sections={[]}
          positionedNodes={positionedNodes}
          hiddenNodeIds={new Set()}
        />,
      ).toJSON() as ReactTestRenderer.ReactTestRendererJSON;
    });

    expect(tree).toBeNull();
  });
});
