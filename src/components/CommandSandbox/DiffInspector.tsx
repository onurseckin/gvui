/**
 * Stdout/Stderr & Expected Baseline Diff Inspector Component.
 * Supports side-by-side split and unified views with character-level difference highlighting.
 * 100% Zero-any type-safe implementation.
 */

import type { FC } from "react";
import type { DiffCharSpan, DiffLine, DiffStreamFilter } from "../../engine/sandbox/types";
import { useCommandSandboxStore } from "./useCommandSandboxStore";

export interface DiffInspectorProps {
  className?: string;
}

export const DiffInspector: FC<DiffInspectorProps> = ({ className = "" }) => {
  const recordedTrace = useCommandSandboxStore((state) => state.recordedTrace);
  const diffResult = useCommandSandboxStore((state) => state.diffResult);
  const diffFilter = useCommandSandboxStore((state) => state.diffFilter);
  const diffViewMode = useCommandSandboxStore((state) => state.diffViewMode);

  const setDiffFilter = useCommandSandboxStore((state) => state.setDiffFilter);
  const setDiffViewMode = useCommandSandboxStore((state) => state.setDiffViewMode);

  if (!recordedTrace || !recordedTrace.expectedBaseline) {
    return (
      <div className={`diff-inspector-view empty ${className}`}>
        <div className="diff-empty-notice">
          <h3>No Expected Baseline Configured</h3>
          <p>This execution trace does not have an expected baseline to compare against.</p>
        </div>
      </div>
    );
  }

  const baseline = recordedTrace.expectedBaseline;
  const summary = diffResult?.summary;
  const lines: DiffLine[] = diffResult?.lines ?? [];

  const isExact = summary?.isExactMatch ?? false;
  const similarity = summary?.similarityPercent ?? 0;

  const renderCharSpans = (spans?: DiffCharSpan[]) => {
    if (!spans || spans.length === 0) return null;
    return spans.map((span, idx) => {
      let spanClass = "char-span-unchanged";
      if (span.type === "added") spanClass = "char-span-added";
      else if (span.type === "removed") spanClass = "char-span-removed";

      return (
        <span key={`span-${idx}`} className={spanClass}>
          {span.text}
        </span>
      );
    });
  };

  return (
    <div className={`diff-inspector-view ${className}`}>
      {/* Diff Header Controls */}
      <div className="diff-header-panel">
        <div className="diff-title-group">
          <h3>Output vs Baseline Comparison</h3>
          <div className="diff-badges">
            <span className={`match-badge ${isExact ? "exact-match" : "mismatch"}`}>
              {isExact ? "✓ Exact Match (100%)" : `✗ Output Mismatch (${similarity}%)`}
            </span>
            <span className={`exit-match-badge ${summary?.exitCodeMatches ? "pass" : "fail"}`}>
              Exit Code: {recordedTrace.exitCode} (Actual) vs {baseline.exitCode} (Expected)
            </span>
          </div>
        </div>

        <div className="diff-controls-group">
          {/* View Mode Toggle */}
          <div className="segmented-control">
            <button
              type="button"
              className={`seg-btn ${diffViewMode === "split" ? "active" : ""}`}
              onClick={() => setDiffViewMode("split")}
            >
              Side-by-Side
            </button>
            <button
              type="button"
              className={`seg-btn ${diffViewMode === "unified" ? "active" : ""}`}
              onClick={() => setDiffViewMode("unified")}
            >
              Unified
            </button>
          </div>

          {/* Stream Filter */}
          <div className="stream-filter-group">
            <span className="filter-label">Stream:</span>
            {(["all", "stdout", "stderr"] as const).map((filter: DiffStreamFilter) => (
              <button
                key={`filter-${filter}`}
                type="button"
                className={`filter-btn ${diffFilter === filter ? "active" : ""}`}
                onClick={() => setDiffFilter(filter)}
              >
                {filter.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Metrics Banner */}
      {summary && (
        <div className="diff-summary-cards">
          <div className="summary-card">
            <span className="metric-num">{summary.unchangedLines}</span>
            <span className="metric-label">Unchanged</span>
          </div>
          <div className="summary-card added">
            <span className="metric-num">+{summary.addedLines}</span>
            <span className="metric-label">Added</span>
          </div>
          <div className="summary-card removed">
            <span className="metric-num">-{summary.removedLines}</span>
            <span className="metric-label">Removed</span>
          </div>
          <div className="summary-card modified">
            <span className="metric-num">~{summary.modifiedLines}</span>
            <span className="metric-label">Modified</span>
          </div>
          <div className="summary-card similarity">
            <span className="metric-num">{summary.similarityPercent}%</span>
            <span className="metric-label">Similarity</span>
          </div>
        </div>
      )}

      {/* Diff Content View */}
      <div className="diff-table-container">
        {diffViewMode === "unified" ? (
          /* Unified View */
          <div className="unified-diff-view" data-testid="unified-diff-view">
            {lines.length === 0 ? (
              <div className="diff-empty-state">No differences detected in selected stream.</div>
            ) : (
              lines.map((line) => (
                <div key={line.id} className={`diff-row unified-row type-${line.type}`}>
                  <span className="diff-gutter">
                    <span className="diff-line-num actual">{line.lineNumberActual ?? ""}</span>
                    <span className="diff-line-num expected">{line.lineNumberExpected ?? ""}</span>
                    <span className="diff-sign">
                      {line.type === "added"
                        ? "+"
                        : line.type === "removed"
                          ? "-"
                          : line.type === "modified"
                            ? "~"
                            : " "}
                    </span>
                  </span>
                  <span className="diff-content">
                    {line.type === "modified" ? (
                      <div className="modified-line-spans">
                        <div className="modified-actual">
                          - {renderCharSpans(line.spansActual) || line.contentActual}
                        </div>
                        <div className="modified-expected">
                          + {renderCharSpans(line.spansExpected) || line.contentExpected}
                        </div>
                      </div>
                    ) : line.type === "added" ? (
                      line.contentExpected
                    ) : (
                      line.contentActual
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Side-by-Side Split View */
          <div className="split-diff-view" data-testid="split-diff-view">
            <div className="split-diff-header">
              <div className="split-col-title actual">Actual Output (Replay)</div>
              <div className="split-col-title expected">Expected Baseline</div>
            </div>
            <div className="split-diff-body">
              {lines.length === 0 ? (
                <div className="diff-empty-state">No differences detected in selected stream.</div>
              ) : (
                lines.map((line) => (
                  <div key={line.id} className={`split-row type-${line.type}`}>
                    {/* Actual Side */}
                    <div className="split-cell actual-side">
                      <span className="split-line-num">{line.lineNumberActual ?? ""}</span>
                      <span className="split-line-text">
                        {line.type === "modified"
                          ? renderCharSpans(line.spansActual) || line.contentActual
                          : (line.contentActual ?? "")}
                      </span>
                    </div>

                    {/* Expected Side */}
                    <div className="split-cell expected-side">
                      <span className="split-line-num">{line.lineNumberExpected ?? ""}</span>
                      <span className="split-line-text">
                        {line.type === "modified"
                          ? renderCharSpans(line.spansExpected) || line.contentExpected
                          : (line.contentExpected ?? "")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
