import { describe, expect, test } from "bun:test";
import { resolveNodeRole, ROLE_GROUP_LABELS, roleGroupOf } from "./graphSchema";

/**
 * NOTE (integrator): this file documents a real, currently-unfixed compatibility gap between the
 * `orchestrating-long-tasks` skill's plan-validator rail and gvui's role vocabulary. It is a
 * source-code fix (`ROLE_SPELLINGS` and `NODE_ROLES`/`KnownNodeRole` in `graphSchema.ts` /
 * `types/graphData.ts`), which is outside this test file's ownership, so the test below is written
 * against the desired contract and is expected to fail until that fix lands.
 *
 * The skill's plan-validator rail (`graph-generator-plan-validator-nodes.ts`) emits a node shaped
 * exactly like the one below: `kind: "agent"`, `metadata.role: "plan-validator"`, no `telemetry`
 * block. `resolveNodeRole` (this module) walks: `telemetry.role` (absent) → `ROLE_SPELLINGS[metadata
 * .role]` (no "plan-validator" entry, so this returns undefined) → `KIND_IMPLIED_ROLE[kind]`
 * ("agent" implies "implementer", `declared: false`). The node's role is reported as an *implied*
 * implementer rather than the plan-validator role the run actually recorded, and every consumer of
 * `resolveNodeRole` + `roleGroupOf` — the Sidebar role breakdown, the token-footprint-by-role
 * breakdown, and the role-group canvas filter — buckets the run's plan validation work into the
 * implementer bucket alongside the actual implementers.
 *
 * This is a distinct, narrower gap from the node-card rendering path
 * (`primitives/nodes/NodeCard/nodeKinds.tsx`'s own `resolveNodeRole`/`describeNodeArchetype`), which
 * reads `metadata.role` through the open `readVocabularyMember` accessor and already renders this
 * node correctly labelled "PLAN VALIDATOR" with a generated accent — that path is not broken. Only
 * the closed-vocabulary role-grouping analytics in this module are.
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
