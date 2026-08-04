import type { FC, ReactNode } from "react";
import { useCallback, useState } from "react";
import { Select } from "../../../ui/atoms/Select";
import type { CustomLayoutConfig } from "../../../engine/layout/custom/config";
import { describeLayoutMode } from "../../../ui/molecules/LayoutSelectDropdown/LayoutSelectDropdown.types";
import { useGraphStore, useLayoutConfig, useLayoutMode } from "../../../state/useGraphStore";
import { SETTINGS_GROUPS } from "./EngineOptionsPanel.fields";
import type { ConfigKey, EnumValue, FieldSpec, SectionId } from "./EngineOptionsPanel.fields";

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
  const config = useLayoutConfig();
  const layoutMode = useLayoutMode();
  const setLayoutConfig = useGraphStore((state) => state.setLayoutConfig);
  const resetLayoutConfig = useGraphStore((state) => state.resetLayoutConfig);

  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [expanded, setExpanded] = useState<Record<SectionId, boolean>>(INITIAL_EXPANDED);

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
          ⚙️ Settings {isOpen ? "▲" : "▼"}
          <span className="engine-mode-badge">{layoutMode}</span>
        </button>
        <span className="engine-options-mode-summary">{describeLayoutMode(layoutMode)}</span>
      </div>

      {isOpen && (
        <div className="engine-options-dropdown-content">
          <div className="engine-options-action-group">
            <button type="button" className="reset-options-btn" onClick={resetLayoutConfig}>
              ↺ Reset to defaults
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
              <FieldGrid fields={group.fields} config={config} onChange={handleChange} />
            </OptionSection>
          ))}
        </div>
      )}
    </div>
  );
};
