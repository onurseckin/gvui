import type { FC, KeyboardEvent, MouseEvent } from "react";

export interface EdgeBadgeOverlayProps {
  x: number;
  y: number;
  label?: string;
  isCycle?: boolean;
  isSelected?: boolean;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
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

  const width = 120;
  const height = 28;

  const handleClick = (e: MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    onClick?.(e);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.key === "Enter" || e.key === " ") && onClick) {
      e.preventDefault();
      onClick(e as unknown as MouseEvent<HTMLDivElement>);
    }
  };

  return (
    <foreignObject
      x={x - width / 2}
      y={y - height / 2}
      width={width}
      height={height}
      className="edge-badge-foreign-object"
    >
      <div
        className={`edge-badge-overlay ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {isCycle ? <span className="edge-badge-cycle-icon">↺</span> : null}
        {label ? <span className="edge-badge-label">{label}</span> : null}
      </div>
    </foreignObject>
  );
};
