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
  maxCrossingSweeps: number;
  maxPortImprovementPasses: number;
  maxRipUpPasses: number;
  maxGlobalPasses: number;
  epsilon: number;
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
  maxCrossingSweeps: 24,
  maxPortImprovementPasses: 12,
  maxRipUpPasses: 12,
  maxGlobalPasses: 8,
  epsilon: 0.001,
});

export function resolveCustomLayoutConfig(partial?: Partial<CustomLayoutConfig>): CustomLayoutConfig {
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
    "portEndpointPadding",
    "obstacleClearance",
    "laneSpacing",
    "initialLaneRings",
    "maxLaneRings",
    "badgeClearance",
    "maxCrossingSweeps",
    "maxPortImprovementPasses",
    "maxRipUpPasses",
    "maxGlobalPasses",
    "epsilon",
  ];

  for (const field of positiveFields) {
    if (typeof merged[field] !== "number" || merged[field] <= 0 || Number.isNaN(merged[field])) {
      throw new LayoutConfigurationError(
        `Configuration property '${field}' must be a positive number, got ${merged[field]}`
      );
    }
  }

  const nonNegativeFields: (keyof CustomLayoutConfig)[] = [
    "bendPenalty",
    "crossingPenalty",
    "directionPenalty",
    "sideReusePenalty",
    "nearObstaclePenalty",
  ];

  for (const field of nonNegativeFields) {
    if (typeof merged[field] !== "number" || merged[field] < 0 || Number.isNaN(merged[field])) {
      throw new LayoutConfigurationError(
        `Configuration property '${field}' must be a non-negative number, got ${merged[field]}`
      );
    }
  }

  return merged;
}
