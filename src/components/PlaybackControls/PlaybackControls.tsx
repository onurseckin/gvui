import type { ChangeEvent, FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconChartDots,
  IconChevronsLeft,
  IconChevronsRight,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconReload,
  IconRepeat,
} from "@tabler/icons-react";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset } from "../../types/graphData";
import {
  calculateStepProgress,
  extractPlaybackSteps,
  getActiveStepEdges,
  getActiveStepNodes,
  getNextStep,
  getPreviousStep,
  type PlaybackSpeed,
  SPEED_OPTIONS,
} from "./playbackUtils";
import "./PlaybackControls.css";

export interface PlaybackControlsProps {
  datasetOverride?: GraphDataset | null;
  className?: string;
  compact?: boolean;
  showPills?: boolean;
  showSlider?: boolean;
  showStats?: boolean;
  showSpeedSelector?: boolean;
  showJumpButtons?: boolean;
  autoPlay?: boolean;
  initialSpeed?: PlaybackSpeed;
  loopByDefault?: boolean;
  onStepChange?: (step: number | null) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onSpeedChange?: (speed: PlaybackSpeed) => void;
  onSelectNode?: (nodeId: string) => void;
}

/**
 * Primary Time-Travel Execution Scrubber & Playback Controls Component.
 */
export const PlaybackControls: FC<PlaybackControlsProps> = memo(function PlaybackControls({
  datasetOverride,
  className = "",
  compact = false,
  showPills = true,
  showSlider = true,
  showStats = true,
  showSpeedSelector = true,
  showJumpButtons = true,
  autoPlay = false,
  initialSpeed = 1,
  loopByDefault = false,
  onStepChange,
  onPlayStateChange,
  onSpeedChange,
  onSelectNode,
}) {
  const storeDataset = useGraphStore((state) => state.dataset);
  const selectedStep = useGraphStore((state) => state.selectedStep);
  const setSelectedStep = useGraphStore((state) => state.setSelectedStep);
  const centerNodeOnCanvas = useGraphStore((state) => state.centerNodeOnCanvas);

  const dataset = datasetOverride !== undefined ? datasetOverride : storeDataset;

  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(initialSpeed);
  const [isLooping, setIsLooping] = useState<boolean>(loopByDefault);

  const containerRef = useRef<HTMLDivElement>(null);
  const pillsRowRef = useRef<HTMLDivElement>(null);

  const steps = useMemo(() => extractPlaybackSteps(dataset), [dataset]);

  const currentStepIndex = useMemo(() => {
    if (selectedStep === null) return -1;
    return steps.findIndex((s) => s.step === selectedStep);
  }, [selectedStep, steps]);

  const currentStepInfo = useMemo(() => {
    if (selectedStep === null || currentStepIndex < 0) return null;
    return steps[currentStepIndex] ?? null;
  }, [selectedStep, currentStepIndex, steps]);

  const activeNodesInStep = useMemo(() => {
    if (!dataset?.nodes || selectedStep === null) return [];
    return getActiveStepNodes(dataset.nodes, selectedStep);
  }, [dataset, selectedStep]);

  const activeEdgesInStep = useMemo(() => {
    if (!dataset?.edges || selectedStep === null) return [];
    return getActiveStepEdges(dataset.edges, selectedStep);
  }, [dataset, selectedStep]);

  // Notify step changes
  const applyStepChange = useCallback(
    (nextStep: number | null) => {
      setSelectedStep(nextStep);
      onStepChange?.(nextStep);
    },
    [setSelectedStep, onStepChange],
  );

  const setPlayingState = useCallback(
    (playing: boolean) => {
      setIsPlaying(playing);
      onPlayStateChange?.(playing);
    },
    [onPlayStateChange],
  );

  const setSpeedState = useCallback(
    (speed: PlaybackSpeed) => {
      setPlaybackSpeed(speed);
      onSpeedChange?.(speed);
    },
    [onSpeedChange],
  );

  // Playback timer tick with interval calculation per speed setting
  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;

    const baseIntervalMs = 1200;
    const intervalMs = Math.max(150, Math.round(baseIntervalMs / playbackSpeed));

    const timer = setInterval(() => {
      setSelectedStep((prev: number | null) => {
        const next = getNextStep(prev, steps, isLooping);
        if (next === null) {
          setPlayingState(false);
          return null;
        }
        onStepChange?.(next);
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, steps, playbackSpeed, isLooping, setSelectedStep, setPlayingState, onStepChange]);

  // Scroll active pill into view
  useEffect(() => {
    if (selectedStep !== null && pillsRowRef.current) {
      const activePill = pillsRowRef.current.querySelector(".playback-step-pill.is-active");
      if (activePill && typeof (activePill as HTMLElement).scrollIntoView === "function") {
        (activePill as HTMLElement).scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      }
    }
  }, [selectedStep]);

  // Transport handlers
  const handleTogglePlay = useCallback(() => {
    if (steps.length === 0) return;

    if (!isPlaying && selectedStep === null) {
      applyStepChange(steps[0].step);
    }
    setPlayingState(!isPlaying);
  }, [isPlaying, selectedStep, steps, applyStepChange, setPlayingState]);

  const handleStepForward = useCallback(() => {
    setPlayingState(false);
    const next = getNextStep(selectedStep, steps, isLooping);
    if (next !== null) {
      applyStepChange(next);
    } else if (steps.length > 0) {
      applyStepChange(steps[0].step);
    }
  }, [selectedStep, steps, isLooping, applyStepChange, setPlayingState]);

  const handleStepBackward = useCallback(() => {
    setPlayingState(false);
    const prev = getPreviousStep(selectedStep, steps);
    if (prev !== null) {
      applyStepChange(prev);
    }
  }, [selectedStep, steps, applyStepChange, setPlayingState]);

  const handleJumpToStart = useCallback(() => {
    setPlayingState(false);
    if (steps.length > 0) {
      applyStepChange(steps[0].step);
    }
  }, [steps, applyStepChange, setPlayingState]);

  const handleJumpToEnd = useCallback(() => {
    setPlayingState(false);
    if (steps.length > 0) {
      applyStepChange(steps[steps.length - 1].step);
    }
  }, [steps, applyStepChange, setPlayingState]);

  const handleResetToAll = useCallback(() => {
    setPlayingState(false);
    applyStepChange(null);
  }, [applyStepChange, setPlayingState]);

  const handleToggleLoop = useCallback(() => {
    setIsLooping((prev) => !prev);
  }, []);

  const handleSliderChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setPlayingState(false);
      const val = Number.parseInt(e.target.value, 10);
      if (val === -1 || Number.isNaN(val)) {
        applyStepChange(null);
      } else {
        const clampedIndex = Math.max(0, Math.min(steps.length - 1, val));
        applyStepChange(steps[clampedIndex].step);
      }
    },
    [steps, applyStepChange, setPlayingState],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const targetTag = (e.target as { tagName?: string } | null)?.tagName?.toLowerCase();
      const targetType = (e.target as { type?: string } | null)?.type?.toLowerCase();
      if (targetTag === "input" && targetType === "text") return;
      if (targetTag === "textarea") return;

      const key = e.key.toLowerCase();

      if (e.key === " " || e.code === "Space" || key === "p") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "ArrowRight" || key === "k") {
        e.preventDefault();
        handleStepForward();
      } else if (e.key === "ArrowLeft" || key === "j") {
        e.preventDefault();
        handleStepBackward();
      } else if (e.key === "Home") {
        e.preventDefault();
        handleJumpToStart();
      } else if (e.key === "End") {
        e.preventDefault();
        handleJumpToEnd();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleResetToAll();
      } else if (key === "l") {
        e.preventDefault();
        handleToggleLoop();
      } else if (key === "1") {
        e.preventDefault();
        setSpeedState(0.5);
      } else if (key === "2") {
        e.preventDefault();
        setSpeedState(1);
      } else if (key === "3") {
        e.preventDefault();
        setSpeedState(2);
      } else if (key === "4") {
        e.preventDefault();
        setSpeedState(5);
      }
    },
    [
      handleTogglePlay,
      handleStepForward,
      handleStepBackward,
      handleJumpToStart,
      handleJumpToEnd,
      handleResetToAll,
      handleToggleLoop,
      setSpeedState,
    ],
  );

  const handleNodeClick = useCallback(
    (nodeId: string, e: MouseEvent) => {
      e.stopPropagation();
      if (onSelectNode) {
        onSelectNode(nodeId);
      } else {
        centerNodeOnCanvas(nodeId);
      }
    },
    [onSelectNode, centerNodeOnCanvas],
  );

  if (steps.length === 0) {
    return null;
  }

  const progressPercentage = calculateStepProgress(selectedStep, steps);
  const sliderValue = currentStepIndex >= 0 ? currentStepIndex : -1;
  const graphTitle = dataset?.title
    ? dataset.title.replace(/^Execution Trajectory:\s*/i, "")
    : "Execution Graph";

  return (
    <div
      ref={containerRef}
      className={`playback-controls-wrapper ${className}`}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Time-Travel Execution Scrubber"
      tabIndex={0}
    >
      <nav
        className={`playback-scrubber-bar ${isPlaying ? "is-playing" : ""}`}
        aria-label="Execution Playback Bar"
      >
        {/* Left Section: Info & Step Title */}
        <div className="playback-left-section">
          <div className={`playback-icon-badge ${isPlaying ? "is-live" : ""}`}>
            <IconChartDots size={16} />
          </div>
          <div className="playback-title-meta">
            <span className="playback-title-text" title={graphTitle}>
              {graphTitle}
            </span>
            <span className="playback-step-counter">
              {selectedStep === null
                ? `Overview (${steps.length} Steps)`
                : `Step ${currentStepIndex + 1} of ${steps.length}`}
            </span>
          </div>
        </div>

        {/* Center Section: Scrubber Slider and Pills */}
        <div className="playback-center-section">
          {showSlider && (
            <div className="playback-slider-container">
              <div className="playback-track-wrapper">
                <div className="playback-progress-track">
                  <div
                    className="playback-progress-fill"
                    style={{
                      width: selectedStep === null ? "100%" : `${progressPercentage}%`,
                    }}
                  />
                </div>
                <input
                  type="range"
                  className="playback-slider-input"
                  min={-1}
                  max={steps.length - 1}
                  value={sliderValue}
                  onChange={handleSliderChange}
                  aria-label="Timeline Scrubber"
                  aria-valuemin={1}
                  aria-valuemax={steps.length}
                  aria-valuenow={currentStepIndex + 1}
                  aria-valuetext={
                    selectedStep === null
                      ? "All steps (Overview)"
                      : (currentStepInfo?.label ?? `Step ${selectedStep}`)
                  }
                />
              </div>
            </div>
          )}

          {showPills && !compact && (
            <div ref={pillsRowRef} className="playback-pills-row">
              <button
                type="button"
                className={`playback-step-pill ${selectedStep === null ? "is-active" : ""}`}
                onClick={handleResetToAll}
                aria-label="Show All Steps Overview"
                title="Overview (All Steps)"
              >
                All Steps
              </button>
              {steps.map((s, idx) => {
                const isActive = selectedStep === s.step;
                const dotClass =
                  s.activeStatus === "error"
                    ? "dot-error"
                    : s.activeStatus === "running"
                      ? "dot-running"
                      : s.activeStatus === "success"
                        ? "dot-success"
                        : "";

                return (
                  <button
                    key={`pill-step-${s.step}`}
                    type="button"
                    className={`playback-step-pill ${isActive ? "is-active" : ""}`}
                    onClick={() => {
                      setPlayingState(false);
                      applyStepChange(s.step);
                    }}
                    title={`${s.label} (${s.nodeCount} nodes)`}
                    aria-label={`Step ${idx + 1}: ${s.label}`}
                  >
                    {dotClass && <span className={`playback-pill-dot ${dotClass}`} />}
                    <span>Step {s.step}</span>
                    <span className="playback-pill-count">({s.nodeCount})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Section: Transport Buttons & Speed Selectors */}
        <div className="playback-right-section">
          <div className="playback-transport-group" role="toolbar" aria-label="Playback Controls">
            {showJumpButtons && (
              <button
                type="button"
                className="playback-btn btn-jump-start"
                onClick={handleJumpToStart}
                title="Jump to Start (Home)"
                aria-label="Jump to Start"
              >
                <IconChevronsLeft size={14} />
              </button>
            )}

            <button
              type="button"
              className="playback-btn btn-prev"
              onClick={handleStepBackward}
              title="Previous Step (Left Arrow)"
              aria-label="Previous Step"
            >
              <IconPlayerTrackPrev size={14} />
            </button>

            <button
              type="button"
              className={`playback-btn btn-play-pause ${isPlaying ? "is-playing" : ""}`}
              onClick={handleTogglePlay}
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              aria-label={isPlaying ? "Pause Playback" : "Start Playback"}
            >
              {isPlaying ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
              <span>{isPlaying ? "Pause" : "Play"}</span>
            </button>

            <button
              type="button"
              className="playback-btn btn-next"
              onClick={handleStepForward}
              title="Next Step (Right Arrow)"
              aria-label="Next Step"
            >
              <IconPlayerTrackNext size={14} />
            </button>

            {showJumpButtons && (
              <button
                type="button"
                className="playback-btn btn-jump-end"
                onClick={handleJumpToEnd}
                title="Jump to End (End)"
                aria-label="Jump to End"
              >
                <IconChevronsRight size={14} />
              </button>
            )}

            <button
              type="button"
              className={`playback-btn btn-loop ${isLooping ? "is-active" : ""}`}
              onClick={handleToggleLoop}
              title={isLooping ? "Disable Loop (L)" : "Enable Loop (L)"}
              aria-label={isLooping ? "Disable Loop" : "Enable Loop"}
              aria-pressed={isLooping}
            >
              <IconRepeat size={13} />
            </button>

            {selectedStep !== null && (
              <button
                type="button"
                className="playback-btn btn-reset"
                onClick={handleResetToAll}
                title="Reset to All Steps (Esc)"
                aria-label="Reset to All Steps"
              >
                <IconReload size={13} />
              </button>
            )}
          </div>

          {showSpeedSelector && (
            <div
              className="playback-speed-group"
              role="radiogroup"
              aria-label="Playback Speed Selector"
            >
              {SPEED_OPTIONS.map((spd) => (
                <button
                  key={`speed-opt-${spd}`}
                  type="button"
                  className={`playback-speed-pill ${playbackSpeed === spd ? "is-selected" : ""}`}
                  onClick={() => setSpeedState(spd)}
                  role="radio"
                  aria-checked={playbackSpeed === spd}
                  aria-label={`${spd}x Speed`}
                  title={`Set speed to ${spd}x`}
                >
                  {`${spd}x`}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Time-Travel Step Status & Execution Details Inspector */}
      {showStats && selectedStep !== null && currentStepInfo && (
        <div className="playback-step-summary-card" aria-live="polite">
          <div className="playback-summary-left">
            <span className="playback-step-badge">Step {selectedStep}</span>
            <span className="playback-summary-text" title={currentStepInfo.label}>
              {currentStepInfo.label}
            </span>
          </div>

          <div className="playback-summary-chips">
            {currentStepInfo.statusBreakdown.success > 0 && (
              <span className="playback-stat-chip chip-success">
                ✓ {currentStepInfo.statusBreakdown.success} Done
              </span>
            )}
            {currentStepInfo.statusBreakdown.running > 0 && (
              <span className="playback-stat-chip chip-running">
                ⚡ {currentStepInfo.statusBreakdown.running} Active
              </span>
            )}
            {currentStepInfo.statusBreakdown.error > 0 && (
              <span className="playback-stat-chip chip-error">
                ✕ {currentStepInfo.statusBreakdown.error} Failed
              </span>
            )}
            {activeEdgesInStep.length > 0 && (
              <span
                className="playback-stat-chip"
                title={`${activeEdgesInStep.length} active edge transitions in this step`}
              >
                ↔ {activeEdgesInStep.length} Edges
              </span>
            )}
            {activeNodesInStep.length > 0 && (
              <div
                style={{ display: "flex", gap: "4px", alignItems: "center" }}
                title="Active nodes in this step"
              >
                {activeNodesInStep.slice(0, 3).map((node) => (
                  <button
                    key={`active-node-${node.id}`}
                    type="button"
                    onClick={(e) => handleNodeClick(node.id, e)}
                    className="playback-step-pill is-active"
                    style={{ fontSize: "10px", padding: "2px 6px", cursor: "pointer" }}
                    title={`Center on ${node.name}`}
                  >
                    {node.name}
                  </button>
                ))}
                {activeNodesInStep.length > 3 && (
                  <span style={{ fontSize: "10px", color: "#a1a1aa" }}>
                    +{activeNodesInStep.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

PlaybackControls.displayName = "PlaybackControls";
