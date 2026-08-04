/**
 * Turns a routed polyline (the `points` on a `RoutedPath`) into an SVG path string.
 *
 * DESIGN NOTE — corner rounding lives entirely on the client, not in the Rust layout engine.
 * The Rust side (Phase 8) only ever emits axis-aligned waypoints; how those waypoints are drawn
 * — sharp, rounded, splined, or collapsed to a straight line — is a pure rendering decision that
 * does not change any node position, port assignment, or lane allocation. Keeping it here means
 * changing `cornerRadius` or `edgeStyle` in the developer panel re-renders instantly, with no
 * round-trip through the layout engine (WASM call, worker message, cache invalidation). See
 * `GraphCanvas`'s edge-style pass, which re-derives `path` from the cached `points` array whenever
 * these two config fields change.
 */

import type { EdgeStyle } from "./config";
import type { Point } from "./types";

function fmt(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  // Avoid emitting "-0" — SVG parsers accept it, but it makes snapshot diffs and tests noisy.
  return (Object.is(rounded, -0) ? 0 : rounded).toString();
}

function moveTo(p: Point): string {
  return `M ${fmt(p.x)} ${fmt(p.y)}`;
}

function lineTo(p: Point): string {
  return `L ${fmt(p.x)} ${fmt(p.y)}`;
}

/** `M first L last`, ignoring any interior waypoints. */
function buildStraightPath(points: Point[]): string {
  return `${moveTo(points[0])} ${lineTo(points[points.length - 1])}`;
}

/** Axis-aligned `M`/`L` polyline through every waypoint, sharp corners. */
function buildOrthogonalPath(points: Point[]): string {
  const commands = [moveTo(points[0])];
  for (let i = 1; i < points.length; i++) {
    commands.push(lineTo(points[i]));
  }
  return commands.join(" ");
}

/**
 * Catmull-Rom through `points`, converted to cubic Bezier segments (the standard uniform
 * conversion: control points at `p1 +/- (neighbour delta) / 6`). Endpoints are handled by
 * duplicating the boundary point as its own "missing" neighbour, which is the usual convention
 * and keeps the curve from overshooting past the first/last waypoint.
 */
function buildSplinePath(points: Point[]): string {
  const commands = [moveTo(points[0])];
  const last = points.length - 1;
  for (let i = 0; i < last; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(last, i + 2)];

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    commands.push(`C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`);
  }
  return commands.join(" ");
}

const COLLINEAR_EPSILON = 1e-6;
const ZERO_LENGTH_EPSILON = 1e-6;

/**
 * Axis-aligned polyline with each interior corner replaced by a quadratic Bezier of radius
 * `min(cornerRadius, halfLen(incoming segment), halfLen(outgoing segment))`. The clamp against
 * half of each adjacent segment length guarantees two neighbouring corners can never claim
 * overlapping arcs on the segment between them, so this never needs to look at more than one
 * vertex at a time.
 *
 * A vertex is left sharp (`L`, no `Q`) when either adjacent segment has ~zero length or the two
 * segments are collinear (no actual corner to round) — both are configurations where a quadratic
 * curve would be degenerate or a no-op.
 */
function buildRoundedPath(points: Point[], cornerRadius: number): string {
  if (points.length <= 2 || cornerRadius <= 0) {
    return buildOrthogonalPath(points);
  }

  const commands = [moveTo(points[0])];
  let cursor = points[0];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = cursor;
    const curr = points[i];
    const next = points[i + 1];

    const inX = curr.x - prev.x;
    const inY = curr.y - prev.y;
    const outX = next.x - curr.x;
    const outY = next.y - curr.y;

    const lenIn = Math.hypot(inX, inY);
    const lenOut = Math.hypot(outX, outY);
    const cross = inX * outY - inY * outX;

    const isDegenerate =
      lenIn < ZERO_LENGTH_EPSILON ||
      lenOut < ZERO_LENGTH_EPSILON ||
      Math.abs(cross) < COLLINEAR_EPSILON * Math.max(lenIn * lenOut, 1);

    if (isDegenerate) {
      commands.push(lineTo(curr));
      cursor = curr;
      continue;
    }

    const radius = Math.min(cornerRadius, lenIn / 2, lenOut / 2);
    const entry: Point = {
      x: curr.x - (inX / lenIn) * radius,
      y: curr.y - (inY / lenIn) * radius,
    };
    const exit: Point = {
      x: curr.x + (outX / lenOut) * radius,
      y: curr.y + (outY / lenOut) * radius,
    };

    commands.push(lineTo(entry));
    commands.push(`Q ${fmt(curr.x)} ${fmt(curr.y)} ${fmt(exit.x)} ${fmt(exit.y)}`);
    cursor = exit;
  }

  commands.push(lineTo(points[points.length - 1]));
  return commands.join(" ");
}

/**
 * Converts a routed polyline to an SVG `d` attribute. `cornerRadius` is only consulted by the
 * `rounded` style; the other styles ignore it (they either have no corners to round, in the case
 * of `straight`, or handle smoothing a different way, in the case of `spline`).
 *
 * Safe on degenerate input: empty returns `""`, a single point returns a zero-length `M`.
 */
export function buildEdgePath(points: Point[], style: EdgeStyle, cornerRadius: number): string {
  if (points.length === 0) return "";
  if (points.length === 1) return moveTo(points[0]);

  switch (style) {
    case "straight":
      return buildStraightPath(points);
    case "spline":
      return buildSplinePath(points);
    case "orthogonal":
      return buildOrthogonalPath(points);
    case "rounded":
      return buildRoundedPath(points, cornerRadius);
    default:
      return buildOrthogonalPath(points);
  }
}
