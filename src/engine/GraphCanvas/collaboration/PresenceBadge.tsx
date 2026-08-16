import type { FC, MouseEvent as ReactMouseEvent } from "react";
import { useCallback } from "react";
import type { PresenceBadgeProps } from "./types";

export const PresenceBadge: FC<PresenceBadgeProps> = ({
  presence,
  size = "md",
  showRole = true,
  showStatusDot = true,
  isFollowing = false,
  onFollowToggle,
  onClick,
}) => {
  const { id, name, role, color, activityState, activeTaskId, avatarUrl } = presence;

  const initials = name
    .split(/[-_\s]+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleFollowClick = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onFollowToggle?.(id);
    },
    [id, onFollowToggle],
  );

  const handleBadgeClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onClick?.(presence);
    },
    [presence, onClick],
  );

  return (
    <div
      className={`gvui-presence-badge gvui-presence-badge--${size} gvui-presence-badge--${activityState} ${
        isFollowing ? "is-following" : ""
      }`}
      onClick={handleBadgeClick}
      data-testid={`presence-badge-${id}`}
      data-agent-id={id}
      role="button"
      tabIndex={0}
      aria-label={`Collaborator ${name}, role ${role}, status ${activityState}`}
    >
      {/* Avatar Container */}
      <div
        className="gvui-presence-avatar"
        style={{
          backgroundColor: color,
          borderColor: color,
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="gvui-presence-avatar-img" />
        ) : (
          <span className="gvui-presence-initials">{initials}</span>
        )}

        {/* Status Dot */}
        {showStatusDot && (
          <span
            className={`gvui-presence-status-dot gvui-presence-status-dot--${activityState}`}
            title={`Status: ${activityState}`}
            data-testid="presence-status-dot"
          />
        )}
      </div>

      {/* Info Section */}
      <div className="gvui-presence-info">
        <div className="gvui-presence-name-row">
          <span className="gvui-presence-name">{name}</span>
          {showRole && (
            <span
              className="gvui-presence-role-pill"
              style={{
                borderColor: color,
                color,
              }}
            >
              {role}
            </span>
          )}
        </div>

        {activeTaskId && (
          <div className="gvui-presence-task-subtext" title={`Task: ${activeTaskId}`}>
            Task: {activeTaskId}
          </div>
        )}
      </div>

      {/* Follow Toggle Button */}
      {onFollowToggle && (
        <button
          type="button"
          className={`gvui-presence-follow-btn ${isFollowing ? "is-active" : ""}`}
          onClick={handleFollowClick}
          title={isFollowing ? "Stop following camera" : "Follow agent camera"}
          aria-label={isFollowing ? `Stop following ${name}` : `Follow ${name}`}
          data-testid={`follow-btn-${id}`}
        >
          {isFollowing ? "👁️ Following" : "👁️ Follow"}
        </button>
      )}
    </div>
  );
};
