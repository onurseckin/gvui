export class LayoutConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutConfigurationError";
  }
}

export interface CustomLayoutConfig {
  nodeGap: number;
  rankGap: number;
  componentGap: number;
  graphPadding: number;
  portStubLength: number;
  portEndpointPadding: number;
  obstacleClearance: number;
  laneSpacing: number;
  initialLaneRings: number;
  maxLaneRings: number;
  bendPenalty: number;
  crossingPenalty: number;
  directionPenalty: number;
  sideReusePenalty: number;
  nearObstaclePenalty: number;
  badgeClearance: number;
  maxBadgeCandidatesPerEdge: number;
  maxBadgeBacktrackSteps: number;
  maxCrossingSweeps: number;
  maxPortImprovementPasses: number;
  maxRipUpPasses: number;
  maxGlobalPasses: number;
  epsilon: number;
  maxAestheticPasses: number;
  maxPortStatesPerPass: number;
  maxPortAlternativesPerEdge: number;
  maxRouteOrderVariants: number;
  coordinateSweepLimit: number;
  maxLayoutStates: number;
  maxFrontierSize: number;
  maxNeighborsPerState: number;
  maxAStarStatesPerRoute: number;
  maxConflictPermutationSize: number;
  maxConflictPermutations: number;
  maxRouteCandidatesPerEdge: number;
  maxBadgeStates: number;
}

export const DEFAULT_CUSTOM_LAYOUT_CONFIG: Readonly<CustomLayoutConfig> = Object.freeze({
  nodeGap: 56,
  rankGap: 120,
  componentGap: 160,
  graphPadding: 80,
  portStubLength: 20,
  portEndpointPadding: 16,
  obstacleClearance: 16,
  laneSpacing: 12,
  initialLaneRings: 2,
  maxLaneRings: 8,
  bendPenalty: 40,
  crossingPenalty: 500,
  directionPenalty: 120,
  sideReusePenalty: 32,
  nearObstaclePenalty: 8,
  badgeClearance: 10,
  maxBadgeCandidatesPerEdge: 48,
  maxBadgeBacktrackSteps: 1000,
  maxCrossingSweeps: 24,
  maxPortImprovementPasses: 12,
  maxRipUpPasses: 12,
  maxGlobalPasses: 8,
  epsilon: 0.001,
  maxAestheticPasses: 12,
  maxPortStatesPerPass: 8,
  maxPortAlternativesPerEdge: 4,
  maxRouteOrderVariants: 4,
  coordinateSweepLimit: 16,
  maxLayoutStates: 200,
  maxFrontierSize: 50,
  maxNeighborsPerState: 16,
  maxAStarStatesPerRoute: 50000,
  maxConflictPermutationSize: 6,
  maxConflictPermutations: 32,
  maxRouteCandidatesPerEdge: 4,
  maxBadgeStates: 200,
});

export function resolveCustomLayoutConfig(
  partial?: Partial<CustomLayoutConfig>,
): CustomLayoutConfig {
  const merged: CustomLayoutConfig = {
    ...DEFAULT_CUSTOM_LAYOUT_CONFIG,
    ...partial,
  };

  const positiveFields: (keyof CustomLayoutConfig)[] = [
    "nodeGap",
    "rankGap",
    "componentGap",
    "graphPadding",
    "portStubLength",
    "obstacleClearance",
    "laneSpacing",
    "initialLaneRings",
    "maxLaneRings",
    "badgeClearance",
    "maxBadgeCandidatesPerEdge",
    "maxBadgeBacktrackSteps",
    "maxCrossingSweeps",
    "maxPortImprovementPasses",
    "maxRipUpPasses",
    "maxGlobalPasses",
    "epsilon",
    "maxAestheticPasses",
    "maxPortStatesPerPass",
    "maxPortAlternativesPerEdge",
    "maxRouteOrderVariants",
    "coordinateSweepLimit",
    "maxLayoutStates",
    "maxFrontierSize",
    "maxNeighborsPerState",
    "maxAStarStatesPerRoute",
    "maxConflictPermutationSize",
    "maxConflictPermutations",
    "maxRouteCandidatesPerEdge",
    "maxBadgeStates",
  ];

  for (const field of positiveFields) {
    if (typeof merged[field] !== "number" || merged[field] <= 0 || Number.isNaN(merged[field])) {
      throw new LayoutConfigurationError(
        `Configuration property '${field}' must be a positive number, got ${merged[field]}`,
      );
    }
  }

  const nonNegativeFields: (keyof CustomLayoutConfig)[] = [
    "portEndpointPadding",
    "bendPenalty",
    "crossingPenalty",
    "directionPenalty",
    "sideReusePenalty",
    "nearObstaclePenalty",
  ];

  for (const field of nonNegativeFields) {
    if (typeof merged[field] !== "number" || merged[field] < 0 || Number.isNaN(merged[field])) {
      throw new LayoutConfigurationError(
        `Configuration property '${field}' must be a non-negative number, got ${merged[field]}`,
      );
    }
  }

  return merged;
}

