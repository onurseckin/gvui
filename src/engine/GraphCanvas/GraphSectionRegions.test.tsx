import { beforeEach, describe, expect, it } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useCanvasGroupingStore } from "../../components/CanvasGrouping";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphSection, PositionedNode } from "../../types/graphData";
import { GraphGroupingLayer } from "./GraphGroupingLayer";
import {
  computeSectionDepths,
  describeSectionType,
  SECTION_TYPE_DESCRIPTORS,
} from "./sectionKinds";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceReactWarnings<T>(fn: () => T): T {
  const originalConsoleError = console.error;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (
      typeof message === "string" &&
      (message.includes("react-test-renderer is deprecated") ||
        message.includes("An update to") ||
        message.includes("was not wrapped in act") ||
        message.includes("The result of getSnapshot should be cached"))
    ) {
      return;
    }
    originalConsoleError(message, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = originalConsoleError;
  }
}

const branchNodes: PositionedNode[] = [
  { id: "sub-1", name: "Sub Implementer", x: 100, y: 100, width: 150, height: 80 },
  { id: "sub-2", name: "Sub Validator", x: 320, y: 110, width: 150, height: 80 },
  { id: "parent", name: "Parent Task", x: 100, y: 400, width: 150, height: 80 },
];

const branchSection: GraphSection = {
  id: "B-1",
  title: "Branch: asset pipeline",
  nodeIds: ["sub-1", "sub-2"],
  reason: "the screenshot writer and its fixture had to move together",
  parentNodeId: "parent",
  status: "collected",
};

function render(sections?: GraphSection[]): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  silenceReactWarnings(() => {
    act(() => {
      renderer = create(
        createElement(GraphGroupingLayer, {
          positionedNodes: branchNodes,
          ...(sections ? { sections } : {}),
        }),
      );
    });
  });
  return renderer;
}

function findByClass(renderer: ReactTestRenderer, className: string) {
  return renderer.root.findAll(
    (el) => typeof el.props.className === "string" && el.props.className.includes(className),
  );
}

describe("Section regions on the canvas", () => {
  beforeEach(() => {
    act(() => {
      useCanvasGroupingStore.getState().clearAllGroups();
      useCanvasGroupingStore.getState().setIsGroupingLayerVisible(true);
      useGraphStore.getState().setPositionedGraph(branchNodes, []);
      useGraphStore.getState().setZoomLevel(1);
    });
  });

  it("renders nothing when the dataset declares no sections and no user groups exist", () => {
    const renderer = render();
    expect(renderer.toJSON()).toBeNull();
    renderer.unmount();
  });

  it("draws a boundary and a header for a dataset section", () => {
    const renderer = render([branchSection]);

    expect(findByClass(renderer, "group-boundary-path")).toHaveLength(1);
    const headers = findByClass(renderer, "group-region-header-container");
    expect(headers).toHaveLength(1);
    expect(findByClass(renderer, "group-header-title")[0].children).toContain(
      "Branch: asset pipeline",
    );
    renderer.unmount();
  });

  it("shows the recorded branch reason, which is the whole point of the region", () => {
    const renderer = render([branchSection]);

    const reason = findByClass(renderer, "group-header-reason");
    expect(reason).toHaveLength(1);
    expect(reason[0].props.title).toBe(branchSection.reason);
    expect(reason[0].children).toContain(branchSection.reason as string);
    renderer.unmount();
  });

  it("marks sections as structure: no drag handle, no lock, no edit affordances", () => {
    const renderer = render([branchSection]);

    expect(findByClass(renderer, "is-section").length).toBeGreaterThan(0);
    expect(findByClass(renderer, "group-header-actions")).toHaveLength(0);
    expect(findByClass(renderer, "group-header-handle")).toHaveLength(0);
    const header = findByClass(renderer, "group-region-header-container")[0];
    expect(header.props.onMouseDown).toBeUndefined();
    renderer.unmount();
  });

  it("skips a section whose nodes are all absent rather than drawing an empty region", () => {
    const renderer = render([{ id: "B-2", title: "Ghost", nodeIds: ["nope"] }]);
    expect(renderer.toJSON()).toBeNull();
    renderer.unmount();
  });

  it("omits the reason line when the producer recorded none", () => {
    const renderer = render([{ id: "B-3", title: "No reason", nodeIds: ["sub-1"] }]);
    expect(findByClass(renderer, "group-header-reason")).toHaveLength(0);
    renderer.unmount();
  });

  it("draws user groups alongside sections", () => {
    act(() => {
      useCanvasGroupingStore.getState().createGroup({
        label: "My Group",
        color: "blue",
        memberNodeIds: ["parent"],
      });
    });

    const renderer = render([branchSection]);
    expect(findByClass(renderer, "group-boundary-path")).toHaveLength(2);
    expect(findByClass(renderer, "group-header-actions")).toHaveLength(1);
    renderer.unmount();
  });
});

/**
 * A nesting chain: each region hangs off a node that the region above it contains, which is the
 * only way depth is expressed in the dataset.
 */
const nestedNodes: PositionedNode[] = [
  { id: "root", name: "Root task", x: 0, y: 0, width: 150, height: 80 },
  { id: "d1", name: "Depth one", x: 200, y: 0, width: 150, height: 80 },
  { id: "d2", name: "Depth two", x: 400, y: 0, width: 150, height: 80 },
  { id: "d3", name: "Depth three", x: 600, y: 0, width: 150, height: 80 },
];

const nestedSections: GraphSection[] = [
  { id: "S1", title: "First", type: "branch", nodeIds: ["d1"], parentNodeId: "root" },
  { id: "S2", title: "Second", type: "branch", nodeIds: ["d2"], parentNodeId: "d1" },
  {
    id: "S3",
    title: "Third",
    type: "branch",
    nodeIds: ["d3"],
    parentNodeId: "d2",
    reason: "the fixture writer had to be split from its consumer",
  },
];

function renderNested(): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  silenceReactWarnings(() => {
    act(() => {
      renderer = create(
        createElement(GraphGroupingLayer, {
          positionedNodes: nestedNodes,
          sections: nestedSections,
        }),
      );
    });
  });
  return renderer;
}

describe("Region depth", () => {
  beforeEach(() => {
    act(() => {
      useCanvasGroupingStore.getState().clearAllGroups();
      useCanvasGroupingStore.getState().setIsGroupingLayerVisible(true);
      useGraphStore.getState().setPositionedGraph(nestedNodes, []);
      useGraphStore.getState().setZoomLevel(1);
    });
  });

  it("derives depth from the parent-node chain", () => {
    const depths = computeSectionDepths(nestedSections);
    expect(depths.get("S1")).toBe(1);
    expect(depths.get("S2")).toBe(2);
    expect(depths.get("S3")).toBe(3);
  });

  it("treats a region whose parent node belongs to nothing as top level", () => {
    expect(computeSectionDepths([nestedSections[0]]).get("S1")).toBe(1);
    expect(computeSectionDepths([{ id: "X", title: "X", nodeIds: ["a"] }]).get("X")).toBe(1);
  });

  it("stops rather than looping when regions reference each other in a cycle", () => {
    const cyclic: GraphSection[] = [
      { id: "A", title: "A", nodeIds: ["a"], parentNodeId: "b" },
      { id: "B", title: "B", nodeIds: ["b"], parentNodeId: "a" },
    ];
    const depths = computeSectionDepths(cyclic);
    expect(depths.get("A")).toBeGreaterThan(0);
    expect(depths.get("B")).toBeGreaterThan(0);
  });

  it("shows the depth in the header so the reader knows how far in they are", () => {
    const renderer = renderNested();
    const labels = findByClass(renderer, "group-header-depth").map((el) => el.props.title);
    expect(labels).toContain("Depth 1");
    expect(labels).toContain("Depth 2");
    expect(labels).toContain("Depth 3");
    renderer.unmount();
  });

  it("arrives with regions past depth two folded up and the rest open", () => {
    const renderer = renderNested();

    const pills = findByClass(renderer, "group-collapsed-pill");
    expect(pills).toHaveLength(1);
    expect(findByClass(renderer, "group-collapsed-label")[0].children).toContain("Third");
    expect(findByClass(renderer, "group-boundary-path")).toHaveLength(2);
    renderer.unmount();
  });

  it("keeps the branch reason on the folded pill, which is why the region exists", () => {
    const renderer = renderNested();
    const pill = findByClass(renderer, "group-collapsed-pill")[0];
    const reason = pill.findAll(
      (el) =>
        typeof el.props.className === "string" &&
        el.props.className.includes("group-header-reason"),
    );
    expect(reason[0].props.title).toBe(nestedSections[2].reason);
    renderer.unmount();
  });

  it("opens a folded region on click and folds an open one back", () => {
    const renderer = renderNested();

    const expand = renderer.root.findAll(
      (el) => el.props.className === "group-expand-btn" && typeof el.props.onClick === "function",
    );
    expect(expand).toHaveLength(1);
    silenceReactWarnings(() => {
      act(() => {
        expand[0].props.onClick({ stopPropagation: () => {} });
      });
    });
    expect(findByClass(renderer, "group-collapsed-pill")).toHaveLength(0);
    expect(findByClass(renderer, "group-boundary-path")).toHaveLength(3);

    const collapse = findByClass(renderer, "group-section-actions")[0].findAll(
      (el) => typeof el.props.onClick === "function" && el.props.type === "button",
    );
    silenceReactWarnings(() => {
      act(() => {
        collapse[0].props.onClick({ stopPropagation: () => {} });
      });
    });
    expect(findByClass(renderer, "group-collapsed-pill")).toHaveLength(1);
    renderer.unmount();
  });

  it("honours a dataset that folds a shallow region itself", () => {
    let renderer!: ReactTestRenderer;
    silenceReactWarnings(() => {
      act(() => {
        renderer = create(
          createElement(GraphGroupingLayer, {
            positionedNodes: nestedNodes,
            sections: [{ ...nestedSections[0], collapsed: true }],
          }),
        );
      });
    });
    expect(findByClass(renderer, "group-collapsed-pill")).toHaveLength(1);
    renderer.unmount();
  });
});

describe("Region types this renderer ships no preset for", () => {
  beforeEach(() => {
    act(() => {
      useCanvasGroupingStore.getState().clearAllGroups();
      useCanvasGroupingStore.getState().setIsGroupingLayerVisible(true);
      useGraphStore.getState().setPositionedGraph(branchNodes, []);
      useGraphStore.getState().setZoomLevel(1);
    });
  });

  it("gives an unfamiliar type its own name and a stable accent", () => {
    const first = describeSectionType("retrospective");
    expect(first?.label).toBe("RETROSPECTIVE");
    expect(first?.accent).toBe(describeSectionType("retrospective")?.accent);
    expect(first?.accent).not.toBe(SECTION_TYPE_DESCRIPTORS.branch.accent);
  });

  it("tells two unfamiliar types apart", () => {
    const accents = new Set(
      ["retrospective", "sprint", "chapter", "epoch"].map(
        (type) => describeSectionType(type)?.accent,
      ),
    );
    expect(accents.size).toBe(4);
  });

  it("leaves a region that declares no type to its status colouring", () => {
    expect(describeSectionType(undefined)).toBe(undefined);
    expect(describeSectionType("  ")).toBe(undefined);
  });

  it("draws a region of an unfamiliar type without throwing", () => {
    const renderer = render([{ ...branchSection, type: "retrospective" }]);
    const path = findByClass(renderer, "group-boundary-path")[0];
    expect(path.props.stroke).toBe(describeSectionType("retrospective")?.accent);
    renderer.unmount();
  });
});
