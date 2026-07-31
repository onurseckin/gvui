import type { FC } from "react";
import { useMemo, useState } from "react";
import { computeCustomLayout } from "../../../engine/layout/custom";
import { renderPathWithCrossingBridges } from "../../../engine/layout/custom/svgPath";
import type { NormalizedEdge, NormalizedNode } from "../../../engine/layout/custom/types";
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
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(1);
  const [debugOptions, setDebugOptions] = useState<DebugOptions>({
    showPorts: true,
    showBadges: true,
    showCrossings: true,
    showDiagnostics: true,
  });

  const activeScenario: TestScenario = useMemo(() => {
    return CUSTOM_LAYOUT_SCENARIOS[selectedScenarioId] ?? CUSTOM_LAYOUT_SCENARIOS[1];
  }, [selectedScenarioId]);

  const { normalizedNodes, normalizedEdges } = useMemo(() => {
    const nodes: NormalizedNode[] = activeScenario.nodes.map((n) => ({
      id: n.id,
      label: n.name,
      width: n.w,
      height: n.h,
    }));
    const edges: NormalizedEdge[] = activeScenario.edges.map((e, idx) => ({
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
    }));
    return { normalizedNodes: nodes, normalizedEdges: edges };
  }, [activeScenario]);

  const layoutResult = useMemo(() => {
    return computeCustomLayout(normalizedNodes, normalizedEdges);
  }, [normalizedNodes, normalizedEdges]);

  // Build lookup maps for rendering details
  const originalNodeMap = useMemo(() => {
    return new Map(activeScenario.nodes.map((n) => [n.id, n]));
  }, [activeScenario]);

  const originalEdgeMap = useMemo(() => {
    return new Map(normalizedEdges.map((e) => [e.id, e]));
  }, [normalizedEdges]);

  const crossingPoints = useMemo(() => {
    return layoutResult.crossings.map((c) => c.point);
  }, [layoutResult]);

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
        <CustomLayoutMetrics layoutResult={layoutResult} />
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
              Nodes: {layoutResult.nodes.length} | Edges: {layoutResult.edges.length} | Status:{" "}
              <strong>{layoutResult.status}</strong>
            </div>
          </div>
          <div className="testing-canvas-container">
            {/* Node Cards */}
            {layoutResult.nodes.map((node) => {
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
                  <div className="testing-node-title">{origNode?.name ?? node.label ?? node.id}</div>
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
              {layoutResult.edges.map((routedPath) => {
                const origEdge = originalEdgeMap.get(routedPath.edgeId);
                const dPath = renderPathWithCrossingBridges(routedPath.points, crossingPoints);

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
                    {debugOptions.showPorts && (
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
                layoutResult.crossings.map((c, i) => (
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

              {/* Badges */}
              {debugOptions.showBadges &&
                layoutResult.badges.map((badge) => {
                  const badgeCenterX = badge.rect.x + badge.rect.width / 2;
                  const badgeCenterY = badge.rect.y + badge.rect.height / 2;
                  const hasLeader =
                    Math.hypot(
                      badge.anchorPoint.x - badgeCenterX,
                      badge.anchorPoint.y - badgeCenterY
                    ) > 4;

                  return (
                    <g key={`badge-${badge.edgeId}-${badge.label}`}>
                      {hasLeader && (
                        <line
                          x1={badge.anchorPoint.x}
                          y1={badge.anchorPoint.y}
                          x2={badgeCenterX}
                          y2={badgeCenterY}
                          stroke="#38bdf8"
                          strokeWidth="1"
                          strokeDasharray="3,3"
                        />
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
        📌 <strong>Graph Layout Laboratory:</strong> Connected to <code>computeCustomLayout</code>. Scenarios #1 through #20 powered by custom top-to-bottom layout & orthogonal edge router.
      </footer>
    </div>
  );
};
