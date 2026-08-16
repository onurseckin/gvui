import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import type { SemanticEdgeKind } from "../../primitives/edges/GraphEdge/edgeKinds";
import type { EdgeTrafficExchange, GraphEdgeData } from "../../types/graphData";
import { EdgeDetailDrawer } from "./index";
import { EdgeOverviewTab } from "./tabs/OverviewTab";
import { EdgeRawJsonTab } from "./tabs/RawJsonTab";
import { TrafficChronologyTab } from "./tabs/TrafficChronologyTab";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EdgeDetailDrawer & Traffic Chronology Inspector", () => {
  const sampleEdge: GraphEdgeData = {
    id: "edge-test-1",
    source: "node-planner",
    target: "node-worker",
    kind: "data",
    label: "AST Architecture Payload",
    description: "Transfers compiled AST nodes and exports to worker agent",
    stepNumber: 2,
    tokens: 4200,
    isHighTraffic: true,
    bundleCount: 3,
    bundleIndex: 0,
    handoff: {
      kind: "artifact",
      summary: "Compiled AST bundle with symbol map",
      tokens: 3800,
      preview: "export interface ASTNode { type: string; line: number; }",
    },
    traffic: {
      volume: 4,
      messagesCount: 4,
      tokens: 18500,
      avgLatencyMs: 140,
      status: "active",
      glowColor: "#06b6d4",
      exchanges: [
        {
          id: "ex-1",
          direction: "forward",
          type: "prompt",
          summary: "Initial worker dispatch with task plan",
          tokens: 4500,
          latencyMs: 120,
          timestamp: "2026-08-15T00:00:01.000Z",
          payloadPreview: "Execute task T-01 with write scope gvui/src/types",
        },
        {
          id: "ex-2",
          direction: "reverse",
          type: "feedback",
          summary: "Worker request for clarification on type signature",
          tokens: 1200,
          latencyMs: 80,
          timestamp: "2026-08-15T00:00:05.000Z",
          payloadPreview: "Should EdgeTrafficDetail include glowIntensity?",
        },
        {
          id: "ex-3",
          direction: "forward",
          type: "decision",
          summary: "Coordinator confirmation: optional glowIntensity",
          tokens: 800,
          latencyMs: 60,
          timestamp: "2026-08-15T00:00:08.000Z",
          payloadPreview: "Yes, optional glowIntensity: number",
        },
        {
          id: "ex-4",
          direction: "reverse",
          type: "artifact",
          summary: "Worker task completion submission",
          tokens: 12000,
          latencyMs: 300,
          timestamp: "2026-08-15T00:00:15.000Z",
          payloadPreview: "export interface EdgeTrafficDetail { glowColor?: string; }",
        },
      ],
    },
  };

  test("renders EdgeDetailDrawer header, status pills, and tab triggers", () => {
    const html = renderToString(<EdgeDetailDrawer edge={sampleEdge} />);

    expect(html.includes("AST Architecture Payload")).toBe(true);
    expect(html.includes("edge-kind-badge")).toBe(true);
    expect(html.includes("DATA")).toBe(true);
    expect(html.includes("ACTIVE")).toBe(true);
    expect(html.includes("Traffic Chronology")).toBe(true);
    expect(
      html.includes("Overview &amp; Routing") ||
        html.includes("Overview & Routing") ||
        html.includes("Overview"),
    ).toBe(true);
    expect(html.includes("Raw Data")).toBe(true);
  });

  test("renders TrafficChronologyTab telemetry cards and chronological exchange items", () => {
    const html = renderToString(
      <TrafficChronologyTab
        edge={sampleEdge}
        sourceName="Planner Coordinator"
        targetName="Worker Implementer"
      />,
    );

    expect(html.includes("Traffic Telemetry Summary")).toBe(true);
    expect(html.includes("Message Exchanges")).toBe(true);
    expect(html.includes("Token Volume")).toBe(true);
    expect(html.includes("19k")).toBe(true);
    expect(html.includes("Avg Latency")).toBe(true);
    expect(html.includes("140ms")).toBe(true);

    expect(html.includes("Chronology Inspector")).toBe(true);
    expect(html.includes("Planner Coordinator")).toBe(true);
    expect(html.includes("Worker Implementer")).toBe(true);
    expect(html.includes("Initial worker dispatch with task plan")).toBe(true);
    expect(html.includes("Worker request for clarification")).toBe(true);
    expect(html.includes("Coordinator confirmation")).toBe(true);
    expect(html.includes("Worker task completion submission")).toBe(true);
    expect(html.includes("Execute task T-01")).toBe(true);
  });

  test("verifies deep In/Out payload direction, tokens, latencies, and payload stream contents", () => {
    const html = renderToString(
      <TrafficChronologyTab edge={sampleEdge} sourceName="Node Alpha" targetName="Node Beta" />,
    );

    // Forward exchange (Node Alpha -> Node Beta)
    expect(html.includes("Node Alpha")).toBe(true);
    expect(html.includes("Node Beta")).toBe(true);
    expect(html.includes("type-prompt")).toBe(true);
    expect(html.includes("4.5k")).toBe(true);
    expect(html.includes("tok")).toBe(true);
    expect(html.includes("120ms")).toBe(true);
    expect(html.includes("Execute task T-01 with write scope gvui/src/types")).toBe(true);

    // Reverse exchange (Node Beta -> Node Alpha)
    expect(html.includes("type-feedback")).toBe(true);
    expect(html.includes("1.2k")).toBe(true);
    expect(html.includes("80ms")).toBe(true);
    expect(html.includes("Should EdgeTrafficDetail include glowIntensity?")).toBe(true);

    // Forward decision exchange
    expect(html.includes("type-decision")).toBe(true);
    expect(html.includes("800")).toBe(true);
    expect(html.includes("60ms")).toBe(true);
    expect(html.includes("Yes, optional glowIntensity: number")).toBe(true);

    // Reverse artifact payload
    expect(html.includes("type-artifact")).toBe(true);
    expect(html.includes("12k")).toBe(true);
    expect(html.includes("300ms")).toBe(true);
  });

  test("renders EdgeOverviewTab with connection routing, handoff contracts, and bundle metrics", () => {
    const html = renderToString(
      <EdgeOverviewTab
        edge={sampleEdge}
        sourceName="Planner Coordinator"
        targetName="Worker Implementer"
      />,
    );

    expect(html.includes("Connection Routing")).toBe(true);
    expect(html.includes("Planner Coordinator")).toBe(true);
    expect(html.includes("Worker Implementer")).toBe(true);
    expect(html.includes("node-planner")).toBe(true);
    expect(html.includes("node-worker")).toBe(true);
    expect(html.includes("Handoff Contract")).toBe(true);
    expect(html.includes("Compiled AST bundle with symbol map")).toBe(true);
    expect(html.includes("ASTNode")).toBe(true);
    expect(html.includes("3.8k")).toBe(true);
    expect(html.includes("High Traffic Channel")).toBe(true);
    expect(html.includes("1 of 3")).toBe(true);
    expect(html.includes("Step 2")).toBe(true);
    expect(html.includes("4.2k")).toBe(true);
    expect(html.includes("Transfers compiled AST nodes and exports to worker agent")).toBe(true);
  });

  test("renders EdgeRawJsonTab with formatted json payload", () => {
    const html = renderToString(<EdgeRawJsonTab edge={sampleEdge} />);

    expect(html.includes("Raw Edge Data (JSON)")).toBe(true);
    expect(html.includes("edge-test-1")).toBe(true);
    expect(html.includes("AST Architecture Payload")).toBe(true);
    expect(html.includes("glowColor")).toBe(true);
  });

  test("handles pushback loop cycle edges gracefully", () => {
    const cycleEdge: GraphEdgeData = {
      id: "edge-cycle-1",
      source: "node-validator",
      target: "node-worker",
      kind: "loop",
      isCycle: true,
      label: "Fix Verification Findings",
      description: "Pushback cycle requiring repairs",
      traffic: {
        volume: 6,
        status: "congested",
        glowColor: "#f59e0b",
      },
    };

    const html = renderToString(<EdgeDetailDrawer edge={cycleEdge} />);

    expect(html.includes("Fix Verification Findings")).toBe(true);
    expect(html.includes("Pushback Cycle")).toBe(true);
    expect(html.includes("CONGESTED")).toBe(true);
  });

  test("renders all tabs without errors for minimal edge without traffic or handoff", () => {
    const minimalEdge: GraphEdgeData = {
      id: "edge-minimal",
      source: "node-a",
      target: "node-b",
    };

    const drawerHtml = renderToString(<EdgeDetailDrawer edge={minimalEdge} />);
    expect(drawerHtml.includes("edge-minimal")).toBe(true);
    expect(drawerHtml.includes("node-a \u2192 node-b")).toBe(true);

    const overviewHtml = renderToString(
      <EdgeOverviewTab edge={minimalEdge} sourceName="Node A" targetName="Node B" />,
    );
    expect(overviewHtml.includes("Connection Routing")).toBe(true);
    expect(overviewHtml.includes("Node A")).toBe(true);
    expect(overviewHtml.includes("Node B")).toBe(true);

    const chronologyHtml = renderToString(
      <TrafficChronologyTab edge={minimalEdge} sourceName="Node A" targetName="Node B" />,
    );
    expect(chronologyHtml.includes("No traffic exchanges recorded on this edge.")).toBe(true);

    const rawJsonHtml = renderToString(<EdgeRawJsonTab edge={minimalEdge} />);
    expect(rawJsonHtml.includes("edge-minimal")).toBe(true);
  });

  test("renders tab badges with accurate exchange count", () => {
    const edgeWithCount: GraphEdgeData = {
      id: "edge-count-test",
      source: "node-1",
      target: "node-2",
      traffic: {
        volume: 12,
        messagesCount: 12,
        tokens: 50000,
        status: "active",
      },
    };

    const html = renderToString(<EdgeDetailDrawer edge={edgeWithCount} />);
    expect(html.includes("edge-tab-badge")).toBe(true);
    expect(html.includes("12")).toBe(true);
  });

  test("renders top summary card with inter-node call count across active steps and calling relationship", () => {
    const multiStepEdge: GraphEdgeData = {
      id: "edge-deep-trace",
      source: "worker-t02-measurer",
      target: "validator-t02-measurer",
      kind: "validation",
      label: "Measurer Quality Assurance Gate",
      traffic: {
        volume: 4,
        messagesCount: 4,
        tokens: 32000,
        activeSteps: [2, 3, 4],
        callingRelationship: "Implementer Work ◄──► Adversarial Validation Gate",
        status: "active",
        exchanges: [
          {
            id: "ex-101",
            step: 2,
            direction: "forward",
            type: "submission",
            summary: "Measurer layout implementation dispatch",
            inputGoal: "Implement canvas measurer bounds & dynamic height",
            outputPassed: "Dynamic box calculations & template sync",
            filesTransferred: [
              {
                path: "src/engine/layout/measurement/canvasMeasurer.ts",
                additions: 142,
                deletions: 18,
                diff: "+ export function measureBounds() { return Math.max(10, w); }",
              },
            ],
            tokens: 6500,
          },
          {
            id: "ex-102",
            step: 3,
            direction: "reverse",
            type: "rejection",
            summary: "Rejection pushback on zero-width bounds clamp",
            auditFinding: {
              id: "finding-T-02-reject",
              severity: "critical",
              status: "open",
              observation: "Need explicit regression verification on zero-width bounds.",
              remediation: "Defensively clamp non-positive width inputs in measurer.",
            },
            tokens: 3200,
          },
          {
            id: "ex-103",
            step: 4,
            direction: "forward",
            type: "repair",
            summary: "Remediated clamp bounds submission",
            remediatedPayload: "Math.max(min, width) bounds clamp + test assertions",
            tokens: 7800,
          },
          {
            id: "ex-104",
            step: 4,
            direction: "reverse",
            type: "approval",
            summary: "Validation signoff verification",
            verdict: "PASS",
            auditFinding: "finding-T-02-reject",
            resolutionProof: {
              method: "gate_execution",
              evidence: ["Monitored gate command exit code 0", "26/26 layout tests passing"],
            },
            tokens: 4100,
          },
        ],
      },
    };

    const drawerHtml = renderToString(<EdgeDetailDrawer edge={multiStepEdge} />);

    // Top Summary Card
    expect(drawerHtml.includes("INTERACTION SUMMARY")).toBe(true);
    expect(drawerHtml.includes("Called 4 times across Steps 2, 3, 4")).toBe(true);
    expect(drawerHtml.includes("Total Inter-Node Calls:")).toBe(true);
    expect(drawerHtml.includes("4 Times")).toBe(true);
    expect(drawerHtml.includes("Active Steps:")).toBe(true);
    expect(drawerHtml.includes("Step 2, Step 3, Step 4")).toBe(true);
    expect(drawerHtml.includes("Calling Relationship:")).toBe(true);
    expect(
      drawerHtml.includes("Implementer Work ◄──► Adversarial Validation Gate") ||
        drawerHtml.includes("Implementer Work"),
    ).toBe(true);

    // Chronology Tab deep In/Out payload rendering
    const tabHtml = renderToString(
      <TrafficChronologyTab
        edge={multiStepEdge}
        sourceName="worker-t02-measurer"
        targetName="validator-t02-measurer"
      />,
    );

    // Step 2 Submission
    expect(tabHtml.includes("[Step 2]")).toBe(true);
    expect(tabHtml.includes("Input Goal:")).toBe(true);
    expect(
      tabHtml.includes("Implement canvas measurer bounds &amp; dynamic height") ||
        tabHtml.includes("Implement canvas measurer bounds & dynamic height"),
    ).toBe(true);
    expect(tabHtml.includes("Output Passed:")).toBe(true);
    expect(
      tabHtml.includes("Dynamic box calculations &amp; template sync") ||
        tabHtml.includes("Dynamic box calculations & template sync"),
    ).toBe(true);
    expect(tabHtml.includes("Files Transferred:")).toBe(true);
    expect(tabHtml.includes("src/engine/layout/measurement/canvasMeasurer.ts")).toBe(true);
    expect(tabHtml.includes("+142")).toBe(true);
    expect(tabHtml.includes("-18")).toBe(true);
    expect(tabHtml.includes("measureBounds")).toBe(true);

    // Step 3 Rejection Pushback
    expect(tabHtml.includes("[Step 3]")).toBe(true);
    expect(tabHtml.includes("Audit Finding:")).toBe(true);
    expect(tabHtml.includes("finding-T-02-reject")).toBe(true);
    expect(tabHtml.includes("(Critical Severity)")).toBe(true);
    expect(tabHtml.includes("Need explicit regression verification on zero-width bounds.")).toBe(
      true,
    );
    expect(tabHtml.includes("Defensively clamp non-positive width inputs in measurer.")).toBe(true);

    // Step 4 Repair Submission
    expect(tabHtml.includes("[Step 4]")).toBe(true);
    expect(tabHtml.includes("Remediated Payload:")).toBe(true);
    expect(tabHtml.includes("Math.max(min, width) bounds clamp + test assertions")).toBe(true);

    // Step 4 Approval Review
    expect(tabHtml.includes("Verdict:")).toBe(true);
    expect(tabHtml.includes("PASS")).toBe(true);
    expect(tabHtml.includes("finding-T-02-reject RESOLVED")).toBe(true);
    expect(tabHtml.includes("Evidence:")).toBe(true);
    expect(tabHtml.includes("Monitored gate command exit code 0")).toBe(true);
    expect(tabHtml.includes("26/26 layout tests passing")).toBe(true);
  });

  test("renders Condition & Branch Evaluation section and copy button in OverviewTab", () => {
    const edgeWithCondition: GraphEdgeData = {
      id: "edge-cond-1",
      source: "node-router",
      target: "node-worker",
      kind: "spawn",
      label: "Branch: High Priority",
      condition: "task.priority === 'CRITICAL' && auth.verified === true",
    };

    const overviewHtml = renderToString(
      <EdgeOverviewTab edge={edgeWithCondition} sourceName="Router" targetName="Worker" />,
    );

    expect(
      overviewHtml.includes("Condition &amp; Branch Evaluation") ||
        overviewHtml.includes("Condition & Branch Evaluation"),
    ).toBe(true);
    expect(overviewHtml.includes("BRANCH CONDITION")).toBe(true);
    expect(overviewHtml.includes("Evaluated Active")).toBe(true);
    expect(overviewHtml.includes("task.priority === &#x27;CRITICAL&#x27;")).toBe(true);
    expect(overviewHtml.includes("Copy Expression")).toBe(true);

    const drawerHtml = renderToString(<EdgeDetailDrawer edge={edgeWithCondition} />);
    expect(drawerHtml.includes("Condition")).toBe(true);
    expect(drawerHtml.includes("Branch Condition:")).toBe(true);
  });

  test("renders condition branch evaluation in TrafficChronologyTab exchanges", () => {
    const edgeWithConditionExchange: GraphEdgeData = {
      id: "edge-cond-ex-1",
      source: "node-gate",
      target: "node-subagent",
      traffic: {
        volume: 1,
        messagesCount: 1,
        exchanges: [
          // Bridge exchange with custom condition metadata for test inspection
          {
            id: "ex-cond-1",
            step: 1,
            direction: "forward",
            type: "decision",
            summary: "Evaluated branch guard: tests passing",
            condition: "coverage >= 0.95 && testFailures === 0",
            branchOutcome: "BRANCH TAKEN",
            tokens: 1500,
          } as unknown as EdgeTrafficExchange,
        ],
      },
    };

    const chronologyHtml = renderToString(
      <TrafficChronologyTab
        edge={edgeWithConditionExchange}
        sourceName="Gate"
        targetName="Subagent"
      />,
    );

    expect(chronologyHtml.includes("Branch Condition:")).toBe(true);
    expect(chronologyHtml.includes("coverage &gt;= 0.95 &amp;&amp; testFailures === 0")).toBe(true);
    expect(chronologyHtml.includes("BRANCH TAKEN")).toBe(true);
    expect(chronologyHtml.includes("Evaluated branch guard: tests passing")).toBe(true);
  });

  test("renders all 7 distinct semantic kinds in EdgeDetailDrawer with appropriate kind badges and colors", () => {
    const kinds: Array<{ kind: SemanticEdgeKind; label: string; accent: string }> = [
      { kind: "spawn", label: "SPAWN / DISPATCH", accent: "#06b6d4" },
      { kind: "sequence", label: "SEQUENCE", accent: "#3f3f46" },
      { kind: "data", label: "DATA HANDOFF", accent: "#6366f1" },
      { kind: "dependency", label: "DEPENDENCY", accent: "#64748b" },
      { kind: "loop", label: "LOOP / PUSHBACK", accent: "#f43f5e" },
      { kind: "gate", label: "VALIDATION GATE", accent: "#10b981" },
      { kind: "critic", label: "CRITIC SIGNOFF", accent: "#eab308" },
    ];

    for (const item of kinds) {
      const edge: GraphEdgeData = {
        id: `edge-${item.kind}`,
        source: "node-a",
        target: "node-b",
        kind: item.kind,
      };

      const html = renderToString(<EdgeDetailDrawer edge={edge} />);
      expect(html.includes(`kind-${item.kind}`)).toBe(true);
      expect(html.includes(item.label)).toBe(true);
      expect(html.includes(`--edge-kind-accent:${item.accent}`)).toBe(true);
    }
  });

  test("handles interactive node jumping via onNavigateNode callback", async () => {
    const { create, act } = await import("react-test-renderer");
    let navigatedNodeId: string | null = null;

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EdgeOverviewTab
          edge={sampleEdge}
          sourceName="Planner"
          targetName="Worker"
          onNavigateNode={(id) => {
            navigatedNodeId = id;
          }}
        />,
      );
    });

    const root = renderer!.root;
    const buttons = root.findAllByProps({ className: "edge-node-link-btn" });
    expect(buttons.length).toBe(2);

    // Click source node button
    navigatedNodeId = null;
    act(() => {
      buttons[0].props.onClick();
    });
    expect(navigatedNodeId).toBe("node-planner");

    // Click target node button
    navigatedNodeId = null;
    act(() => {
      buttons[1].props.onClick();
    });
    expect(navigatedNodeId).toBe("node-worker");
  });

  test("handles drawer close button click and Escape key trigger", async () => {
    const { create, act } = await import("react-test-renderer");
    let closed = false;

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EdgeDetailDrawer
          edge={sampleEdge}
          onClose={() => {
            closed = true;
          }}
        />,
      );
    });

    const root = renderer!.root;
    const closeBtn = root.findByProps({ className: "edge-drawer-close-btn" });

    // Click close button
    closed = false;
    act(() => {
      closeBtn.props.onClick();
    });
    expect(closed).toBe(true);

    // Press Escape key on drawer container
    const drawerAside = root.findByProps({ className: "edge-drawer" });
    closed = false;
    act(() => {
      drawerAside.props.onKeyDown({
        key: "Escape",
        stopPropagation: () => {},
      });
    });
    expect(closed).toBe(true);
  });

  test("finding-02-edge-badge-stress: gracefully handles unknown edge kinds and defaults to sequence", () => {
    const unknownKindEdge: GraphEdgeData = {
      id: "edge-unknown-1",
      source: "node-1",
      target: "node-2",
      kind: "unknown_custom_pipeline" as unknown as GraphEdgeData["kind"],
      label: "Custom Flow",
    };

    const html = renderToString(<EdgeDetailDrawer edge={unknownKindEdge} />);
    expect(html.includes("Custom Flow")).toBe(true);
    expect(html.includes("kind-sequence")).toBe(true);
    expect(html.includes("SEQUENCE")).toBe(true);
  });

  test("finding-02-edge-badge-stress: handles zero-traffic edges and empty telemetry cleanly", () => {
    const zeroTrafficEdge: GraphEdgeData = {
      id: "edge-zero-traffic",
      source: "node-alpha",
      target: "node-beta",
      traffic: {
        volume: 0,
        messagesCount: 0,
        tokens: 0,
        exchanges: [],
        status: "idle",
      },
    };

    const html = renderToString(<EdgeDetailDrawer edge={zeroTrafficEdge} />);
    expect(html.includes("Called 0 times")).toBe(true);
    expect(html.includes("0 Times")).toBe(true);
    expect(html.includes("IDLE")).toBe(true);
    expect(html.includes("edge-tab-badge")).toBe(false);

    const chronologyHtml = renderToString(
      <TrafficChronologyTab edge={zeroTrafficEdge} sourceName="Alpha" targetName="Beta" />,
    );
    expect(chronologyHtml.includes("No traffic exchanges recorded on this edge.")).toBe(true);
    expect(chronologyHtml.includes("Token Volume")).toBe(true);
  });

  test("finding-02-edge-badge-stress: handles empty/null handoff payloads and malformed exchange entries safely", () => {
    const malformedPayloadEdge: GraphEdgeData = {
      id: "edge-malformed-payload",
      source: "node-x",
      target: "node-y",
      handoff: {
        kind: "file",
        summary: "",
        tokens: 0,
        preview: "",
      },
      traffic: {
        volume: 2,
        exchanges: [
          // Bridge exchange with empty strings and partial finding data
          {
            id: "ex-empty-1",
            step: "",
            summary: "",
            payloadPreview: "",
            tokens: 0,
            auditFinding: {
              id: "finding-empty",
              status: "open",
            },
          } as unknown as EdgeTrafficExchange,
          // Bridge exchange with string finding and string evidence
          {
            id: "ex-empty-2",
            type: "feedback",
            summary: "String-only finding",
            finding: "Generic issue note",
            evidence: "Build log snippet",
          } as unknown as EdgeTrafficExchange,
        ],
      },
    };

    const overviewHtml = renderToString(
      <EdgeOverviewTab edge={malformedPayloadEdge} sourceName="X" targetName="Y" />,
    );
    expect(overviewHtml.includes("Handoff Contract")).toBe(true);
    expect(overviewHtml.includes("Handoff Payload Tokens:")).toBe(true);

    const chronologyHtml = renderToString(
      <TrafficChronologyTab edge={malformedPayloadEdge} sourceName="X" targetName="Y" />,
    );
    expect(chronologyHtml.includes("finding-empty")).toBe(true);
    expect(chronologyHtml.includes("Generic issue note")).toBe(true);
    expect(chronologyHtml.includes("Build log snippet")).toBe(true);
    expect(chronologyHtml.includes("0 tok")).toBe(true);
  });

  test("renders null safely when edge is null or undefined", () => {
    const htmlNull = renderToString(<EdgeDetailDrawer edge={null} />);
    expect(htmlNull).toBe("");

    const htmlUndefined = renderToString(<EdgeDetailDrawer edge={undefined} />);
    expect(htmlUndefined).toBe("");
  });
});
