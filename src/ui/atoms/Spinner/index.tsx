import type { FC, HTMLAttributes } from "react";
import "./Spinner.css";

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

export const Spinner: FC<SpinnerProps> = ({ size = "md", className = "", ...props }) => {
  return (
    <div
      aria-label="Loading..."
      className={`gvui-spinner gvui-spinner--${size} ${className}`}
      role="status"
      {...props}
    />
  );
};
