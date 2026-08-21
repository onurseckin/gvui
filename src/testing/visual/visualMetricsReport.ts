/**
 * Report synthesis and scoring: combines per-viewport audit results into a single
 * VisualMetricsReport, and derives the pass/fail integrity and accessibility scores.
 */

import type { OverflowViolation } from "./boundingBoxGeometry";
import type { TextClippingViolation } from "./textClippingDetection";
import type { ContrastViolation } from "./colorContrastAnalysis";
import type { StackingViolation } from "./stackingCollisionDetection";

export interface ViewportMetrics {
  readonly viewport: {
    readonly name: string;
    readonly width: number;
    readonly height: number;
  };
  readonly totalElementsChecked: number;
  readonly totalViolations: number;
  readonly overflowCount: number;
  readonly clippingCount: number;
  readonly collisionCount: number;
  readonly contrastViolationCount: number;
  readonly passed: boolean;
  readonly integrityScore: number; // 0 - 100
  readonly accessibilityScore: number; // 0 - 100
  readonly layoutOverflows: readonly OverflowViolation[];
  readonly textClippings: readonly TextClippingViolation[];
  readonly collisions: readonly StackingViolation[];
  readonly contrastIssues: readonly ContrastViolation[];
}

export interface VisualMetricsReport {
  readonly version: string;
  readonly timestamp: string;
  readonly dataset?: string;
  readonly url?: string;
  readonly summary: {
    readonly totalElementsChecked: number;
    readonly totalViolations: number;
    readonly overflowCount: number;
    readonly clippingCount: number;
    readonly collisionCount: number;
    readonly contrastViolationCount: number;
    readonly passed: boolean;
    readonly integrityScore: number;
    readonly accessibilityScore: number;
  };
  readonly viewports: Record<string, ViewportMetrics>;
  readonly layoutOverflows: readonly OverflowViolation[];
  readonly textClippings: readonly TextClippingViolation[];
  readonly collisions: readonly StackingViolation[];
  readonly contrastIssues: readonly ContrastViolation[];
}

/**
 * Synthesizes individual viewport metrics into a unified VisualMetricsReport.
 */
export function createVisualMetricsReport(params: {
  readonly viewports: Record<string, ViewportMetrics>;
  readonly dataset?: string;
  readonly url?: string;
  readonly timestamp?: string;
}): VisualMetricsReport {
  const allOverflows: OverflowViolation[] = [];
  const allClippings: TextClippingViolation[] = [];
  const allCollisions: StackingViolation[] = [];
  const allContrasts: ContrastViolation[] = [];

  let totalElementsChecked = 0;

  for (const vpMetrics of Object.values(params.viewports)) {
    totalElementsChecked += vpMetrics.totalElementsChecked;
    allOverflows.push(...vpMetrics.layoutOverflows);
    allClippings.push(...vpMetrics.textClippings);
    allCollisions.push(...vpMetrics.collisions);
    allContrasts.push(...vpMetrics.contrastIssues);
  }

  const overflowCount = allOverflows.length;
  const clippingCount = allClippings.length;
  const collisionCount = allCollisions.length;
  const contrastViolationCount = allContrasts.length;
  const totalViolations = overflowCount + clippingCount + collisionCount + contrastViolationCount;

  // Score integrity: deductions for layout overflow, clipping, collisions
  const integrityScore = Math.max(
    0,
    Math.min(100, Math.round(100 - (overflowCount * 10 + clippingCount * 5 + collisionCount * 15))),
  );

  // Score accessibility: deductions for contrast violations
  const accessibilityScore = Math.max(
    0,
    Math.min(100, Math.round(100 - contrastViolationCount * 10)),
  );

  const passed = totalViolations === 0;

  return {
    version: "1.0.0",
    timestamp: params.timestamp ?? new Date().toISOString(),
    dataset: params.dataset,
    url: params.url,
    summary: {
      totalElementsChecked,
      totalViolations,
      overflowCount,
      clippingCount,
      collisionCount,
      contrastViolationCount,
      passed,
      integrityScore,
      accessibilityScore,
    },
    viewports: params.viewports,
    layoutOverflows: allOverflows,
    textClippings: allClippings,
    collisions: allCollisions,
    contrastIssues: allContrasts,
  };
}

/**
 * Creates empty/passing ViewportMetrics for a specific viewport.
 */
export function createEmptyViewportMetrics(viewport: {
  name: string;
  width: number;
  height: number;
}): ViewportMetrics {
  return {
    viewport,
    totalElementsChecked: 0,
    totalViolations: 0,
    overflowCount: 0,
    clippingCount: 0,
    collisionCount: 0,
    contrastViolationCount: 0,
    passed: true,
    integrityScore: 100,
    accessibilityScore: 100,
    layoutOverflows: [],
    textClippings: [],
    collisions: [],
    contrastIssues: [],
  };
}
