import type { FC } from "react";
import { useState } from "react";
import { IconFlame } from "@tabler/icons-react";
import type { ConcurrencyHeatmapMetrics } from "../../store/useAnalyticsStore";

export interface ConcurrencyHeatmapCardProps {
  concurrency: ConcurrencyHeatmapMetrics;
}

export const ConcurrencyHeatmapCard: FC<ConcurrencyHeatmapCardProps> = ({ concurrency }) => {
  const { peakConcurrency, averageConcurrency, bins, stepConcurrency } = concurrency;
  const [selectedBinIndex, setSelectedBinIndex] = useState<number | null>(null);

  const selectedBin =
    selectedBinIndex !== null && bins[selectedBinIndex] ? bins[selectedBinIndex] : null;

  const getHeatmapColor = (intensity: number): string => {
    if (intensity <= 0) return "#1c1917";
    if (intensity < 0.25) return "#064e3b";
    if (intensity < 0.5) return "#047857";
    if (intensity < 0.75) return "#d97706";
    return "#dc2626";
  };

  return (
    <div className="analytics-card" data-testid="concurrency-heatmap-card">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">
          <IconFlame size={18} color="#f59e0b" />
          Concurrency Heatmap
        </h3>
        <span className="analytics-card-badge">
          Peak: {peakConcurrency} | Avg: {averageConcurrency.toFixed(1)}
        </span>
      </div>

      <div className="analytics-card-content">
        <div className="concurrency-summary-row">
          <span>Timeline Execution Heatmap (12 time intervals)</span>
          <span style={{ color: "#a1a1aa", fontSize: 11 }}>Click a slot to view active nodes</span>
        </div>

        {/* 12 Timeline Heatmap Slots */}
        <div className="concurrency-heatmap-slots">
          {bins.map((bin) => {
            const isSelected = selectedBinIndex === bin.binIndex;
            const bgColor = getHeatmapColor(bin.intensity);

            return (
              <div
                key={`bin-${bin.binIndex}`}
                className="concurrency-slot"
                style={{
                  backgroundColor: bgColor,
                  border: isSelected ? "2px solid #ffffff" : "1px solid rgba(255,255,255,0.1)",
                }}
                onClick={() => setSelectedBinIndex(isSelected ? null : bin.binIndex)}
                title={`Interval ${bin.timeLabel}: ${bin.activeCount} active tasks`}
                data-testid={`concurrency-slot-${bin.binIndex}`}
              >
                <span className="concurrency-slot-count">{bin.activeCount}</span>
                <span className="concurrency-slot-label">{bin.timeLabel}</span>
              </div>
            );
          })}
        </div>

        {/* Selected Slot Details Drawer */}
        {selectedBin && (
          <div className="concurrency-slot-detail" data-testid="concurrency-slot-detail">
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
              <span>
                Interval: {selectedBin.timeLabel} ({selectedBin.activeCount} active tasks)
              </span>
              <span
                style={{ color: "#a1a1aa", cursor: "pointer" }}
                onClick={() => setSelectedBinIndex(null)}
              >
                ✕ Close
              </span>
            </div>
            {selectedBin.nodeNames.length > 0 && (
              <div>
                <span style={{ color: "#a1a1aa", fontSize: 11 }}>Active Tasks: </span>
                <span style={{ color: "#ffffff" }}>{selectedBin.nodeNames.join(", ")}</span>
              </div>
            )}
            {selectedBin.models.length > 0 && (
              <div>
                <span style={{ color: "#a1a1aa", fontSize: 11 }}>Engaged Models: </span>
                <span style={{ color: "#38bdf8" }}>{selectedBin.models.join(", ")}</span>
              </div>
            )}
          </div>
        )}

        {/* Step-by-Step Task Parallelism Table */}
        {stepConcurrency.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#a1a1aa", marginBottom: 6 }}>
              Step Parallelism
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {stepConcurrency.map((sc) => (
                <div
                  key={`step-c-${sc.step}`}
                  style={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    padding: "4px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ color: "#a1a1aa" }}>Phase {sc.step}:</span>
                  <span style={{ fontWeight: 700, color: sc.count > 1 ? "#38bdf8" : "#ffffff" }}>
                    {sc.count} parallel
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
