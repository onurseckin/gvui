import * as React from "react";
import { Select } from "../../atoms/Select";
import type { SelectOption } from "../../atoms/Select";
import type { LayoutMode } from "../../../state/useGraphStore";
import type { LayoutSelectDropdownProps } from "./LayoutSelectDropdown.types";

const LAYOUT_OPTIONS: SelectOption<LayoutMode>[] = [
  {
    value: "top-down",
    label: "Top-Down (State-Space Engine)",
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
  {
    value: "top-down-dagre",
    label: "Top-Down (Dagre Ranked Engine)",
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
        <path d="M4 21h16" />
      </svg>
    ),
  },
  {
    value: "left-right",
    label: "Left-to-Right (Dagre Rank-Based Engine)",
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
        <path d="M3 12h12" />
        <path d="m11 8 4 4-4 4" />
        <rect width="4" height="6" x="17" y="9" rx="1" />
      </svg>
    ),
  },
  {
    value: "force",
    label: "Organic Force (Physics Force-Directed)",
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
        <circle cx="12" cy="12" r="3" />
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="18" r="2" />
        <line x1="6.8" y1="7.4" x2="10.2" y2="10.6" />
        <line x1="17.2" y1="7.4" x2="13.8" y2="10.6" />
        <line x1="6.8" y1="16.6" x2="10.2" y2="13.4" />
        <line x1="17.2" y1="16.6" x2="13.8" y2="13.4" />
      </svg>
    ),
  },
  {
    value: "radial",
    label: "Radial Balance (Concentric Circular)",
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
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="3" x2="12" y2="9" />
        <line x1="12" y1="15" x2="12" y2="21" />
        <line x1="3" y1="12" x2="9" y2="12" />
        <line x1="15" y1="12" x2="21" y2="12" />
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
