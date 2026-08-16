import type { FC } from "react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { IconGitCompare, IconHistory } from "@tabler/icons-react";
import { getStateAtEvent, useHistoryReplayStore } from "../../store/useHistoryReplayStore";
import { BookmarkList } from "./BookmarkList";
import { PlaybackControls } from "./PlaybackControls";
import { StateDiffModal } from "./StateDiffModal";
import { TimelineScrubber } from "./TimelineScrubber";
import type { ReplayEvent, ReplayStateSnapshot } from "./types";
import "./HistoryReplay.css";

export interface HistoryReplayProps {
  initialEventsJsonl?: string;
  eventsOverride?: readonly ReplayEvent[];
  className?: string;
  onStateSnapshotChange?: (snapshot: ReplayStateSnapshot) => void;
  onEventSeek?: (index: number, event: ReplayEvent) => void;
  autoPlay?: boolean;
}

export const HistoryReplay: FC<HistoryReplayProps> = memo(function HistoryReplay({
  initialEventsJsonl,
  eventsOverride,
  className = "",
  onStateSnapshotChange,
  onEventSeek,
  autoPlay = false,
}) {
  const storeEvents = useHistoryReplayStore((s) => s.events);
  const currentEventIndex = useHistoryReplayStore((s) => s.currentEventIndex);
  const isPlaying = useHistoryReplayStore((s) => s.isPlaying);
  const playbackSpeed = useHistoryReplayStore((s) => s.playbackSpeed);
  const isLooping = useHistoryReplayStore((s) => s.isLooping);
  const bookmarks = useHistoryReplayStore((s) => s.bookmarks);
  const filterBookmarkCategory = useHistoryReplayStore((s) => s.filterBookmarkCategory);
  const isDiffModalOpen = useHistoryReplayStore((s) => s.isDiffModalOpen);
  const selectedDiffIndices = useHistoryReplayStore((s) => s.selectedDiffIndices);

  const loadEventsJsonl = useHistoryReplayStore((s) => s.loadEventsJsonl);
  const setEvents = useHistoryReplayStore((s) => s.setEvents);
  const seekToIndex = useHistoryReplayStore((s) => s.seekToIndex);
  const play = useHistoryReplayStore((s) => s.play);
  const togglePlay = useHistoryReplayStore((s) => s.togglePlay);
  const stepForward = useHistoryReplayStore((s) => s.stepForward);
  const stepBackward = useHistoryReplayStore((s) => s.stepBackward);
  const jumpToStart = useHistoryReplayStore((s) => s.jumpToStart);
  const jumpToEnd = useHistoryReplayStore((s) => s.jumpToEnd);
  const setSpeed = useHistoryReplayStore((s) => s.setSpeed);
  const toggleLoop = useHistoryReplayStore((s) => s.toggleLoop);
  const addBookmark = useHistoryReplayStore((s) => s.addBookmark);
  const removeBookmark = useHistoryReplayStore((s) => s.removeBookmark);
  const setBookmarkCategoryFilter = useHistoryReplayStore((s) => s.setBookmarkCategoryFilter);
  const jumpToNextBookmark = useHistoryReplayStore((s) => s.jumpToNextBookmark);
  const jumpToPrevBookmark = useHistoryReplayStore((s) => s.jumpToPrevBookmark);
  const jumpToNextFailure = useHistoryReplayStore((s) => s.jumpToNextFailure);
  const jumpToNextCritic = useHistoryReplayStore((s) => s.jumpToNextCritic);
  const openDiffModal = useHistoryReplayStore((s) => s.openDiffModal);
  const closeDiffModal = useHistoryReplayStore((s) => s.closeDiffModal);

  // Initialize store if props provided
  useEffect(() => {
    if (initialEventsJsonl) {
      loadEventsJsonl(initialEventsJsonl);
      if (autoPlay) {
        play();
      }
    }
  }, [initialEventsJsonl, loadEventsJsonl, autoPlay, play]);

  useEffect(() => {
    if (eventsOverride && eventsOverride.length > 0) {
      setEvents([...eventsOverride]);
      if (autoPlay) {
        play();
      }
    }
  }, [eventsOverride, setEvents, autoPlay, play]);

  const activeEvents: readonly ReplayEvent[] =
    eventsOverride !== undefined ? eventsOverride : storeEvents;

  // Active snapshot calculation
  const currentSnapshot: ReplayStateSnapshot = useMemo(() => {
    return getStateAtEvent(currentEventIndex, activeEvents);
  }, [currentEventIndex, activeEvents]);

  // Notify listeners when snapshot changes
  useEffect(() => {
    if (onStateSnapshotChange) {
      onStateSnapshotChange(currentSnapshot);
    }
    if (onEventSeek && currentSnapshot.event) {
      onEventSeek(currentEventIndex, currentSnapshot.event);
    }
  }, [currentSnapshot, currentEventIndex, onStateSnapshotChange, onEventSeek]);

  // Autoplay timer loop
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying && activeEvents.length > 0) {
      const intervalMs = Math.max(100, Math.round(1000 / playbackSpeed));
      timerRef.current = setInterval(() => {
        stepForward();
      }, intervalMs);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, activeEvents.length, stepForward]);

  const handleSeek = useCallback(
    (index: number) => {
      seekToIndex(index);
    },
    [seekToIndex],
  );

  const handleAddCustomBookmark = useCallback(
    (eventIndex: number, label: string, note?: string) => {
      addBookmark(eventIndex, label, note, "custom");
    },
    [addBookmark],
  );

  const currentEvent = currentSnapshot.event;

  return (
    <div className={`history-replay-hud ${className}`} data-testid="history-replay-hud">
      {/* Header */}
      <div className="history-replay-hud-header">
        <div className="history-replay-title-group">
          <IconHistory size={18} style={{ color: "#818cf8" }} />
          <h1 className="history-replay-title">Execution History Replay</h1>
          <span className="history-replay-badge" data-testid="badge-event-sequence">
            Seq #{currentEvent?.sequence ?? 0}
          </span>
        </div>

        <div className="history-replay-header-actions">
          <button
            type="button"
            className="history-replay-btn"
            onClick={() => openDiffModal()}
            disabled={activeEvents.length < 2}
            data-testid="btn-header-diff"
          >
            <IconGitCompare size={14} /> State Diff
          </button>
        </div>
      </div>

      {/* Timeline Scrubber */}
      <TimelineScrubber
        events={activeEvents}
        currentEventIndex={currentEventIndex}
        bookmarks={bookmarks}
        onSeek={handleSeek}
      />

      {/* Playback Controls */}
      <PlaybackControls
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        isLooping={isLooping}
        currentEventIndex={currentEventIndex}
        totalEvents={activeEvents.length}
        onPlayToggle={togglePlay}
        onStepForward={stepForward}
        onStepBackward={stepBackward}
        onJumpToStart={jumpToStart}
        onJumpToEnd={jumpToEnd}
        onSpeedChange={setSpeed}
        onLoopToggle={toggleLoop}
        onNextBookmark={jumpToNextBookmark}
        onPrevBookmark={jumpToPrevBookmark}
        onNextFailure={jumpToNextFailure}
        onNextCritic={jumpToNextCritic}
        onOpenDiff={() => openDiffModal()}
      />

      {/* Body: Left Pane (Snapshot & Event Info) + Right Pane (Bookmarks) */}
      <div className="history-replay-body">
        <div className="history-replay-left-pane">
          {/* Snapshot Summary Cards */}
          <div className="history-snapshot-card" data-testid="snapshot-summary-card">
            <div className="history-snapshot-header">
              <span>Point-in-Time Snapshot</span>
              <span>
                Step {currentEventIndex + 1} / {activeEvents.length}
              </span>
            </div>
            <div className="history-stats-grid">
              <div className="history-stat-box">
                <div className="history-stat-value" data-testid="stat-total-nodes">
                  {currentSnapshot.summary.totalNodes}
                </div>
                <div className="history-stat-label">Nodes</div>
              </div>
              <div className="history-stat-box">
                <div className="history-stat-value" data-testid="stat-total-edges">
                  {currentSnapshot.summary.totalEdges}
                </div>
                <div className="history-stat-label">Edges</div>
              </div>
              <div className="history-stat-box">
                <div className="history-stat-value stat-active" data-testid="stat-active-leases">
                  {currentSnapshot.summary.activeLeases}
                </div>
                <div className="history-stat-label">Active Leases</div>
              </div>
              <div className="history-stat-box">
                <div className="history-stat-value stat-success" data-testid="stat-completed-tasks">
                  {currentSnapshot.summary.completedTasks}
                </div>
                <div className="history-stat-label">Completed</div>
              </div>
              <div className="history-stat-box">
                <div className="history-stat-value stat-error" data-testid="stat-failed-tasks">
                  {currentSnapshot.summary.failedTasks}
                </div>
                <div className="history-stat-label">Failures</div>
              </div>
            </div>
          </div>

          {/* Current Event Details */}
          {currentEvent && (
            <div className="history-event-detail-box" data-testid="current-event-detail-box">
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontWeight: 700, color: "#ffffff" }}>
                  Event #{currentEvent.sequence}: {currentEvent.kind}
                </span>
                <span style={{ fontSize: "11px", color: "#a1a1aa" }}>
                  Actor: <strong style={{ color: "#e4e4e7" }}>{currentEvent.actor}</strong>
                </span>
              </div>
              {currentEvent.summary && (
                <div style={{ color: "#c7d2fe", fontSize: "12px", marginTop: "2px" }}>
                  {currentEvent.summary}
                </div>
              )}
              {currentEvent.payload && Object.keys(currentEvent.payload).length > 0 && (
                <pre className="history-event-payload-json" data-testid="event-payload-json">
                  {JSON.stringify(currentEvent.payload, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Right Pane: Bookmark List */}
        <BookmarkList
          bookmarks={bookmarks}
          currentEventIndex={currentEventIndex}
          activeFilter={filterBookmarkCategory}
          onSelectFilter={setBookmarkCategoryFilter}
          onJumpToBookmark={handleSeek}
          onAddBookmark={handleAddCustomBookmark}
          onRemoveBookmark={removeBookmark}
        />
      </div>

      {/* State Diff Modal */}
      <StateDiffModal
        isOpen={isDiffModalOpen}
        events={activeEvents}
        initialIndexA={selectedDiffIndices?.indexA}
        initialIndexB={selectedDiffIndices?.indexB}
        onClose={closeDiffModal}
        onJumpToEvent={handleSeek}
      />
    </div>
  );
});
