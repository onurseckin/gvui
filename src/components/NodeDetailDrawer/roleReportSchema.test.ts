import { describe, expect, test } from "bun:test";
import type { GraphNodeData } from "../../types/graphData";
import {
  describeValidatorDomain,
  readPlanValidatorReview,
  readValidatorDomain,
} from "./roleReportSchema";

function planValidatorNode(metadata: Record<string, unknown>): GraphNodeData {
  return {
    id: "node-plan-validator-r1",
    name: "Plan Validator: agent-x",
    kind: "agent",
    metadata: { role: "plan-validator", ...metadata },
  };
}

function domainValidatorNode(
  metadata: Record<string, unknown>,
  telemetryRole?: string,
): GraphNodeData {
  return {
    id: "node-validator-t01",
    name: "Validator: agent-y",
    kind: "agent",
    ...(telemetryRole ? { telemetry: { role: telemetryRole } } : {}),
    metadata: { role: "validator", ...metadata },
  };
}

describe("readValidatorDomain", () => {
  test("reads the domain off a domain-qualified role, the producer's own naming", () => {
    const node = domainValidatorNode({}, "validator-security");
    expect(readValidatorDomain(node)).toBe("security");
  });

  test("reads the domain off a domain-qualified metadata.role when telemetry carries none", () => {
    const node: GraphNodeData = {
      id: "n",
      name: "n",
      metadata: { role: "validator-ui-design" },
    };
    expect(readValidatorDomain(node)).toBe("ui-design");
  });

  test("falls back to a metadata.validatorDomain field beside a plain validator role", () => {
    const node = domainValidatorNode({ validatorDomain: "product" });
    expect(readValidatorDomain(node)).toBe("product");
  });

  test("returns undefined for a role this producer never scoped a domain to", () => {
    expect(readValidatorDomain(domainValidatorNode({}))).toBeUndefined();
    expect(readValidatorDomain(planValidatorNode({}))).toBeUndefined();
    expect(
      readValidatorDomain({ id: "n", name: "n", metadata: { role: "implementer" } }),
    ).toBeUndefined();
  });

  test("never reads a stray metadata.domain key off a node that never declared a validator role", () => {
    const node: GraphNodeData = {
      id: "n",
      name: "n",
      metadata: { domain: "billing" },
    };
    expect(readValidatorDomain(node)).toBeUndefined();
  });
});

describe("describeValidatorDomain", () => {
  test("gives each of the five known domains its own title and tagline", () => {
    const security = describeValidatorDomain("security");
    const uiDesign = describeValidatorDomain("ui-design");
    expect(security?.title).toBe("Security");
    expect(uiDesign?.title).toBe("UI Design");
    expect(security?.tagline).not.toBe(uiDesign?.tagline);
  });

  test("renders an unrecognized domain as itself instead of dropping it", () => {
    const profile = describeValidatorDomain("data-governance");
    expect(profile?.title).toBe("Data Governance");
  });

  test("returns undefined for an absent domain", () => {
    expect(describeValidatorDomain(undefined)).toBeUndefined();
  });
});

describe("readPlanValidatorReview", () => {
  test("reads all four answers, the verdict, the graph revision and the plan findings", () => {
    const node = planValidatorNode({
      graphRevision: 3,
      verdict: "changes_requested",
      decompositionAnswer: "Ten entities compressed into two tasks.",
      dependencyAnswer: "Every edge has a real read/write relationship.",
      gateAnswer: "Each gate can fail independently.",
      stragglerAnswer: "No task dwarfs its wave.",
      planFindings: [
        {
          id: "PF-1",
          invariant: "decomposition",
          severity: "critical",
          observation: "Ten distinct entities landed on one task.",
          remediation: "Split the task per entity.",
        },
      ],
    });

    const review = readPlanValidatorReview(node);
    expect(review?.graphRevision).toBe(3);
    expect(review?.verdict).toBe("changes_requested");
    expect(review?.answers).toHaveLength(4);
    expect(review?.answers[0]).toEqual({
      label: "Decomposition",
      text: "Ten entities compressed into two tasks.",
    });
    expect(review?.findings).toEqual([
      {
        id: "PF-1",
        invariant: "decomposition",
        severity: "critical",
        observation: "Ten distinct entities landed on one task.",
        remediation: "Split the task per entity.",
      },
    ]);
  });

  test("marks an unanswered question as absent rather than an empty string", () => {
    const node = planValidatorNode({
      verdict: "approved",
      decompositionAnswer: "Matches the prompt.",
    });
    const review = readPlanValidatorReview(node);
    expect(review?.answers.find((a) => a.label === "Dependencies")?.text).toBeUndefined();
  });

  test("a round still awaiting review renders nothing rather than four false blanks", () => {
    const node = planValidatorNode({ graphRevision: 2 });
    expect(readPlanValidatorReview(node)).toBeUndefined();
  });

  test("returns undefined for every role other than plan-validator", () => {
    expect(readPlanValidatorReview(domainValidatorNode({ verdict: "pass" }))).toBeUndefined();
  });

  test("a finding missing its id is dropped rather than rendered without one", () => {
    const node = planValidatorNode({
      verdict: "changes_requested",
      planFindings: [{ severity: "critical", observation: "no id here" }],
    });
    expect(readPlanValidatorReview(node)?.findings).toEqual([]);
  });
});
