import React from "react";
import { IconLock, IconLockOpen, IconShieldCheck } from "@tabler/icons-react";
import type { AgentLock } from "./types";

export interface LiveLockIndicatorProps {
  locks: AgentLock[];
  onReleaseLock?: (taskId: string) => void;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  if (remainingSecs === 0) return `${mins}m`;
  return `${mins}m ${remainingSecs}s`;
}

export const LiveLockIndicator: React.FC<LiveLockIndicatorProps> = ({ locks, onReleaseLock }) => {
  return (
    <div className="gvui-live-locks-section" data-testid="live-locks-indicator">
      <div className="gvui-live-locks-header">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <IconLock size={12} color="#818cf8" />
          <span>Active Task Leases & Locks</span>
        </div>
        <span className="gvui-live-locks-badge" data-testid="locks-count">
          {locks.length} {locks.length === 1 ? "Lock" : "Locks"}
        </span>
      </div>

      {locks.length === 0 ? (
        <div className="gvui-no-locks-msg" data-testid="no-locks-msg">
          <IconLockOpen
            size={12}
            style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}
          />
          No active write locks. All tasks are currently unlocked/idle.
        </div>
      ) : (
        <div className="gvui-locks-list" data-testid="locks-list">
          {locks.map((lock) => {
            const roleClass = `gvui-role-chip--${lock.role.toLowerCase()}`;
            return (
              <div
                key={lock.taskId}
                className="gvui-lock-card"
                data-testid={`lock-card-${lock.taskId}`}
              >
                <div className="gvui-lock-card__left">
                  <div className="gvui-lock-pulse-dot" title="Active Write Lease" />
                  <div className="gvui-lock-task-info">
                    <div className="gvui-lock-task-title">{lock.taskLabel ?? lock.taskId}</div>
                    {lock.writeScope && lock.writeScope.length > 0 && (
                      <div className="gvui-lock-scope" title={lock.writeScope.join(", ")}>
                        Scope: {lock.writeScope.join(", ")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="gvui-lock-card__right">
                  <span className={`gvui-role-chip ${roleClass}`}>
                    <IconShieldCheck size={10} />
                    {lock.role}
                  </span>
                  <span className="gvui-agent-name" title={lock.agentId}>
                    {lock.agentName ?? lock.agentId}
                  </span>
                  {lock.durationSeconds && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#a1a1aa",
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                      title="Lease Duration"
                    >
                      ({formatDuration(lock.durationSeconds)})
                    </span>
                  )}
                  {onReleaseLock && (
                    <button
                      type="button"
                      className="gvui-feed-btn"
                      style={{ padding: "2px 6px", fontSize: 10 }}
                      onClick={() => onReleaseLock(lock.taskId)}
                      title="Force Release Lock"
                      data-testid={`release-lock-${lock.taskId}`}
                    >
                      Release
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
