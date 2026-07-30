import * as React from "react";
import { Button as BaseButton } from "@base-ui-components/react/button";
import type { ButtonProps } from "./Button.types";
import "./Button.css";

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => {
    const combinedClassName = [
      "gvui-button",
      `gvui-button--${variant}`,
      `gvui-button--${size}`,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <BaseButton ref={ref} className={combinedClassName} {...props}>
        {children}
      </BaseButton>
    );
  },
);

Button.displayName = "Button";

export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button.types";
