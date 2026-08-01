import type { FC } from "react";
import { useMemo, useState } from "react";
import type { NormalizedEdge, NormalizedNode } from "../../../engine/layout/custom/types";

function pointsToSvgPath(points: Array<{ x: number; y: number }>): string {
  if (!points || points.length === 0) return "";
  return points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "").trim();
}

function renderPathWithCrossingBridges(
  points: Array<{ x: number; y: number }>,
  _ownedCrossings?: unknown,
): string {
  return pointsToSvgPath(points);
}

import { CUSTOM_LAYOUT_SCENARIOS } from "../data/customLayoutScenarios";
import "../GraphTesting.css";
import type { TestScenario } from "../types";
import { CustomLayoutMetrics } from "./CustomLayoutMetrics";
import { LayoutErrorBoundary } from "./LayoutErrorBoundary";
import { useCustomLayoutWorker } from "../hooks/useCustomLayoutWorker";

interface GraphTestingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GraphTestingModal: FC<GraphTestingModalProps> = ({ isOpen, onClose }) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(20);

  const activeScenario: TestScenario = useMemo(() => {
    return CUSTOM_LAYOUT_SCENARIOS[selectedScenarioId] ?? CUSTOM_LAYOUT_SCENARIOS[20];
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
      layoutRole: e.layoutRole,
    }));
    return { normalizedNodes: nodes, normalizedEdges: edges };
  }, [activeScenario]);

  const {
    result: layoutResult,
    isCalculating,
    error,
    recalculate,
    resultGeneration,
  } = useCustomLayoutWorker({
    nodes: normalizedNodes,
    edges: normalizedEdges,
    inputKey: `scenario-${activeScenario.id}`,
    timeoutMs: 30_000,
    enabled: isOpen,
  });

  const originalNodeMap = useMemo(() => {
    return new Map(activeScenario.nodes.map((n) => [n.id, n]));
  }, [activeScenario.nodes]);

  const originalEdgeMap = useMemo(() => {
    return new Map(normalizedEdges.map((e) => [e.id, e]));
  }, [normalizedEdges]);

  const renderedEdgePaths = useMemo(() => {
    if (!layoutResult) return [];
    const crossings = layoutResult.crossings || [];
    return layoutResult.edges.map((routedPath) => {
      const origEdge = originalEdgeMap.get(routedPath.edgeId);
      const ownedCrossings = crossings
        .filter((c) => (c.bridgeOwnerEdgeId ?? c.edgeIdB) === routedPath.edgeId)
        .map((c) => c.point);
      const dPath = renderPathWithCrossingBridges(routedPath.points, ownedCrossings);
      return { routedPath, origEdge, dPath };
    });
  }, [layoutResult, originalEdgeMap]);

  if (!isOpen) return null;

  return (
    <div className="graph-testing-backdrop" onClick={onClose}>
      <div className="graph-testing-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="graph-testing-header">
          <div className="graph-testing-header-left">
            <h2 className="graph-testing-title">🧪 Graph Layout Algorithm Laboratory</h2>
            <span className="graph-testing-subtitle">
              Interactive playground for custom directed layout & orthogonal routing engine
            </span>
          </div>
          <button className="graph-testing-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {error && layoutResult && (
          <div className="graph-layout-worker-warning" role="alert">
            <span>Layout worker failed: {error.message}</span>
            <button type="button" onClick={recalculate}>
              Retry layout
            </button>
          </div>
        )}

        {/* Toolbar: Scenario Tabs */}
        <div className="graph-testing-toolbar">
          <div className="graph-testing-tabs">
            {Object.values(CUSTOM_LAYOUT_SCENARIOS).map((scenario) => (
              <button
                key={scenario.id}
                className={`graph-testing-tab-btn ${selectedScenarioId === scenario.id ? "active" : ""}`}
                onClick={() => setSelectedScenarioId(scenario.id)}
              >
                #{scenario.id} {scenario.title}
              </button>
            ))}
          </div>
        </div>

        {!layoutResult ? (
          <div
            className={error ? "graph-layout-worker-warning" : "graph-layout-worker-loading"}
            role={error ? "alert" : "status"}
            aria-busy={isCalculating}
          >
            <span>
              {error
                ? `Layout worker failed: ${error.message}`
                : isCalculating
                  ? "Calculating graph layout…"
                  : "Layout is unavailable."}
            </span>
            {(error || !isCalculating) && (
              <button type="button" onClick={recalculate}>
                Retry layout
              </button>
            )}
          </div>
        ) : (
          <>
            {isCalculating && (
              <div className="graph-layout-worker-loading" role="status" aria-busy="true">
                <span>Recalculating graph layout…</span>
              </div>
            )}
            <LayoutErrorBoundary onRetry={recalculate} resultGeneration={resultGeneration}>
              {/* Metrics Summary Panel */}
              <div
                className="graph-testing-metrics-wrapper"
                style={{ padding: "0 24px", marginTop: "12px" }}
              >
                <CustomLayoutMetrics
                  layoutResult={layoutResult}
                  normalizedEdges={normalizedEdges}
                />
              </div>

              {/* Main Content */}
              <div className="graph-testing-content single-panel">
                <div className="testing-panel">
                  <div className="testing-panel-header">
                    <div className="testing-panel-title">
                      <span className="mode-tag mode-tag-a">Custom Engine</span>
                      <span>{activeScenario.title}</span>
                    </div>
                    <div className="testing-stat-badge">
                      Nodes: {layoutResult.nodes.length} | Edges: {layoutResult.edges.length} |
                      Crossings: {layoutResult.validation.metrics.crossingCount} | Hairpins:{" "}
                      {layoutResult.validation.metrics.hairpinCount ?? 0} | Leaders:{" "}
                      {(layoutResult.validation.metrics.ordinaryLeaderCount ?? 0) +
                        (layoutResult.validation.metrics.feedbackLeaderCount ?? 0)}{" "}
                      | Passes: {layoutResult.optimizationStats?.globalPasses ?? 1} | Status:{" "}
                      <strong>{layoutResult.status}</strong>
                    </div>
                  </div>
                  <div className="testing-canvas-container">
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
                          <div className="testing-node-title">
                            {origNode?.name ?? node.label ?? node.id}
                          </div>
                          {origNode?.desc && (
                            <div className="testing-node-desc">{origNode.desc}</div>
                          )}
                        </div>
                      );
                    })}

                    <svg className="testing-svg-layer">
                      <defs>
                        <marker
                          id="arrow-modal"
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
                      {renderedEdgePaths.map(({ routedPath, origEdge, dPath }) => (
                        <path
                          key={`edge-modal-${routedPath.edgeId}`}
                          d={dPath}
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          fill="none"
                          strokeDasharray={origEdge?.isCycle ? "5,5" : undefined}
                          markerEnd="url(#arrow-modal)"
                        />
                      ))}

                      {/* Crossings */}
                      {(layoutResult.crossings || []).map((c, i) => (
                        <circle
                          key={`crossing-modal-${c.edgeIdA}-${c.edgeIdB}-${i}`}
                          cx={c.point.x}
                          cy={c.point.y}
                          r="5"
                          fill="#f59e0b"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                      ))}

                      {/* Badges */}
                      {layoutResult.badges.map((badge) => {
                        const badgeCenterX = badge.rect.x + badge.rect.width / 2;
                        const badgeCenterY = badge.rect.y + badge.rect.height / 2;
                        const hasLeader =
                          badge.anchorPoint &&
                          Math.hypot(
                            badge.anchorPoint.x - badgeCenterX,
                            badge.anchorPoint.y - badgeCenterY,
                          ) > 4;

                        return (
                          <g key={`badge-modal-${badge.edgeId}-${badge.label}`}>
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
            </LayoutErrorBoundary>
          </>
        )}
      </div>
    </div>
  );
};
