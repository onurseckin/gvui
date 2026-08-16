import React, { useState } from "react";
import type { MacroStep } from "../../engine/macros/types";
import { useMacroStore } from "./useMacroStore";

export interface TimelineScrubberProps {
  steps: MacroStep[];
  currentStepIndex: number;
  onStepSelect?: (step: MacroStep, index: number) => void;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  steps,
  currentStepIndex,
  onStepSelect,
}) => {
  const toggleStepEnabled = useMacroStore((s) => s.toggleStepEnabled);
  const toggleStepBreakpoint = useMacroStore((s) => s.toggleStepBreakpoint);
  const deleteStep = useMacroStore((s) => s.deleteStep);
  const reorderSteps = useMacroStore((s) => s.reorderSteps);
  const jumpToStep = useMacroStore((s) => s.jumpToStep);

  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

  if (steps.length === 0) {
    return (
      <div style={{ padding: "16px", textAlign: "center", color: "#71717a", fontSize: "12px" }}>
        No steps in active script. Record actions on canvas or select a template.
      </div>
    );
  }

  return (
    <div className="macro-timeline-list" role="list" aria-label="Macro Steps Timeline">
      {steps.map((step, index) => {
        const isCurrent = index === currentStepIndex;
        const isCompleted = index < currentStepIndex;
        const isExpanded = expandedStepIndex === index;

        return (
          <div
            key={step.id}
            className={`macro-step-card ${isCurrent ? "active" : ""} ${isCompleted ? "completed" : ""} ${!step.enabled ? "disabled" : ""}`}
            role="listitem"
            data-testid={`macro-step-${index}`}
            onClick={() => {
              onStepSelect?.(step, index);
            }}
          >
            <div className="macro-step-info">
              <span className="macro-step-num">{index + 1}.</span>
              <span className="macro-step-type-badge">{step.type}</span>
              <span className="macro-step-label" title={step.description ?? step.label}>
                {step.label}
              </span>
            </div>

            <div className="macro-step-actions" onClick={(e) => e.stopPropagation()}>
              {/* Breakpoint toggle */}
              <button
                type="button"
                className={`macro-bp-btn ${step.breakpoint ? "active" : ""}`}
                title={step.breakpoint ? "Remove Breakpoint" : "Add Breakpoint"}
                aria-label={`Toggle Breakpoint on step ${index + 1}`}
                onClick={() => toggleStepBreakpoint(index)}
              >
                ●
              </button>

              {/* Move up */}
              <button
                type="button"
                className="macro-icon-btn"
                disabled={index === 0}
                title="Move Step Up"
                aria-label={`Move step ${index + 1} up`}
                onClick={() => reorderSteps(index, index - 1)}
              >
                ↑
              </button>

              {/* Move down */}
              <button
                type="button"
                className="macro-icon-btn"
                disabled={index === steps.length - 1}
                title="Move Step Down"
                aria-label={`Move step ${index + 1} down`}
                onClick={() => reorderSteps(index, index + 1)}
              >
                ↓
              </button>

              {/* Jump to this step */}
              <button
                type="button"
                className="macro-icon-btn"
                title="Jump Execution to this step"
                aria-label={`Jump to step ${index + 1}`}
                onClick={() => void jumpToStep(index)}
              >
                ▶
              </button>

              {/* Enable / Disable */}
              <input
                type="checkbox"
                checked={step.enabled}
                title={step.enabled ? "Disable Step" : "Enable Step"}
                aria-label={`Enable step ${index + 1}`}
                onChange={() => toggleStepEnabled(index)}
                style={{ cursor: "pointer" }}
              />

              {/* Inspect toggle */}
              <button
                type="button"
                className="macro-icon-btn"
                title="Inspect Payload"
                aria-label={`Inspect step ${index + 1} details`}
                onClick={() => setExpandedStepIndex(isExpanded ? null : index)}
              >
                {isExpanded ? "▲" : "▼"}
              </button>

              {/* Delete step */}
              <button
                type="button"
                className="macro-icon-btn"
                title="Delete Step"
                aria-label={`Delete step ${index + 1}`}
                onClick={() => deleteStep(index)}
                style={{ color: "#ef4444" }}
              >
                ✕
              </button>
            </div>

            {isExpanded && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  width: "100%",
                  marginTop: "6px",
                  padding: "6px 8px",
                  background: "#121214",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono, monospace)",
                  color: "#a1a1aa",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {step.description && (
                  <div style={{ marginBottom: "4px", color: "#e4e4e7" }}>{step.description}</div>
                )}
                <div>Payload: {JSON.stringify(step.payload, null, 2)}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
