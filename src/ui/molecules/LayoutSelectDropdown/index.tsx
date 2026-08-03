import * as React from "react";
import { Select } from "../../atoms/Select";
import type { SelectOption } from "../../atoms/Select";
import type { LayoutMode } from "../../../state/useGraphStore";
import type { LayoutSelectDropdownProps } from "./LayoutSelectDropdown.types";

const LAYOUT_OPTIONS: SelectOption<LayoutMode>[] = [
  {
    value: "top-down",
    label: "State-Space Top-Down",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="m8 11 4 4 4-4" />
        <rect width="6" height="4" x="9" y="17" rx="1" />
      </svg>
    ),
  },
  {
    value: "top-down-dagre",
    label: "Ranked Top-Down",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="7" height="5" x="8.5" y="3" rx="1" />
        <path d="M12 8v4" />
        <rect width="6" height="5" x="4" y="12" rx="1" />
        <rect width="6" height="5" x="14" y="12" rx="1" />
      </svg>
    ),
  },
  {
    value: "left-right",
    label: "Ranked Left-to-Right",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h12" />
        <path d="m11 8 4 4-4 4" />
        <rect width="4" height="6" x="17" y="9" rx="1" />
      </svg>
    ),
  },
  {
    value: "force",
    label: "Organic Force-Directed",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="18" r="2" />
        <path d="M7 7.5 10 10" />
        <path d="m17 7.5-3 2.5" />
        <path d="M7 16.5 10 14" />
        <path d="m17 16.5-3-2.5" />
      </svg>
    ),
  },
  {
    value: "radial",
    label: "Organic Radial",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 4v6" />
        <path d="M12 14v6" />
        <path d="M4 12h6" />
        <path d="M14 12h6" />
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
