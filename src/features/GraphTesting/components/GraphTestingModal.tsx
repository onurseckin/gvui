import type { FC } from "react";
import { useMemo, useState } from "react";
import { computeDagreRankLayout } from "../algorithm/dagreRankEngine";
import { computeShortestPathLayout } from "../algorithm/shortestPathEngine";
import { TEST_SCENARIOS } from "../data/testScenarios";
import "../GraphTesting.css";
import type { ScenarioLayoutResult, TestScenario } from "../types";

interface GraphTestingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GraphTestingModal: FC<GraphTestingModalProps> = ({ isOpen, onClose }) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(1);
  const [showOptionA, setShowOptionA] = useState<boolean>(true);
  const [showOptionB, setShowOptionB] = useState<boolean>(true);

  const activeScenario: TestScenario = useMemo(() => {
    return TEST_SCENARIOS[selectedScenarioId] ?? TEST_SCENARIOS[1];
  }, [selectedScenarioId]);

  const optionAResult: ScenarioLayoutResult = useMemo(() => {
    return computeShortestPathLayout(activeScenario);
  }, [activeScenario]);

  const optionBResult: ScenarioLayoutResult = useMemo(() => {
    return computeDagreRankLayout(activeScenario);
  }, [activeScenario]);

  const toggleOptionA = () => {
    if (showOptionA && !showOptionB) return;
    setShowOptionA((prev) => !prev);
  };

  const toggleOptionB = () => {
    if (showOptionB && !showOptionA) return;
    setShowOptionB((prev) => !prev);
  };

  if (!isOpen) return null;

  const isSinglePanel = (showOptionA && !showOptionB) || (!showOptionA && showOptionB);

  return (
    <div className="graph-testing-backdrop" role="dialog" aria-modal="true">
      <div className="graph-testing-dialog">
        {/* Header */}
        <div className="graph-testing-header">
          <div className="graph-testing-header-left">
            <h2 className="graph-testing-title">🧪 Graph Layout Algorithm Laboratory</h2>
            <span className="graph-testing-subtitle">
              Comparing Option A (16-Pair Shortest Geometric Path) vs Option B (Dagre Rank-Biased
              Flow)
            </span>
          </div>
          <button className="graph-testing-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Toolbar: Scenario Tabs & Algorithm Aperture Toggles */}
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

          <div className="algorithm-toggles-container">
            <button
              className={`algorithm-toggle-btn ${showOptionA ? "active-a" : ""}`}
              onClick={toggleOptionA}
              title="Toggle 16-Pair Shortest Path Algorithm"
            >
              <span>{showOptionA ? "✓" : "○"}</span>
              <span>Option A: 16-Pair Geometric</span>
            </button>
            <button
              className={`algorithm-toggle-btn ${showOptionB ? "active-b" : ""}`}
              onClick={toggleOptionB}
              title="Toggle Rank-Based Flow Algorithm"
            >
              <span>{showOptionB ? "✓" : "○"}</span>
              <span>Option B: Rank-Based Flow</span>
            </button>
          </div>
        </div>

        {/* Content Comparison Grid */}
        <div className={`graph-testing-content ${isSinglePanel ? "single-panel" : ""}`}>
          {/* Panel Option A */}
          {showOptionA && (
            <div className="testing-panel">
              <div className="testing-panel-header">
                <div className="testing-panel-title">
                  <span className="mode-tag mode-tag-a">Option A</span>
                  <span>Pure 16-Pair Shortest Path</span>
                </div>
                <div className="testing-stat-badge">
                  Total Length: {Math.round(optionAResult.totalDistance)}px
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
                      id="arrow-a"
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

                  {optionAResult.edges.map((edgeRes, i) => (
                    <path
                      key={`edge-a-${activeScenario.edges[i]?.source ?? "s"}-${activeScenario.edges[i]?.target ?? "t"}-${i}`}
                      d={edgeRes.dPath}
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      fill="none"
                      strokeDasharray={activeScenario.edges[i]?.isCycle ? "5,5" : undefined}
                      markerEnd="url(#arrow-a)"
                    />
                  ))}

                  {optionAResult.badges.map((badge) => (
                    <g key={`badge-a-${badge.idx}-${badge.label}`}>
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
          )}

          {/* Panel Option B */}
          {showOptionB && (
            <div className="testing-panel">
              <div className="testing-panel-header">
                <div className="testing-panel-title">
                  <span className="mode-tag mode-tag-b">Option B</span>
                  <span>Dagre Rank-Biased Flow</span>
                </div>
                <div className="testing-stat-badge">
                  Total Length: {Math.round(optionBResult.totalDistance)}px
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
                      id="arrow-b"
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#a855f7" />
                    </marker>
                  </defs>

                  {optionBResult.edges.map((edgeRes, i) => (
                    <path
                      key={`edge-b-${activeScenario.edges[i]?.source ?? "s"}-${activeScenario.edges[i]?.target ?? "t"}-${i}`}
                      d={edgeRes.dPath}
                      stroke="#a855f7"
                      strokeWidth="2.5"
                      fill="none"
                      strokeDasharray={activeScenario.edges[i]?.isCycle ? "5,5" : undefined}
                      markerEnd="url(#arrow-b)"
                    />
                  ))}

                  {optionBResult.badges.map((badge) => (
                    <g key={`badge-b-${badge.idx}-${badge.label}`}>
                      <rect
                        x={badge.x - badge.w / 2}
                        y={badge.y - badge.h / 2}
                        width={badge.w}
                        height={badge.h}
                        rx={6}
                        fill="#09090b"
                        stroke="#a855f7"
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
          )}
        </div>
      </div>
    </div>
  );
};
