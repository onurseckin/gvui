import type * as React from "react";

export type BadgeVariant = "success" | "error" | "warning" | "info" | "tool" | "gray" | "default";

export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  glow?: boolean;
  children?: React.ReactNode;
  className?: string;
}
