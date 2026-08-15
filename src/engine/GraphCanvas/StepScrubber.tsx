import type { FC } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { IconChartDots, IconPlayerPause, IconPlayerPlay, IconReload } from "@tabler/icons-react";
import { useGraphStore } from "../../state/useGraphStore";

export interface StepInfo {
  step: number;
  label: string;
  nodeCount: number;
}

export const StepScrubber: FC = memo(function StepScrubber() {
  const dataset = useGraphStore((state) => state.dataset);
  const selectedStep = useGraphStore((state) => state.selectedStep);
  const setSelectedStep = useGraphStore((state) => state.setSelectedStep);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);

  const steps: StepInfo[] = useMemo(() => {
    if (!dataset?.nodes) return [];
    const stepMap = new Map<number, { label: string; count: number }>();

    for (const node of dataset.nodes) {
      if (typeof node.step === "number") {
        const existing = stepMap.get(node.step);
        const nodeLabel = node.stepLabel ?? `Step ${node.step}`;
        if (existing) {
          existing.count++;
        } else {
          stepMap.set(node.step, { label: nodeLabel, count: 1 });
        }
      }
    }

    const sorted = Array.from(stepMap.entries()).sort(([a], [b]) => a - b);
    return sorted.map(([step, { label, count }]) => ({ step, label, nodeCount: count }));
  }, [dataset]);

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;

    const intervalMs = Math.round(2000 / playbackSpeed);
    const timer = setInterval(() => {
      setSelectedStep((prev: number | null) => {
        if (prev === null) return steps[0].step;
        const currentIndex = steps.findIndex((s) => s.step === prev);
        if (currentIndex < 0 || currentIndex >= steps.length - 1) {
          setIsPlaying(false);
          return null; // loop back to all
        }
        return steps[currentIndex + 1].step;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, steps, playbackSpeed, setSelectedStep]);

  const handleTogglePlay = useCallback(() => {
    if (steps.length === 0) return;
    if (!isPlaying && selectedStep === null) {
      setSelectedStep(steps[0].step);
    }
    setIsPlaying((prev) => !prev);
  }, [isPlaying, selectedStep, steps, setSelectedStep]);

  const handleSelectStep = useCallback(
    (step: number | null) => {
      setIsPlaying(false);
      setSelectedStep(step);
    },
    [setSelectedStep],
  );

  const cycleSpeed = useCallback(() => {
    setPlaybackSpeed((prev) => (prev === 0.5 ? 1 : prev === 1 ? 2 : 0.5));
  }, []);

  if (steps.length === 0) return null;

  return (
    <nav className="step-scrubber-bar" aria-label="Step Navigation and Playback">
      <div className="step-scrubber-left">
        <IconChartDots size={16} className="step-scrubber-icon" />
        <span className="step-scrubber-title" title={dataset?.title ?? "Execution Graph"}>
          {dataset?.title
            ? dataset.title.replace(/^Execution Trajectory:\s*/, "")
            : "Execution Graph"}
        </span>
      </div>

      <div className="step-scrubber-pills">
        <button
          type="button"
          className={`step-pill ${selectedStep === null ? "is-active" : ""}`}
          onClick={() => handleSelectStep(null)}
        >
          All Steps
        </button>
        {steps.map((s) => (
          <button
            key={`step-${s.step}`}
            type="button"
            className={`step-pill ${selectedStep === s.step ? "is-active" : ""}`}
            onClick={() => handleSelectStep(s.step)}
            title={s.label}
          >
            Step {s.step} <span className="step-pill-count">({s.nodeCount})</span>
          </button>
        ))}
      </div>

      <div className="step-scrubber-controls">
        <button
          type="button"
          className={`step-control-btn ${isPlaying ? "is-playing" : ""}`}
          onClick={handleTogglePlay}
          aria-label={isPlaying ? "Pause Playback" : "Start Playback"}
          title={isPlaying ? "Pause Playback" : "Play Step-by-Step"}
        >
          {isPlaying ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>
        <button
          type="button"
          className="step-control-btn step-speed-btn"
          onClick={cycleSpeed}
          title="Toggle Playback Speed"
        >
          <span>{playbackSpeed}x</span>
        </button>
        {selectedStep !== null && (
          <button
            type="button"
            className="step-control-btn step-reset-btn"
            onClick={() => handleSelectStep(null)}
            title="Reset step filter"
          >
            <IconReload size={13} />
          </button>
        )}
      </div>
    </nav>
  );
});

StepScrubber.displayName = "StepScrubber";
