import type React from "react";
import type { InputProps } from "../../atoms/Input";

export interface SearchInputProps extends InputProps {
  onClear?: () => void;
  showHotkey?: boolean;
  hotkeyText?: string;
  onClick?: React.MouseEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
}
