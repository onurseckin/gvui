import type { CustomLayoutConfig } from "./config";
import type { ExactSpacingDemand, BadgePlacement, RoutedPath } from "./types";

export function planLabelLaneDemands(
  placements: BadgePlacement[],
  _routes: RoutedPath[],
  config: CustomLayoutConfig,
): ExactSpacingDemand[] {
  const demands: ExactSpacingDemand[] = [];

  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const p1 = placements[i];
      const p2 = placements[j];

      // Check if both badges lie on vertical tracks at close X coordinates
      const isP1Vert = Math.abs(p1.rect.width) > 0;
      const isP2Vert = Math.abs(p2.rect.width) > 0;

      if (isP1Vert && isP2Vert) {
        const xDist = Math.abs(p1.rect.x - p2.rect.x);
        const yOverlap =
          Math.max(0, Math.min(p1.rect.y + p1.rect.height, p2.rect.y + p2.rect.height) - Math.max(p1.rect.y, p2.rect.y));

        if (yOverlap > config.epsilon && xDist < (p1.rect.width + p2.rect.width) / 2 + config.badgeClearance) {
          demands.push({
            kind: "lane-x",
            affectedEdgeIds: [p1.edgeId, p2.edgeId].sort(),
            minimum: (p1.rect.width + p2.rect.width) / 2 + 2 * config.badgeClearance,
            reason: "parallel-labels",
          });
        }
      }
    }
  }

  return demands;
}
