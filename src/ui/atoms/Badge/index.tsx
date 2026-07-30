import * as React from "react";
import type { BadgeProps } from "./Badge.types";
import "./Badge.css";

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = "default",
      size = "md",
      dot = false,
      glow = false,
      className = "",
      children,
      ...props
    },
    ref,
  ) => {
    const combinedClassName = [
      "gvui-badge",
      `gvui-badge--${variant}`,
      `gvui-badge--${size}`,
      glow ? "gvui-badge--glow" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <span ref={ref} className={combinedClassName} {...props}>
        {dot && <span className="gvui-badge-dot" />}
        {children}
      </span>
    );
  },
);

Badge.displayName = "Badge";

export type { BadgeProps, BadgeVariant, BadgeSize } from "./Badge.types";
