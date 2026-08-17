/**
 * TypeScript mirror of `crates/gvui/src/0_common/0_2_config.rs`.
 *
 * Field names, defaults, and validation rules are kept byte-for-byte in sync with the Rust
 * `CustomLayoutConfig`. If you add/rename/remove a field here, make the matching change on the
 * Rust side (and vice versa) — this file is not the source of truth, the Rust struct is.
 *
 * Three tiers, see docs/concepts/quality-model.md and docs/engine/11-emit-and-quality.md:
 * - Tier 1 — Aesthetics: monotone, predictable knobs. What users tune.
 * - Tier 2 — Algorithm selection: swap the algorithm a phase uses, for A/B and debugging.
 * - Tier 3 — Budgets: safety rails, not quality dials.
 *
 * The v1 search-budget knobs (maxRipUpPasses, maxConflictPermutations, maxLayoutStates,
 * maxAStarStatesPerRoute, bendPenalty, crossingPenalty, initialLaneRings, ...) are gone: they
 * bounded a search that no longer exists in v2's construct-don't-search pipeline.
 *
 * `direction` is the ONLY source of flow direction. It used to be half-encoded in the engine mode
 * string as well, and because the client always sends a fully resolved config the mode's direction
 * was discarded every time — which is why `left-right` silently drew top-down. Nothing outside this
 * field may decide which way ranks flow.
 */

/** Mirrors `LayoutConfigurationError` (crates/gvui/src/0_common/0_2_config.rs). */
export class LayoutConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutConfigurationError";
  }
}

// -------------------------------------------------------------------------------------------
// Enumerations — kebab-case string literals, matching Rust's `#[serde(rename_all = "kebab-case")]`
// -------------------------------------------------------------------------------------------

/** Primary flow direction of a layered layout. */
export type Direction = "top-down" | "bottom-up" | "left-right" | "right-left";

/**
 * How edge polylines are rendered.
 *
 * `octilinear` is an orthogonal route whose right-angle corners the engine has already replaced
 * with 45-degree chamfers, so the points it emits are no longer all axis-aligned. It is a post-pass
 * on the orthogonal polyline rather than a different router: the lane model stays exact, and with
 * it the guarantee that routing cannot fail.
 */
export type EdgeStyle = "orthogonal" | "rounded" | "spline" | "octilinear" | "straight";

/** Where an edge badge sits relative to its edge. */
export type LabelPlacement = "on-edge" | "beside-edge" | "above-edge";

/** Rank assignment algorithm. */
export type Ranker = "network-simplex" | "longest-path" | "tight-tree";

/** Two-layer ordering heuristic. */
export type OrderingHeuristic = "median" | "barycenter";

/** Horizontal coordinate assignment algorithm. */
export type Coordinator = "brandes-kopf" | "simple";

/** Which of the four Brandes-Koepf candidate assignments to emit. */
export type BkAlign =
  | "median"
  | "leftmost"
  | "rightmost"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";

/** Preset over the spacing family. */
export type Compaction = "tight" | "balanced" | "airy";

// -------------------------------------------------------------------------------------------
// Config
// -------------------------------------------------------------------------------------------

/** Mirrors Rust's `CustomLayoutConfig` (camelCase over the wire via serde). */
export interface CustomLayoutConfig {
  // ---- Tier 1: aesthetics -----------------------------------------------------------------
  /** Primary flow direction. */
  direction: Direction;
  /** Minimum horizontal separation between adjacent items in a rank (> 0). */
  nodeGap: number;
  /** Minimum vertical separation between rank bands; routing channels may raise it (> 0). */
  rankGap: number;
  /** Minimum separation between disconnected components (> 0). */
  componentGap: number;
  /** Outer margin around the whole drawing (> 0). */
  graphPadding: number;
  /** Distance between parallel routing lanes inside a channel or corridor (> 0). */
  laneSpacing: number;
  /** Minimum spacing between two ports on the same node side (> 0). */
  portPitch: number;
  /** Straight run leaving a port before the first bend (> 0). */
  portStubLength: number;
  /** Clearance between the outermost port and a node corner (>= 0). */
  portEndpointPadding: number;
  /** Bend rounding radius; `0` yields sharp corners (>= 0). */
  cornerRadius: number;
  /** Edge rendering style. */
  edgeStyle: EdgeStyle;
  /** Badge position relative to its edge. */
  labelPlacement: LabelPlacement;
  /** Padding reserved around a badge box (> 0). */
  badgeClearance: number;
  /** Wrap width for edge labels, in pixels (> 0). */
  maxLabelWidth: number;
  /** Maximum wrapped lines before ellipsis (> 0). */
  maxLabelLines: number;
  /** Lower clamp for measured node width (> 0). */
  minNodeWidth: number;
  /** Upper clamp for measured node width; must exceed `minNodeWidth`. */
  maxNodeWidth: number;
  /** Width:height target used by rank balancing and component packing (> 0). */
  targetAspectRatio: number;
  /** Hard cap on items per rank. `0` derives it from `targetAspectRatio`. */
  maxNodesPerRank: number;
  /** Whether rank balancing runs at all. */
  balanceRanks: boolean;
  /** Route parallel edges between the same node pair as one bus. */
  bundleParallelEdges: boolean;
  /** Spacing preset multiplier. */
  compaction: Compaction;
  /**
   * Let the router pick any of the four node sides per endpoint, scored geometrically, instead of
   * forcing every forward edge onto Bottom -> Top. Sideways targets then leave sideways, which
   * removes the dog-leg they would otherwise need.
   */
  flexiblePortSides: boolean;
  /**
   * What attaching to a left/right face costs, measured in corners, when `flexiblePortSides` is on.
   *
   * A side attachment always costs exactly one more corner than a flow-face one: the route has to
   * step out of the face before it can descend into its routing channel. So at any bias `>= 0` the
   * flow faces win essentially every inter-rank edge, and the sides are left to same-rank edges that
   * genuinely travel sideways.
   *
   * **Negative values buy side attachment at the price of that corner.** Measured over the sample
   * corpus: `1` (default) gives 5% of ports on a side face with 40 crossings and 368 bends; `-1`
   * gives 15% with 69 and 404; `-1.5` gives 44% with 146 and 508. Using all four sides costs
   * crossings rather than saving them, because a side port is forced to drop at a fixed x outside
   * the node instead of near the x it is heading for. It is offered as an aesthetic choice, not an
   * optimisation.
   */
  flowSideBias: number;
  /**
   * Snap a source and target port to a common coordinate when that turns a dog-leg into one
   * straight segment. The largest single reducer of unnecessary corners.
   */
  straightShotAlignment: boolean;
  /**
   * Allow the ranker to place the endpoints of a peer edge on the same rank (`minLen = 0`), so two
   * siblings can be joined by a straight horizontal line instead of being forced onto different
   * ranks and connected vertically.
   */
  sameRankPeerEdges: boolean;
  /**
   * Re-decide which routing lane each channel segment occupies once coordinates exist, using the
   * segments' real x-spans instead of the order-space colouring that sized the channels.
   *
   * Every geometric crossing this engine produces is a horizontal channel run cut by another edge's
   * vertical drop, and which runs get cut is decided entirely by the lane order. Turning this off
   * restores the older behaviour: 148 crossings and 14 pairs of edges drawn on top of each other
   * across the sample corpus, against 40 and 0 with it on.
   */
  crossingAwareLanes: boolean;
  /**
   * Per-channel segment count above which `crossingAwareLanes` keeps the original assignment rather
   * than optimising (> 0). The optimiser is quadratic in the segments sharing one channel, so this
   * bounds it. Raising it from 256 to 1024 measured as free on a 10,600-edge mesh, so the default
   * sits where it stops being free rather than where it stops being cheap.
   */
  laneOrderMaxSegments: number;
  /**
   * Place each port as close to its counterpart as the sorted port order and `portPitch` allow,
   * instead of spreading ports evenly along the face. A shorter channel run is a narrower window for
   * another edge's drop to cut, so this reduces crossings as well as bends.
   */
  portDestinationAffinity: boolean;
  /**
   * Ports one left/right face may carry (> 0). Each descends at its own x, staggered outward by
   * `portPitch`, so the face needs proportionally more clearance before the router will use it.
   * Only reachable at all when `flowSideBias` is negative.
   */
  sideFaceCapacity: number;

  // ---- Tier 2: algorithm selection ---------------------------------------------------------
  /** Rank assignment algorithm. */
  ranker: Ranker;
  /** Two-layer ordering heuristic. */
  ordering: OrderingHeuristic;
  /** Down/up sweep count in the ordering phase (> 0). */
  orderingSweeps: number;
  /** Independent ordering seeds; the best result wins (> 0). */
  orderingSeeds: number;
  /** Horizontal coordinate algorithm. */
  coordinator: Coordinator;
  /** Brandes-Koepf candidate selection. */
  bkAlign: BkAlign;
  /** Keep dummy chains straight by making dummies reluctant to move during ordering. */
  dummyPriority: boolean;

  // ---- Tier 2b: organic (stress) mode -------------------------------------------------------
  /** SGD epochs for organic mode (> 0). */
  stressIterations: number;
  /** Desired pixel length of one graph-distance unit (> 0). */
  stressIdealEdgeLength: number;
  /** Overlap-removal passes after stress convergence (>= 0). */
  overlapRemovalPasses: number;

  // ---- Tier 2c: radial mode ------------------------------------------------------------------
  /** Gap between concentric rings (> 0). */
  radialRingGap: number;
  /** Explicit root node id for radial mode; empty selects the highest-degree node. */
  radialRoot: string;

  // ---- Tier 3: budgets -----------------------------------------------------------------------
  /** Soft wall-clock budget in milliseconds; ordering stops sweeping when exceeded (> 0). */
  timeBudgetMs: number;
  /** Guard against pathological rank spans (> 0). */
  maxDummyChainLength: number;
  /** Run the Phase 9 invariant checks even in release builds. */
  assertConstraints: boolean;
  /** Floating point comparison tolerance (> 0). */
  epsilon: number;

  // ---- UI passthrough (not used by layout) ----------------------------------------------------
  /** Viewport wheel/pinch sensitivity. Carried for the renderer's convenience. */
  zoomSensitivity: number;
}

/** Tuned defaults. Mirrors Rust's `DEFAULT_CUSTOM_LAYOUT_CONFIG`. */
export const DEFAULT_CUSTOM_LAYOUT_CONFIG: Readonly<CustomLayoutConfig> = Object.freeze({
  direction: "top-down",
  nodeGap: 60,
  rankGap: 60,
  componentGap: 160,
  graphPadding: 80,
  laneSpacing: 12,
  portPitch: 18,
  portStubLength: 20,
  portEndpointPadding: 16,
  cornerRadius: 8,
  edgeStyle: "rounded",
  labelPlacement: "on-edge",
  badgeClearance: 10,
  maxLabelWidth: 220,
  maxLabelLines: 3,
  minNodeWidth: 200,
  maxNodeWidth: 500,
  targetAspectRatio: 1.6,
  maxNodesPerRank: 0,
  balanceRanks: true,
  bundleParallelEdges: true,
  compaction: "balanced",
  flexiblePortSides: true,
  flowSideBias: 1,
  straightShotAlignment: true,
  sameRankPeerEdges: true,
  crossingAwareLanes: true,
  laneOrderMaxSegments: 1024,
  portDestinationAffinity: true,
  sideFaceCapacity: 2,

  ranker: "network-simplex",
  ordering: "median",
  orderingSweeps: 16,
  orderingSeeds: 4,
  coordinator: "brandes-kopf",
  bkAlign: "median",
  dummyPriority: true,

  stressIterations: 30,
  stressIdealEdgeLength: 180,
  overlapRemovalPasses: 6,

  radialRingGap: 140,
  radialRoot: "",

  timeBudgetMs: 250,
  maxDummyChainLength: 64,
  assertConstraints: false,
  epsilon: 0.001,

  zoomSensitivity: 1,
});

// -------------------------------------------------------------------------------------------
// Validation — mirrors `CustomLayoutConfig::validate()`
// -------------------------------------------------------------------------------------------

const POSITIVE_F64_FIELDS: (keyof CustomLayoutConfig)[] = [
  "nodeGap",
  "rankGap",
  "componentGap",
  "graphPadding",
  "laneSpacing",
  "portPitch",
  "portStubLength",
  "badgeClearance",
  "maxLabelWidth",
  "minNodeWidth",
  "maxNodeWidth",
  "targetAspectRatio",
  "stressIdealEdgeLength",
  "radialRingGap",
  "timeBudgetMs",
  "epsilon",
  "zoomSensitivity",
];

const NON_NEGATIVE_F64_FIELDS: (keyof CustomLayoutConfig)[] = [
  "portEndpointPadding",
  "cornerRadius",
];

/**
 * Fields that may be negative but must still be finite.
 *
 * Only `flowSideBias` qualifies: its sign is meaningful — negative asks the router to attach to the
 * left/right faces despite the corner that costs — so clamping it at zero would remove the setting's
 * whole purpose rather than catch a mistake.
 */
const FINITE_F64_FIELDS: (keyof CustomLayoutConfig)[] = ["flowSideBias"];

/** Mirrors Rust's `positive_usize` list; these must additionally be integers. */
const POSITIVE_INT_FIELDS: (keyof CustomLayoutConfig)[] = [
  "maxLabelLines",
  "orderingSweeps",
  "orderingSeeds",
  "stressIterations",
  "maxDummyChainLength",
  "laneOrderMaxSegments",
  "sideFaceCapacity",
];

/** Non-negative integer fields with no lower bound beyond zero (`0` is a valid "auto"/"off"). */
const NON_NEGATIVE_INT_FIELDS: (keyof CustomLayoutConfig)[] = [
  "maxNodesPerRank",
  "overlapRemovalPasses",
];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Validates every numeric bound. Returns the first violation encountered, mirroring the Rust
 * `validate()` short-circuit order so error messages match across the two implementations.
 */
export function validateCustomLayoutConfig(config: CustomLayoutConfig): void {
  for (const field of POSITIVE_F64_FIELDS) {
    const v = config[field];
    if (!isFiniteNumber(v) || v <= 0) {
      throw new LayoutConfigurationError(
        `Configuration property '${field}' must be a positive finite number, got ${String(v)}`,
      );
    }
  }

  for (const field of NON_NEGATIVE_F64_FIELDS) {
    const v = config[field];
    if (!isFiniteNumber(v) || v < 0) {
      throw new LayoutConfigurationError(
        `Configuration property '${field}' must be a non-negative finite number, got ${String(v)}`,
      );
    }
  }

  for (const field of FINITE_F64_FIELDS) {
    const v = config[field];
    if (!isFiniteNumber(v)) {
      throw new LayoutConfigurationError(
        `Configuration property '${field}' must be a finite number, got ${String(v)}`,
      );
    }
  }

  for (const field of POSITIVE_INT_FIELDS) {
    const v = config[field];
    if (!isFiniteNumber(v) || !Number.isInteger(v) || v <= 0) {
      throw new LayoutConfigurationError(
        `Configuration property '${field}' must be greater than 0`,
      );
    }
  }

  for (const field of NON_NEGATIVE_INT_FIELDS) {
    const v = config[field];
    if (!isFiniteNumber(v) || !Number.isInteger(v) || v < 0) {
      throw new LayoutConfigurationError(
        `Configuration property '${field}' must be a non-negative integer, got ${String(v)}`,
      );
    }
  }

  const VALID_DIRECTIONS: readonly Direction[] = [
    "top-down",
    "bottom-up",
    "left-right",
    "right-left",
  ];
  if (!VALID_DIRECTIONS.includes(config.direction)) {
    throw new LayoutConfigurationError(
      `Configuration property 'direction' must be one of ${VALID_DIRECTIONS.join(", ")}, got ${String(config.direction)}`,
    );
  }

  if (config.maxNodeWidth < config.minNodeWidth) {
    throw new LayoutConfigurationError(
      `Configuration property 'maxNodeWidth' (${config.maxNodeWidth}) must be >= 'minNodeWidth' (${config.minNodeWidth})`,
    );
  }
}

/**
 * Merges a partial override over the defaults and validates the result, mirroring Rust's
 * `resolve_custom_layout_config`. Unknown keys on `partial` are ignored (not just unused — never
 * copied onto the resolved object), matching the Rust side's tolerance for older clients still
 * sending removed v1 search-budget knobs.
 */
export function resolveCustomLayoutConfig(
  partial?: Partial<CustomLayoutConfig> | null,
): CustomLayoutConfig {
  const resolved: CustomLayoutConfig = { ...DEFAULT_CUSTOM_LAYOUT_CONFIG };

  if (partial) {
    const keys = Object.keys(DEFAULT_CUSTOM_LAYOUT_CONFIG) as (keyof CustomLayoutConfig)[];
    for (const key of keys) {
      const value = partial[key];
      if (value !== undefined) {
        if (
          key === "direction" &&
          ((value as unknown) === "bottom-top" ||
            (value as unknown) === "bottom_top" ||
            (value as unknown) === "bottom_up")
        ) {
          resolved.direction = "bottom-up";
        } else {
          // Each field of CustomLayoutConfig is independently typed on both sides of this
          // assignment (both indexed by the same `key`), but TS cannot express "assign a value of
          // matching key" across a homomorphic mapped type without losing the union. This is the
          // single documented bridge cast for that structural gap, not a loosening of field types.
          (resolved as Record<keyof CustomLayoutConfig, unknown>)[key] = value;
        }
      }
    }
  }

  validateCustomLayoutConfig(resolved);
  return resolved;
}
