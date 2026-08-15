import React, { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import {
  IconChevronDown,
  IconListNumbers,
  IconPlayerPause,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { useGraphStore } from "../../state/useGraphStore";
import { createPanelDismissHandler } from "./panelDismiss";
import "./Controls.css";
import "./StepsDropdown.css";

export const StepsDropdown: FC = React.memo(function StepsDropdown() {
  const dataset = useGraphStore((state) => state.dataset);
  const selectedStep = useGraphStore((state) => state.selectedStep);
  const selectedSteps = useGraphStore((state) => state.selectedSteps);
  const setSelectedStep = useGraphStore((state) => state.setSelectedStep);
  const toggleSelectedStep = useGraphStore((state) => state.toggleSelectedStep);
  const selectAllSteps = useGraphStore((state) => state.selectAllSteps);
  const clearSelectedSteps = useGraphStore((state) => state.clearSelectedSteps);

  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1000);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const steps = useMemo(() => {
    if (!dataset?.nodes) return [];
    const stepMap = new Map<number, { label: string; count: number }>();
    for (const node of dataset.nodes) {
      if (node.step !== undefined) {
        const existing = stepMap.get(node.step);
        const label = node.stepLabel ?? `Step ${node.step}`;
        if (existing) existing.count += 1;
        else stepMap.set(node.step, { label, count: 1 });
      }
    }
    return Array.from(stepMap.entries())
      .map(([step, info]) => ({ step, label: info.label, count: info.count }))
      .sort((a, b) => a.step - b.step);
  }, [dataset]);

  useEffect(() => {
    if (!isOpen) return;
    const dismiss = createPanelDismissHandler(
      () => dropdownRef.current,
      () => setIsOpen(false),
    );
    const handleClickOutside = (e: MouseEvent) => dismiss(e);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;
    const interval = setInterval(() => {
      setSelectedStep((prev) => {
        const currentIndex = steps.findIndex((s) => s.step === prev);
        const nextIndex =
          currentIndex === -1 || currentIndex >= steps.length - 1 ? 0 : currentIndex + 1;
        return steps[nextIndex]?.step ?? null;
      });
    }, playbackSpeed);
    return () => clearInterval(interval);
  }, [isPlaying, steps, playbackSpeed, setSelectedStep]);

  const handleTogglePlay = useCallback(() => setIsPlaying((p) => !p), []);

  if (steps.length === 0) return null;

  const isFiltering = selectedSteps.size > 0 || selectedStep !== null;

  return (
    <div className="steps-dropdown-wrapper" ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        className={`toolbar-btn steps-trigger-btn ${isFiltering ? "is-active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Filter & Playback Steps"
      >
        <IconListNumbers size={14} />
        <span>Steps</span>
        {selectedStep !== null ? (
          <span className="steps-count-badge">Step {selectedStep}</span>
        ) : selectedSteps.size > 0 ? (
          <span className="steps-count-badge">
            {selectedSteps.size}/{steps.length}
          </span>
        ) : null}
        <IconChevronDown size={12} />
      </button>

      {isOpen && (
        <div className="steps-dropdown-menu">
          <div className="steps-dropdown-header">
            <span className="steps-dropdown-title">Execution Steps</span>
            <div className="steps-dropdown-actions">
              <button type="button" className="steps-action-btn" onClick={selectAllSteps}>
                All
              </button>
              <button type="button" className="steps-action-btn" onClick={clearSelectedSteps}>
                Clear
              </button>
            </div>
          </div>

          <div className="steps-dropdown-list">
            {steps.map(({ step, label, count }) => {
              const isChecked =
                selectedStep !== null
                  ? selectedStep === step
                  : selectedSteps.size === 0 || selectedSteps.has(step);

              return (
                <label key={step} className="steps-dropdown-item">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelectedStep(step)}
                  />
                  <span className="steps-item-pill">[{step}]</span>
                  <span className="steps-item-label" title={label}>
                    {label}
                  </span>
                  <span className="steps-item-count">{count}</span>
                </label>
              );
            })}
          </div>

          <div className="steps-playback-bar">
            <button
              type="button"
              className={`steps-play-btn ${isPlaying ? "is-playing" : ""}`}
              onClick={handleTogglePlay}
              title={isPlaying ? "Pause Step Playback" : "Play Steps Sequence"}
            >
              {isPlaying ? <IconPlayerPause size={13} /> : <IconPlayerPlay size={13} />}
              <span>{isPlaying ? "Pause" : "Play"}</span>
            </button>
            <div className="steps-speed-buttons">
              {[
                { label: "0.5x", speed: 2000 },
                { label: "1x", speed: 1000 },
                { label: "2x", speed: 500 },
              ].map(({ label, speed }) => (
                <button
                  key={label}
                  type="button"
                  className={`steps-speed-btn ${playbackSpeed === speed ? "is-active" : ""}`}
                  onClick={() => setPlaybackSpeed(speed)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

StepsDropdown.displayName = "StepsDropdown";
