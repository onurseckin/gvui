import React, { useMemo } from "react";
import {
  IconActivity,
  IconAppWindow,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconInbox,
  IconPlayerPause,
  IconPlayerPlay,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useCollaborationStore, type CollaborationStore } from "../../store/useCollaborationStore";
import type { CollaborationEvent, RoleFilter, SeverityFilter } from "./types";
import { FeedItem } from "./FeedItem";
import { LiveLockIndicator } from "./LiveLockIndicator";
import { ThroughputGauge } from "./ThroughputGauge";
import "./CollaborationFeed.css";

export interface CollaborationFeedProps {
  customStore?: CollaborationStore;
  onSelectTask?: (taskId: string) => void;
  onSelectAgent?: (agentId: string) => void;
  className?: string;
  defaultDocked?: boolean;
  defaultCollapsed?: boolean;
}

export const CollaborationFeed: React.FC<CollaborationFeedProps> = ({
  customStore,
  onSelectTask,
  onSelectAgent,
  className = "",
  defaultDocked,
  defaultCollapsed,
}) => {
  // Use either customStore passed in props (e.g. for testing) or Zustand global hook
  const globalStore = useCollaborationStore();
  const store = customStore ?? globalStore;

  const {
    events,
    activeLocks,
    throughput,
    severityFilter,
    roleFilter,
    searchQuery,
    isStreamingPaused,
    isDocked,
    isCollapsed,
    setSeverityFilter,
    setRoleFilter,
    setSearchQuery,
    togglePauseStreaming,
    clearEvents,
    releaseAgentLock,
    setDocked,
    setCollapsed,
    exportFeedJson,
    getFilteredEvents,
    getActiveLocks,
  } = store;

  // Sync initial props if provided
  React.useEffect(() => {
    if (defaultDocked !== undefined) {
      setDocked(defaultDocked);
    }
  }, [defaultDocked, setDocked]);

  React.useEffect(() => {
    if (defaultCollapsed !== undefined) {
      setCollapsed(defaultCollapsed);
    }
  }, [defaultCollapsed, setCollapsed]);

  const filteredEvents: CollaborationEvent[] = useMemo(() => {
    return getFilteredEvents();
  }, [events, severityFilter, roleFilter, searchQuery, getFilteredEvents]);

  const currentLocks = useMemo(() => {
    return getActiveLocks();
  }, [activeLocks, getActiveLocks]);

  const handleExportJson = () => {
    const jsonStr = exportFeedJson();
    if (typeof document !== "undefined") {
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `collaboration-feed-${new Date().toISOString().replace(/:/g, "-")}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const severityOptions: Array<{ id: SeverityFilter; label: string; classModifier?: string }> = [
    { id: "all", label: "All" },
    { id: "info", label: "Info" },
    { id: "warn", label: "Warn", classModifier: "warn" },
    { id: "reject", label: "Rejections", classModifier: "reject" },
    { id: "approve", label: "Approvals", classModifier: "approve" },
  ];

  const roleOptions: Array<{ id: RoleFilter; label: string }> = [
    { id: "all", label: "All Roles" },
    { id: "orchestrator", label: "Orchestrator" },
    { id: "implementer", label: "Implementer" },
    { id: "validator", label: "Validator" },
    { id: "critic", label: "Critic" },
  ];

  const containerClasses = [
    "gvui-collaboration-feed",
    isDocked ? "gvui-collaboration-feed--docked" : "",
    isCollapsed ? "gvui-collaboration-feed--collapsed" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses} data-testid="collaboration-feed-hud">
      {/* Feed Header */}
      <div className="gvui-feed-header">
        <div className="gvui-feed-title-section">
          <div className="gvui-feed-title">
            <IconActivity size={16} color="#818cf8" />
            <span>Collaboration Feed</span>
          </div>

          <div
            className={`gvui-live-indicator ${isStreamingPaused ? "gvui-live-indicator--paused" : ""}`}
            data-testid="feed-live-indicator"
          >
            <div className="gvui-live-dot" />
            <span>{isStreamingPaused ? "Paused" : "Live"}</span>
          </div>
        </div>

        <div className="gvui-feed-actions">
          {/* Pause / Resume */}
          <button
            type="button"
            className={`gvui-feed-btn ${isStreamingPaused ? "gvui-feed-btn--active" : ""}`}
            onClick={togglePauseStreaming}
            title={isStreamingPaused ? "Resume Live Stream" : "Pause Live Stream"}
            data-testid="toggle-stream-pause-btn"
          >
            {isStreamingPaused ? <IconPlayerPlay size={13} /> : <IconPlayerPause size={13} />}
            <span>{isStreamingPaused ? "Resume" : "Pause"}</span>
          </button>

          {/* Clear Feed */}
          <button
            type="button"
            className="gvui-feed-btn"
            onClick={clearEvents}
            title="Clear Event History"
            data-testid="clear-feed-btn"
          >
            <IconTrash size={13} />
            <span>Clear</span>
          </button>

          {/* Export JSON */}
          <button
            type="button"
            className="gvui-feed-btn"
            onClick={handleExportJson}
            title="Export Feed JSON"
            data-testid="export-feed-btn"
          >
            <IconDownload size={13} />
            <span>Export</span>
          </button>

          {/* Dock / Undock */}
          <button
            type="button"
            className={`gvui-feed-btn ${isDocked ? "gvui-feed-btn--active" : ""}`}
            onClick={() => setDocked(!isDocked)}
            title={isDocked ? "Undock HUD" : "Dock HUD to corner"}
            data-testid="toggle-dock-btn"
          >
            <IconAppWindow size={13} />
          </button>

          {/* Collapse / Expand */}
          <button
            type="button"
            className="gvui-feed-btn"
            onClick={() => setCollapsed(!isCollapsed)}
            title={isCollapsed ? "Expand Feed" : "Collapse Feed"}
            data-testid="toggle-collapse-btn"
          >
            {isCollapsed ? <IconChevronDown size={13} /> : <IconChevronUp size={13} />}
          </button>
        </div>
      </div>

      {/* Main Body (hidden when collapsed) */}
      {!isCollapsed && (
        <>
          {/* Throughput & Latency Gauge */}
          <ThroughputGauge metrics={throughput} />

          {/* Live Task Locks & Leases */}
          <LiveLockIndicator
            locks={currentLocks}
            onReleaseLock={(taskId) => releaseAgentLock(taskId)}
          />

          {/* Filter & Search Toolbar */}
          <div className="gvui-feed-toolbar" data-testid="feed-toolbar">
            <div className="gvui-toolbar-left">
              {/* Search Box */}
              <div className="gvui-search-wrapper">
                <span className="gvui-search-icon">
                  <IconSearch size={14} />
                </span>
                <input
                  type="text"
                  className="gvui-search-input"
                  placeholder="Filter events, agents, tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="feed-search-input"
                />
                {searchQuery.length > 0 && (
                  <button
                    type="button"
                    className="gvui-search-clear"
                    onClick={() => setSearchQuery("")}
                    title="Clear search"
                    data-testid="clear-search-btn"
                  >
                    <IconX size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="gvui-toolbar-right">
              {/* Severity Filter Chips */}
              <div className="gvui-filter-group" data-testid="severity-filter-group">
                {severityOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`gvui-filter-chip ${opt.classModifier ? `gvui-filter-chip--${opt.classModifier}` : ""} ${
                      severityFilter === opt.id ? "gvui-filter-chip--active" : ""
                    }`}
                    onClick={() => setSeverityFilter(opt.id)}
                    data-testid={`filter-severity-${opt.id}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Role Filter Chips */}
              <div className="gvui-filter-group" data-testid="role-filter-group">
                {roleOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`gvui-filter-chip ${roleFilter === opt.id ? "gvui-filter-chip--active" : ""}`}
                    onClick={() => setRoleFilter(opt.id)}
                    data-testid={`filter-role-${opt.id}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Streaming Events List */}
          <div className="gvui-feed-items-container" data-testid="feed-items-container">
            {filteredEvents.length === 0 ? (
              <div className="gvui-feed-empty-state" data-testid="feed-empty-state">
                <IconInbox size={28} className="gvui-feed-empty-icon" />
                <div className="gvui-feed-empty-text">
                  {events.length === 0
                    ? "No collaboration events recorded yet. Ready for incoming agent activity."
                    : "No events match the selected filters or search query."}
                </div>
              </div>
            ) : (
              filteredEvents.map((evt) => (
                <FeedItem
                  key={evt.id}
                  event={evt}
                  onSelectTask={onSelectTask}
                  onSelectAgent={onSelectAgent}
                />
              ))
            )}
          </div>

          {/* Paused Notification Banner */}
          {isStreamingPaused && (
            <div className="gvui-feed-paused-banner" data-testid="stream-paused-banner">
              <span>Stream display paused. Incoming events are still recorded in memory.</span>
              <button
                type="button"
                className="gvui-feed-btn"
                style={{ color: "#ffffff", padding: "2px 8px" }}
                onClick={togglePauseStreaming}
              >
                Resume
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
