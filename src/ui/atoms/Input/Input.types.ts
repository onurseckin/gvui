import type { Input as BaseInput } from "@base-ui-components/react/input";

export type InputSize = "sm" | "md" | "lg";

export interface InputProps extends Omit<BaseInput.Props, "size"> {
  size?: InputSize;
  fullWidth?: boolean;
  className?: string;
}
