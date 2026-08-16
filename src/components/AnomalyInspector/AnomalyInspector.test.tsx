import { describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type { GraphDataset } from "../../types/graphData";
import { AnomalyInspector } from "./index";

describe("AnomalyInspector Component Suite", () => {
  const sampleDataset: GraphDataset = {
    id: "test-run-inspector",
    title: "Inspector Test Pipeline",
    nodes: [
      {
        id: "node-root",
        name: "Root",
        status: "success",
        metrics: { durationMs: 2000, tokensIn: 1000, tokensOut: 500 },
      },
      {
        id: "node-retry-excess",
        name: "Retry Excess Node",
        status: "error",
        metrics: { retries: 4, repairRounds: 2, durationMs: 5000 },
      },
      {
        id: "node-token-spike",
        name: "Token Outlier Node",
        status: "success",
        metrics: { tokensIn: 80000, tokensOut: 5000 },
      },
    ],
    edges: [
      { id: "e1", source: "node-root", target: "node-retry-excess" },
      { id: "e2", source: "node-root", target: "node-token-spike" },
    ],
  };

  it("renders empty state when dataset is null", () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<AnomalyInspector dataset={null} />);
    });

    const root = renderer?.root;
    const emptyBox = root?.findByProps({ "data-testid": "anomaly-inspector-empty-dataset" });
    expect(emptyBox).toBeDefined();
  });

  it("renders clean state when graph dataset has zero defects", () => {
    const cleanDataset: GraphDataset = {
      id: "all-clean",
      title: "All Clean",
      nodes: [
        {
          id: "clean-node-1",
          name: "Clean 1",
          status: "success",
          metrics: { retries: 0, repairRounds: 0, tokensIn: 500, tokensOut: 200, durationMs: 1000 },
        },
      ],
      edges: [],
    };

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<AnomalyInspector dataset={cleanDataset} />);
    });

    const root = renderer?.root;
    const cleanState = root?.findByProps({ "data-testid": "anomaly-clean-state" });
    expect(cleanState).toBeDefined();
  });

  it("renders full dashboard with cards and overview components on anomaly detection", () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<AnomalyInspector dataset={sampleDataset} />);
    });

    const root = renderer?.root;
    const dashboard = root?.findByProps({ "data-testid": "gvui-anomaly-inspector" });
    expect(dashboard).toBeDefined();

    const gauge = root?.findByProps({ "data-testid": "anomaly-health-gauge" });
    expect(gauge).toBeDefined();

    const filterBar = root?.findByProps({ "data-testid": "anomaly-filter-bar" });
    expect(filterBar).toBeDefined();

    const categoryDist = root?.findByProps({ "data-testid": "anomaly-category-distribution" });
    expect(categoryDist).toBeDefined();

    const cardsList = root?.findByProps({ "data-testid": "anomaly-cards-list" });
    expect(cardsList).toBeDefined();
  });

  it("expands and collapses anomaly cards on click", () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<AnomalyInspector dataset={sampleDataset} />);
    });

    const root = renderer?.root;
    const cards = root?.findAll((node) => {
      return (
        typeof node.props.className === "string" &&
        node.props.className.includes("gvui-anomaly-card")
      );
    });
    expect(cards && cards.length > 0).toBe(true);

    const firstCard = cards?.[0];
    const header = firstCard?.findByProps({ className: "anomaly-card-header" });

    // Expand
    act(() => {
      header?.props.onClick();
    });

    const expandedBody = firstCard?.findByProps({ "data-testid": "anomaly-card-body" });
    expect(expandedBody).toBeDefined();

    // Collapse
    act(() => {
      header?.props.onClick();
    });

    const bodiesAfterCollapse = firstCard?.findAllByProps({ "data-testid": "anomaly-card-body" });
    expect(bodiesAfterCollapse?.length).toBe(0);
  });

  it("filters anomalies via search input", () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<AnomalyInspector dataset={sampleDataset} />);
    });

    const root = renderer?.root;
    const searchInput = root?.findByProps({ "data-testid": "anomaly-search-input" });

    act(() => {
      searchInput?.props.onChange({ target: { value: "Retry" } });
    });

    const cards = root?.findAll((node) => {
      return (
        typeof node.props.className === "string" &&
        node.props.className.includes("gvui-anomaly-card")
      );
    });
    expect(cards?.length).toBe(1);
  });

  it("triggers onSelectNode callback when clicking target node chips", () => {
    let selectedNode: string | null = null;
    const handleSelectNode = (nid: string) => {
      selectedNode = nid;
    };

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <AnomalyInspector dataset={sampleDataset} onSelectNode={handleSelectNode} />,
      );
    });

    const root = renderer?.root;
    const nodeChips = root?.findAllByProps({ className: "target-node-chip" });
    expect(nodeChips && nodeChips.length > 0).toBe(true);

    const chip = nodeChips?.[0];
    act(() => {
      chip?.props.onClick({ stopPropagation: () => {} });
    });

    expect(selectedNode).not.toBeNull();
  });

  it("triggers onApplyQuickFix callback when applying automated quick fix", () => {
    let patchedResult: GraphDataset | null = null;
    const handleQuickFix = (res: GraphDataset) => {
      patchedResult = res;
    };

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <AnomalyInspector dataset={sampleDataset} onApplyQuickFix={handleQuickFix} />,
      );
    });

    const root = renderer?.root;
    // First expand all cards to access quick fix buttons
    const expandAllBtn = root?.findByProps({ "data-testid": "anomaly-expand-all-btn" });
    act(() => {
      expandAllBtn?.props.onClick();
    });

    const quickFixBtns = root?.findAllByProps({ className: "quick-fix-btn" });
    expect(quickFixBtns && quickFixBtns.length > 0).toBe(true);

    act(() => {
      quickFixBtns?.[0]?.props.onClick();
    });

    expect(patchedResult).not.toBeNull();
  });
});
