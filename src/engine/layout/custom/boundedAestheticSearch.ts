import { compareLayoutScores } from "./layoutValidator";
import { computeStateHash } from "./searchState";
import type { StateEvaluationResult } from "./stateEvaluator";
import type { LayoutSearchState, SearchStopReason } from "./types";

export interface BoundedAestheticSearchDependencies {
  evaluateState: (state: LayoutSearchState) => StateEvaluationResult;
  generateTrialStates: (
    state: LayoutSearchState,
    evaluation: StateEvaluationResult,
  ) => LayoutSearchState[];
  generateCompletionStates: (
    state: LayoutSearchState,
    evaluation: StateEvaluationResult,
  ) => LayoutSearchState[];
  interruptionReason?: () => "cancelled" | "deadline-exceeded" | undefined;
}

export interface BoundedAestheticSearchOptions {
  bestState: LayoutSearchState;
  bestEvaluation: StateEvaluationResult;
  maxEvaluations: number;
  budgetStopReason: "aesthetic-state-budget" | "layout-state-budget";
  visitedHashes: Set<string>;
  dependencies: BoundedAestheticSearchDependencies;
}

export interface BoundedAestheticSearchResult {
  bestState: LayoutSearchState;
  bestEvaluation: StateEvaluationResult;
  evaluatedStates: number;
  stopReason: SearchStopReason;
}

export function isPrimaryCleanEvaluation(evaluation: StateEvaluationResult): boolean {
  const { metrics } = evaluation.validation;
  return (
    evaluation.validation.isValid &&
    (metrics.unresolvedRouteCount ?? 0) === 0 &&
    (metrics.unresolvedBadgeCount ?? 0) === 0 &&
    metrics.nodeNodeOverlaps === 0 &&
    metrics.edgeNodePenetrations === 0 &&
    metrics.sharedEdgeSegmentLength === 0 &&
    metrics.badgeNodeOverlaps === 0 &&
    metrics.badgeBadgeOverlaps === 0 &&
    metrics.crossingCount === 0 &&
    (metrics.ordinaryLeaderCount ?? 0) === 0 &&
    metrics.badgeUnrelatedEdgeOverlaps === 0
  );
}

export function hasRemainingAestheticDefect(evaluation: StateEvaluationResult): boolean {
  const { metrics } = evaluation.validation;
  return (metrics.avoidableHairpinCount ?? 0) > 0 || (metrics.excessBendCount ?? 0) > 0;
}

export function isObjectiveTargetEvaluation(evaluation: StateEvaluationResult): boolean {
  return (
    isPrimaryCleanEvaluation(evaluation) &&
    !hasRemainingAestheticDefect(evaluation) &&
    evaluation.validation.diagnostics.length === 0
  );
}

function uniqueStatesInOrder(states: LayoutSearchState[]): LayoutSearchState[] {
  const seen = new Set<string>();
  return states.filter((state) => {
    const hash = computeStateHash(state);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
}

export function runBoundedAestheticSearch({
  bestState: initialBestState,
  bestEvaluation: initialBestEvaluation,
  maxEvaluations,
  budgetStopReason,
  visitedHashes,
  dependencies,
}: BoundedAestheticSearchOptions): BoundedAestheticSearchResult {
  let bestState = initialBestState;
  let bestEvaluation = initialBestEvaluation;
  let evaluatedStates = 0;

  const stop = (stopReason: SearchStopReason): BoundedAestheticSearchResult => ({
    bestState,
    bestEvaluation,
    evaluatedStates,
    stopReason,
  });
  const interrupted = (): BoundedAestheticSearchResult | undefined => {
    const reason = dependencies.interruptionReason?.();
    return reason ? stop(reason) : undefined;
  };

  const evaluateCandidate = (
    candidate: LayoutSearchState,
  ):
    | { kind: "duplicate" }
    | { kind: "interrupted"; reason: "cancelled" | "deadline-exceeded" }
    | { kind: "budget" }
    | { kind: "evaluated"; evaluation: StateEvaluationResult } => {
    const interruption = dependencies.interruptionReason?.();
    if (interruption) return { kind: "interrupted", reason: interruption };
    const hash = computeStateHash(candidate);
    if (visitedHashes.has(hash)) return { kind: "duplicate" };
    if (evaluatedStates >= maxEvaluations) return { kind: "budget" };

    visitedHashes.add(hash);
    candidate.visitedSignatures.add(hash);
    const evaluation = dependencies.evaluateState(candidate);
    evaluatedStates++;
    return { kind: "evaluated", evaluation };
  };

  improvementRounds: for (let improvementRound = 0; improvementRound < 2; improvementRound++) {
    const beforePortfolio = interrupted();
    if (beforePortfolio) return beforePortfolio;
    const generatedTrials = dependencies.generateTrialStates(bestState, bestEvaluation);
    const afterTrialGeneration = interrupted();
    if (afterTrialGeneration) return afterTrialGeneration;
    const trials = uniqueStatesInOrder(generatedTrials);

    for (const trial of trials) {
      const beforeTrial = interrupted();
      if (beforeTrial) return beforeTrial;
      const trialResult = evaluateCandidate(trial);
      if (trialResult.kind === "interrupted") return stop(trialResult.reason);
      if (trialResult.kind === "budget") return interrupted() ?? stop(budgetStopReason);
      if (trialResult.kind === "duplicate") continue;

      const afterTrialEvaluation = interrupted();
      if (afterTrialEvaluation) return afterTrialEvaluation;

      const trialEvaluation = trialResult.evaluation;
      if (
        isPrimaryCleanEvaluation(trialEvaluation) &&
        compareLayoutScores(trialEvaluation.validation, bestEvaluation.validation) < 0
      ) {
        bestState = trial;
        bestEvaluation = trialEvaluation;
        if (isObjectiveTargetEvaluation(bestEvaluation)) return stop("objective-target");
        continue improvementRounds;
      }

      if (trialEvaluation.validation.metrics.crossingCount <= 0) continue;
      const beforeCompletionGeneration = interrupted();
      if (beforeCompletionGeneration) return beforeCompletionGeneration;
      const generatedCompletions = dependencies.generateCompletionStates(trial, trialEvaluation);
      const afterCompletionGeneration = interrupted();
      if (afterCompletionGeneration) return afterCompletionGeneration;
      const completions = uniqueStatesInOrder(generatedCompletions).slice(0, 2);
      for (const completion of completions) {
        const beforeCompletion = interrupted();
        if (beforeCompletion) return beforeCompletion;
        const completionResult = evaluateCandidate(completion);
        if (completionResult.kind === "interrupted") return stop(completionResult.reason);
        if (completionResult.kind === "budget") return interrupted() ?? stop(budgetStopReason);
        if (completionResult.kind === "duplicate") continue;

        const afterCompletionEvaluation = interrupted();
        if (afterCompletionEvaluation) return afterCompletionEvaluation;

        const completionEvaluation = completionResult.evaluation;
        if (
          isPrimaryCleanEvaluation(completionEvaluation) &&
          compareLayoutScores(completionEvaluation.validation, bestEvaluation.validation) < 0
        ) {
          bestState = completion;
          bestEvaluation = completionEvaluation;
          if (isObjectiveTargetEvaluation(bestEvaluation)) return stop("objective-target");
          continue improvementRounds;
        }
      }
    }

    const afterPortfolio = interrupted();
    return afterPortfolio ?? stop("bounded-local-optimum");
  }

  return interrupted() ?? stop("bounded-local-optimum");
}
