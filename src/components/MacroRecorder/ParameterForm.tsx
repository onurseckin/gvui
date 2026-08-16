import React from "react";
import type { ParameterDefinition } from "../../engine/macros/types";
import { validateParameterValue } from "../../engine/macros/macroExecutor";
import { useMacroStore } from "./useMacroStore";

export interface ParameterFormProps {
  parameters: ParameterDefinition[];
}

export const ParameterForm: React.FC<ParameterFormProps> = ({ parameters }) => {
  const paramValues = useMacroStore((s) => s.paramValues);
  const setParameterValue = useMacroStore((s) => s.setParameterValue);
  const resetParameters = useMacroStore((s) => s.resetParameters);

  if (parameters.length === 0) {
    return (
      <div style={{ padding: "16px", textAlign: "center", color: "#71717a", fontSize: "12px" }}>
        This macro script has no parameters defined. You can run it directly.
      </div>
    );
  }

  return (
    <div className="macro-params-form" role="form" aria-label="Macro Parameters">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#a1a1aa",
          }}
        >
          Template Parameters
        </span>
        <button
          type="button"
          className="macro-ctrl-btn"
          onClick={resetParameters}
          style={{ padding: "3px 8px", fontSize: "11px" }}
        >
          Reset Defaults
        </button>
      </div>

      {parameters.map((def) => {
        const val = paramValues[def.name] !== undefined ? paramValues[def.name] : def.defaultValue;
        const validation = validateParameterValue(def, val);

        return (
          <div key={def.name} className="macro-param-row">
            <label className="macro-param-label" htmlFor={`param-${def.name}`}>
              <span>{def.label || def.name}</span>
              {def.required && <span style={{ color: "#ef4444" }}>*</span>}
              <span style={{ fontSize: "10px", color: "#71717a" }}>({def.type})</span>
            </label>

            {def.type === "boolean" ? (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <input
                  id={`param-${def.name}`}
                  type="checkbox"
                  checked={Boolean(val)}
                  onChange={(e) => setParameterValue(def.name, e.target.checked)}
                />
                <span>{val ? "Enabled" : "Disabled"}</span>
              </label>
            ) : def.type === "select" && def.options && def.options.length > 0 ? (
              <select
                id={`param-${def.name}`}
                className="macro-param-input"
                value={String(val ?? "")}
                onChange={(e) => setParameterValue(def.name, e.target.value)}
              >
                {def.options.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : def.type === "number" ? (
              <input
                id={`param-${def.name}`}
                type="number"
                className="macro-param-input"
                value={val !== undefined ? String(val) : ""}
                min={def.validation?.min}
                max={def.validation?.max}
                onChange={(e) => {
                  const parsed = e.target.value === "" ? "" : Number(e.target.value);
                  setParameterValue(def.name, parsed);
                }}
              />
            ) : (
              <input
                id={`param-${def.name}`}
                type="text"
                className="macro-param-input"
                value={val !== undefined ? String(val) : ""}
                placeholder={String(def.defaultValue ?? "")}
                onChange={(e) => setParameterValue(def.name, e.target.value)}
              />
            )}

            {def.description && <div className="macro-param-desc">{def.description}</div>}
            {!validation.valid && (
              <div style={{ color: "#f87171", fontSize: "10px" }}>{validation.error}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};
