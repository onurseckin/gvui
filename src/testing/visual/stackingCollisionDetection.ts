/**
 * Stacking and interactive-element collision detection: flags unintended overlapping bounding
 * boxes among sibling / interactive elements, distinct from a nested parent/child containment.
 */

import { computeBoundingBoxOverlap, type BoundingBox } from "./boundingBoxGeometry";

export interface StackingViolation {
  readonly selectorA: string;
  readonly selectorB: string;
  readonly boxA: BoundingBox;
  readonly boxB: BoundingBox;
  readonly intersectionBox: BoundingBox;
  readonly overlapArea: number;
  readonly overlapRatioA: number;
  readonly overlapRatioB: number;
  readonly severity: "error" | "warning";
  readonly description: string;
}

export interface ElementWithBounds {
  readonly selector: string;
  readonly bounds: BoundingBox;
  readonly zIndex?: number;
  readonly isInteractive?: boolean;
}

// A box whose overlap covers (very nearly) 100% of its own area is not overlapping a sibling —
// it is nested inside the other box, e.g. an icon `span` inside its own `button`. Bounding boxes
// carry no DOM parent/child link, so full geometric containment is the only signal this pure,
// zero-dependency function has for telling "nested" apart from "colliding"; 99.5% tolerates
// subpixel rounding between a child's rect and its parent's without masking a genuine near-total
// overlap between two unrelated siblings.
const CONTAINMENT_OVERLAP_PERCENTAGE = 99.5;

/**
 * Detects unintended overlapping bounding boxes among sibling / interactive elements.
 */
export function detectStackingCollisions(
  elements: readonly ElementWithBounds[],
  overlapAreaThreshold = 50,
): StackingViolation[] {
  const violations: StackingViolation[] = [];

  for (let i = 0; i < elements.length; i++) {
    const elA = elements[i];
    for (let j = i + 1; j < elements.length; j++) {
      const elB = elements[j];

      const overlap = computeBoundingBoxOverlap(elA.bounds, elB.bounds);
      const isContainment =
        overlap.overlapPercentageA >= CONTAINMENT_OVERLAP_PERCENTAGE ||
        overlap.overlapPercentageB >= CONTAINMENT_OVERLAP_PERCENTAGE;

      if (
        overlap.hasOverlap &&
        overlap.overlapArea >= overlapAreaThreshold &&
        overlap.intersectionBox &&
        !isContainment
      ) {
        const severity: "error" | "warning" =
          elA.isInteractive && elB.isInteractive ? "error" : "warning";

        violations.push({
          selectorA: elA.selector,
          selectorB: elB.selector,
          boxA: elA.bounds,
          boxB: elB.bounds,
          intersectionBox: overlap.intersectionBox,
          overlapArea: overlap.overlapArea,
          overlapRatioA: overlap.overlapPercentageA,
          overlapRatioB: overlap.overlapPercentageB,
          severity,
          description: `Collision detected between '${elA.selector}' and '${elB.selector}' (overlap: ${overlap.overlapArea.toFixed(1)}px², ${overlap.overlapPercentageA.toFixed(1)}% of A)`,
        });
      }
    }
  }

  return violations;
}
