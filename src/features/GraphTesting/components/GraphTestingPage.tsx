import type { FC } from "react";
import { useMemo, useState } from "react";
import {
  type LayoutDiagnostic,
  type NormalizedEdge,
  type NormalizedNode,
} from "../../../engine/layout/custom/types";
import { getDefaultMeasurer } from "../../../engine/layout/measurement";

import {
  pointsToSvgPath,
  renderPathWithCrossingBridges,
} from "../../../engine/layout/custom/svgPath";

import { Button, Select, Spinner } from "../../../ui";
import type { SelectOption } from "../../../ui";
import { DeveloperSettings } from "../../../components/DeveloperSettings";
import { CUSTOM_LAYOUT_SCENARIOS } from "../data/customLayoutScenarios";
import "../GraphTesting.css";
import type { TestScenario } from "../types";
import { CustomLayoutDebugOverlay, type DebugOptions } from "./CustomLayoutDebugOverlay";
import { CustomLayoutMetrics } from "./CustomLayoutMetrics";
import { LayoutErrorBoundary } from "./LayoutErrorBoundary";
import { useCustomLayoutWorker } from "../hooks/useCustomLayoutWorker";
import { EngineOptionsPanel } from "./EngineOptionsPanel";
import { type CustomLayoutConfig } from "../../../engine/layout/custom/config";
import { useLayoutConfig } from "../../../state/useGraphStore";

import { useNavigate } from "@tanstack/react-router";

type WorkspaceTab = "graph-testing" | "developer-settings";

interface GraphTestingPageProps {
  onBackToApp?: () => void;
}

/**
 * Breathing room added to the drawing extent when sizing the canvas stage. Arrow heads, badge
 * strokes and crossing markers are drawn centred on their geometry, so the raw extent alone clips
 * them by a few pixels.
 */
const CANVAS_STAGE_PADDING = 48;

export const GraphTestingPage: FC<GraphTestingPageProps> = ({ onBackToApp }) => {
  const navigate = useNavigate();
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("graph-testing");
  // Default to Scenario #20 (Full DevOps Microservice Mesh)
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(20);
  // Read from the store rather than holding a local copy: `EngineOptionsPanel` writes straight to
  // the store, so a local mirror here would silently ignore every settings change made on this
  // page.
  const appliedEngineConfig: CustomLayoutConfig = useLayoutConfig();
  const [debugOptions, setDebugOptions] = useState<DebugOptions>({
    showPorts: true,
    showBadges: true,
    showCrossings: true,
    showDiagnostics: true,
  });

  const activeScenario: TestScenario = useMemo(() => {
    return (
      CUSTOM_LAYOUT_SCENARIOS[selectedScenarioId] ??
      CUSTOM_LAYOUT_SCENARIOS[20] ?? { id: 20, title: "DevOps Mesh", nodes: [], edges: [] }
    );
  }, [selectedScenarioId]);

  const { normalizedNodes, normalizedEdges } = useMemo(() => {
    // Scenarios provide an explicit `w`/`h` per node — that's the "skips measurement" input path
    // documented in docs/engine/03-ingest-and-measurement.md Phase 0, so node sizing is
    // passed straight through. Edge labels have no such explicit box, so they go through the same
    // `MeasurementProvider` the production path uses (see `customLayoutAdapter.ts`'s
    // `buildEngineInputs`), keeping the playground's badge placement honest about the real font
    // metrics instead of leaving `labelWidth`/`labelHeight` undefined and letting the engine fall
    // back to a character-count estimate.
    const nodes: NormalizedNode[] = (activeScenario.nodes || []).map((n) => ({
      id: n.id,
      label: n.name,
      width: n.w,
      height: n.h,
    }));
    const measurer = getDefaultMeasurer();
    const edges: NormalizedEdge[] = (activeScenario.edges || []).map((e, idx) => {
      const labelBox = e.label
        ? measurer.measureLabel(e.label, {
            maxWidth: appliedEngineConfig.maxLabelWidth,
            maxLines: appliedEngineConfig.maxLabelLines,
          })
        : null;
      return {
        id: `e-${e.source}-${e.target}-${idx}`,
        source: e.source,
        target: e.target,
        label: e.label,
        isCycle: e.isCycle,
        layoutRole: e.layoutRole,
        labelWidth: labelBox?.width,
        labelHeight: labelBox?.height,
      };
    });
    return { normalizedNodes: nodes, normalizedEdges: edges };
  }, [activeScenario, appliedEngineConfig.maxLabelWidth, appliedEngineConfig.maxLabelLines]);

  const configSignature = useMemo(() => JSON.stringify(appliedEngineConfig), [appliedEngineConfig]);

  const {
    result: layoutResult,
    isCalculating,
    error,
    recalculate,
    resultGeneration,
  } = useCustomLayoutWorker({
    nodes: normalizedNodes,
    edges: normalizedEdges,
    inputKey: `scenario-${activeScenario.id}:${configSignature}`,
    configPartial: appliedEngineConfig,
    timeoutMs: 30_000,
  });

  const originalNodeMap = useMemo(() => {
    return new Map((activeScenario.nodes || []).map((n) => [n.id, n]));
  }, [activeScenario.nodes]);

  const originalEdgeMap = useMemo(() => {
    return new Map(normalizedEdges.map((e) => [e.id, e]));
  }, [normalizedEdges]);

  const renderedEdgePaths = useMemo(() => {
    if (!layoutResult) return [];
    const crossings = layoutResult.crossings || [];
    return (layoutResult.edges || []).map((routedPath) => {
      const origEdge = originalEdgeMap.get(routedPath.edgeId);
      const ownedCrossings = crossings
        .filter((c) => (c.bridgeOwnerEdgeId ?? c.edgeIdB) === routedPath.edgeId)
        .map((c) => c.point);
      const dPath = renderPathWithCrossingBridges(routedPath.points || [], ownedCrossings);
      return { routedPath, origEdge, dPath };
    });
  }, [layoutResult, originalEdgeMap]);

  const scenarioOptions = useMemo<SelectOption[]>(() => {
    return Object.values(CUSTOM_LAYOUT_SCENARIOS).map((scenario) => ({
      value: String(scenario.id),
      // Scenario titles already carry their own "N. " prefix; prepending the id unconditionally
      // would read as "3. 3. Fan-Out 8-Node Broadcaster".
      label: scenario.title.startsWith(`${scenario.id}.`)
        ? scenario.title
        : `${scenario.id}. ${scenario.title}`,
    }));
  }, []);

  const stageSize = useMemo(() => {
    // The SVG layer clips at its own box and the *page* — not the canvas — supplies vertical
    // scrolling now, so the stage has to cover every pixel the engine can draw: routed points and
    // leader lines reach past the node bounding box, and `boundingBox` is only the node extent.
    let maxX = 0;
    let maxY = 0;
    const grow = (x: number, y: number): void => {
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    for (const node of layoutResult?.nodes ?? []) grow(node.x + node.width, node.y + node.height);
    for (const routedPath of layoutResult?.edges ?? []) {
      for (const point of routedPath.points ?? []) grow(point.x, point.y);
    }
    for (const badge of layoutResult?.badges ?? []) {
      grow(badge.rect.x + badge.rect.width, badge.rect.y + badge.rect.height);
      for (const point of badge.leaderPoints ?? []) grow(point.x, point.y);
    }
    for (const crossing of layoutResult?.crossings ?? []) grow(crossing.point.x, crossing.point.y);
    const box = layoutResult?.boundingBox;
    if (box) grow(box.x + box.width, box.y + box.height);

    return { width: maxX + CANVAS_STAGE_PADDING, height: maxY + CANVAS_STAGE_PADDING };
  }, [layoutResult]);

  return (
    <div className="graph-testing-page-container">
      {/* Page Header: the tab switch is the page's only navigation between Graph Testing and
          Developer Settings, replacing what used to be a dedicated title/URL/badge readout that
          just restated where the page already was. */}
      <header className="graph-testing-page-header">
        <div className="workspace-tabs" role="tablist">
          <Button
            variant={activeWorkspaceTab === "graph-testing" ? "outline" : "ghost"}
            role="tab"
            aria-selected={activeWorkspaceTab === "graph-testing"}
            className="workspace-tab-btn"
            onClick={() => setActiveWorkspaceTab("graph-testing")}
          >
            Graph Testing
          </Button>
          <Button
            variant={activeWorkspaceTab === "developer-settings" ? "outline" : "ghost"}
            role="tab"
            aria-selected={activeWorkspaceTab === "developer-settings"}
            className="workspace-tab-btn"
            onClick={() => setActiveWorkspaceTab("developer-settings")}
          >
            Developer Settings
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={() => (onBackToApp ? onBackToApp() : void navigate({ to: "/" }))}
          className="back-to-app-btn"
        >
          ← Back to Graph App
        </Button>
      </header>

      {activeWorkspaceTab === "developer-settings" ? (
        <DeveloperSettings className="workspace-developer-settings" />
      ) : (
        <>
          {/* Everything below the header scrolls as one page: the canvas is too tall to fit a
              fixed shell, and clipping it is what hid the bottom of the larger scenarios. */}
          <div className="graph-testing-page-scroll">
            {error && layoutResult && (
              <div className="graph-layout-worker-warning" role="alert">
                <span>Layout worker failed: {error.message}</span>
                <button type="button" onClick={recalculate}>
                  Retry layout
                </button>
              </div>
            )}

            {/* Toolbar: Scenario Dropdown */}
            <div className="graph-testing-toolbar">
              <div className="graph-testing-toolbar-left">
                <span className="scenario-select-label">
                  Scenario ({selectedScenarioId}/{scenarioOptions.length}):
                </span>
                <Select
                  options={scenarioOptions}
                  value={String(selectedScenarioId)}
                  size="sm"
                  aria-label="Scenario"
                  className="scenario-select-trigger"
                  onValueChange={(next) => setSelectedScenarioId(Number(next))}
                />
              </div>
            </div>

            {!layoutResult ? (
              <div
                className={error ? "graph-layout-worker-warning" : "graph-layout-worker-loading"}
                role={error ? "alert" : "status"}
                aria-busy={isCalculating}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "1rem",
                  minHeight: "300px",
                }}
              >
                {error ? (
                  <>
                    <span>Layout worker failed: {error.message}</span>
                    <button type="button" onClick={recalculate}>
                      Retry layout
                    </button>
                  </>
                ) : isCalculating ? (
                  <Spinner size="lg" />
                ) : (
                  <span>Layout is unavailable.</span>
                )}
              </div>
            ) : (
              <>
                {isCalculating && (
                  <div
                    className="graph-layout-worker-loading"
                    role="status"
                    aria-busy="true"
                    style={{ position: "absolute", top: "1rem", right: "1rem", zIndex: 10 }}
                  >
                    <Spinner size="sm" />
                  </div>
                )}
                <LayoutErrorBoundary onRetry={recalculate} resultGeneration={resultGeneration}>
                  {/* Engine settings. The panel now reads and writes `useGraphStore` directly — there
                is no staged-then-applied copy, because v2 layout is fast enough (~2 ms) to
                recompute on every change. */}
                  <EngineOptionsPanel />

                  {/* Metrics Summary Panel */}
                  <div className="graph-testing-metrics-wrapper">
                    <CustomLayoutMetrics
                      layoutResult={layoutResult}
                      normalizedEdges={normalizedEdges}
                    />
                    <CustomLayoutDebugOverlay
                      layoutResult={layoutResult}
                      options={debugOptions}
                      onOptionsChange={setDebugOptions}
                    />
                  </div>

                  {/* Content Canvas */}
                  <div className="graph-testing-content single-panel">
                    <div className="testing-panel">
                      <div className="testing-panel-header">
                        <div className="testing-panel-title">
                          <span className="mode-tag mode-tag-a">Custom Layout Engine</span>
                          <span>{activeScenario.title}</span>
                        </div>
                        <div className="testing-stat-badge">
                          Nodes: {(layoutResult.nodes || []).length} | Edges:{" "}
                          {(layoutResult.edges || []).length} | Crossings:{" "}
                          {layoutResult.validation?.metrics?.crossings ?? 0} | Bends:{" "}
                          {layoutResult.validation?.metrics?.bendCount ?? 0} | Leaders:{" "}
                          {layoutResult.validation?.metrics?.leaderCount ?? 0} | Passes:{" "}
                          {layoutResult.optimizationStats?.globalPasses ?? 1} | Status:{" "}
                          <strong>{layoutResult.status}</strong>
                        </div>
                      </div>
                      <div className="testing-canvas-container">
                        {/* The stage is sized to the drawing, so the canvas only ever scrolls sideways
                      and a vertical wheel over it reaches the page scroller instead of dead-ending
                      in a nested viewport. */}
                        <div
                          className="testing-canvas-stage"
                          style={{ width: `${stageSize.width}px`, height: `${stageSize.height}px` }}
                        >
                          {/* Node Cards */}
                          {(layoutResult.nodes || []).map((node) => {
                            const origNode = originalNodeMap.get(node.id);
                            return (
                              <div
                                key={node.id}
                                className="testing-node-card"
                                style={{
                                  left: `${node.x}px`,
                                  top: `${node.y}px`,
                                  width: `${node.width}px`,
                                  height: `${node.height}px`,
                                }}
                              >
                                <div className="testing-node-title">
                                  {origNode?.name ?? node.label ?? node.id}
                                </div>
                                {origNode?.desc && (
                                  <div className="testing-node-desc">{origNode.desc}</div>
                                )}
                              </div>
                            );
                          })}

                          {/* SVG Layer */}
                          <svg className="testing-svg-layer">
                            <defs>
                              <marker
                                id="arrow-custom"
                                viewBox="0 0 10 10"
                                refX="8"
                                refY="5"
                                markerWidth="6"
                                markerHeight="6"
                                orient="auto-start-reverse"
                              >
                                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-color)" />
                              </marker>
                            </defs>

                            {/* Edge Routes */}
                            {renderedEdgePaths.map(({ routedPath, origEdge, dPath }) => (
                              <g key={`edge-group-${routedPath.edgeId}`}>
                                <path
                                  key={`edge-path-${routedPath.edgeId}`}
                                  d={dPath}
                                  stroke="var(--accent-color)"
                                  strokeWidth="2.5"
                                  fill="none"
                                  strokeDasharray={origEdge?.isCycle ? "5,5" : undefined}
                                  markerEnd="url(#arrow-custom)"
                                />

                                {/* Port Indicators */}
                                {debugOptions.showPorts &&
                                  routedPath.sourcePort &&
                                  routedPath.targetPort && (
                                    <>
                                      <circle
                                        cx={routedPath.sourcePort.point.x}
                                        cy={routedPath.sourcePort.point.y}
                                        r="3.5"
                                        fill="#10b981"
                                      />
                                      <line
                                        x1={routedPath.sourcePort.point.x}
                                        y1={routedPath.sourcePort.point.y}
                                        x2={routedPath.sourcePort.stub.x}
                                        y2={routedPath.sourcePort.stub.y}
                                        stroke="#10b981"
                                        strokeWidth="1.5"
                                        strokeDasharray="2,2"
                                      />
                                      <circle
                                        cx={routedPath.targetPort.point.x}
                                        cy={routedPath.targetPort.point.y}
                                        r="3.5"
                                        fill="#f43f5e"
                                      />
                                      <line
                                        x1={routedPath.targetPort.point.x}
                                        y1={routedPath.targetPort.point.y}
                                        x2={routedPath.targetPort.stub.x}
                                        y2={routedPath.targetPort.stub.y}
                                        stroke="#f43f5e"
                                        strokeWidth="1.5"
                                        strokeDasharray="2,2"
                                      />
                                    </>
                                  )}
                              </g>
                            ))}

                            {/* Crossings */}
                            {debugOptions.showCrossings &&
                              (layoutResult.crossings || []).map((c, i) => (
                                <circle
                                  key={`crossing-${c.edgeIdA}-${c.edgeIdB}-${i}`}
                                  cx={c.point.x}
                                  cy={c.point.y}
                                  r="5"
                                  fill="#f59e0b"
                                  stroke="#ffffff"
                                  strokeWidth="1.5"
                                />
                              ))}

                            {/* Diagnostic Geometry Highlights */}
                            {debugOptions.showDiagnostics &&
                              (
                                layoutResult.validation?.diagnostics as
                                  | Array<
                                      LayoutDiagnostic & {
                                        rect?: {
                                          x: number;
                                          y: number;
                                          width: number;
                                          height: number;
                                        };
                                        segment?: {
                                          a: { x: number; y: number };
                                          b: { x: number; y: number };
                                        };
                                        point?: { x: number; y: number };
                                      }
                                    >
                                  | undefined
                              )?.map((diag, i) => (
                                <g key={`diag-geom-${diag.code}-${i}`}>
                                  {diag.rect && (
                                    <rect
                                      x={diag.rect.x}
                                      y={diag.rect.y}
                                      width={diag.rect.width}
                                      height={diag.rect.height}
                                      fill="rgba(239, 68, 68, 0.15)"
                                      stroke="#ef4444"
                                      strokeWidth="2"
                                      strokeDasharray="4,4"
                                    />
                                  )}
                                  {diag.segment && (
                                    <line
                                      x1={diag.segment.a.x}
                                      y1={diag.segment.a.y}
                                      x2={diag.segment.b.x}
                                      y2={diag.segment.b.y}
                                      stroke="#ef4444"
                                      strokeWidth="3"
                                      strokeDasharray="4,2"
                                    />
                                  )}
                                  {diag.point && (
                                    <circle
                                      cx={diag.point.x}
                                      cy={diag.point.y}
                                      r="6"
                                      fill="#ef4444"
                                      stroke="#ffffff"
                                      strokeWidth="2"
                                    />
                                  )}
                                </g>
                              ))}

                            {/* Badges */}
                            {debugOptions.showBadges &&
                              (layoutResult.badges || []).map((badge) => {
                                const badgeCenterX = badge.rect.x + badge.rect.width / 2;
                                const badgeCenterY = badge.rect.y + badge.rect.height / 2;
                                const hasLeader =
                                  badge.anchorPoint &&
                                  Math.hypot(
                                    badge.anchorPoint.x - badgeCenterX,
                                    badge.anchorPoint.y - badgeCenterY,
                                  ) > 4;

                                return (
                                  <g key={`badge-${badge.edgeId}-${badge.label}`}>
                                    {badge.leaderPoints && badge.leaderPoints.length >= 2 ? (
                                      <path
                                        d={pointsToSvgPath(badge.leaderPoints)}
                                        stroke="var(--accent-color)"
                                        strokeWidth="1"
                                        strokeDasharray="3,3"
                                        fill="none"
                                      />
                                    ) : (
                                      hasLeader && (
                                        <line
                                          x1={badge.anchorPoint.x}
                                          y1={badge.anchorPoint.y}
                                          x2={badgeCenterX}
                                          y2={badgeCenterY}
                                          stroke="var(--accent-color)"
                                          strokeWidth="1"
                                          strokeDasharray="3,3"
                                        />
                                      )
                                    )}
                                    <rect
                                      x={badge.rect.x}
                                      y={badge.rect.y}
                                      width={badge.rect.width}
                                      height={badge.rect.height}
                                      rx={6}
                                      fill="#09090b"
                                      stroke="var(--accent-color)"
                                      strokeWidth="1.5"
                                    />
                                    <text
                                      x={badgeCenterX}
                                      y={badgeCenterY + 4}
                                      textAnchor="middle"
                                      fill="#ffffff"
                                      fontSize="11"
                                      fontWeight="600"
                                    >
                                      {badge.label}
                                    </text>
                                  </g>
                                );
                              })}
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </LayoutErrorBoundary>
              </>
            )}
          </div>

          {/* Footer */}
          <footer className="graph-testing-page-footer">
            📌 <strong>Graph Layout Laboratory:</strong> Connected to{" "}
            <code>computeCustomLayout</code>. Scenarios #1 through #{scenarioOptions.length} powered
            by the custom layered layout & orthogonal edge router.
          </footer>
        </>
      )}
    </div>
  );
};
