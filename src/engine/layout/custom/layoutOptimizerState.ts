import type { CustomLayoutConfig } from "./config";
import {
  hasRemainingAestheticDefect,
  isObjectiveTargetEvaluation,
  isPrimaryCleanEvaluation,
  runBoundedAestheticSearch,
} from "./boundedAestheticSearch";
import { compareLayoutScores } from "./layoutValidator";
import {
  generateAestheticTrialStates,
  generateCrossingCompletionStates,
  generateNeighborhoodStates,
} from "./neighborhoodSearch";
import { computeStateHash, createInitialSearchState } from "./searchState";
import { evaluateSearchState, type StateEvaluationResult } from "./stateEvaluator";
import type {
  LayoutSearchState,
  NormalizedEdge,
  NormalizedNode,
  OptimizationStats,
  SearchStopReason,
} from "./types";

export interface OptimizationResult {
  bestState: LayoutSearchState;
  bestEvaluation: StateEvaluationResult;
  stats: OptimizationStats;
}

export interface SearchOptions {
  initialState?: LayoutSearchState;
  signal?: AbortSignal;
  deadlineMs?: number;
}

export function searchBestLayoutState(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  config: CustomLayoutConfig,
  options?: SearchOptions | LayoutSearchState,
): OptimizationResult {
  const startTime = Date.now();
  const searchOpts: SearchOptions =
    options && "sideAssignments" in options
      ? { initialState: options }
      : ((options as SearchOptions) ?? {});

  const deadlineTime = searchOpts.deadlineMs ? startTime + searchOpts.deadlineMs : undefined;
  const signal = searchOpts.signal;

  const startState = searchOpts.initialState ?? createInitialSearchState();
  const startEval = evaluateSearchState(nodes, edges, startState, config);

  let bestState = startState;
  let bestEval = startEval;

  interface FrontierNode {
    state: LayoutSearchState;
    evalResult: StateEvaluationResult;
  }

  const frontier: FrontierNode[] = [{ state: startState, evalResult: startEval }];
  const visitedHashes = new Set<string>();

  const startHash = computeStateHash(startState);
  visitedHashes.add(startHash);
  startState.visitedSignatures.add(startHash);

  let evaluatedStates = 1;
  let stopReason: SearchStopReason = "frontier-exhausted";

  const maxStates = config.maxLayoutStates;
  const maxFrontier = config.maxFrontierSize;

  while (frontier.length > 0) {
    if (signal?.aborted) {
      stopReason = "cancelled";
      break;
    }

    if (deadlineTime && Date.now() >= deadlineTime) {
      stopReason = "deadline-exceeded";
      break;
    }

    if (evaluatedStates >= maxStates) {
      stopReason = "layout-state-budget";
      break;
    }

    if (isObjectiveTargetEvaluation(bestEval)) {
      stopReason = "objective-target";
      break;
    }

    if (isPrimaryCleanEvaluation(bestEval) && hasRemainingAestheticDefect(bestEval)) {
      const remainingGlobalStates = maxStates - evaluatedStates;
      const maxEvaluations = Math.min(config.maxAestheticPasses, remainingGlobalStates);
      const budgetStopReason =
        remainingGlobalStates <= config.maxAestheticPasses
          ? "layout-state-budget"
          : "aesthetic-state-budget";
      const aestheticResult = runBoundedAestheticSearch({
        bestState,
        bestEvaluation: bestEval,
        maxEvaluations,
        budgetStopReason,
        visitedHashes,
        dependencies: {
          evaluateState: (candidate) => evaluateSearchState(nodes, edges, candidate, config),
          generateTrialStates: (candidate, evaluation) =>
            generateAestheticTrialStates(candidate, evaluation, config),
          generateCompletionStates: (candidate, evaluation) =>
            generateCrossingCompletionStates(candidate, evaluation, config, 2),
          interruptionReason: () => {
            if (signal?.aborted) return "cancelled";
            if (deadlineTime && Date.now() >= deadlineTime) return "deadline-exceeded";
            return undefined;
          },
        },
      });
      evaluatedStates += aestheticResult.evaluatedStates;
      bestState = aestheticResult.bestState;
      bestEval = aestheticResult.bestEvaluation;
      stopReason = aestheticResult.stopReason;
      break;
    }

    // Sort frontier ascending by score (best score at index 0)
    frontier.sort((a, b) => compareLayoutScores(a.evalResult.validation, b.evalResult.validation));

    // Pop best node from frontier
    const curr = frontier.shift()!;

    // Check if curr is better than global best
    if (compareLayoutScores(curr.evalResult.validation, bestEval.validation) < 0) {
      bestState = curr.state;
      bestEval = curr.evalResult;
    }

    if (isPrimaryCleanEvaluation(bestEval) && hasRemainingAestheticDefect(bestEval)) {
      continue;
    }

    // Generate neighbors
    const neighborStates = generateNeighborhoodStates(curr.state, curr.evalResult, config);

    for (const nextState of neighborStates) {
      if (signal?.aborted) {
        stopReason = "cancelled";
        break;
      }
      if (deadlineTime && Date.now() >= deadlineTime) {
        stopReason = "deadline-exceeded";
        break;
      }
      if (evaluatedStates >= maxStates) {
        stopReason = "layout-state-budget";
        break;
      }

      const hash = computeStateHash(nextState);
      if (visitedHashes.has(hash)) {
        continue;
      }

      visitedHashes.add(hash);
      nextState.visitedSignatures.add(hash);

      const nextEval = evaluateSearchState(nodes, edges, nextState, config);
      evaluatedStates++;

      if (compareLayoutScores(nextEval.validation, bestEval.validation) < 0) {
        bestState = nextState;
        bestEval = nextEval;
      }

      frontier.push({ state: nextState, evalResult: nextEval });

      if (isObjectiveTargetEvaluation(bestEval)) {
        stopReason = "objective-target";
        break;
      }

      if (isPrimaryCleanEvaluation(bestEval) && hasRemainingAestheticDefect(bestEval)) {
        break;
      }

      if (frontier.length > maxFrontier) {
        frontier.sort((a, b) =>
          compareLayoutScores(a.evalResult.validation, b.evalResult.validation),
        );
        frontier.length = maxFrontier;
      }
    }
  }

  const stats: OptimizationStats = {
    globalPasses: 1,
    evaluatedPortStates: evaluatedStates,
    spacingExpansions: 0,
    repeatedStateStop: false,
    totalPasses: 1,
    totalEvaluatedStates: evaluatedStates,
    visitedStateHashes: visitedHashes.size,
    stopReason,
  };

  return {
    bestState,
    bestEvaluation: bestEval,
    stats,
  };
}
