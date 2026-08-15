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
});
