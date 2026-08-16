import type { ChangeEvent, FC } from "react";
import { memo, useCallback } from "react";
import {
  IconBookmark,
  IconBug,
  IconChevronsLeft,
  IconChevronsRight,
  IconEye,
  IconGitCompare,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconRepeat,
} from "@tabler/icons-react";
import type { ReplaySpeed } from "./types";

export interface PlaybackControlsProps {
  isPlaying: boolean;
  playbackSpeed: ReplaySpeed;
  isLooping: boolean;
  currentEventIndex: number;
  totalEvents: number;
  onPlayToggle: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
  onLoopToggle: () => void;
  onNextBookmark?: () => void;
  onPrevBookmark?: () => void;
  onNextFailure?: () => void;
  onNextCritic?: () => void;
  onOpenDiff?: () => void;
  className?: string;
}

export const PlaybackControls: FC<PlaybackControlsProps> = memo(function PlaybackControls({
  isPlaying,
  playbackSpeed,
  isLooping,
  currentEventIndex,
  totalEvents,
  onPlayToggle,
  onStepForward,
  onStepBackward,
  onJumpToStart,
  onJumpToEnd,
  onSpeedChange,
  onLoopToggle,
  onNextBookmark,
  onPrevBookmark,
  onNextFailure,
  onNextCritic,
  onOpenDiff,
  className = "",
}) {
  const handleSpeedSelect = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const val = parseFloat(e.target.value);
      if (val === 0.5 || val === 1 || val === 2 || val === 5) {
        onSpeedChange(val);
      }
    },
    [onSpeedChange],
  );

  const isAtStart = totalEvents === 0 || currentEventIndex <= 0;
  const isAtEnd = totalEvents === 0 || currentEventIndex >= totalEvents - 1;

  return (
    <div className={`playback-controls-bar ${className}`} data-testid="playback-controls">
      {/* Playback action buttons */}
      <div className="playback-buttons-group">
        <button
          type="button"
          className="history-replay-btn history-replay-btn-icon"
          onClick={onJumpToStart}
          disabled={isAtStart}
          title="Jump to Start"
          aria-label="Jump to Start"
          data-testid="btn-jump-start"
        >
          <IconChevronsLeft size={16} />
        </button>

        <button
          type="button"
          className="history-replay-btn history-replay-btn-icon"
          onClick={onStepBackward}
          disabled={isAtStart}
          title="Step Backward"
          aria-label="Step Backward"
          data-testid="btn-step-backward"
        >
          <IconPlayerSkipBack size={16} />
        </button>

        <button
          type="button"
          className={`history-replay-btn history-replay-btn-primary history-replay-btn-icon`}
          onClick={onPlayToggle}
          disabled={totalEvents === 0}
          title={isPlaying ? "Pause Playback" : "Start Playback"}
          aria-label={isPlaying ? "Pause" : "Play"}
          data-testid="btn-play-toggle"
        >
          {isPlaying ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
        </button>

        <button
          type="button"
          className="history-replay-btn history-replay-btn-icon"
          onClick={onStepForward}
          disabled={isAtEnd && !isLooping}
          title="Step Forward"
          aria-label="Step Forward"
          data-testid="btn-step-forward"
        >
          <IconPlayerSkipForward size={16} />
        </button>

        <button
          type="button"
          className="history-replay-btn history-replay-btn-icon"
          onClick={onJumpToEnd}
          disabled={isAtEnd}
          title="Jump to End"
          aria-label="Jump to End"
          data-testid="btn-jump-end"
        >
          <IconChevronsRight size={16} />
        </button>

        <button
          type="button"
          className={`history-replay-btn history-replay-btn-icon ${
            isLooping ? "history-replay-btn-primary" : ""
          }`}
          onClick={onLoopToggle}
          title={isLooping ? "Looping Enabled" : "Looping Disabled"}
          aria-label="Toggle Loop"
          data-testid="btn-toggle-loop"
        >
          <IconRepeat size={16} />
        </button>
      </div>

      {/* Speed Selector */}
      <div className="playback-buttons-group">
        <label htmlFor="playback-speed-select" style={{ fontSize: "11px", color: "#a1a1aa" }}>
          Speed:
        </label>
        <select
          id="playback-speed-select"
          className="playback-speed-select"
          value={playbackSpeed}
          onChange={handleSpeedSelect}
          data-testid="select-speed"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1.0x</option>
          <option value={2}>2.0x</option>
          <option value={5}>5.0x</option>
        </select>
      </div>

      {/* Navigation jumps */}
      <div className="playback-buttons-group">
        {onPrevBookmark && (
          <button
            type="button"
            className="history-replay-btn"
            onClick={onPrevBookmark}
            title="Previous Bookmark"
            data-testid="btn-prev-bookmark"
          >
            <IconBookmark size={14} /> Prev BM
          </button>
        )}

        {onNextBookmark && (
          <button
            type="button"
            className="history-replay-btn"
            onClick={onNextBookmark}
            title="Next Bookmark"
            data-testid="btn-next-bookmark"
          >
            <IconBookmark size={14} /> Next BM
          </button>
        )}

        {onNextFailure && (
          <button
            type="button"
            className="history-replay-btn history-replay-btn-danger"
            onClick={onNextFailure}
            title="Jump to Next Failure Event"
            data-testid="btn-jump-failure"
          >
            <IconBug size={14} /> Next Failure
          </button>
        )}

        {onNextCritic && (
          <button
            type="button"
            className="history-replay-btn"
            style={{ borderColor: "#d97706", color: "#fde68a" }}
            onClick={onNextCritic}
            title="Jump to Next Critic Review"
            data-testid="btn-jump-critic"
          >
            <IconEye size={14} /> Next Review
          </button>
        )}

        {onOpenDiff && (
          <button
            type="button"
            className="history-replay-btn"
            onClick={onOpenDiff}
            title="Inspect State Diff"
            data-testid="btn-open-diff"
          >
            <IconGitCompare size={14} /> State Diff
          </button>
        )}
      </div>

      {/* Counter */}
      <div className="playback-status-info">
        <span className="playback-counter" data-testid="playback-counter">
          {totalEvents > 0 ? currentEventIndex + 1 : 0} / {totalEvents}
        </span>
      </div>
    </div>
  );
});
