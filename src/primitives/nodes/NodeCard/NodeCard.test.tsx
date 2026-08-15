import { describe, expect, test } from "bun:test";
import {
  describeNodeKind,
  describeNodeStatus,
  resolveModelTier,
  NODE_KIND_DESCRIPTORS,
  NODE_STATUS_DESCRIPTORS,
} from "./nodeKinds";
import type { GraphNodeData, NodeKind, NodeStatus, PositionedNode } from "../../../types/graphData";

describe("NodeCard archetypes and kind descriptors", () => {
  test("describes input stadium archetype with violet accent", () => {
    const node: GraphNodeData = { id: "in-1", name: "User Input", kind: "input" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#8b5cf6");
    expect(desc.label).toBe("USER PROMPT");
  });

  test("describes orchestrator dispatcher archetype with blue accent", () => {
    const node: GraphNodeData = { id: "orch-1", name: "Orchestrator", kind: "orchestrator" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#3b82f6");
    expect(desc.label).toBe("COORDINATOR");
  });

  test("describes agent worker archetype with cyan accent", () => {
    const node: GraphNodeData = { id: "ag-1", name: "Worker Agent", kind: "agent" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#06b6d4");
    expect(desc.label).toBe("WORKER");
  });

  test("describes tool CLI archetype with slate accent", () => {
    const node: GraphNodeData = { id: "tool-1", name: "Run Tests", kind: "tool" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#71717a");
    expect(desc.label).toBe("CLI COMMAND");
  });

  test("describes router decision archetype with amber accent", () => {
    const node: GraphNodeData = { id: "rout-1", name: "Branch Router", kind: "router" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#f59e0b");
    expect(desc.label).toBe("ROUTER");
  });

  test("describes validator gate checkpoint archetype with emerald accent", () => {
    const node: GraphNodeData = { id: "gate-1", name: "Validator Gate", kind: "gate" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#10b981");
    expect(desc.label).toBe("VALIDATOR GATE");
  });

  test("describes critic scorecard archetype with indigo/gold critic accent", () => {
    const node: GraphNodeData = { id: "crit-1", name: "Completeness Critic", kind: "critic" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#818cf8");
    expect(desc.label).toBe("COMPLETENESS CRITIC");
  });

  test("describes terminal sealed outcome archetype with emerald green accent", () => {
    const node: GraphNodeData = { id: "term-1", name: "Terminal Node", kind: "terminal" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#10b981");
    expect(desc.label).toBe("SEALED OUTCOME");
  });

  test("describes join archetype with teal accent", () => {
    const node: GraphNodeData = { id: "join-1", name: "Join Node", kind: "join" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#2dd4bf");
    expect(desc.label).toBe("JOIN");
  });

  test("resolves model tiers accurately", () => {
    expect(resolveModelTier({ id: "1", name: "1", model: "claude-3-opus" })).toBe("l");
    expect(resolveModelTier({ id: "2", name: "2", model: "claude-3-5-sonnet" })).toBe("m");
    expect(resolveModelTier({ id: "3", name: "3", model: "claude-3-haiku" })).toBe("s");
    expect(resolveModelTier({ id: "4", name: "4" })).toBe(undefined);
  });

  test("describes node status indicators", () => {
    expect(describeNodeStatus({ id: "n1", name: "N1", status: "success" }).label).toBe("Success");
    expect(describeNodeStatus({ id: "n2", name: "N2", status: "running" }).label).toBe("Running");
    expect(describeNodeStatus({ id: "n3", name: "N3", status: "error" }).label).toBe("Error");
    expect(describeNodeStatus({ id: "n4", name: "N4", status: "warning" }).label).toBe("Warning");
    expect(describeNodeStatus({ id: "n5", name: "N5", status: "skipped" }).label).toBe("Skipped");
    expect(describeNodeStatus({ id: "n6", name: "N6", status: "cached" }).label).toBe("Cached");
    expect(describeNodeStatus({ id: "n7", name: "N7", status: "pending" }).label).toBe("Pending");
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { create, act } from "react-test-renderer";
import { NodeCardHeader } from "./NodeCardHeader";
import { NodeCardTitle } from "./NodeCardTitle";
import { NodeCard } from "./index";

describe("NodeCardHeader redesign", () => {
  test("renders Kind Icon and Type Tag on the left, without title", () => {
    const node: GraphNodeData = {
      id: "orch-1",
      name: "Complex Orchestration Coordinator",
      kind: "orchestrator",
      type: "coordinator",
    };
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <NodeCardHeader node={node} isCollapsed={false} onToggleCollapse={() => {}} />,
      );
    });

    const root = renderer!.root;
    const headerMain = root.findByProps({ className: "node-card-header-main" });
    expect(headerMain).toBeDefined();

    // Kind icon exists
    const kindIcon = headerMain.findByProps({ className: "node-card-kind-icon" });
    expect(kindIcon).toBeDefined();

    // Type tag exists
    const typeTag = headerMain.findByProps({ className: "node-card-type-tag" });
    expect(typeTag.children).toEqual(["coordinator"]);

    // Title is NOT in header main
    const titleElements = headerMain.findAllByProps({ className: "node-card-title" });
    expect(titleElements.length).toBe(0);
  });

  test("renders Step Badge, Status Badge, Model Chip, and Collapse Button on the right", () => {
    let toggledId = "";
    const node: GraphNodeData = {
      id: "node-42",
      name: "Agent Step Runner",
      kind: "agent",
      type: "worker",
      step: 5,
      badge: { text: "IN_PROGRESS", variant: "warning" },
      model: "claude-3-5-sonnet",
      harnessModel: "anthropic-claude",
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <NodeCardHeader
          node={node}
          isCollapsed={false}
          onToggleCollapse={(id) => {
            toggledId = id;
          }}
        />,
      );
    });

    const root = renderer!.root;
    const headerAside = root.findByProps({ className: "node-card-header-aside" });
    expect(headerAside).toBeDefined();

    const stepBadge = headerAside.findByProps({ className: "node-card-step-badge" });
    expect(stepBadge.children).toEqual(["Step ", "5"]);

    const badgeChip = headerAside.findByProps({
      className: "node-card-badge-chip variant-warning",
    });
    expect(badgeChip.children).toEqual(["IN_PROGRESS"]);

    const modelChip = headerAside.findByProps({
      className: "node-card-model-chip tier-m",
    });
    expect(modelChip.children).toEqual(["claude-3-5-sonnet"]);

    const toggleBtn = headerAside.findByProps({ className: "node-card-toggle-btn" });
    expect(toggleBtn.props["aria-label"]).toBe("Collapse node");
    expect(toggleBtn.props["aria-expanded"]).toBe(true);

    act(() => {
      toggleBtn.props.onClick({ stopPropagation: () => {} });
    });
    expect(toggledId).toBe("node-42");
  });

  test("reflects aria-expanded=false when collapsed and handles keyboard Enter / Space triggers", () => {
    let toggledCount = 0;
    let lastToggledId = "";
    const node: GraphNodeData = {
      id: "node-kbd",
      name: "Keyboard Accessible Node",
      kind: "gate",
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <NodeCardHeader
          node={node}
          isCollapsed={true}
          onToggleCollapse={(id) => {
            toggledCount++;
            lastToggledId = id;
          }}
        />,
      );
    });

    const root = renderer!.root;
    const toggleBtn = root.findByProps({ className: "node-card-toggle-btn" });
    expect(toggleBtn.props["aria-label"]).toBe("Expand node");
    expect(toggleBtn.props["aria-expanded"]).toBe(false);

    // Press Enter
    act(() => {
      toggleBtn.props.onKeyDown({
        key: "Enter",
        stopPropagation: () => {},
        preventDefault: () => {},
      });
    });
    expect(toggledCount).toBe(1);
    expect(lastToggledId).toBe("node-kbd");

    // Press Space
    act(() => {
      toggleBtn.props.onKeyDown({
        key: " ",
        stopPropagation: () => {},
        preventDefault: () => {},
      });
    });
    expect(toggledCount).toBe(2);

    // Other keys (e.g. Escape or ArrowDown) should not trigger toggle
    act(() => {
      toggleBtn.props.onKeyDown({
        key: "ArrowDown",
        stopPropagation: () => {},
        preventDefault: () => {},
      });
    });
    expect(toggledCount).toBe(2);
  });
});

describe("NodeCardTitle dedicated full-width component", () => {
  test("renders full-width title with natural wrapping and title tooltip", () => {
    const node: GraphNodeData = {
      id: "title-node",
      name: "Full Width Title That Wraps Across Multiple Lines Naturally Without Artificial Clamping",
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<NodeCardTitle node={node} />);
    });

    const root = renderer!.root;
    const titleElement = root.findByProps({ className: "node-card-title" });
    expect(titleElement.props.title).toBe(node.name);
    expect(titleElement.children).toEqual([node.name]);
  });

  test("renders null when name is empty or not provided", () => {
    const node: GraphNodeData = {
      id: "empty-title-node",
      name: "",
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<NodeCardTitle node={node} />);
    });

    expect(renderer!.toJSON()).toBeNull();
  });
});

describe("NodeCard integration across standard widths: 200px, 320px, 500px", () => {
  const testWidths = [200, 320, 500];

  for (const width of testWidths) {
    test(`renders full card layout correctly at ${width}px width`, () => {
      const node: PositionedNode = {
        id: `node-${width}`,
        name: `Node Testing At Width ${width}px With Full Title Separation`,
        kind: "agent",
        type: "executor",
        step: 2,
        badge: { text: "READY", variant: "success" },
        model: "claude-3-haiku",
        description: "Executes verified code paths cleanly.",
        tools: [{ name: "test-tool" }],
        x: 0,
        y: 0,
        width,
        height: 120,
      };

      let renderer: ReturnType<typeof create>;
      act(() => {
        renderer = create(
          <NodeCard
            node={node}
            isSelected={false}
            isFiltered={false}
            isCollapsed={false}
            onSelect={() => {}}
            onToggleCollapse={() => {}}
          />,
        );
      });

      const root = renderer!.root;
      const cardDiv = root.findByProps({ role: "button" });
      expect(cardDiv.props.style.width).toBe(`${width}px`);

      // Header is rendered
      const header = cardDiv.findByProps({ className: "node-card-header" });
      expect(header).toBeDefined();

      // Body is rendered with title as first element
      const body = cardDiv.findByProps({ className: "node-card-body" });
      expect(body).toBeDefined();

      const title = body.findByProps({ className: "node-card-title" });
      expect(title).toBeDefined();
      expect(title.children).toEqual([node.name]);
    });
  }

  test("hides body when collapsed and keeps header visible", () => {
    const node: PositionedNode = {
      id: "collapsed-node",
      name: "Collapsed Task Name",
      kind: "gate",
      type: "validator",
      step: 1,
      x: 0,
      y: 0,
      width: 320,
      height: 35,
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <NodeCard
          node={node}
          isSelected={false}
          isFiltered={false}
          isCollapsed={true}
          onSelect={() => {}}
          onToggleCollapse={() => {}}
        />,
      );
    });

    const root = renderer!.root;
    const cardDiv = root.findByProps({ role: "button" });
    const header = cardDiv.findByProps({ className: "node-card-header" });
    expect(header).toBeDefined();

    const body = cardDiv.findAllByProps({ className: "node-card-body" });
    expect(body.length).toBe(0);
  });
});

describe("NodeCardTitle edge-case handling", () => {
  test("renders Unicode emojis, CJK, and RTL scripts without mutation or corruption", () => {
    const unicodeTitles = [
      "🚀 Autonomous Agent 🤖: Step 4 Deployment",
      "日本語のタスク・中文任务・한국어 분석 작업",
      "مهمة المنسق الرئيسي للنظام",
    ];

    for (const titleText of unicodeTitles) {
      const node: GraphNodeData = {
        id: "unicode-node",
        name: titleText,
      };

      let renderer: ReturnType<typeof create>;
      act(() => {
        renderer = create(<NodeCardTitle node={node} />);
      });

      const root = renderer!.root;
      const titleElement = root.findByProps({ className: "node-card-title" });
      expect(titleElement.props.title).toBe(titleText);
      expect(titleElement.children).toEqual([titleText]);
    }
  });

  test("renders multi-line string inputs with explicit newlines preserving structure", () => {
    const multilineTitle = "Phase 1: Ingestion\nPhase 2: Validation\nPhase 3: Execution";
    const node: GraphNodeData = {
      id: "multiline-node",
      name: multilineTitle,
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<NodeCardTitle node={node} />);
    });

    const root = renderer!.root;
    const titleElement = root.findByProps({ className: "node-card-title" });
    expect(titleElement.props.title).toBe(multilineTitle);
    expect(titleElement.children).toEqual([multilineTitle]);
  });

  test("renders very long unbroken tokens without truncation", () => {
    const unbrokenTokenTitle =
      "https://git.internal.company.com/repositories/gvui/commits/9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1098/pipeline/artifacts/coverage.json";
    const node: GraphNodeData = {
      id: "unbroken-node",
      name: unbrokenTokenTitle,
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<NodeCardTitle node={node} />);
    });

    const root = renderer!.root;
    const titleElement = root.findByProps({ className: "node-card-title" });
    expect(titleElement.props.title).toBe(unbrokenTokenTitle);
    expect(titleElement.children).toEqual([unbrokenTokenTitle]);
  });
});

describe("Narrow viewport (200px) multi-chip header stress testing", () => {
  test("renders all header chips simultaneously at 200px without crashing", () => {
    const crowdedNode: PositionedNode = {
      id: "crowded-200",
      name: "Crowded Header Node At 200px",
      kind: "orchestrator",
      type: "coordinator-v2",
      step: 99,
      badge: { text: "CRITICAL_PATH", variant: "warning" },
      model: "claude-3-5-sonnet-20260620",
      harnessModel: "harness-runner-extended",
      x: 0,
      y: 0,
      width: 200,
      height: 140,
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <NodeCard
          node={crowdedNode}
          isSelected={false}
          isFiltered={false}
          isCollapsed={false}
          onSelect={() => {}}
          onToggleCollapse={() => {}}
        />,
      );
    });

    const root = renderer!.root;
    const card = root.findByProps({ role: "button" });
    expect(card.props.style.width).toBe("200px");

    const header = card.findByProps({ className: "node-card-header" });
    expect(header).toBeDefined();

    const headerMain = header.findByProps({ className: "node-card-header-main" });
    const typeTag = headerMain.findByProps({ className: "node-card-type-tag" });
    expect(typeTag.children).toEqual(["coordinator-v2"]);

    const headerAside = header.findByProps({ className: "node-card-header-aside" });
    const stepBadge = headerAside.findByProps({ className: "node-card-step-badge" });
    expect(stepBadge.children).toEqual(["Step ", "99"]);

    const badgeChip = headerAside.findByProps({
      className: "node-card-badge-chip variant-warning",
    });
    expect(badgeChip.children).toEqual(["CRITICAL_PATH"]);

    const modelChip = headerAside.findByProps({
      className: "node-card-model-chip tier-m",
    });
    expect(modelChip.children).toEqual(["claude-3-5-sonnet-20260620"]);

    const toggleBtn = headerAside.findByProps({ className: "node-card-toggle-btn" });
    expect(toggleBtn).toBeDefined();

    // Body title is fully separate and intact
    const body = card.findByProps({ className: "node-card-body" });
    const title = body.findByProps({ className: "node-card-title" });
    expect(title.children).toEqual(["Crowded Header Node At 200px"]);
  });
});

describe("Exhaustive Archetype Matrix (All 9 Archetypes)", () => {
  const allArchetypes: readonly NodeKind[] = [
    "input",
    "orchestrator",
    "agent",
    "tool",
    "gate",
    "critic",
    "terminal",
    "router",
    "join",
  ];

  for (const kind of allArchetypes) {
    test(`renders archetype '${kind}' with matching accent, type tag, and separated title`, () => {
      const descriptor = NODE_KIND_DESCRIPTORS[kind];
      const node: PositionedNode = {
        id: `node-${kind}`,
        name: `Title For ${descriptor.label}`,
        kind,
        type: `${kind}-type-spec`,
        step: 1,
        x: 0,
        y: 0,
        width: 320,
        height: 100,
      };

      let renderer: ReturnType<typeof create>;
      act(() => {
        renderer = create(
          <NodeCard
            node={node}
            isSelected={false}
            isFiltered={false}
            isCollapsed={false}
            onSelect={() => {}}
            onToggleCollapse={() => {}}
          />,
        );
      });

      const root = renderer!.root;
      const card = root.findByProps({ role: "button" });

      // Header structure
      const header = card.findByProps({ className: "node-card-header" });
      const icon = header.findByProps({ className: "node-card-kind-icon" });
      expect(icon.props.style.color).toBe(descriptor.accent);

      const typeTag = header.findByProps({ className: "node-card-type-tag" });
      expect(typeTag.children).toEqual([`${kind}-type-spec`]);

      // Title separation inside body
      const body = card.findByProps({ className: "node-card-body" });
      const title = body.findByProps({ className: "node-card-title" });
      expect(title.children).toEqual([node.name]);
    });
  }
});

describe("Exhaustive Lifecycle State Matrix (All 7 Lifecycle States)", () => {
  const allStatuses: readonly NodeStatus[] = [
    "pending",
    "running",
    "success",
    "error",
    "warning",
    "skipped",
    "cached",
  ];

  for (const status of allStatuses) {
    test(`renders lifecycle state '${status}' with correct status class, badge, and separated title`, () => {
      const statusDesc = NODE_STATUS_DESCRIPTORS[status];
      const variant =
        status === "error"
          ? "error"
          : status === "warning"
            ? "warning"
            : status === "success"
              ? "success"
              : "info";
      const node: PositionedNode = {
        id: `node-status-${status}`,
        name: `Node Status ${statusDesc.label}`,
        kind: "agent",
        status,
        badge: {
          text: status.toUpperCase(),
          variant,
        },
        x: 0,
        y: 0,
        width: 320,
        height: 100,
      };

      let renderer: ReturnType<typeof create>;
      act(() => {
        renderer = create(
          <NodeCard
            node={node}
            isSelected={false}
            isFiltered={false}
            isCollapsed={false}
            onSelect={() => {}}
            onToggleCollapse={() => {}}
          />,
        );
      });

      const root = renderer!.root;
      const card = root.findByProps({ role: "button" });
      expect(card.props.className).toContain(`status-${status}`);

      const header = card.findByProps({ className: "node-card-header" });
      expect(header).toBeDefined();

      const badgeChip = header.findByProps({
        className: `node-card-badge-chip variant-${variant}`,
      });
      expect(badgeChip.children).toEqual([status.toUpperCase()]);

      const body = card.findByProps({ className: "node-card-body" });
      const title = body.findByProps({ className: "node-card-title" });
      expect(title.children).toEqual([node.name]);
    });
  }
});

describe("Exhaustive Viewport Stress Matrix (9 Archetypes x 3 Viewport Widths = 27 Layout Configurations)", () => {
  const allArchetypes: readonly NodeKind[] = [
    "input",
    "orchestrator",
    "agent",
    "tool",
    "gate",
    "critic",
    "terminal",
    "router",
    "join",
  ];
  const widths = [200, 320, 500];

  for (const kind of allArchetypes) {
    for (const width of widths) {
      test(`renders archetype '${kind}' cleanly at ${width}px viewport width without layout errors`, () => {
        const node: PositionedNode = {
          id: `stress-${kind}-${width}`,
          name: `Archetype ${kind.toUpperCase()} Title Wrapping Naturally At ${width}px Viewport Width Without Collision`,
          kind,
          type: `${kind}-spec`,
          step: 3,
          badge: { text: "ACTIVE", variant: "success" },
          model: "claude-3-5-sonnet",
          description:
            "Stress test node validating full width title separation and header chip bounds.",
          x: 0,
          y: 0,
          width,
          height: 120,
        };

        let renderer: ReturnType<typeof create>;
        act(() => {
          renderer = create(
            <NodeCard
              node={node}
              isSelected={false}
              isFiltered={false}
              isCollapsed={false}
              onSelect={() => {}}
              onToggleCollapse={() => {}}
            />,
          );
        });

        const root = renderer!.root;
        const card = root.findByProps({ role: "button" });
        expect(card.props.style.width).toBe(`${width}px`);

        const header = card.findByProps({ className: "node-card-header" });
        expect(header).toBeDefined();

        const body = card.findByProps({ className: "node-card-body" });
        const title = body.findByProps({ className: "node-card-title" });
        expect(title.children).toEqual([node.name]);
      });
    }
  }
});
