import type * as React from "react";

export type SelectSize = "sm" | "md" | "lg";

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface SelectProps<V extends string = string> {
  options: SelectOption<V>[];
  value?: V;
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  placeholder?: string;
  size?: SelectSize;
  disabled?: boolean;
  className?: string;
  popupClassName?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
}
