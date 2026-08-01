import * as React from "react";
import { Select } from "../../atoms/Select";
import type { SelectOption } from "../../atoms/Select";
import type { LayoutMode } from "../../../state/useGraphStore";
import type { LayoutSelectDropdownProps } from "./LayoutSelectDropdown.types";

const LAYOUT_OPTIONS: SelectOption<LayoutMode>[] = [
  {
    value: "top-down",
    label: "Top-Down (WASM Engine)",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v12" />
        <path d="m8 11 4 4 4-4" />
        <rect width="6" height="4" x="9" y="17" rx="1" />
      </svg>
    ),
  },
];

export function LayoutSelectDropdown({
  value,
  defaultValue = "top-down",
  onLayoutChange,
  size = "md",
  disabled = false,
  className = "",
  "aria-label": ariaLabel = "Select graph layout",
}: LayoutSelectDropdownProps): React.JSX.Element {
  return (
    <Select<LayoutMode>
      options={LAYOUT_OPTIONS}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onLayoutChange}
      placeholder="Select Layout"
      size={size}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    />
  );
}

export type { LayoutSelectDropdownProps } from "./LayoutSelectDropdown.types";
