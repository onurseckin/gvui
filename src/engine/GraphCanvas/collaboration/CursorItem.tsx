import type { FC, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useMemo } from "react";
import type { CursorItemProps } from "./types";

export const CursorItem: FC<CursorItemProps> = ({
  presence,
  trailPoints = [],
  isSelf = false,
  showTrail = true,
  onClick,
}) => {
  const { cursor, color, name, role, activityState, id } = presence;

  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onClick?.(id);
    },
    [id, onClick],
  );

  const trailPolyline = useMemo(() => {
    if (!showTrail || trailPoints.length < 2) return null;
    return trailPoints.map((p) => `${p.x},${p.y}`).join(" ");
  }, [showTrail, trailPoints]);

  if (!cursor) return null;

  const isClicking = Boolean(cursor.isPointerDown);
  const isIdle = activityState === "idle";
  const isDisconnected = activityState === "disconnected";

  if (isDisconnected) return null;

  return (
    <div
      className={`gvui-collab-cursor-wrapper ${isSelf ? "is-self" : ""} ${
        isIdle ? "is-idle" : ""
      } ${isClicking ? "is-clicking" : ""}`}
      style={{
        transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
        zIndex: isClicking ? 50 : 30,
      }}
      data-testid={`cursor-${id}`}
      data-agent-id={id}
      data-agent-role={role}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Cursor of ${name} (${role})`}
    >
      {/* Click ripple animation */}
      {isClicking && (
        <div
          className="gvui-cursor-click-ripple"
          style={{ borderColor: color }}
          data-testid="cursor-click-ripple"
        />
      )}

      {/* SVG Cursor Pointer */}
      <svg
        className="gvui-collab-cursor-svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M3 3L10.07 20.97L13.58 13.58L20.97 10.07L3 3Z"
          fill={color}
          stroke="#09090b"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* Agent Tag Label */}
      <div
        className="gvui-collab-cursor-label"
        style={{
          backgroundColor: color,
        }}
      >
        <span className="gvui-cursor-name">{name}</span>
        {role && <span className="gvui-cursor-role">[{role}]</span>}
        {cursor.targetNodeId && (
          <span className="gvui-cursor-target" title={`Target: ${cursor.targetNodeId}`}>
            🎯 {cursor.targetNodeId}
          </span>
        )}
      </div>

      {/* Trail element if any */}
      {trailPolyline && (
        <svg
          className="gvui-cursor-trail-svg"
          style={{
            position: "absolute",
            top: -cursor.y,
            left: -cursor.x,
            width: "10000px",
            height: "10000px",
            pointerEvents: "none",
            overflow: "visible",
          }}
          aria-hidden="true"
        >
          <polyline
            points={trailPolyline}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity="0.4"
            strokeDasharray="4 2"
          />
        </svg>
      )}
    </div>
  );
};
