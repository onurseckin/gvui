/**
 * Interactive Playback Controls Component for command execution replay.
 * 100% Zero-any type-safe implementation.
 */

import type { FC } from "react";

export interface PlaybackControlsProps {
  isPlaying: boolean;
  playbackSpeed: number;
  completedEventsCount: number;
  totalEventsCount: number;
  isFinished: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  onSpeedChange: (speed: number) => void;
  className?: string;
}

const SPEED_OPTIONS: readonly number[] = [0.25, 0.5, 1, 2, 5];

export const PlaybackControls: FC<PlaybackControlsProps> = ({
  isPlaying,
  playbackSpeed,
  completedEventsCount,
  totalEventsCount,
  isFinished,
  onPlay,
  onPause,
  onStepForward,
  onStepBackward,
  onJumpToStart,
  onJumpToEnd,
  onSpeedChange,
  className = "",
}) => {
  return (
    <div className={`playback-controls-wrapper ${className}`}>
      <div className="playback-buttons-group">
        <button
          type="button"
          className="control-btn"
          onClick={onJumpToStart}
          title="Jump to Start"
          aria-label="Jump to start"
        >
          ⇤
        </button>
        <button
          type="button"
          className="control-btn"
          onClick={onStepBackward}
          title="Step Backward"
          aria-label="Step backward"
        >
          ◀
        </button>

        <button
          type="button"
          className={`control-btn play-pause-btn ${isPlaying ? "playing" : ""}`}
          onClick={isPlaying ? onPause : onPlay}
          title={isPlaying ? "Pause Playback" : isFinished ? "Replay" : "Play"}
          aria-label={isPlaying ? "Pause" : isFinished ? "Replay" : "Play"}
        >
          {isPlaying ? "❚❚ Pause" : isFinished ? "↻ Replay" : "▶ Play"}
        </button>

        <button
          type="button"
          className="control-btn"
          onClick={onStepForward}
          title="Step Forward"
          aria-label="Step forward"
        >
          ▶
        </button>
        <button
          type="button"
          className="control-btn"
          onClick={onJumpToEnd}
          title="Jump to End"
          aria-label="Jump to end"
        >
          ⇥
        </button>
      </div>

      <div className="playback-speed-group">
        <span className="speed-label">Speed:</span>
        <div className="speed-buttons">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={`speed-${speed}`}
              type="button"
              className={`speed-btn ${playbackSpeed === speed ? "active" : ""}`}
              onClick={() => onSpeedChange(speed)}
              aria-label={`Set speed to ${speed}x`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      <div className="playback-status-indicator">
        <span className="events-count">
          Events: <strong>{completedEventsCount}</strong> / {totalEventsCount}
        </span>
        {isFinished && <span className="status-tag complete">Finished</span>}
        {isPlaying && <span className="status-tag running">Playing...</span>}
      </div>
    </div>
  );
};
