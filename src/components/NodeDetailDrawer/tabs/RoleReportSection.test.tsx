import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import type { GraphNodeData } from "../../../types/graphData";
import { RoleReportSection } from "./RoleReportSection";

describe("RoleReportSection: plan-validator", () => {
  const node: GraphNodeData = {
    id: "node-plan-validator-r2",
    name: "Plan Validator: agent-x",
    kind: "agent",
    metadata: {
      role: "plan-validator",
      graphRevision: 2,
      verdict: "approved",
      decompositionAnswer: "Task count matches the prompt's ten entities.",
      dependencyAnswer: "Every edge is a real read/write relationship.",
      gateAnswer: "Each gate can fail on its own task alone.",
      stragglerAnswer: "No task dwarfs its wave.",
      planFindings: [],
    },
  };

  test("renders the graph revision, verdict and all four answers", () => {
    const html = renderToString(<RoleReportSection node={node} />);
    expect(html).toContain("Plan Validation");
    expect(html).toContain("2");
    expect(html).toContain("approved");
    expect(html).toContain("Task count matches the prompt&#x27;s ten entities.");
    expect(html).toContain("Every edge is a real read/write relationship.");
    expect(html).toContain("Each gate can fail on its own task alone.");
    expect(html).toContain("No task dwarfs its wave.");
  });

  test("marks an unanswered question as unknown rather than a blank line", () => {
    const partial: GraphNodeData = {
      ...node,
      metadata: { role: "plan-validator", verdict: "changes_requested", decompositionAnswer: "ok" },
    };
    const html = renderToString(<RoleReportSection node={partial} />);
    expect(html).toContain("unknown");
  });

  test("renders plan findings in their own section, not the task-finding card", () => {
    const withFindings: GraphNodeData = {
      ...node,
      metadata: {
        ...node.metadata,
        verdict: "changes_requested",
        planFindings: [
          {
            id: "PF-1",
            invariant: "dependencies",
            severity: "critical",
            observation: "Task 4 depends on task 9 for no real reason.",
            remediation: "Remove the false dependency edge.",
          },
        ],
      },
    };
    const html = renderToString(<RoleReportSection node={withFindings} />);
    expect(html).toContain("Plan Findings");
    expect(html).toContain("PF-1");
    expect(html).toContain("Task 4 depends on task 9 for no real reason.");
    expect(html).toContain("Remove the false dependency edge.");
  });

  test("a round still awaiting review renders nothing", () => {
    const pending: GraphNodeData = {
      id: "node-plan-validator-r3",
      name: "Plan Validator: agent-z",
      kind: "agent",
      metadata: { role: "plan-validator", graphRevision: 3 },
    };
    expect(renderToString(<RoleReportSection node={pending} />)).toBe("");
  });
});

describe("RoleReportSection: domain validators", () => {
  test("a UI-design validator surfaces its screenshot and browser-run counts", () => {
    const node: GraphNodeData = {
      id: "node-validator-t01",
      name: "Validator: ui-agent",
      kind: "agent",
      telemetry: { role: "validator-ui-design" },
      assets: [
        { id: "shot-1", type: "image", url: "/e/1.png" },
        { id: "shot-2", type: "image", url: "/e/2.png" },
      ],
      browserTests: [{ commandId: "cmd-1", browser: "chromium", status: "passed" }],
      metadata: { role: "validator" },
    };
    const html = renderToString(<RoleReportSection node={node} />);
    expect(html).toContain("UI Design Validation");
    expect(html).toContain("Screenshots recorded");
    expect(html).toContain("2");
    expect(html).toContain("Browser runs recorded");
  });

  test("a code-quality validator surfaces its gate commands and failure count", () => {
    const node: GraphNodeData = {
      id: "node-validator-t02",
      name: "Validator: cq-agent",
      kind: "agent",
      telemetry: { role: "validator-code-quality" },
      scripts: [
        { commandId: "cmd-1", argv: ["bun", "run", "typecheck"], exitCode: 0, startedAt: "t" },
        { commandId: "cmd-2", argv: ["bun", "run", "lint"], exitCode: 1, startedAt: "t" },
      ],
      metadata: { role: "validator" },
    };
    const html = renderToString(<RoleReportSection node={node} />);
    expect(html).toContain("Code Quality Validation");
    expect(html).toContain("Gate commands recorded");
    expect(html).toContain("2 (1 failing)");
  });

  test("a security validator surfaces the critical-finding floor by severity", () => {
    const node: GraphNodeData = {
      id: "node-validator-t03",
      name: "Validator: sec-agent",
      kind: "agent",
      telemetry: { role: "validator-security" },
      metadata: {
        role: "validator",
        findings: [
          { id: "F-1", severity: "critical", observation: "o", status: "open" },
          { id: "F-2", severity: "suggestion", observation: "o", status: "open" },
        ],
      },
    };
    const html = renderToString(<RoleReportSection node={node} />);
    expect(html).toContain("Security Validation");
    expect(html).toContain("1 critical of 2 total");
  });

  test("an unrecognized domain still renders under its own name", () => {
    const node: GraphNodeData = {
      id: "node-validator-t04",
      name: "Validator: gov-agent",
      kind: "agent",
      telemetry: { role: "validator-data-governance" },
      metadata: { role: "validator" },
    };
    const html = renderToString(<RoleReportSection node={node} />);
    expect(html).toContain("Data Governance Validation");
  });

  test("a generic validator with no domain renders no domain section", () => {
    const node: GraphNodeData = {
      id: "node-validator-t05",
      name: "Validator: generic-agent",
      kind: "agent",
      telemetry: { role: "validator" },
      metadata: { role: "validator" },
    };
    expect(renderToString(<RoleReportSection node={node} />)).toBe("");
  });

  test("evidence a domain never asks for reads as unknown, not zero", () => {
    const node: GraphNodeData = {
      id: "node-validator-t06",
      name: "Validator: ui-agent-bare",
      kind: "agent",
      telemetry: { role: "validator-ui-design" },
      metadata: { role: "validator" },
    };
    const html = renderToString(<RoleReportSection node={node} />);
    expect(html).toContain("unknown");
  });
});
