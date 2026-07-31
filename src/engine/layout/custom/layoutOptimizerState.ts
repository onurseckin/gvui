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

export interface SearchStateBudgets {
  maxLayoutStates: number;
  maxAestheticEvaluations: number;
  maxAStarStatesPerRoute: number;
  maxConflictPermutations: number;
}

/**
 * Bound the conflict-permutation branch for graph shapes whose routing cost
 * grows fastest. A state evaluation reruns every route-order variant and
 * conflict repair, so a broad local permutation sweep can monopolize the UI
 * thread without changing the selected route set.
 *
 * The limits are deliberately derived from graph structure rather than from
 * a caller-specific timeout.  Caller-supplied limits are always retained
 * when they are already stricter.
 */
export function deriveSearchStateBudgets(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  config: CustomLayoutConfig,
): SearchStateBudgets {
  const parallelCounts = new Map<string, number>();
  for (const edge of edges) {
    const key = `${edge.source}\u0000${edge.target}`;
    parallelCounts.set(key, (parallelCounts.get(key) ?? 0) + 1);
  }
  const maxParallelEdges = Math.max(0, ...parallelCounts.values());
  const isParallelRich = maxParallelEdges >= 3 && edges.length >= nodes.length * 2;
  const feedbackEdgeCount = edges.filter(
    (edge) => edge.isCycle || edge.layoutRole === "feedback",
  ).length;
  const isFeedbackRich = feedbackEdgeCount >= 3 && edges.length >= nodes.length + 2;
  const requiresConflictPruning = isParallelRich || isFeedbackRich;

  return {
    maxLayoutStates: config.maxLayoutStates,
    maxAestheticEvaluations: config.maxAestheticPasses,
    maxAStarStatesPerRoute: config.maxAStarStatesPerRoute,
    maxConflictPermutations: requiresConflictPruning
      ? Math.min(config.maxConflictPermutations, 1)
      : config.maxConflictPermutations,
  };
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

  const budgets = deriveSearchStateBudgets(nodes, edges, config);
  const searchConfig: CustomLayoutConfig = {
    ...config,
    maxAStarStatesPerRoute: budgets.maxAStarStatesPerRoute,
    maxConflictPermutations: budgets.maxConflictPermutations,
  };
  const startState = searchOpts.initialState ?? createInitialSearchState();
  const startEval = evaluateSearchState(nodes, edges, startState, searchConfig);

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

  const maxStates = budgets.maxLayoutStates;
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
      const maxEvaluations = Math.min(budgets.maxAestheticEvaluations, remainingGlobalStates);
      const budgetStopReason =
        remainingGlobalStates <= budgets.maxAestheticEvaluations
          ? "layout-state-budget"
          : "aesthetic-state-budget";
      const aestheticResult = runBoundedAestheticSearch({
        bestState,
        bestEvaluation: bestEval,
        maxEvaluations,
        budgetStopReason,
        visitedHashes,
        dependencies: {
          evaluateState: (candidate) => evaluateSearchState(nodes, edges, candidate, searchConfig),
          generateTrialStates: (candidate, evaluation) =>
            generateAestheticTrialStates(candidate, evaluation, searchConfig),
          generateCompletionStates: (candidate, evaluation) =>
            generateCrossingCompletionStates(candidate, evaluation, searchConfig, 2),
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
    const neighborStates = generateNeighborhoodStates(curr.state, curr.evalResult, searchConfig);

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

      const nextEval = evaluateSearchState(nodes, edges, nextState, searchConfig);
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
