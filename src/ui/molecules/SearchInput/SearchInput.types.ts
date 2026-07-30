import type { InputProps } from "../../atoms/Input";

export interface SearchInputProps extends InputProps {
  onClear?: () => void;
  showHotkey?: boolean;
  hotkeyText?: string;
}
