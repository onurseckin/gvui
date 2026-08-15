import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import type { GraphEdgeData } from "../../types/graphData";
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

  test("renders null safely when edge is null or undefined", () => {
    const htmlNull = renderToString(<EdgeDetailDrawer edge={null} />);
    expect(htmlNull).toBe("");

    const htmlUndefined = renderToString(<EdgeDetailDrawer edge={undefined} />);
    expect(htmlUndefined).toBe("");
  });
});
