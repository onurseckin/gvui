import type { FC, KeyboardEvent, MouseEvent } from "react";

import "./PortSocket.css";

export type PortPosition = "top" | "right" | "bottom" | "left";
export type PortState = "idle" | "connected" | "connecting" | "hovered" | "disabled";
export type PortType = "input" | "output" | "bidirectional";

export interface PortSocketProps {
  id?: string;
  position?: PortPosition;
  state?: PortState;
  type?: PortType;
  label?: string;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  className?: string;
}

export const PortSocket: FC<PortSocketProps> = ({
  id,
  position = "bottom",
  state = "idle",
  type = "output",
  label,
  onClick,
  className = "",
}) => {
  const classes = ["port-socket", `pos-${position}`, `state-${state}`, `type-${type}`, className]
    .filter(Boolean)
    .join(" ");

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.key === "Enter" || e.key === " ") && onClick) {
      e.preventDefault();
      // Bridge event type safely for keyboard activation
      onClick(e as unknown as MouseEvent<HTMLDivElement>);
    }
  };

  return (
    <div
      id={id}
      className={classes}
      title={label ?? `${type} port (${position})`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="port-socket-inner" />
    </div>
  );
};
