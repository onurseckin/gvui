import type { FC, KeyboardEvent, MouseEvent } from "react";

export interface EdgeBadgeOverlayProps {
  x: number;
  y: number;
  label?: string;
  isCycle?: boolean;
  isSelected?: boolean;
  onClick?: (e: MouseEvent<SVGGElement>) => void;
}

export const EdgeBadgeOverlay: FC<EdgeBadgeOverlayProps> = ({
  x,
  y,
  label,
  isCycle = false,
  isSelected = false,
  onClick,
}) => {
  const hasLabel = Boolean(label && label.trim().length > 0);
  if (!hasLabel && !isCycle) {
    return null;
  }

  const displayText = isCycle ? (label ? `↺ ${label}` : "↺") : (label ?? "");
  const width = Math.max(60, displayText.length * 7 + 24);
  const height = 28;

  const handleClick = (e: MouseEvent<SVGGElement>): void => {
    e.stopPropagation();
    onClick?.(e);
  };

  const handleKeyDown = (e: KeyboardEvent<SVGGElement>): void => {
    if ((e.key === "Enter" || e.key === " ") && onClick) {
      e.preventDefault();
      onClick(e as unknown as MouseEvent<SVGGElement>);
    }
  };

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className={`edge-badge-group ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={14}
        ry={14}
        fill="#18181b"
        stroke="#27272a"
        className={`edge-badge-rect ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""}`.trim()}
      />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        fontSize="11"
        fontFamily="var(--font-mono)"
        fontWeight="600"
        className="edge-badge-text"
      >
        {displayText}
      </text>
    </g>
  );
};
