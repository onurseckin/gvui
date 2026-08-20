import { IconBrowser, IconCheck, IconClock, IconDeviceDesktop, IconX } from "@tabler/icons-react";
import type { FC, ReactNode } from "react";
import { memo } from "react";
import { DrawerSection } from "../DrawerSection";
import { EvidenceChip, UnknownValue } from "../EvidenceChip";
import type { BrowserRunRow, BrowserRunViewportRow } from "../nodeSchema";

export interface BrowserRunsSectionProps {
  runs: readonly BrowserRunRow[];
}

/** One labelled fact of a run: the value with its provenance, or an explicit unknown. */
const RunMetric: FC<{ label: string; run: BrowserRunRow; field: string; children?: ReactNode }> = ({
  label,
  run,
  field,
  children,
}) => (
  <div className="drawer-metric">
    <span className="drawer-metric-label">{label}</span>
    <span className="drawer-metric-value">
      {children === undefined ? (
        <UnknownValue what={label} />
      ) : (
        <>
          {children}
          <EvidenceChip evidenceClass={run.evidence[field]} />
        </>
      )}
    </span>
  </div>
);

function viewportText(viewport: BrowserRunViewportRow): string {
  return `${viewport.width} × ${viewport.height}`;
}

const StatusPill: FC<{ run: BrowserRunRow }> = ({ run }) => {
  if (run.status === undefined) {
    return (
      <span className="drawer-status-pill drawer-status-pill--unknown">
        <UnknownValue what="Run outcome" />
      </span>
    );
  }
  const variant =
    run.status === "passed"
      ? "drawer-status-pill--success"
      : run.status === "timedOut"
        ? "drawer-status-pill--warn"
        : "drawer-status-pill--error";
  const icon =
    run.status === "passed" ? (
      <IconCheck size={12} />
    ) : run.status === "timedOut" ? (
      <IconClock size={12} />
    ) : (
      <IconX size={12} />
    );
  return (
    <span className={`drawer-status-pill ${variant}`}>
      {icon} {run.status}
      <EvidenceChip evidenceClass={run.evidence.status} />
    </span>
  );
};

const ArtifactList: FC<{ label: string; testId: string; paths: readonly string[] }> = ({
  label,
  testId,
  paths,
}) =>
  paths.length > 0 ? (
    <div className="drawer-browser-run-artifacts" data-testid={testId}>
      <span className="drawer-metric-label">{label}</span>
      <div className="drawer-chip-wrap">
        {paths.map((path) => (
          <code key={path} className="drawer-chip">
            {path}
          </code>
        ))}
      </div>
    </div>
  ) : null;

/**
 * The browser runs a node owns. The harness measured the clock and the exit status; the runner
 * reported the browser, viewport and artefacts, and each field carries the label that says which.
 * A node with no recorded run renders nothing at all rather than an empty card.
 */
export const BrowserRunsSection: FC<BrowserRunsSectionProps> = memo(function BrowserRunsSection({
  runs,
}) {
  if (runs.length === 0) return null;

  return (
    <DrawerSection title="Browser Test Runs" count={runs.length}>
      {runs.map((run, index) => (
        <div
          className="drawer-browser-run-card"
          data-testid="browser-run-card"
          key={run.commandId ?? `browser-run-${index}`}
        >
          <div className="drawer-browser-run-header">
            <span className="drawer-browser-run-icon">
              <IconBrowser size={16} />
            </span>
            <span className="drawer-browser-run-title">
              {run.testFile ?? <UnknownValue what="Test file" />}
            </span>
            <StatusPill run={run} />
          </div>

          <div className="drawer-browser-run-meta-grid">
            <RunMetric label="Runner" run={run} field="runner">
              {run.runner}
            </RunMetric>
            <RunMetric label="Engine" run={run} field="browser">
              {run.browser}
            </RunMetric>
            <RunMetric label="Viewport" run={run} field={run.viewport ? "viewport" : "viewports"}>
              {run.viewport ? (
                <>
                  <IconDeviceDesktop size={12} className="drawer-metric-icon" />
                  {viewportText(run.viewport)}
                </>
              ) : run.viewports.length > 0 ? (
                run.viewports
                  .map((viewport) =>
                    viewport.name
                      ? `${viewport.name} ${viewportText(viewport)}`
                      : viewportText(viewport),
                  )
                  .join(", ")
              ) : undefined}
            </RunMetric>
            <RunMetric label="Duration" run={run} field="durationMs">
              {run.durationMs === undefined ? undefined : (
                <>
                  <IconClock size={12} className="drawer-metric-icon" />
                  {(run.durationMs / 1000).toFixed(2)}s
                </>
              )}
            </RunMetric>
          </div>

          <ArtifactList label="Traces" testId="browser-run-traces" paths={run.traces} />
          <ArtifactList label="Videos" testId="browser-run-videos" paths={run.videos} />

          {run.reportPath ? (
            <div className="drawer-browser-run-artifacts" data-testid="browser-run-report">
              <span className="drawer-metric-label">Report</span>
              <code className="drawer-chip">{run.reportPath}</code>
            </div>
          ) : null}
        </div>
      ))}
    </DrawerSection>
  );
});
