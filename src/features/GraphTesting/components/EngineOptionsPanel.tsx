import type { FC, ReactNode } from "react";
import { useCallback, useState } from "react";
import { Select, type SelectOption } from "../../../ui/atoms/Select";
import {
  LAYOUT_PRESETS,
  type CustomLayoutConfig,
  type LayoutPresetName,
} from "../../../engine/layout/custom/config";
import { describeLayoutMode } from "../../../ui/molecules/LayoutSelectDropdown/LayoutSelectDropdown.types";
import {
  useGraphStore,
  useLayoutConfig,
  useLayoutMode,
  useLayoutPreset,
} from "../../../state/useGraphStore";

type ConfigKey = keyof CustomLayoutConfig;

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

type EnumValue = CustomLayoutConfig[EnumKey];

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

type FieldSpec = NumberFieldSpec | BooleanFieldSpec | TextFieldSpec | EnumFieldSpec;

/**
 * Identity helper that pins `K` to the literal key, so the option list is checked against that
 * field's own union: a stray `"splines"` in `edgeStyle` is a compile error, not a runtime no-op.
 */
const enumField = <K extends EnumKey>(spec: EnumFieldSpecFor<K>): EnumFieldSpecFor<K> => spec;

// -------------------------------------------------------------------------------------------
// Tier 1 — Aesthetics
// -------------------------------------------------------------------------------------------

const TIER1_FIELDS: FieldSpec[] = [
  enumField({
    kind: "enum",
    key: "direction",
    label: "Direction",
    help: "Primary flow direction of the ranks.",
    options: [
      { value: "top-down", label: "Top-down" },
      { value: "bottom-up", label: "Bottom-up" },
      { value: "left-right", label: "Left-to-right" },
      { value: "right-left", label: "Right-to-left" },
    ],
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
    key: "cornerRadius",
    label: "Corner radius",
    help: "Rounder bends. 0 gives sharp corners.",
    min: 0,
    max: 40,
    step: 1,
  },
  enumField({
    kind: "enum",
    key: "edgeStyle",
    label: "Edge style",
    help: "How edge polylines are rendered.",
    options: [
      { value: "orthogonal", label: "Orthogonal" },
      { value: "rounded", label: "Rounded" },
      { value: "spline", label: "Spline" },
      { value: "straight", label: "Straight" },
    ],
  }),
  enumField({
    kind: "enum",
    key: "labelPlacement",
    label: "Label placement",
    help: "Where an edge badge sits relative to its edge.",
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
    kind: "boolean",
    key: "bundleParallelEdges",
    label: "Bundle parallel edges",
    help: "Routes every edge between the same node pair as one bus.",
  },
  enumField({
    kind: "enum",
    key: "compaction",
    label: "Compaction",
    help: "Spacing preset multiplier applied over the whole gap family.",
    options: [
      { value: "tight", label: "Tight" },
      { value: "balanced", label: "Balanced" },
      { value: "airy", label: "Airy" },
    ],
  }),
  {
    kind: "number",
    key: "zoomSensitivity",
    label: "Zoom sensitivity",
    help: "Sharper viewport wheel and pinch response. Carried for the renderer, unused by layout.",
    min: 0.1,
    max: 3,
    step: 0.05,
  },
];

// -------------------------------------------------------------------------------------------
// Tier 2 — Algorithms
// -------------------------------------------------------------------------------------------

const TIER2_CORE_FIELDS: FieldSpec[] = [
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
];

const TIER2_ORGANIC_FIELDS: FieldSpec[] = [
  {
    kind: "number",
    key: "stressIterations",
    label: "Stress iterations",
    help: "More SGD epochs; organic positions settle further at the cost of time.",
    min: 1,
    max: 300,
    step: 1,
    integer: true,
  },
  {
    kind: "number",
    key: "stressIdealEdgeLength",
    label: "Ideal edge length",
    help: "Stretches the drawing: one graph-distance unit maps to more pixels.",
    min: 20,
    max: 600,
    step: 10,
  },
  {
    kind: "number",
    key: "overlapRemovalPasses",
    label: "Overlap removal passes",
    help: "More passes pushing overlapping nodes apart after stress converges.",
    min: 0,
    max: 32,
    step: 1,
    integer: true,
  },
];

const TIER2_RADIAL_FIELDS: FieldSpec[] = [
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

// -------------------------------------------------------------------------------------------
// Tier 3 — Budgets
// -------------------------------------------------------------------------------------------

const TIER3_FIELDS: FieldSpec[] = [
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

const PRESET_BUTTONS: { name: LayoutPresetName; label: string }[] = [
  { name: "compact", label: "Compact" },
  { name: "readable", label: "Readable" },
  { name: "presentation", label: "Presentation" },
  { name: "dense-mesh", label: "Dense mesh" },
];

interface FieldChange {
  <K extends ConfigKey>(key: K, value: CustomLayoutConfig[K]): void;
}

interface FieldRowProps {
  spec: FieldSpec;
  config: CustomLayoutConfig;
  onChange: FieldChange;
}

const FieldRow: FC<FieldRowProps> = ({ spec, config, onChange }) => {
  const controlId = `engine-cfg-${spec.key}`;
  const helpId = `${controlId}-help`;

  const help = (
    <p className="option-field-help" id={helpId}>
      {spec.help}
    </p>
  );

  if (spec.kind === "number") {
    const value = config[spec.key];
    const commit = (raw: string) => {
      const trimmed = raw.trim();
      // A cleared or half-typed box ("", "-", "1e") is mid-edit, not a value. The store feeds the
      // engine directly, and the engine rejects out-of-range values by throwing — so every write
      // from here is clamped into the field's own range first.
      if (trimmed === "") return;
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return;
      let next = Math.min(spec.max, Math.max(spec.min, parsed));
      if (spec.integer) next = Math.round(next);
      // Cross-field rule the engine validates: maxNodeWidth >= minNodeWidth. Enforced while
      // dragging so the pair is never transiently invalid.
      if (spec.key === "minNodeWidth") next = Math.min(next, config.maxNodeWidth);
      if (spec.key === "maxNodeWidth") next = Math.max(next, config.minNodeWidth);
      onChange(spec.key, next);
    };

    return (
      <div className="option-field">
        <label className="option-field-label" htmlFor={controlId}>
          {spec.label}
        </label>
        <div className="option-controls-row">
          <input
            id={controlId}
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={value}
            aria-describedby={helpId}
            onChange={(e) => commit(e.target.value)}
          />
          <input
            type="number"
            className="option-custom-input"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={value}
            aria-label={`${spec.label} value`}
            aria-describedby={helpId}
            onChange={(e) => commit(e.target.value)}
          />
        </div>
        {help}
      </div>
    );
  }

  if (spec.kind === "boolean") {
    return (
      <div className="option-field">
        <div className="option-check-row">
          <input
            id={controlId}
            type="checkbox"
            className="option-checkbox"
            checked={config[spec.key]}
            aria-describedby={helpId}
            onChange={(e) => onChange(spec.key, e.target.checked)}
          />
          <label className="option-field-label" htmlFor={controlId}>
            {spec.label}
          </label>
        </div>
        {help}
      </div>
    );
  }

  if (spec.kind === "text") {
    return (
      <div className="option-field">
        <label className="option-field-label" htmlFor={controlId}>
          {spec.label}
        </label>
        <input
          id={controlId}
          type="text"
          className="option-text-input"
          value={config[spec.key]}
          placeholder={spec.placeholder}
          aria-describedby={helpId}
          onChange={(e) => onChange(spec.key, e.target.value)}
        />
        {help}
      </div>
    );
  }

  return (
    <div className="option-field">
      <span className="option-field-label" id={`${controlId}-label`}>
        {spec.label}
      </span>
      <Select<EnumValue>
        options={spec.options}
        value={config[spec.key]}
        size="sm"
        aria-label={spec.label}
        onValueChange={(next) => onChange(spec.key, next)}
      />
      {help}
    </div>
  );
};

interface OptionSectionProps {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const OptionSection: FC<OptionSectionProps> = ({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}) => (
  <section className="engine-section">
    <button
      type="button"
      className="engine-section-header"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span className="engine-section-title">{title}</span>
      <span className="engine-section-subtitle">{subtitle}</span>
      <span className="engine-section-chevron">{expanded ? "▲" : "▼"}</span>
    </button>
    {expanded && <div className="engine-section-body">{children}</div>}
  </section>
);

const FieldGrid: FC<{ fields: FieldSpec[]; config: CustomLayoutConfig; onChange: FieldChange }> = ({
  fields,
  config,
  onChange,
}) => (
  <div className="engine-field-grid">
    {fields.map((spec) => (
      <FieldRow key={spec.key} spec={spec} config={config} onChange={onChange} />
    ))}
  </div>
);

export interface EngineOptionsPanelProps {
  className?: string;
}

type SectionId = "aesthetics" | "algorithms" | "budgets";

export const EngineOptionsPanel: FC<EngineOptionsPanelProps> = ({ className = "" }) => {
  const config = useLayoutConfig();
  const layoutMode = useLayoutMode();
  const layoutPreset = useLayoutPreset();
  const setLayoutConfig = useGraphStore((state) => state.setLayoutConfig);
  const resetLayoutConfig = useGraphStore((state) => state.resetLayoutConfig);
  const applyPreset = useGraphStore((state) => state.applyPreset);

  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [expanded, setExpanded] = useState<Record<SectionId, boolean>>({
    aesthetics: true,
    algorithms: false,
    budgets: false,
  });

  const toggleSection = useCallback((id: SectionId) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleChange = useCallback<FieldChange>(
    (key, value) => {
      setLayoutConfig((prev) => {
        const next: CustomLayoutConfig = { ...prev };
        // Each side of this write is independently typed by the same generic `key`, a relation
        // TS cannot express without collapsing the field union — the same bridge the resolver in
        // config.ts uses. It narrows nothing: `key`/`value` are already paired by the field spec.
        (next as Record<ConfigKey, unknown>)[key] = value;
        return next;
      });
    },
    [setLayoutConfig],
  );

  return (
    <div className={`engine-options-panel-container ${className}`.trim()}>
      <div className="engine-options-bar">
        <button
          type="button"
          className="engine-options-toggle-btn"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          ⚙️ Engine options {isOpen ? "▲" : "▼"}
          <span className="engine-mode-badge">{layoutMode}</span>
        </button>
        <span className="engine-options-mode-summary">{describeLayoutMode(layoutMode)}</span>
      </div>

      {isOpen && (
        <div className="engine-options-dropdown-content">
          <div className="engine-preset-row">
            <span className="engine-preset-label">Preset</span>
            {PRESET_BUTTONS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className={`engine-preset-btn ${layoutPreset === preset.name ? "is-active" : ""}`.trim()}
                aria-pressed={layoutPreset === preset.name}
                title={Object.keys(LAYOUT_PRESETS[preset.name]).join(", ") || "engine defaults"}
                onClick={() => applyPreset(preset.name)}
              >
                {preset.label}
              </button>
            ))}
            <button type="button" className="reset-options-btn" onClick={resetLayoutConfig}>
              ↺ Reset to defaults
            </button>
          </div>

          <OptionSection
            title="Tier 1 · Aesthetics"
            subtitle="Monotone knobs. Turning one up always does more of the same thing."
            expanded={expanded.aesthetics}
            onToggle={() => toggleSection("aesthetics")}
          >
            <FieldGrid fields={TIER1_FIELDS} config={config} onChange={handleChange} />
          </OptionSection>

          <OptionSection
            title="Tier 2 · Algorithms"
            subtitle="Swap the algorithm a phase uses, for A/B comparison and debugging."
            expanded={expanded.algorithms}
            onToggle={() => toggleSection("algorithms")}
          >
            <FieldGrid fields={TIER2_CORE_FIELDS} config={config} onChange={handleChange} />

            {layoutMode === "organic" && (
              <>
                <h5 className="engine-subgroup-title">Organic (stress)</h5>
                <FieldGrid fields={TIER2_ORGANIC_FIELDS} config={config} onChange={handleChange} />
              </>
            )}

            {layoutMode === "radial" && (
              <>
                <h5 className="engine-subgroup-title">Radial</h5>
                <FieldGrid fields={TIER2_RADIAL_FIELDS} config={config} onChange={handleChange} />
              </>
            )}
          </OptionSection>

          <OptionSection
            title="Tier 3 · Budgets"
            subtitle="Safety rails, not quality dials. Raising these does not improve a drawing."
            expanded={expanded.budgets}
            onToggle={() => toggleSection("budgets")}
          >
            <FieldGrid fields={TIER3_FIELDS} config={config} onChange={handleChange} />
          </OptionSection>
        </div>
      )}
    </div>
  );
};
