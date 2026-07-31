import { describe, expect, it } from "bun:test";
import {
  runBoundedAestheticSearch,
  type BoundedAestheticSearchDependencies,
} from "./boundedAestheticSearch";
import { resolveLayoutStatus } from "./optimizeLayout";
import { computeStateHash, createInitialSearchState } from "./searchState";
import type { StateEvaluationResult } from "./stateEvaluator";
import type { LayoutSearchState, LayoutValidationResult } from "./types";

function makeState(key: string): LayoutSearchState {
  const state = createInitialSearchState();
  state.portOrders[key] = [key];
  return state;
}

function makeValidation(
  overrides: Partial<LayoutValidationResult["metrics"]> = {},
  isValid = true,
): LayoutValidationResult {
  return {
    isValid,
    diagnostics: isValid
      ? []
      : [{ code: "INCOMPLETE", severity: "error", message: "Incomplete candidate", ids: [] }],
    crossings:
      (overrides.crossingCount ?? 0) > 0
        ? [{ edgeIdA: "defect", edgeIdB: "partner", point: { x: 1, y: 1 } }]
        : [],
    metrics: {
      unresolvedRouteCount: 0,
      unresolvedBadgeCount: 0,
      nodeNodeOverlaps: 0,
      edgeNodePenetrations: 0,
      sharedEdgeSegmentLength: 0,
      badgeNodeOverlaps: 0,
      badgeBadgeOverlaps: 0,
      badgeUnrelatedEdgeOverlaps: 0,
      crossingCount: 0,
      bendCount: 4,
      totalLength: 100,
      directionDeviationPenalty: 0,
      portSideReusePenalty: 0,
      totalArea: 100,
      ordinaryLeaderCount: 0,
      feedbackLeaderCount: 0,
      totalLeaderLength: 0,
      hairpinCount: 1,
      portSideImbalance: 0,
      avoidableHairpinCount: 1,
      excessBendCount: 0,
      ...overrides,
    },
  };
}

function makeEvaluation(validation: LayoutValidationResult): StateEvaluationResult {
  return { validation } as StateEvaluationResult;
}

function dependencies(
  evaluations: Map<string, StateEvaluationResult>,
  trials: LayoutSearchState[],
  completions: LayoutSearchState[],
): BoundedAestheticSearchDependencies {
  return {
    evaluateState: (state) => {
      const evaluation = evaluations.get(computeStateHash(state));
      if (!evaluation) throw new Error(`Missing evaluation for ${computeStateHash(state)}`);
      return evaluation;
    },
    generateTrialStates: () => trials,
    generateCompletionStates: () => completions,
  };
}

describe("bounded aesthetic search", () => {
  it("selects a coordinated child after its hairpin-reducing parent temporarily crosses", () => {
    const clean = makeState("clean");
    const trial = makeState("trial");
    const completion = makeState("completion");
    const evaluations = new Map([
      [
        computeStateHash(trial),
        makeEvaluation(makeValidation({ crossingCount: 1, avoidableHairpinCount: 0 })),
      ],
      [
        computeStateHash(completion),
        makeEvaluation(
          makeValidation({ avoidableHairpinCount: 0, excessBendCount: 0, hairpinCount: 0 }),
        ),
      ],
    ]);

    const result = runBoundedAestheticSearch({
      bestState: clean,
      bestEvaluation: makeEvaluation(makeValidation()),
      maxEvaluations: 3,
      visitedHashes: new Set([computeStateHash(clean)]),
      dependencies: dependencies(evaluations, [trial], [completion]),
    });

    expect(computeStateHash(result.bestState)).toBe(computeStateHash(completion));
    expect(result.evaluatedStates).toBe(2);
    expect(result.stopReason).toBe("objective-target");
  });

  it("rejects incomplete completions and truthfully reports an exhausted bounded portfolio", () => {
    const clean = makeState("clean");
    const trial = makeState("trial");
    const missingRoute = makeState("missing-route");
    const missingBadge = makeState("missing-badge");
    const cleanEvaluation = makeEvaluation(makeValidation());
    const evaluations = new Map([
      [computeStateHash(trial), makeEvaluation(makeValidation({ crossingCount: 1 }))],
      [
        computeStateHash(missingRoute),
        makeEvaluation(makeValidation({ unresolvedRouteCount: 1 }, false)),
      ],
      [
        computeStateHash(missingBadge),
        makeEvaluation(makeValidation({ unresolvedBadgeCount: 1 }, false)),
      ],
    ]);

    const result = runBoundedAestheticSearch({
      bestState: clean,
      bestEvaluation: cleanEvaluation,
      maxEvaluations: 3,
      visitedHashes: new Set([computeStateHash(clean)]),
      dependencies: dependencies(evaluations, [trial], [missingRoute, missingBadge]),
    });

    expect(result.bestState).toBe(clean);
    expect(result.evaluatedStates).toBe(3);
    expect(result.stopReason).toBe("bounded-local-optimum");
    expect(resolveLayoutStatus(result.bestEvaluation.validation)).toBe("unresolved_soft_conflicts");
  });

  it("reports the layout budget when the evaluation cap interrupts the portfolio", () => {
    const clean = makeState("clean");
    const trialA = makeState("trial-a");
    const trialB = makeState("trial-b");
    const evaluations = new Map([
      [computeStateHash(trialA), makeEvaluation(makeValidation({ crossingCount: 1 }))],
      [computeStateHash(trialB), makeEvaluation(makeValidation({ crossingCount: 1 }))],
    ]);

    const result = runBoundedAestheticSearch({
      bestState: clean,
      bestEvaluation: makeEvaluation(makeValidation()),
      maxEvaluations: 1,
      visitedHashes: new Set([computeStateHash(clean)]),
      dependencies: dependencies(evaluations, [trialA, trialB], []),
    });

    expect(result.bestState).toBe(clean);
    expect(result.evaluatedStates).toBe(1);
    expect(result.stopReason).toBe("layout-state-budget");
  });

  it("is deterministic when trial and completion inputs are reversed", () => {
    const clean = makeState("clean");
    const trialA = makeState("trial-a");
    const trialB = makeState("trial-b");
    const completionA = makeState("completion-a");
    const completionB = makeState("completion-b");
    const cleanEvaluation = makeEvaluation(makeValidation({ avoidableHairpinCount: 2 }));
    const evaluations = new Map([
      [computeStateHash(trialA), makeEvaluation(makeValidation({ crossingCount: 1 }))],
      [computeStateHash(trialB), makeEvaluation(makeValidation({ crossingCount: 1 }))],
      [
        computeStateHash(completionA),
        makeEvaluation(makeValidation({ avoidableHairpinCount: 1, hairpinCount: 1 })),
      ],
      [
        computeStateHash(completionB),
        makeEvaluation(makeValidation({ avoidableHairpinCount: 2, totalLength: 110 })),
      ],
    ]);
    const run = (reverse: boolean) =>
      runBoundedAestheticSearch({
        bestState: clean,
        bestEvaluation: cleanEvaluation,
        maxEvaluations: 4,
        visitedHashes: new Set([computeStateHash(clean)]),
        dependencies: {
          ...dependencies(
            evaluations,
            reverse ? [trialB, trialA] : [trialA, trialB],
            reverse ? [completionB, completionA] : [completionA, completionB],
          ),
          generateTrialStates: (state) =>
            state === clean ? (reverse ? [trialB, trialA] : [trialA, trialB]) : [],
        },
      });

    const forward = run(false);
    const reversed = run(true);
    expect(computeStateHash(reversed.bestState)).toBe(computeStateHash(forward.bestState));
    expect(reversed.bestEvaluation.validation.metrics).toEqual(
      forward.bestEvaluation.validation.metrics,
    );
    expect(reversed.stopReason).toBe(forward.stopReason);
  });
});
