import type { FC } from "react";
import React, { useCallback, useMemo, useState } from "react";
import { useGraphFilesStore } from "../../state/useGraphFilesStore";
import { Button } from "../../ui";

export interface RunComparisonSelectorProps {
  runs?: string[];
  baseRun?: string | null;
  targetRun?: string | null;
  onBaseRunChange?: (runId: string) => void;
  onTargetRunChange?: (runId: string) => void;
  onCompare?: (baseRun: string, targetRun: string) => void;
  onSwap?: () => void;
  disabled?: boolean;
  className?: string;
}

export const RunComparisonSelector: FC<RunComparisonSelectorProps> = React.memo(
  function RunComparisonSelector({
    runs: propRuns,
    baseRun: propBaseRun,
    targetRun: propTargetRun,
    onBaseRunChange,
    onTargetRunChange,
    onCompare,
    onSwap,
    disabled = false,
    className = "",
  }) {
    const storeFiles = useGraphFilesStore((state) => state.files);
    const availableRuns = useMemo(() => {
      return propRuns ?? storeFiles;
    }, [propRuns, storeFiles]);

    const [internalBaseRun, setInternalBaseRun] = useState<string>(
      propBaseRun ?? availableRuns[0] ?? "",
    );
    const [internalTargetRun, setInternalTargetRun] = useState<string>(
      propTargetRun ?? availableRuns[1] ?? availableRuns[0] ?? "",
    );

    const activeBaseRun = propBaseRun !== undefined ? (propBaseRun ?? "") : internalBaseRun;
    const activeTargetRun = propTargetRun !== undefined ? (propTargetRun ?? "") : internalTargetRun;

    const handleBaseChange = useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setInternalBaseRun(val);
        onBaseRunChange?.(val);
      },
      [onBaseRunChange],
    );

    const handleTargetChange = useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setInternalTargetRun(val);
        onTargetRunChange?.(val);
      },
      [onTargetRunChange],
    );

    const handleSwap = useCallback(() => {
      if (onSwap) {
        onSwap();
      } else {
        const temp = activeBaseRun;
        setInternalBaseRun(activeTargetRun);
        setInternalTargetRun(temp);
        onBaseRunChange?.(activeTargetRun);
        onTargetRunChange?.(temp);
      }
    }, [activeBaseRun, activeTargetRun, onBaseRunChange, onTargetRunChange, onSwap]);

    const handleCompareClick = useCallback(() => {
      if (activeBaseRun && activeTargetRun && onCompare) {
        onCompare(activeBaseRun, activeTargetRun);
      }
    }, [activeBaseRun, activeTargetRun, onCompare]);

    const isSameRun = Boolean(
      activeBaseRun && activeTargetRun && activeBaseRun === activeTargetRun,
    );
    const hasInsufficientRuns = availableRuns.length < 2;
    const canCompare = Boolean(activeBaseRun && activeTargetRun && !disabled);

    return (
      <div
        className={`run-comparison-selector ${className}`.trim()}
        data-testid="run-comparison-selector"
      >
        <div className="run-comparison-header">
          <span className="run-comparison-title">Multi-Run Comparison</span>
          {availableRuns.length > 0 && (
            <span className="run-comparison-count" data-testid="run-count-badge">
              {availableRuns.length} runs
            </span>
          )}
        </div>

        {availableRuns.length === 0 ? (
          <div className="run-comparison-empty" data-testid="no-runs-message">
            No execution runs available to compare.
          </div>
        ) : (
          <div className="run-comparison-form">
            <div className="run-select-group">
              <label
                htmlFor="base-run-select"
                className="run-select-label"
                data-testid="base-run-label"
              >
                <span className="run-label-indicator run-label-indicator--base">A</span>
                Baseline Run:
              </label>
              <div className="run-select-wrapper">
                <select
                  id="base-run-select"
                  data-testid="base-run-select"
                  className="run-select-input"
                  value={activeBaseRun}
                  onChange={handleBaseChange}
                  disabled={disabled || availableRuns.length === 0}
                  aria-label="Baseline Run (A)"
                >
                  {availableRuns.length === 0 && <option value="">No runs available</option>}
                  {availableRuns.map((run) => (
                    <option key={`base-${run}`} value={run}>
                      {run}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="run-swap-row">
              <button
                type="button"
                className="run-swap-button"
                onClick={handleSwap}
                disabled={disabled || hasInsufficientRuns}
                data-testid="swap-runs-btn"
                title="Swap baseline and candidate runs"
                aria-label="Swap baseline and candidate runs"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 16V4M7 4L3 8M7 4L11 8" />
                  <path d="M17 8V20M17 20L21 16M17 20L13 16" />
                </svg>
              </button>
            </div>

            <div className="run-select-group">
              <label
                htmlFor="target-run-select"
                className="run-select-label"
                data-testid="target-run-label"
              >
                <span className="run-label-indicator run-label-indicator--target">B</span>
                Candidate Run:
              </label>
              <div className="run-select-wrapper">
                <select
                  id="target-run-select"
                  data-testid="target-run-select"
                  className="run-select-input"
                  value={activeTargetRun}
                  onChange={handleTargetChange}
                  disabled={disabled || availableRuns.length === 0}
                  aria-label="Candidate Run (B)"
                >
                  {availableRuns.length === 0 && <option value="">No runs available</option>}
                  {availableRuns.map((run) => (
                    <option key={`target-${run}`} value={run}>
                      {run}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isSameRun && (
              <div className="run-comparison-warning" data-testid="same-run-warning">
                Notice: Comparing run against itself (identical baseline & candidate).
              </div>
            )}

            {hasInsufficientRuns && (
              <div className="run-comparison-notice" data-testid="insufficient-runs-notice">
                Select or upload additional runs to see cross-run diffs.
              </div>
            )}

            {onCompare && (
              <Button
                variant="primary"
                size="sm"
                className="run-compare-action-btn"
                onClick={handleCompareClick}
                disabled={!canCompare}
                data-testid="compare-runs-btn"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginRight: 6 }}
                >
                  <path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7" />
                </svg>
                Compare Runs
              </Button>
            )}
          </div>
        )}
      </div>
    );
  },
);

export default RunComparisonSelector;
