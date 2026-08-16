import type { FC, MouseEvent } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconReload,
  IconSparkles,
} from "@tabler/icons-react";
import {
  extractPlaybackSteps,
  getActiveStepNodes,
  getNextStep,
  getPreviousStep,
  type PlaybackSpeed,
  SPEED_OPTIONS,
} from "../../components/PlaybackControls";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset } from "../../types/graphData";
import "../../components/PlaybackControls/PlaybackControls.css";

export interface GraphPlaybackOverlayProps {
  datasetOverride?: GraphDataset | null;
  className?: string;
  position?: "top-center" | "bottom-center" | "top" | "bottom";
  defaultExpanded?: boolean;
  onSelectNode?: (nodeId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
}

/**
 * Dynamic Canvas Playback Overlay & Heads-Up Display (HUD).
 */
export const GraphPlaybackOverlay: FC<GraphPlaybackOverlayProps> = memo(
  function GraphPlaybackOverlay({
    datasetOverride,
    className = "",
    position = "top-center",
    defaultExpanded = true,
    onSelectNode,
    onSelectEdge: _onSelectEdge,
  }) {
    const storeDataset = useGraphStore((state) => state.dataset);
    const selectedStep = useGraphStore((state) => state.selectedStep);
    const setSelectedStep = useGraphStore((state) => state.setSelectedStep);
    const centerNodeOnCanvas = useGraphStore((state) => state.centerNodeOnCanvas);

    const dataset = datasetOverride !== undefined ? datasetOverride : storeDataset;

    const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);

    const steps = useMemo(() => extractPlaybackSteps(dataset), [dataset]);

    const currentStepIndex = useMemo(() => {
      if (selectedStep === null) return -1;
      return steps.findIndex((s) => s.step === selectedStep);
    }, [selectedStep, steps]);

    const currentStepInfo = useMemo(() => {
      if (selectedStep === null || currentStepIndex < 0) return null;
      return steps[currentStepIndex] ?? null;
    }, [selectedStep, currentStepIndex, steps]);

    const activeNodes = useMemo(() => {
      if (!dataset?.nodes || selectedStep === null) return [];
      return getActiveStepNodes(dataset.nodes, selectedStep);
    }, [dataset, selectedStep]);

    const handleTogglePlay = useCallback(() => {
      if (steps.length === 0) return;
      if (!isPlaying && selectedStep === null) {
        setSelectedStep(steps[0].step);
      }
      setIsPlaying((prev) => !prev);
    }, [isPlaying, selectedStep, steps, setSelectedStep]);

    const handleStepForward = useCallback(() => {
      setIsPlaying(false);
      const next = getNextStep(selectedStep, steps, false);
      if (next !== null) {
        setSelectedStep(next);
      }
    }, [selectedStep, steps, setSelectedStep]);

    const handleStepBackward = useCallback(() => {
      setIsPlaying(false);
      const prev = getPreviousStep(selectedStep, steps);
      if (prev !== null) {
        setSelectedStep(prev);
      }
    }, [selectedStep, steps, setSelectedStep]);

    const handleReset = useCallback(() => {
      setIsPlaying(false);
      setSelectedStep(null);
    }, [setSelectedStep]);

    const cycleSpeed = useCallback(() => {
      setPlaybackSpeed((prev) => {
        const idx = SPEED_OPTIONS.indexOf(prev);
        return SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
      });
    }, []);

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

    const positionClass = `position-${position}`;

    if (!isExpanded) {
      return (
        <div
          className={`graph-playback-hud ${positionClass} ${className}`}
          role="region"
          aria-label="Time-Travel Playback HUD"
        >
          <div className="graph-playback-hud-compact">
            <IconSparkles size={14} color="#818cf8" />
            <span>
              {selectedStep === null
                ? `Overview (${steps.length} Steps)`
                : `Step ${currentStepIndex + 1}/${steps.length}`}
            </span>
            <button
              type="button"
              className="hud-expand-btn"
              onClick={() => setIsExpanded(true)}
              title="Expand Playback HUD"
              aria-label="Expand Playback HUD"
            >
              <IconChevronDown size={14} />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`graph-playback-hud ${positionClass} ${className}`}
        role="region"
        aria-label="Time-Travel Playback HUD"
      >
        <div className="playback-scrubber-bar" style={{ minWidth: "320px" }}>
          <div className="playback-left-section">
            <div className={`playback-icon-badge ${isPlaying ? "is-live" : ""}`}>
              <IconClock size={15} />
            </div>
            <div className="playback-title-meta">
              <span className="playback-title-text">
                {selectedStep === null
                  ? "All Steps Overview"
                  : (currentStepInfo?.label ?? `Step ${selectedStep}`)}
              </span>
              <span className="playback-step-counter">
                {selectedStep === null
                  ? `${steps.length} execution steps`
                  : `Step ${currentStepIndex + 1} of ${steps.length}`}
              </span>
            </div>
          </div>

          <div className="playback-right-section" style={{ borderLeft: "none" }}>
            <div className="playback-transport-group">
              <button
                type="button"
                className="playback-btn"
                onClick={handleStepBackward}
                disabled={selectedStep === null || currentStepIndex <= 0}
                title="Step Backward"
                aria-label="Step Backward"
              >
                <IconPlayerTrackPrev size={13} />
              </button>

              <button
                type="button"
                className={`playback-btn btn-play-pause ${isPlaying ? "is-playing" : ""}`}
                onClick={handleTogglePlay}
                title={isPlaying ? "Pause" : "Play"}
                aria-label={isPlaying ? "Pause Playback" : "Start Playback"}
              >
                {isPlaying ? <IconPlayerPause size={13} /> : <IconPlayerPlay size={13} />}
                <span>{isPlaying ? "Pause" : "Play"}</span>
              </button>

              <button
                type="button"
                className="playback-btn"
                onClick={handleStepForward}
                disabled={selectedStep !== null && currentStepIndex >= steps.length - 1}
                title="Step Forward"
                aria-label="Step Forward"
              >
                <IconPlayerTrackNext size={13} />
              </button>

              <button
                type="button"
                className="playback-btn playback-speed-pill is-selected"
                onClick={cycleSpeed}
                title={`Playback Speed (${playbackSpeed}x) - Click to cycle`}
                aria-label={`Playback Speed: ${playbackSpeed}x`}
                style={{ padding: "3px 8px", fontSize: "10px" }}
              >
                {`${playbackSpeed}x`}
              </button>

              {selectedStep !== null && (
                <button
                  type="button"
                  className="playback-btn btn-reset"
                  onClick={handleReset}
                  title="Reset to All Steps"
                  aria-label="Reset to All Steps"
                >
                  <IconReload size={13} />
                </button>
              )}

              <button
                type="button"
                className="hud-expand-btn"
                onClick={() => setIsExpanded(false)}
                title="Collapse HUD"
                aria-label="Collapse HUD"
                style={{ marginLeft: "4px" }}
              >
                <IconChevronUp size={14} />
              </button>
            </div>
          </div>
        </div>

        {selectedStep !== null && activeNodes.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "4px",
              marginTop: "6px",
            }}
          >
            {activeNodes.map((n) => (
              <button
                key={`overlay-node-${n.id}`}
                type="button"
                onClick={(e) => handleNodeClick(n.id, e)}
                className="playback-step-pill is-active"
                style={{
                  fontSize: "10px",
                  padding: "2px 8px",
                  boxShadow: "0 0 8px rgba(59, 130, 246, 0.4)",
                  cursor: "pointer",
                }}
                title={`Center on ${n.name}`}
              >
                ⚡ {n.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);

GraphPlaybackOverlay.displayName = "GraphPlaybackOverlay";
