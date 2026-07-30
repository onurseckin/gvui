import * as React from "react";
import { Input as BaseInput } from "@base-ui-components/react/input";
import type { InputProps } from "./Input.types";
import "./Input.css";

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ size = "md", fullWidth = false, className = "", ...props }, ref) => {
    const combinedClassName = [
      "gvui-input",
      `gvui-input--${size}`,
      fullWidth ? "gvui-input--full-width" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return <BaseInput ref={ref} className={combinedClassName} {...props} />;
  },
);

Input.displayName = "Input";

export type { InputProps, InputSize } from "./Input.types";
