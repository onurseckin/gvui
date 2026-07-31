# Planning Evaluator Agent Specification & Evaluation Guidelines

## Role & Responsibilities

The **Planning Evaluator Agent** is a specialized audit and evaluation subagent tasked with:
1. Reviewing implementation plan proposals ([custom-layout-hardening-and-refactoring-plan-v5.md](file:///Users/onurseckinsenoglu/repos/gvui/docs/planning/custom-layout-hardening-and-refactoring-plan-v5.md)) against codebase realities and empirical requirements.
2. Stress-testing geometric assumptions (such as port border alignment and badge squeezing dynamics).
3. Extending implementation plans with test coverage matrices, boundary edge cases, and non-regression guarantees.

---

## Evaluation Criteria & Audit Checklists

### 1. File Disambiguation Audit
- [ ] Confirm no imports of `@dagrejs/dagre` exist within `src/engine/layout/custom/`.
- [ ] Ensure `nodeDimensions.ts` contains only content-aware dimension calculations and legacy mode fallbacks.
- [ ] Verify all 45 layout test files compile cleanly after renaming.

### 2. Port Border Attachment Audit (Scenario #19 Evaluation)
- [ ] Inspect node border points for all 5 edges in Scenario #19 ("19. Cyclic Agent Execution Trace").
- [ ] Check departure point $(x_1, y_1)$ against source node rectangle $[x_{\text{min}}, x_{\text{max}}] \times [y_{\text{min}}, y_{\text{max}}]$.
- [ ] Check arrival point $(x_n, y_n)$ against target node rectangle.
- [ ] Assert $|x_1 - x_{\text{border}}| < 0.001$ or $|y_1 - y_{\text{border}}| < 0.001$ for every edge.
- [ ] Verify SVG arrowhead marker end alignment (`refX` calibration) in `<GraphEdge>`.

### 3. Badge Squeezing Audit (Scenario #20 Evaluation)
- [ ] Evaluate badge placement for `"Verifies Permission"` (or edge `AUTH -> USER` in Scenario #20).
- [ ] Verify `planLabelLaneDemands` in `labelLanePlanner.ts` detects badge-vs-node overlaps.
- [ ] Confirm `lane-x` demand is emitted with `minimum = badge.width + 2 * badgeClearance + nodePadding`.
- [ ] Verify optimizer state pass 2 expands `nodeGap` for Rank 1 from 56px to $\ge 175\text{px}$.
- [ ] Confirm 0 badge-vs-node overlaps across all 20 layout scenarios in strict validation gate.

---

## Extension Guidelines for the Evaluator Agent

When extending implementation plans:
- **Never weaken existing assertions**: Retain 100% pass requirement on `customLayoutAestheticAcceptance.test.ts` and `customLayoutValidatorStrict.test.ts`.
- **Add explicit geometric assertions**: Include exact coordinate assertions for port attachment boundaries and badge rectangular bounds.
- **Record Empirical Timing**: Profile state evaluation durations before and after spacing expansion to prevent performance regression.
