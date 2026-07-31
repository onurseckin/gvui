import type { FC } from "react";
import { useMemo, useState } from "react";
import { Button } from "../../../ui";
import { computeShortestPathLayout } from "../algorithm/shortestPathEngine";
import { TEST_SCENARIOS } from "../data/testScenarios";
import "../GraphTesting.css";
import type { ScenarioLayoutResult, TestScenario } from "../types";

interface GraphTestingPageProps {
  onBackToApp: () => void;
}

export const GraphTestingPage: FC<GraphTestingPageProps> = ({ onBackToApp }) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(1);

  const activeScenario: TestScenario = useMemo(() => {
    return TEST_SCENARIOS[selectedScenarioId] ?? TEST_SCENARIOS[1];
  }, [selectedScenarioId]);

  const layoutResult: ScenarioLayoutResult = useMemo(() => {
    return computeShortestPathLayout(activeScenario);
  }, [activeScenario]);

  return (
    <div className="graph-testing-page-container">
      {/* Top Navbar */}
      <header className="graph-testing-page-header">
        <div className="graph-testing-header-left">
          <Button variant="outline" size="sm" onClick={onBackToApp}>
            ← Back to Graph App
          </Button>
          <h1 className="graph-testing-title">🧪 Graph Layout Playground</h1>
          <span className="graph-testing-subtitle">
            URL: <code>/testing</code> (Clean layout & edge routing workspace)
          </span>
        </div>
        <div className="graph-testing-header-right">
          <span className="page-mode-badge">Algorithm Testing Ground</span>
        </div>
      </header>

      {/* Toolbar: Scenario Tabs */}
      <div className="graph-testing-toolbar">
        <div className="graph-testing-tabs">
          {Object.values(TEST_SCENARIOS).map((scenario) => (
            <button
              key={scenario.id}
              className={`graph-testing-tab-btn ${selectedScenarioId === scenario.id ? "active" : ""}`}
              onClick={() => setSelectedScenarioId(scenario.id)}
            >
              {scenario.title}
            </button>
          ))}
        </div>
      </div>

      {/* Content Canvas */}
      <div className="graph-testing-content single-panel">
        <div className="testing-panel">
          <div className="testing-panel-header">
            <div className="testing-panel-title">
              <span className="mode-tag mode-tag-a">Canvas View</span>
              <span>{activeScenario.title}</span>
            </div>
            <div className="testing-stat-badge">
              Nodes: {activeScenario.nodes.length} | Edges: {activeScenario.edges.length} | Total Wire Length: {Math.round(layoutResult.totalDistance)}px
            </div>
          </div>
          <div className="testing-canvas-container">
            {activeScenario.nodes.map((node) => (
              <div
                key={node.id}
                className="testing-node-card"
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${node.w}px`,
                  height: `${node.h}px`,
                }}
              >
                <div className="testing-node-title">{node.name}</div>
                <div className="testing-node-desc">{node.desc}</div>
              </div>
            ))}

            <svg className="testing-svg-layer">
              <defs>
                <marker
                  id="arrow-page"
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

              {layoutResult.edges.map((edgeRes, i) => (
                <path
                  key={`edge-page-${activeScenario.edges[i]?.source ?? "s"}-${activeScenario.edges[i]?.target ?? "t"}-${i}`}
                  d={edgeRes.dPath}
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  fill="none"
                  strokeDasharray={activeScenario.edges[i]?.isCycle ? "5,5" : undefined}
                  markerEnd="url(#arrow-page)"
                />
              ))}

              {layoutResult.badges.map((badge) => (
                <g key={`badge-page-${badge.idx}-${badge.label}`}>
                  <rect
                    x={badge.x - badge.w / 2}
                    y={badge.y - badge.h / 2}
                    width={badge.w}
                    height={badge.h}
                    rx={6}
                    fill="#09090b"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                  />
                  <text
                    x={badge.x}
                    y={badge.y + 4}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {badge.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="graph-testing-page-footer">
        📌 <strong>Playground ready for systematic rendering system:</strong> Clean scenario suite loaded from most complex (#1) to most basic (#5). Ready for node layout & edge routing instructions.
      </footer>
    </div>
  );
};
