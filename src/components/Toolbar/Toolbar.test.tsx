import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import { GraphSearchOverlay, isNodeSearchMatch } from "./GraphSearchOverlay";
import { LayoutMenu } from "./LayoutMenu";
import { Toolbar } from "./Toolbar";
import { useGraphStore } from "../../state/useGraphStore";
import type { PositionedNode } from "../../types/graphData";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceReactTestRendererDeprecationWarning<T>(fn: () => T): T {
  const originalConsoleError = console.error;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (
      message ===
      "react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer"
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

const initialStoreState = useGraphStore.getState();

const mockNodes: PositionedNode[] = [
  {
    id: "node-coordinator-1",
    name: "Master Coordinator",
    kind: "orchestrator",
    status: "running",
    step: 1,
    stepLabel: "Initialization Step",
    description: "Orchestrates multi-agent execution pipeline",
    badges: [{ label: "Orchestration" }],
    metadata: {
      role: "Lead Orchestrator",
      leaseAgent: "gvui-coord-01",
      status: "running",
    },
    hostAgent: {
      name: "CoordinatorAgent",
      role: "orchestrator",
      telemetry: { model: { value: "claude-3-5-sonnet", evidence_class: "host_reported" } },
    },
    provenance: {
      actorId: "gvui-coord-01",
    },
    x: 0,
    y: 0,
    width: 200,
    height: 100,
  },
  {
    id: "node-worker-2",
    name: "Feature Implementer",
    kind: "agent",
    status: "success",
    step: 2,
    stepLabel: "Implementation Step",
    description: "Implements search overlay frontend component",
    badges: [{ label: "Code" }],
    metadata: {
      role: "Software Engineer",
      leaseAgent: "gvui-impl-t04",
      status: "completed",
    },
    hostAgent: {
      name: "ImplementerAgent",
      role: "implementer",
      telemetry: { model: { value: "claude-3-5-sonnet", evidence_class: "host_reported" } },
    },
    provenance: {
      actorId: "gvui-impl-t04",
    },
    x: 300,
    y: 0,
    width: 200,
    height: 100,
  },
  {
    id: "node-validator-3",
    name: "Adversarial Gate",
    kind: "gate",
    status: "error",
    step: 3,
    stepLabel: "Validation Step",
    description: "Verifies test coverage and security constraints",
    badges: [{ label: "Gate" }],
    metadata: {
      role: "Quality Gatekeeper",
      leaseAgent: "gvui-val-01",
      status: "failed",
    },
    hostAgent: {
      name: "ValidatorAgent",
      role: "validator",
      telemetry: { model: { value: "claude-3-5-sonnet", evidence_class: "host_reported" } },
    },
    provenance: {
      actorId: "gvui-val-01",
    },
    x: 600,
    y: 0,
    width: 200,
    height: 100,
  },
  {
    id: "node-tool-4",
    name: "CLI Harness Exec",
    kind: "tool",
    status: "success",
    step: 4,
    stepLabel: "Execution Step",
    description: "Runs bun test commands",
    tools: [{ name: "bun_test", type: "generic" }],
    badges: [{ label: "CLI" }],
    metadata: {
      role: "CLI Tool",
      status: "success",
    },
    x: 900,
    y: 0,
    width: 200,
    height: 100,
  },
];

describe("GraphSearchOverlay - Matching Logic (isNodeSearchMatch)", () => {
  it("matches nodes by label / name case-insensitively", () => {
    expect(isNodeSearchMatch(mockNodes[0], "master")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[0], "COORDINATOR")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[1], "Implementer")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[1], "nonexistent")).toBe(false);
  });

  it("matches nodes by id", () => {
    expect(isNodeSearchMatch(mockNodes[0], "node-coordinator-1")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[2], "validator-3")).toBe(true);
  });

  it("matches nodes by role in metadata, hostAgent, and actorId", () => {
    expect(isNodeSearchMatch(mockNodes[0], "Lead Orchestrator")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[1], "Software Engineer")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[1], "gvui-impl-t04")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[2], "Quality Gatekeeper")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[2], "gvui-val-01")).toBe(true);
  });

  it("matches nodes by archetype / kind descriptor label", () => {
    expect(isNodeSearchMatch(mockNodes[0], "orchestrator")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[0], "COORDINATOR")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[2], "gate")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[2], "VALIDATOR GATE")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[3], "tool")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[3], "CLI COMMAND")).toBe(true);
  });

  it("matches nodes by status and metadata status", () => {
    expect(isNodeSearchMatch(mockNodes[0], "running")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[1], "success")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[1], "completed")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[2], "error")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[2], "failed")).toBe(true);
  });

  it("supports multi-field regex searches", () => {
    // Alternation regex matching name or role across nodes
    expect(isNodeSearchMatch(mockNodes[0], "master|implementer")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[1], "master|implementer")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[2], "master|implementer")).toBe(false);

    // Regex anchored to start or end
    expect(isNodeSearchMatch(mockNodes[0], "^Master.*")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[1], "^Master.*")).toBe(false);

    // Regex matching ID patterns
    expect(isNodeSearchMatch(mockNodes[0], "node-\\w+-\\d")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[2], "validator-\\d+$")).toBe(true);
  });

  it("safely falls back to literal substring search for unparseable regexes", () => {
    // Malformed regex patterns with unclosed brackets should not crash
    expect(isNodeSearchMatch(mockNodes[0], "[master")).toBe(false);
    expect(isNodeSearchMatch(mockNodes[0], "(master")).toBe(false);
    expect(isNodeSearchMatch(mockNodes[0], "*")).toBe(false);
  });

  it("filters correctly by category pills", () => {
    expect(isNodeSearchMatch(mockNodes[1], "", "success")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[0], "", "success")).toBe(false);
    expect(isNodeSearchMatch(mockNodes[2], "", "error")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[0], "", "running")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[3], "", "tools")).toBe(true);
    expect(isNodeSearchMatch(mockNodes[0], "", "tools")).toBe(false);
  });
});

describe("GraphSearchOverlay Component", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    useGraphStore.setState({
      ...initialStoreState,
      positionedNodes: mockNodes,
      searchQuery: "",
      activeFilter: "all",
      selectedNodeId: null,
    });
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
      renderer = null;
    }
  });

  it("renders the search input, category filters, and match counter badge", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<GraphSearchOverlay defaultDropdownOpen={true} />);
      });
    });

    const root = renderer!.root;
    const input = root.findByProps({ className: "graph-search-input" });
    expect(input).toBeDefined();
    expect(input.props.placeholder).toContain("Search nodes");

    const badgeCount = root.findByProps({ className: "graph-search-badge-count" });
    expect(badgeCount.props.children).toBe(4);

    const pills = root.findAll(
      (node: ReactTestInstance) =>
        node.type === "button" && Boolean(node.props.className?.includes("graph-search-pill")),
    );
    const activePill = root.findByProps({ className: "graph-search-pill is-active" });
    const activeSpan = activePill.findByType("span");
    expect(activeSpan.props.children).toBe("All");
    expect(pills.length).toBe(5);
  });

  it("updates store searchQuery when typing into the input", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<GraphSearchOverlay defaultDropdownOpen={true} />);
      });
    });

    const root = renderer!.root;
    const input = root.findByProps({ className: "graph-search-input" });

    act(() => {
      input.props.onChange({ target: { value: "Validator" } });
    });

    expect(useGraphStore.getState().searchQuery).toBe("Validator");

    const badgeCount = root.findByProps({ className: "graph-search-badge-count" });
    expect(badgeCount.props.children).toBe(1);

    const results = root.findAllByProps({ role: "option" });
    expect(results.length).toBe(1);
    expect(results[0].props.id).toBe("search-opt-node-validator-3");
  });

  it("renders empty state with role=status when zero matches are found", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<GraphSearchOverlay defaultDropdownOpen={true} />);
      });
    });

    const root = renderer!.root;
    const input = root.findByProps({ className: "graph-search-input" });

    act(() => {
      input.props.onChange({ target: { value: "xyz_no_matching_query_123" } });
    });

    expect(useGraphStore.getState().searchQuery).toBe("xyz_no_matching_query_123");

    const badgeCount = root.findByProps({ className: "graph-search-badge-count" });
    expect(badgeCount.props.children).toBe(0);

    const emptyState = root.findByProps({ role: "status" });
    expect(emptyState).toBeDefined();
    expect(emptyState.props.children).toContain("No matching nodes found");
  });

  it("filters by category when clicking category pills", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<GraphSearchOverlay defaultDropdownOpen={true} />);
      });
    });

    const root = renderer!.root;
    const pills = root.findAll((node: ReactTestInstance) =>
      Boolean(node.props.className?.includes("graph-search-pill")),
    );

    const successPill = pills.find((p) => {
      const spans = p.findAllByType("span");
      return spans.some((s) => s.props.children === "Success");
    });
    expect(successPill).toBeDefined();

    act(() => {
      successPill!.props.onClick();
    });

    expect(useGraphStore.getState().activeFilter).toBe("success");

    const results = root.findAllByProps({ role: "option" });
    expect(results.length).toBe(2); // node-worker-2 and node-tool-4 have success status
  });

  it("selects and centers node when clicking on a search result", () => {
    let selectedId: string | null = null;

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <GraphSearchOverlay
            defaultDropdownOpen={true}
            onSelectNode={(id) => {
              selectedId = id;
            }}
          />,
        );
      });
    });

    const root = renderer!.root;
    const items = root.findAllByProps({ role: "option" });
    expect(items.length).toBe(4);

    act(() => {
      items[1].props.onClick();
    });

    expect(useGraphStore.getState().selectedNodeId).toBe("node-worker-2");
    expect(selectedId).toBe("node-worker-2");
  });

  it("supports keyboard navigation with ArrowDown, ArrowUp, Enter, and Escape", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<GraphSearchOverlay defaultDropdownOpen={true} />);
      });
    });

    const root = renderer!.root;
    const searchContainer = root.findByProps({ role: "search" });

    // Navigate down to item 1 (Feature Implementer)
    act(() => {
      searchContainer.props.onKeyDown({
        key: "ArrowDown",
        preventDefault: () => {},
      });
    });

    let items = root.findAllByProps({ role: "option" });
    expect(items[1].props.className).toContain("is-selected");

    // Navigate down to item 2 (Adversarial Gate)
    act(() => {
      searchContainer.props.onKeyDown({
        key: "ArrowDown",
        preventDefault: () => {},
      });
    });

    items = root.findAllByProps({ role: "option" });
    expect(items[2].props.className).toContain("is-selected");

    // Navigate up back to item 1
    act(() => {
      searchContainer.props.onKeyDown({
        key: "ArrowUp",
        preventDefault: () => {},
      });
    });

    items = root.findAllByProps({ role: "option" });
    expect(items[1].props.className).toContain("is-selected");

    // Press Enter to select item 1
    act(() => {
      searchContainer.props.onKeyDown({
        key: "Enter",
        preventDefault: () => {},
      });
    });

    expect(useGraphStore.getState().selectedNodeId).toBe("node-worker-2");

    // Type a query then hit Escape to clear
    const input = root.findByProps({ className: "graph-search-input" });
    act(() => {
      input.props.onChange({ target: { value: "Gate" } });
    });
    expect(useGraphStore.getState().searchQuery).toBe("Gate");

    act(() => {
      searchContainer.props.onKeyDown({
        key: "Escape",
        preventDefault: () => {},
      });
    });
    expect(useGraphStore.getState().searchQuery).toBe("");
  });

  it("clears query when clicking the clear (X) button", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<GraphSearchOverlay defaultDropdownOpen={true} />);
      });
    });

    const root = renderer!.root;
    const input = root.findByProps({ className: "graph-search-input" });

    act(() => {
      input.props.onChange({ target: { value: "test" } });
    });
    expect(useGraphStore.getState().searchQuery).toBe("test");

    const clearBtn = root.findByProps({ "aria-label": "Clear search query" });
    act(() => {
      clearBtn.props.onClick({ stopPropagation: () => {} });
    });

    expect(useGraphStore.getState().searchQuery).toBe("");
  });

  it("triggers focus on global shortcuts (Cmd+F, Cmd+K, /)", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<GraphSearchOverlay defaultExpanded={false} />);
      });
    });

    const root = renderer!.root;

    // Simulate global Cmd+K
    act(() => {
      const ev = new Event("keydown", { bubbles: true });
      Object.assign(ev, { key: "k", metaKey: true });
      window.dispatchEvent(ev);
    });

    // Should now be expanded
    const input = root.findByProps({ className: "graph-search-input" });
    expect(input).toBeDefined();

    // Collapse
    const collapseBtn = root.findByProps({ "aria-label": "Collapse search overlay" });
    act(() => {
      collapseBtn.props.onClick({ stopPropagation: () => {} });
    });

    // Simulate slash key
    act(() => {
      const ev = new Event("keydown", { bubbles: true });
      Object.assign(ev, { key: "/" });
      window.dispatchEvent(ev);
    });

    const inputAfterSlash = root.findByProps({ className: "graph-search-input" });
    expect(inputAfterSlash).toBeDefined();
  });

  it("toggles expand / collapse state", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<GraphSearchOverlay defaultDropdownOpen={true} />);
      });
    });

    const root = renderer!.root;
    const collapseBtn = root.findByProps({ "aria-label": "Collapse search overlay" });

    act(() => {
      collapseBtn.props.onClick({ stopPropagation: () => {} });
    });

    const triggerBtn = root.findByProps({ className: "graph-search-trigger-btn" });
    expect(triggerBtn).toBeDefined();

    act(() => {
      triggerBtn.props.onClick();
    });

    const input = root.findByProps({ className: "graph-search-input" });
    expect(input).toBeDefined();
  });

  it("stops event propagation on click and mouse down", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<GraphSearchOverlay defaultDropdownOpen={true} />);
      });
    });

    const root = renderer!.root;
    const searchContainer = root.findByProps({ role: "search" });

    let stoppedClick = false;
    let stoppedMouseDown = false;

    searchContainer.props.onClick({
      stopPropagation: () => {
        stoppedClick = true;
      },
    });
    searchContainer.props.onMouseDown({
      stopPropagation: () => {
        stoppedMouseDown = true;
      },
    });

    expect(stoppedClick).toBe(true);
    expect(stoppedMouseDown).toBe(true);
  });
});

describe("LayoutMenu Component", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    useGraphStore.setState({
      ...initialStoreState,
      positionedNodes: mockNodes,
      selectedNodeId: null,
      layoutMode: "layered",
      layoutConfig: { ...initialStoreState.layoutConfig, nodeGap: 60, rankGap: 60 },
    });
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
      renderer = null;
    }
  });

  it("renders trigger button and toggles open/close state", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<LayoutMenu defaultOpen={false} />);
      });
    });

    const root = renderer!.root;
    const trigger = root.findByProps({ "data-testid": "layout-menu-trigger" });
    expect(trigger).toBeDefined();
    expect(trigger.props["aria-expanded"]).toBe(false);

    // Click to open
    act(() => {
      trigger.props.onClick();
    });

    expect(trigger.props["aria-expanded"]).toBe(true);
    const popover = root.findByProps({ "data-testid": "layout-menu-popover" });
    expect(popover).toBeDefined();

    // Click close button
    const closeBtn = root.findByProps({ "aria-label": "Close layout menu" });
    act(() => {
      closeBtn.props.onClick();
    });

    const popoversAfterClose = root.findAllByProps({ "data-testid": "layout-menu-popover" });
    expect(popoversAfterClose.length).toBe(0);
  });

  it("closes on Escape key press", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<LayoutMenu defaultOpen={true} />);
      });
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ "data-testid": "layout-menu-popover" }).length).toBe(1);

    act(() => {
      const ev = new Event("keydown", { bubbles: true });
      Object.assign(ev, { key: "Escape" });
      window.dispatchEvent(ev);
    });

    expect(root.findAllByProps({ "data-testid": "layout-menu-popover" }).length).toBe(0);
  });

  it("switches algorithms between Layered, Radial, and Force", () => {
    let chosenAlgo: string | null = null;

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <LayoutMenu
            defaultOpen={true}
            onAlgorithmChange={(mode) => {
              chosenAlgo = mode;
            }}
          />,
        );
      });
    });

    const root = renderer!.root;
    const radialBtn = root.findByProps({ "data-testid": "algorithm-radial" });
    const forceBtn = root.findByProps({ "data-testid": "algorithm-force" });
    const layeredBtn = root.findByProps({ "data-testid": "algorithm-layered" });

    act(() => {
      radialBtn.props.onClick();
    });
    expect(useGraphStore.getState().layoutMode).toBe("radial");
    expect(chosenAlgo).toBe("radial");

    act(() => {
      forceBtn.props.onClick();
    });
    // In store normalizeLayoutMode maps "force" -> "layered" or custom, and layoutMode is set
    expect(chosenAlgo).toBe("force");

    act(() => {
      layeredBtn.props.onClick();
    });
    expect(useGraphStore.getState().layoutMode).toBe("layered");
    expect(chosenAlgo).toBe("layered");
  });

  it("updates nodeGap and rankGap via spacing sliders and number inputs with boundary clamping", () => {
    let spacingChanged: { type: string; value: number } | null = null;

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <LayoutMenu
            defaultOpen={true}
            onSpacingChange={(type, val) => {
              spacingChanged = { type, value: val };
            }}
          />,
        );
      });
    });

    const root = renderer!.root;
    const sliderNodeGap = root.findByProps({ "data-testid": "slider-node-gap" });
    const inputRankGap = root.findByProps({ "data-testid": "input-rank-gap" });

    // Valid values
    act(() => {
      sliderNodeGap.props.onChange({ target: { value: "115" } });
    });
    expect(useGraphStore.getState().layoutConfig.nodeGap).toBe(115);
    expect(spacingChanged).toEqual({ type: "nodeGap", value: 115 });

    act(() => {
      inputRankGap.props.onChange({ target: { value: "140" } });
    });
    expect(useGraphStore.getState().layoutConfig.rankGap).toBe(140);
    expect(spacingChanged).toEqual({ type: "rankGap", value: 140 });

    // Boundary clamp: too low (< 10) clamps to 10
    act(() => {
      sliderNodeGap.props.onChange({ target: { value: "-50" } });
    });
    expect(useGraphStore.getState().layoutConfig.nodeGap).toBe(10);

    // Boundary clamp: too high (> 500) clamps to 500
    act(() => {
      inputRankGap.props.onChange({ target: { value: "9999" } });
    });
    expect(useGraphStore.getState().layoutConfig.rankGap).toBe(500);

    // Invalid non-number input safely defaults to 60
    act(() => {
      sliderNodeGap.props.onChange({ target: { value: "invalid-text" } });
    });
    expect(useGraphStore.getState().layoutConfig.nodeGap).toBe(60);
  });

  it("handles subtree clustering enable, strategy select, collapse/expand all, and individual toggles", () => {
    let clusteringEnabledState = false;

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <LayoutMenu
            defaultOpen={true}
            onClusteringToggle={(enabled) => {
              clusteringEnabledState = enabled;
            }}
          />,
        );
      });
    });

    const root = renderer!.root;
    const toggleClustering = root.findByProps({ "data-testid": "toggle-clustering" });

    // Enable clustering
    act(() => {
      toggleClustering.props.onChange();
    });
    expect(clusteringEnabledState).toBe(true);

    // Change strategy
    const strategySelect = root.findByProps({ "data-testid": "select-clustering-strategy" });
    act(() => {
      strategySelect.props.onChange({ target: { value: "agent" } });
    });

    // Check cluster list rendered
    const clusterList = root.findByProps({ "data-testid": "cluster-list" });
    expect(clusterList).toBeDefined();

    // Collapse All
    const collapseAllBtn = root.findByProps({ "data-testid": "btn-collapse-all" });
    act(() => {
      collapseAllBtn.props.onClick();
    });

    // Expand All
    const expandAllBtn = root.findByProps({ "data-testid": "btn-expand-all" });
    act(() => {
      expandAllBtn.props.onClick();
    });
  });

  it("handles pinning and unpinning node positions", () => {
    let pinnedPayload: { nodeId: string; isPinned: boolean } | null = null;

    useGraphStore.setState({ selectedNodeId: "node-worker-2" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <LayoutMenu
            defaultOpen={true}
            onPinNode={(id, isPinned) => {
              pinnedPayload = { nodeId: id, isPinned };
            }}
          />,
        );
      });
    });

    const root = renderer!.root;
    const pinSelectedBtn = root.findByProps({ "data-testid": "btn-pin-selected" });
    const unpinSelectedBtn = root.findByProps({ "data-testid": "btn-unpin-selected" });

    expect(pinSelectedBtn.props.disabled).toBe(false);
    expect(unpinSelectedBtn.props.disabled).toBe(true);

    // Pin selected node
    act(() => {
      pinSelectedBtn.props.onClick();
    });
    expect(pinnedPayload).toEqual({ nodeId: "node-worker-2", isPinned: true });

    // Unpin selected node
    const unpinSelectedAfterPin = root.findByProps({ "data-testid": "btn-unpin-selected" });
    expect(unpinSelectedAfterPin.props.disabled).toBe(false);

    act(() => {
      unpinSelectedAfterPin.props.onClick();
    });
    expect(pinnedPayload).toEqual({ nodeId: "node-worker-2", isPinned: false });

    // Pin all nodes
    const pinAllBtn = root.findByProps({ "data-testid": "btn-pin-all" });
    act(() => {
      pinAllBtn.props.onClick();
    });

    const badge = root.findByProps({ "data-testid": "pinned-count-badge" });
    expect(badge.props.children).toEqual([4, " pinned"]);

    // Unpin all nodes
    const unpinAllBtn = root.findByProps({ "data-testid": "btn-unpin-all" });
    act(() => {
      unpinAllBtn.props.onClick();
    });

    expect(root.findAllByProps({ "data-testid": "pinned-count-badge" }).length).toBe(0);
  });

  it("resets layout configuration to defaults when clicking reset layout", () => {
    let resetCalled = false;

    useGraphStore.setState({
      layoutMode: "radial",
      layoutConfig: { ...initialStoreState.layoutConfig, nodeGap: 180, rankGap: 210 },
    });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <LayoutMenu
            defaultOpen={true}
            onReset={() => {
              resetCalled = true;
            }}
          />,
        );
      });
    });

    const root = renderer!.root;
    const resetBtn = root.findByProps({ "data-testid": "btn-reset-layout" });

    act(() => {
      resetBtn.props.onClick();
    });

    expect(resetCalled).toBe(true);
    expect(useGraphStore.getState().layoutMode).toBe("layered");
    expect(useGraphStore.getState().layoutConfig.nodeGap).toBe(60);
    expect(useGraphStore.getState().layoutConfig.rankGap).toBe(60);
  });
});

describe("Toolbar Component", () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
      renderer = null;
    }
  });

  it("renders Toolbar with CanvasToolbar and LayoutMenu by default and without in-canvas search overlay", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<Toolbar />);
      });
    });

    const root = renderer!.root;
    const toolbarWrapper = root.findByProps({ className: "gvui-toolbar-wrapper" });
    expect(toolbarWrapper).toBeDefined();

    const layoutMenu = root.findByProps({ "data-testid": "layout-menu-trigger" });
    expect(layoutMenu).toBeDefined();

    const searches = root.findAllByProps({ role: "search" });
    expect(searches.length).toBe(0);
  });

  it("hides layout menu when showLayoutMenu={false}", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<Toolbar showLayoutMenu={false} />);
      });
    });

    const root = renderer!.root;
    const layoutMenus = root.findAllByProps({ "data-testid": "layout-menu-trigger" });
    expect(layoutMenus.length).toBe(0);
  });

  it("does not render any search overlay inside toolbar area", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<Toolbar />);
      });
    });

    const root = renderer!.root;
    const searches = root.findAllByProps({ role: "search" });
    expect(searches.length).toBe(0);
  });
});
