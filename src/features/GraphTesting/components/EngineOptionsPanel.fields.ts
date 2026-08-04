/**
 * The Settings panel as data: one `FieldSpec` per field of `CustomLayoutConfig`, grouped by the
 * thing a user is trying to change.
 *
 * Split out of `EngineOptionsPanel.tsx` for the same reason `LayoutSelectDropdown.types.ts` is
 * split out of its component: a module that exports both a component and constants loses React
 * Fast Refresh. Keeping the catalogue here also lets a test assert the invariant the panel exists
 * to uphold — every config field is reachable from the UI, exactly once.
 */

import type { SelectOption } from "../../../ui/atoms/Select";
import { DIRECTION_DESCRIPTORS } from "../../../ui/molecules/LayoutSelectDropdown/LayoutSelectDropdown.types";
import type { CustomLayoutConfig } from "../../../engine/layout/custom/config";

export type ConfigKey = keyof CustomLayoutConfig;

/** Keys whose value is a number. Booleans do not extend `number`, so they drop out. */
type NumberKey = { [K in ConfigKey]: CustomLayoutConfig[K] extends number ? K : never }[ConfigKey];

type BooleanKey = {
  [K in ConfigKey]: CustomLayoutConfig[K] extends boolean ? K : never;
}[ConfigKey];

/**
 * Keys backed by a closed string union. The `string extends …` guard rejects open strings
 * (`radialRoot`), which belong in a free-text control rather than a Select.
 */
type EnumKey = {
  [K in ConfigKey]: CustomLayoutConfig[K] extends string
    ? string extends CustomLayoutConfig[K]
      ? never
      : K
    : never;
}[ConfigKey];

type TextKey = { [K in ConfigKey]: string extends CustomLayoutConfig[K] ? K : never }[ConfigKey];

export type EnumValue = CustomLayoutConfig[EnumKey];

interface NumberFieldSpec {
  kind: "number";
  key: NumberKey;
  label: string;
  /** One line, phrased as what happens when the value goes UP. */
  help: string;
  min: number;
  max: number;
  step: number;
  /** Rust validates these as `usize`, so fractional slider positions must be rounded away. */
  integer?: boolean;
}

interface BooleanFieldSpec {
  kind: "boolean";
  key: BooleanKey;
  label: string;
  help: string;
}

interface TextFieldSpec {
  kind: "text";
  key: TextKey;
  label: string;
  help: string;
  placeholder?: string;
}

interface EnumFieldSpecFor<K extends EnumKey> {
  kind: "enum";
  key: K;
  label: string;
  help: string;
  options: SelectOption<Extract<CustomLayoutConfig[K], string>>[];
}

type EnumFieldSpec = { [K in EnumKey]: EnumFieldSpecFor<K> }[EnumKey];

export type FieldSpec = NumberFieldSpec | BooleanFieldSpec | TextFieldSpec | EnumFieldSpec;

/**
 * Identity helper that pins `K` to the literal key, so the option list is checked against that
 * field's own union: a stray `"splines"` in `edgeStyle` is a compile error, not a runtime no-op.
 */
const enumField = <K extends EnumKey>(spec: EnumFieldSpecFor<K>): EnumFieldSpecFor<K> => spec;

// -------------------------------------------------------------------------------------------
// Field catalogue
//
// One group per thing a user is trying to change, not one group per implementation tier — the
// tiers were an engine-internal taxonomy and nobody arriving at this panel is looking for "Tier 2".
// -------------------------------------------------------------------------------------------

const LAYOUT_FIELDS: FieldSpec[] = [
  enumField({
    kind: "enum",
    key: "direction",
    label: "Direction",
    help: "Which way ranks advance. The only thing that decides flow direction.",
    options: DIRECTION_DESCRIPTORS.map((d) => ({ value: d.value, label: d.label })),
  }),
  {
    kind: "number",
    key: "nodeGap",
    label: "Node gap",
    help: "More space between neighbours inside a rank; the drawing gets wider.",
    min: 4,
    max: 400,
    step: 4,
  },
  {
    kind: "number",
    key: "rankGap",
    label: "Rank gap",
    help: "More space between ranks. Routing channels can raise this automatically.",
    min: 4,
    max: 400,
    step: 4,
  },
  {
    kind: "number",
    key: "componentGap",
    label: "Component gap",
    help: "Pushes disconnected sub-graphs further apart.",
    min: 4,
    max: 600,
    step: 4,
  },
  {
    kind: "number",
    key: "graphPadding",
    label: "Graph padding",
    help: "Thicker empty margin around the whole drawing.",
    min: 4,
    max: 400,
    step: 4,
  },
  enumField({
    kind: "enum",
    key: "compaction",
    label: "Compaction",
    help: "Scales every gap at once: tight squeezes them, airy opens them up.",
    options: [
      { value: "tight", label: "Tight" },
      { value: "balanced", label: "Balanced" },
      { value: "airy", label: "Airy" },
    ],
  }),
  {
    kind: "number",
    key: "targetAspectRatio",
    label: "Target aspect ratio",
    help: "Favours wider, shorter drawings; rank balancing and component packing follow it.",
    min: 0.2,
    max: 4,
    step: 0.1,
  },
  {
    kind: "number",
    key: "maxNodesPerRank",
    label: "Max nodes per rank",
    help: "Allows fuller ranks before wrapping. 0 derives the cap from the target aspect ratio.",
    min: 0,
    max: 64,
    step: 1,
    integer: true,
  },
  {
    kind: "boolean",
    key: "balanceRanks",
    label: "Balance ranks",
    help: "Redistributes nodes across ranks to chase the target aspect ratio.",
  },
  {
    kind: "number",
    key: "minNodeWidth",
    label: "Min node width",
    help: "Raises the floor on measured node width; narrow nodes get padded out.",
    min: 40,
    max: 600,
    step: 10,
  },
  {
    kind: "number",
    key: "maxNodeWidth",
    label: "Max node width",
    help: "Lets wide nodes stay wide before their text is clamped. Must stay above min node width.",
    min: 80,
    max: 1200,
    step: 10,
  },
  {
    kind: "number",
    key: "zoomSensitivity",
    label: "Zoom sensitivity",
    help: "Sharper viewport wheel and pinch response. Read by the renderer, never by the layout.",
    min: 0.1,
    max: 3,
    step: 0.05,
  },
];

const EDGE_FIELDS: FieldSpec[] = [
  enumField({
    kind: "enum",
    key: "edgeStyle",
    label: "Edge style",
    help: "How a routed polyline is drawn. Octilinear turns right angles into 45-degree chamfers.",
    options: [
      { value: "orthogonal", label: "Orthogonal" },
      { value: "rounded", label: "Rounded" },
      { value: "spline", label: "Spline" },
      { value: "octilinear", label: "Octilinear" },
      { value: "straight", label: "Straight" },
    ],
  }),
  {
    kind: "number",
    key: "cornerRadius",
    label: "Corner radius",
    help: "Rounder bends. 0 gives sharp corners. Only the rounded style reads it.",
    min: 0,
    max: 40,
    step: 1,
  },
  {
    kind: "number",
    key: "portPitch",
    label: "Port pitch",
    help: "Ports on the same node side spread further apart.",
    min: 2,
    max: 80,
    step: 2,
  },
  {
    kind: "number",
    key: "portStubLength",
    label: "Port stub length",
    help: "Longer straight run leaving a port before the first bend.",
    min: 2,
    max: 120,
    step: 2,
  },
  {
    kind: "number",
    key: "portEndpointPadding",
    label: "Port endpoint padding",
    help: "Keeps the outermost ports further away from the node corners.",
    min: 0,
    max: 80,
    step: 2,
  },
  {
    kind: "number",
    key: "laneSpacing",
    label: "Lane spacing",
    help: "Parallel routing lanes sit further apart, so channels grow wider.",
    min: 2,
    max: 80,
    step: 2,
  },
  {
    kind: "boolean",
    key: "flexiblePortSides",
    label: "Flexible port sides",
    help: "Lets an edge leave and enter through whichever of the four sides faces the other end.",
  },
  {
    kind: "number",
    key: "flowSideBias",
    label: "Flow side bias",
    help: "Keeps edges on the rank-flow sides even when a sideways exit is shorter. 0 is purely geometric.",
    min: 0,
    max: 8,
    step: 0.1,
  },
  {
    kind: "boolean",
    key: "straightShotAlignment",
    label: "Straight-shot alignment",
    help: "Snaps a source and target port to a shared coordinate when that removes a dog-leg.",
  },
  {
    kind: "boolean",
    key: "sameRankPeerEdges",
    label: "Same-rank peer edges",
    help: "Lets two siblings share a rank and be joined by one straight horizontal line.",
  },
  {
    kind: "boolean",
    key: "bundleParallelEdges",
    label: "Bundle parallel edges",
    help: "Routes every edge between the same node pair as one bus.",
  },
];

const LABEL_FIELDS: FieldSpec[] = [
  enumField({
    kind: "enum",
    key: "labelPlacement",
    label: "Label placement",
    help: "On-edge centres the badge on the line; the offset placements need a leader line to reach it.",
    options: [
      { value: "on-edge", label: "On edge" },
      { value: "beside-edge", label: "Beside edge" },
      { value: "above-edge", label: "Above edge" },
    ],
  }),
  {
    kind: "number",
    key: "badgeClearance",
    label: "Badge clearance",
    help: "More padding reserved around each badge box.",
    min: 1,
    max: 60,
    step: 1,
  },
  {
    kind: "number",
    key: "maxLabelWidth",
    label: "Max label width",
    help: "Edge labels wrap later, so they render wider.",
    min: 40,
    max: 800,
    step: 10,
  },
  {
    kind: "number",
    key: "maxLabelLines",
    label: "Max label lines",
    help: "More wrapped lines before a label is ellipsized.",
    min: 1,
    max: 10,
    step: 1,
    integer: true,
  },
];

const ALGORITHM_FIELDS: FieldSpec[] = [
  enumField({
    kind: "enum",
    key: "ranker",
    label: "Ranker",
    help: "Algorithm that assigns nodes to ranks.",
    options: [
      { value: "network-simplex", label: "Network simplex" },
      { value: "longest-path", label: "Longest path" },
      { value: "tight-tree", label: "Tight tree" },
    ],
  }),
  enumField({
    kind: "enum",
    key: "ordering",
    label: "Ordering heuristic",
    help: "Two-layer heuristic used to reduce crossings.",
    options: [
      { value: "median", label: "Median" },
      { value: "barycenter", label: "Barycenter" },
    ],
  }),
  {
    kind: "number",
    key: "orderingSweeps",
    label: "Ordering sweeps",
    help: "More down/up crossing-reduction sweeps; slower, usually fewer crossings.",
    min: 1,
    max: 64,
    step: 1,
    integer: true,
  },
  {
    kind: "number",
    key: "orderingSeeds",
    label: "Ordering seeds",
    help: "More independent attempts, best one wins. Set to 1 for strict determinism benchmarking.",
    min: 1,
    max: 32,
    step: 1,
    integer: true,
  },
  enumField({
    kind: "enum",
    key: "coordinator",
    label: "Coordinator",
    help: "Algorithm that assigns the in-rank coordinate.",
    options: [
      { value: "brandes-kopf", label: "Brandes-Köpf" },
      { value: "simple", label: "Simple (rank-centred)" },
    ],
  }),
  enumField({
    kind: "enum",
    key: "bkAlign",
    label: "Brandes-Köpf alignment",
    help: "Which of the four candidate assignments is emitted.",
    options: [
      { value: "median", label: "Median" },
      { value: "leftmost", label: "Leftmost" },
      { value: "rightmost", label: "Rightmost" },
      { value: "up-left", label: "Up-left" },
      { value: "up-right", label: "Up-right" },
      { value: "down-left", label: "Down-left" },
      { value: "down-right", label: "Down-right" },
    ],
  }),
  {
    kind: "boolean",
    key: "dummyPriority",
    label: "Dummy priority",
    help: "Makes long-edge dummies reluctant to move, which keeps their chains straight.",
  },
  {
    kind: "number",
    key: "stressIterations",
    label: "Stress iterations",
    help: "More SGD epochs for the stress solver; positions settle further at the cost of time.",
    min: 1,
    max: 300,
    step: 1,
    integer: true,
  },
  {
    kind: "number",
    key: "stressIdealEdgeLength",
    label: "Stress ideal edge length",
    help: "Stretches the stress solver's drawing: one graph-distance unit maps to more pixels.",
    min: 20,
    max: 600,
    step: 10,
  },
  {
    kind: "number",
    key: "overlapRemovalPasses",
    label: "Overlap removal passes",
    help: "More passes pushing overlapping nodes apart after the stress solver converges.",
    min: 0,
    max: 32,
    step: 1,
    integer: true,
  },
];

const RADIAL_FIELDS: FieldSpec[] = [
  {
    kind: "number",
    key: "radialRingGap",
    label: "Ring gap",
    help: "Concentric rings sit further apart.",
    min: 20,
    max: 600,
    step: 10,
  },
  {
    kind: "text",
    key: "radialRoot",
    label: "Radial root",
    help: "Node id placed at the centre. Empty selects the highest-degree node.",
    placeholder: "highest-degree node",
  },
];

const BUDGET_FIELDS: FieldSpec[] = [
  {
    kind: "number",
    key: "timeBudgetMs",
    label: "Time budget (ms)",
    help: "Lets ordering keep sweeping for longer before it gives up.",
    min: 10,
    max: 5000,
    step: 10,
  },
  {
    kind: "number",
    key: "maxDummyChainLength",
    label: "Max dummy chain length",
    help: "Allows longer dummy chains before the pathological-span guard trips.",
    min: 1,
    max: 512,
    step: 1,
    integer: true,
  },
  {
    kind: "boolean",
    key: "assertConstraints",
    label: "Assert constraints",
    help: "Runs the Phase 9 invariant checks in release builds too; slower, but catches bugs.",
  },
  {
    kind: "number",
    key: "epsilon",
    label: "Epsilon",
    help: "Coarser floating-point comparison tolerance.",
    min: 0.0001,
    max: 0.01,
    step: 0.0001,
  },
];

export type SectionId = "layout" | "edges" | "labels" | "algorithms" | "radial" | "budgets";

export interface SettingsGroup {
  id: SectionId;
  title: string;
  subtitle: string;
  fields: FieldSpec[];
}

/**
 * The whole panel, in render order. Layout first because it answers "why does it look like that";
 * Budgets last because raising a safety rail never improves a drawing.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "layout",
    title: "Layout",
    subtitle: "Direction, spacing, and the shape of the drawing as a whole.",
    fields: LAYOUT_FIELDS,
  },
  {
    id: "edges",
    title: "Edges",
    subtitle: "How edges leave a node, where they run, and how they are drawn.",
    fields: EDGE_FIELDS,
  },
  {
    id: "labels",
    title: "Labels",
    subtitle: "Where an edge badge sits and how much text it may carry.",
    fields: LABEL_FIELDS,
  },
  {
    id: "algorithms",
    title: "Algorithms",
    subtitle: "Swap the algorithm a phase uses, for A/B comparison and debugging.",
    fields: ALGORITHM_FIELDS,
  },
  {
    id: "radial",
    title: "Radial",
    subtitle: "Only read by the radial engine.",
    fields: RADIAL_FIELDS,
  },
  {
    id: "budgets",
    title: "Budgets",
    subtitle: "Safety rails, not quality dials. Raising these does not improve a drawing.",
    fields: BUDGET_FIELDS,
  },
];
