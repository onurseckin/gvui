import type * as React from "react";
import type { Button as BaseButton } from "@base-ui-components/react/button";

export type ButtonVariant = "primary" | "ghost" | "icon" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<BaseButton.Props, "variant" | "size"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: React.ReactNode;
  className?: string;
}
