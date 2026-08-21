import { describe, expect, test } from "bun:test";
import { resolveNodeRole, ROLE_GROUP_LABELS, roleGroupOf } from "./graphSchema";

/**
 * The `orchestrating-long-tasks` skill's plan-validator rail (`graph-generator-plan-validator-
 * nodes.ts`) emits a node shaped exactly like the one below: `kind: "agent"`, `metadata.role:
 * "plan-validator"`, no `telemetry` block. `resolveNodeRole` (this module) reads it through
 * `ROLE_SPELLINGS["plan-validator"]`, which is declared rather than implied from the node's kind, so
 * every consumer of `resolveNodeRole` + `roleGroupOf` — the Sidebar role breakdown, the
 * token-footprint-by-role breakdown, and the role-group canvas filter — buckets the run's plan
 * validation work under the Validators group, distinct from the implementer bucket.
 */

const PLAN_VALIDATOR_NODE = {
  id: "node-plan-validator-r1",
  name: "Plan Validator: agent-x",
  kind: "agent",
  status: "success",
  metadata: {
    role: "plan-validator",
    agentId: "agent-x",
    validatorId: "agent-x",
    graphRevision: 1,
  },
};

describe("the plan-validator role the skill emits", () => {
  test("resolveNodeRole reports the recorded plan-validator role as declared", () => {
    const resolved = resolveNodeRole(PLAN_VALIDATOR_NODE);
    expect(resolved).toBeDefined();
    expect(resolved?.declared).toBe(true);
    expect(resolved?.role).toBe("plan-validator");
  });

  test("roleGroupOf buckets a plan-validator under the validator group", () => {
    const resolved = resolveNodeRole(PLAN_VALIDATOR_NODE);
    expect(resolved).toBeDefined();
    if (resolved === undefined) return;
    const group = roleGroupOf(resolved.role);
    expect(group).toBe("validator");
    expect(ROLE_GROUP_LABELS[group]).toBe("Validators");
  });
});
