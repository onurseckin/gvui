import type { FC, ReactNode } from "react";
import { useCallback, useState } from "react";
import { Select } from "../../../ui/atoms/Select";
import {
  DEFAULT_CUSTOM_LAYOUT_CONFIG,
  type CustomLayoutConfig,
} from "../../../engine/layout/custom/config";
import { describeLayoutMode } from "../../../ui/molecules/LayoutSelectDropdown/LayoutSelectDropdown.types";
import { useGraphStore, useLayoutConfig, useLayoutMode } from "../../../state/useGraphStore";
import { SETTINGS_GROUPS } from "./EngineOptionsPanel.fields";
import type { ConfigKey, EnumValue, FieldSpec, SectionId } from "./EngineOptionsPanel.fields";

interface FieldChange {
  <K extends ConfigKey>(key: K, value: CustomLayoutConfig[K]): void;
}

const CONFIG_KEYS = Object.keys(DEFAULT_CUSTOM_LAYOUT_CONFIG) as ConfigKey[];

/**
 * How many fields differ between two configs. Every `CustomLayoutConfig` value is a primitive, so
 * `!==` compares values rather than identity and no deep walk is needed.
 */
const countChangedFields = (a: CustomLayoutConfig, b: CustomLayoutConfig): number =>
  CONFIG_KEYS.reduce((total, key) => (a[key] === b[key] ? total : total + 1), 0);

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
      // A cleared or half-typed box ("", "-", "1e") is mid-edit, not a value. Apply hands the
      // staged config straight to the engine, which rejects out-of-range values by throwing — so
      // every value staged from here is clamped into the field's own range first.
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

/** Layout answers "why does it look like that"; everything else is a deliberate detour. */
const INITIAL_EXPANDED: Record<SectionId, boolean> = {
  layout: true,
  edges: false,
  labels: false,
  algorithms: false,
  radial: false,
  budgets: false,
};

export const EngineOptionsPanel: FC<EngineOptionsPanelProps> = ({ className = "" }) => {
  const appliedConfig = useLayoutConfig();
  const layoutMode = useLayoutMode();
  const setLayoutConfig = useGraphStore((state) => state.setLayoutConfig);

  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [expanded, setExpanded] = useState<Record<SectionId, boolean>>(INITIAL_EXPANDED);
  // Controls edit this copy; only Apply hands it to the store. Relayout is a whole-graph
  // recompute, so a live-bound panel re-ran it on every slider tick and every keystroke.
  const [staged, setStaged] = useState<CustomLayoutConfig>(appliedConfig);
  /** The applied config `staged` was last seeded from — the reference an outside write changes. */
  const [seed, setSeed] = useState<CustomLayoutConfig>(appliedConfig);

  if (seed !== appliedConfig) {
    // Someone outside the panel wrote the config (the toolbar's reset, a restored viewport), or we
    // just applied. Adopt it only while the panel is clean: re-seeding over unapplied edits would
    // discard work the user can no longer recover. Adjusting state during render rather than in an
    // effect keeps the controls from showing the superseded values for a commit.
    setSeed(appliedConfig);
    if (countChangedFields(staged, seed) === 0) setStaged(appliedConfig);
  }

  const changedCount = countChangedFields(staged, appliedConfig);
  const isDirty = changedCount > 0;

  const toggleSection = useCallback((id: SectionId) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleChange = useCallback<FieldChange>((key, value) => {
    setStaged((prev) => {
      const next: CustomLayoutConfig = { ...prev };
      // Each side of this write is independently typed by the same generic `key`, a relation
      // TS cannot express without collapsing the field union — the same bridge the resolver in
      // config.ts uses. It narrows nothing: `key`/`value` are already paired by the field spec.
      (next as Record<ConfigKey, unknown>)[key] = value;
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    // A copy, so the store never shares the object the next edit replaces.
    setLayoutConfig({ ...staged });
  }, [setLayoutConfig, staged]);

  const handleReset = useCallback(() => {
    // Same end state as the store's `resetLayoutConfig`, reached through Apply like every other
    // edit — so a mis-click is still recoverable until the user commits it.
    setStaged({ ...DEFAULT_CUSTOM_LAYOUT_CONFIG });
  }, []);

  return (
    <div className={`engine-options-panel-container ${className}`.trim()}>
      <div className="engine-options-bar">
        <button
          type="button"
          className="engine-options-toggle-btn"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          ⚙️ Settings {isOpen ? "▲" : "▼"}
          <span className="engine-mode-badge">{layoutMode}</span>
        </button>
        {/* In the bar, not the body: a collapsed panel must still admit it is holding edits. */}
        {isDirty && <span className="unapplied-badge">{changedCount} unapplied</span>}
        <span className="engine-options-mode-summary">{describeLayoutMode(layoutMode)}</span>
      </div>

      {isOpen && (
        <div className="engine-options-dropdown-content">
          <div className="engine-options-action-group">
            <button type="button" className="reset-options-btn" onClick={handleReset}>
              ↺ Reset to defaults
            </button>
            <button
              type="button"
              className={`apply-options-btn ${isDirty ? "dirty" : "applied"}`}
              disabled={!isDirty}
              onClick={handleApply}
            >
              {isDirty ? `Apply ${changedCount} change${changedCount === 1 ? "" : "s"}` : "Applied"}
            </button>
          </div>

          {SETTINGS_GROUPS.map((group) => (
            <OptionSection
              key={group.id}
              title={group.title}
              subtitle={group.subtitle}
              expanded={expanded[group.id]}
              onToggle={() => toggleSection(group.id)}
            >
              <FieldGrid fields={group.fields} config={staged} onChange={handleChange} />
            </OptionSection>
          ))}
        </div>
      )}
    </div>
  );
};
