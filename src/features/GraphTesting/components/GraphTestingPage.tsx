import type { FC } from "react";
import { useMemo, useState } from "react";
import {
  computeCustomLayout,
  type CustomLayoutResult,
  type ExtendedLayoutDiagnostic,
  type NormalizedEdge,
  type NormalizedNode,
} from "../../../engine/layout/custom";
import {
  pointsToSvgPath,
  renderPathWithCrossingBridges,
} from "../../../engine/layout/custom/svgPath";
import { Button } from "../../../ui";
import { CUSTOM_LAYOUT_SCENARIOS } from "../data/customLayoutScenarios";
import "../GraphTesting.css";
import type { TestScenario } from "../types";
import { CustomLayoutDebugOverlay, type DebugOptions } from "./CustomLayoutDebugOverlay";
import { CustomLayoutMetrics } from "./CustomLayoutMetrics";

interface GraphTestingPageProps {
  onBackToApp: () => void;
}

export const GraphTestingPage: FC<GraphTestingPageProps> = ({ onBackToApp }) => {
  // Default to Scenario #20 (Full DevOps Microservice Mesh)
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(20);
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
    const nodes: NormalizedNode[] = (activeScenario.nodes || []).map((n) => ({
      id: n.id,
      label: n.name,
      width: n.w,
      height: n.h,
    }));
    const edges: NormalizedEdge[] = (activeScenario.edges || []).map((e, idx) => ({
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
      layoutRole: e.layoutRole,
    }));
    return { normalizedNodes: nodes, normalizedEdges: edges };
  }, [activeScenario]);

  const layoutResult = useMemo<CustomLayoutResult>(() => {
    try {
      return computeCustomLayout(normalizedNodes, normalizedEdges);
    } catch (err) {
      console.error("Layout computation error:", err);
      return {
        nodes: [],
        edges: [],
        badges: [],
        crossings: [],
        status: "invalid_hard_failure" as const,
        validation: {
          isValid: false,
          diagnostics: [
            { code: "RENDER_ERROR", severity: "error" as const, message: String(err), ids: [] },
          ],
          metrics: {
            unresolvedRouteCount: normalizedEdges.length,
            unresolvedBadgeCount: normalizedEdges.filter(
              (edge) => edge.isCycle || (edge.label?.trim().length ?? 0) > 0,
            ).length,
            nodeNodeOverlaps: 0,
            edgeNodePenetrations: 0,
            sharedEdgeSegmentLength: 0,
            badgeNodeOverlaps: 0,
            badgeBadgeOverlaps: 0,
            badgeUnrelatedEdgeOverlaps: 0,
            crossingCount: 0,
            bendCount: 0,
            totalLength: 0,
            directionDeviationPenalty: 0,
            portSideReusePenalty: 0,
            totalArea: 0,
          },
        },
      };
    }
  }, [normalizedNodes, normalizedEdges]);

  // Build lookup maps for rendering details
  const originalNodeMap = useMemo(() => {
    return new Map((activeScenario.nodes || []).map((n) => [n.id, n]));
  }, [activeScenario]);

  const originalEdgeMap = useMemo(() => {
    return new Map(normalizedEdges.map((e) => [e.id, e]));
  }, [normalizedEdges]);

  const renderedNodes = layoutResult.nodes || [];
  const renderedEdges = layoutResult.edges || [];
  const renderedBadges = layoutResult.badges || [];
  const renderedCrossings = layoutResult.crossings || [];

  return (
    <div className="graph-testing-page-container">
      {/* Page Header */}
      <header className="graph-testing-page-header">
        <div className="graph-testing-header-left">
          <Button variant="outline" onClick={onBackToApp} className="back-to-app-btn">
            ← Back to Graph App
          </Button>
          <h1 className="graph-testing-title">🧪 Graph Layout Playground</h1>
          <span className="graph-testing-subtitle">
            URL: <code>/testing</code> (Custom Directed Layout & Routing Engine Workspace)
          </span>
        </div>
        <div className="graph-testing-header-right">
          <span className="page-mode-badge">Custom Layout Engine</span>
        </div>
      </header>

      {/* Toolbar: Scenario Dropdown & Scrollable Tabs */}
      <div className="graph-testing-toolbar">
        <div className="graph-testing-toolbar-left">
          <label className="scenario-select-label" htmlFor="scenario-dropdown">
            Scenario ({selectedScenarioId}/20):
          </label>
          <select
            id="scenario-dropdown"
            className="scenario-select-dropdown"
            value={selectedScenarioId}
            onChange={(e) => setSelectedScenarioId(Number(e.target.value))}
          >
            {Object.values(CUSTOM_LAYOUT_SCENARIOS).map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.title}
              </option>
            ))}
          </select>
        </div>

        <div className="graph-testing-tabs">
          {Object.values(CUSTOM_LAYOUT_SCENARIOS).map((scenario) => (
            <button
              key={scenario.id}
              className={`graph-testing-tab-btn ${selectedScenarioId === scenario.id ? "active" : ""}`}
              onClick={() => setSelectedScenarioId(scenario.id)}
            >
              #{scenario.id}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Summary Panel */}
      <div className="graph-testing-metrics-wrapper">
        <CustomLayoutMetrics layoutResult={layoutResult} normalizedEdges={normalizedEdges} />
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
              Nodes: {renderedNodes.length} | Edges: {renderedEdges.length} | Crossings:{" "}
              {layoutResult.validation?.metrics?.crossingCount ?? 0} | Hairpins:{" "}
              {layoutResult.validation?.metrics?.hairpinCount ?? 0} | Leaders:{" "}
              {(layoutResult.validation?.metrics?.ordinaryLeaderCount ?? 0) +
                (layoutResult.validation?.metrics?.feedbackLeaderCount ?? 0)}{" "}
              | Passes: {layoutResult.optimizationStats?.globalPasses ?? 1} | Status:{" "}
              <strong>{layoutResult.status}</strong>
            </div>
          </div>
          <div className="testing-canvas-container">
            {/* Node Cards */}
            {renderedNodes.map((node) => {
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
                  {origNode?.desc && <div className="testing-node-desc">{origNode.desc}</div>}
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
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
                </marker>
              </defs>

              {/* Edge Routes */}
              {renderedEdges.map((routedPath) => {
                const origEdge = originalEdgeMap.get(routedPath.edgeId);
                const ownedCrossings = renderedCrossings
                  .filter((c) => (c.bridgeOwnerEdgeId ?? c.edgeIdB) === routedPath.edgeId)
                  .map((c) => c.point);
                const dPath = renderPathWithCrossingBridges(
                  routedPath.points || [],
                  ownedCrossings,
                );

                return (
                  <g key={`edge-group-${routedPath.edgeId}`}>
                    <path
                      key={`edge-path-${routedPath.edgeId}`}
                      d={dPath}
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      fill="none"
                      strokeDasharray={origEdge?.isCycle ? "5,5" : undefined}
                      markerEnd="url(#arrow-custom)"
                    />

                    {/* Port Indicators */}
                    {debugOptions.showPorts && routedPath.sourcePort && routedPath.targetPort && (
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
                );
              })}

              {/* Crossings */}
              {debugOptions.showCrossings &&
                renderedCrossings.map((c, i) => (
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
                  layoutResult.validation?.diagnostics as ExtendedLayoutDiagnostic[] | undefined
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
                renderedBadges.map((badge) => {
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
                          stroke="#38bdf8"
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
                            stroke="#38bdf8"
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
                        stroke="#38bdf8"
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

      {/* Footer */}
      <footer className="graph-testing-page-footer">
        📌 <strong>Graph Layout Laboratory:</strong> Connected to <code>computeCustomLayout</code>.
        Scenarios #1 through #20 powered by custom top-to-bottom layout & orthogonal edge router.
      </footer>
    </div>
  );
};
