/**
 * Integrated Terminal Command Replay View Component.
 * Connects timeline scrubber, playback controls, and ANSI terminal display with live timer loop.
 * 100% Zero-any type-safe implementation.
 */

import { useEffect, type FC } from "react";
import type { AnsiLine } from "../../engine/sandbox/types";
import { PlaybackControls } from "./PlaybackControls";
import { ReplayTimeline } from "./ReplayTimeline";
import { TerminalDisplay } from "./TerminalDisplay";
import { useCommandSandboxStore } from "./useCommandSandboxStore";

export interface TerminalReplayViewProps {
  className?: string;
}

export const TerminalReplayView: FC<TerminalReplayViewProps> = ({ className = "" }) => {
  const recordedTrace = useCommandSandboxStore((state) => state.recordedTrace);
  const replayState = useCommandSandboxStore((state) => state.replayState);
  const terminalSearchQuery = useCommandSandboxStore((state) => state.terminalSearchQuery);
  const terminalAutoScroll = useCommandSandboxStore((state) => state.terminalAutoScroll);

  const play = useCommandSandboxStore((state) => state.play);
  const pause = useCommandSandboxStore((state) => state.pause);
  const seekToTime = useCommandSandboxStore((state) => state.seekToTime);
  const stepForward = useCommandSandboxStore((state) => state.stepForward);
  const stepBackward = useCommandSandboxStore((state) => state.stepBackward);
  const setPlaybackSpeed = useCommandSandboxStore((state) => state.setPlaybackSpeed);
  const jumpToStart = useCommandSandboxStore((state) => state.jumpToStart);
  const jumpToEnd = useCommandSandboxStore((state) => state.jumpToEnd);
  const setTerminalSearchQuery = useCommandSandboxStore((state) => state.setTerminalSearchQuery);
  const toggleAutoScroll = useCommandSandboxStore((state) => state.toggleAutoScroll);

  // Playback timer effect
  useEffect(() => {
    if (!replayState.isPlaying || !recordedTrace) return;

    const intervalMs = 25; // 40fps update rate
    const stepDeltaMs = intervalMs * replayState.playbackSpeed;

    const timer = setInterval(() => {
      const nextTime = replayState.currentTimeMs + stepDeltaMs;
      if (nextTime >= recordedTrace.totalDurationMs) {
        seekToTime(recordedTrace.totalDurationMs);
        pause();
      } else {
        seekToTime(nextTime);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [
    replayState.isPlaying,
    replayState.currentTimeMs,
    replayState.playbackSpeed,
    recordedTrace,
    seekToTime,
    pause,
  ]);

  if (!recordedTrace) {
    return (
      <div className="terminal-replay-view empty">
        <div className="empty-state-message">No command execution trace loaded</div>
      </div>
    );
  }

  const isSuccess = recordedTrace.exitCode === 0;

  // Filter lines if needed
  const visibleLines: AnsiLine[] = replayState.visibleLines;

  return (
    <div className={`terminal-replay-view ${className}`}>
      {/* Command Info Banner */}
      <div className="command-banner">
        <div className="command-prompt-info">
          <span className="prompt-symbol">$</span>
          <code className="command-string">{recordedTrace.command}</code>
        </div>
        <div className="command-meta-badges">
          <span className="cwd-badge" title="Working Directory">
            📁 {recordedTrace.cwd}
          </span>
          <span className={`exit-badge ${isSuccess ? "success" : "error"}`}>
            {isSuccess ? "✓ Exit 0" : `✗ Exit ${recordedTrace.exitCode}`}
          </span>
        </div>
      </div>

      {/* Toolbar with Search and Auto-scroll */}
      <div className="replay-toolbar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search terminal output..."
            value={terminalSearchQuery}
            onChange={(e) => setTerminalSearchQuery(e.target.value)}
            className="terminal-search-input"
            aria-label="Search terminal output"
          />
          {terminalSearchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setTerminalSearchQuery("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="toolbar-toggles">
          <button
            type="button"
            className={`toggle-btn ${terminalAutoScroll ? "active" : ""}`}
            onClick={toggleAutoScroll}
            title="Auto-scroll terminal to bottom"
          >
            Auto-Scroll: {terminalAutoScroll ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Timeline Scrubber */}
      <ReplayTimeline
        currentTimeMs={replayState.currentTimeMs}
        totalDurationMs={recordedTrace.totalDurationMs}
        events={recordedTrace.events}
        onSeek={seekToTime}
      />

      {/* Playback Controls */}
      <PlaybackControls
        isPlaying={replayState.isPlaying}
        playbackSpeed={replayState.playbackSpeed}
        completedEventsCount={replayState.completedEventsCount}
        totalEventsCount={replayState.totalEventsCount}
        isFinished={replayState.isFinished}
        onPlay={play}
        onPause={pause}
        onStepForward={stepForward}
        onStepBackward={stepBackward}
        onJumpToStart={jumpToStart}
        onJumpToEnd={jumpToEnd}
        onSpeedChange={setPlaybackSpeed}
      />

      {/* Main Terminal Screen */}
      <TerminalDisplay
        lines={visibleLines}
        searchQuery={terminalSearchQuery}
        autoScroll={terminalAutoScroll}
        maxHeight="480px"
      />
    </div>
  );
};
