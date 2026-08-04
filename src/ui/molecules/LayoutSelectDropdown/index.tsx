import * as React from "react";
import { Select } from "../../atoms/Select";
import type { SelectOption } from "../../atoms/Select";
import type { LayoutMode } from "../../../state/useGraphStore";
import type { Direction } from "../../../engine/layout/custom/config";
import {
  DIRECTION_DESCRIPTORS,
  LAYOUT_MODE_DESCRIPTORS,
  describeLayoutMode,
} from "./LayoutSelectDropdown.types";
import type {
  DirectionSelectDropdownProps,
  LayoutSelectDropdownProps,
} from "./LayoutSelectDropdown.types";

const LAYOUT_ICONS: Record<LayoutMode, React.ReactNode> = {
  layered: (
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
      <rect width="7" height="5" x="8.5" y="3" rx="1" />
      <path d="M12 8v4" />
      <rect width="6" height="5" x="4" y="12" rx="1" />
      <rect width="6" height="5" x="14" y="12" rx="1" />
    </svg>
  ),
  radial: (
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
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4v6" />
      <path d="M12 14v6" />
      <path d="M4 12h6" />
      <path d="M14 12h6" />
    </svg>
  ),
};

/** Arrow pointing the way ranks advance, so the menu reads without parsing the label. */
const DIRECTION_ICONS: Record<Direction, React.ReactNode> = {
  "top-down": (
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
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  ),
  "bottom-up": (
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
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  ),
  "left-right": (
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
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  ),
  "right-left": (
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
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </svg>
  ),
};

const LAYOUT_OPTIONS: SelectOption<LayoutMode>[] = LAYOUT_MODE_DESCRIPTORS.map((descriptor) => ({
  value: descriptor.value,
  label: descriptor.label,
  icon: LAYOUT_ICONS[descriptor.value],
}));

const DIRECTION_OPTIONS: SelectOption<Direction>[] = DIRECTION_DESCRIPTORS.map((descriptor) => ({
  value: descriptor.value,
  label: descriptor.label,
  icon: DIRECTION_ICONS[descriptor.value],
}));

function describeDirection(direction: Direction): string {
  return DIRECTION_DESCRIPTORS.find((d) => d.value === direction)?.description ?? "";
}

/**
 * The `title` tooltip is how the one-line description reaches the user from a toolbar-sized
 * control: the shared `Select` atom takes a plain string label, so the description cannot live in
 * the menu itself without stretching the trigger to the width of a sentence. `display: inline-flex`
 * keeps the wrapper transparent to the toolbar's flex layout.
 */
const TOOLTIP_HOST_STYLE: React.CSSProperties = { display: "inline-flex" };

/** Picks the engine. Flow direction is a separate control — see `DirectionSelectDropdown`. */
export function LayoutSelectDropdown({
  value,
  defaultValue = "layered",
  onLayoutChange,
  size = "md",
  disabled = false,
  className = "",
  "aria-label": ariaLabel = "Select layout engine",
}: LayoutSelectDropdownProps): React.JSX.Element {
  const active = value ?? defaultValue;
  return (
    <span style={TOOLTIP_HOST_STYLE} title={describeLayoutMode(active)}>
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
    </span>
  );
}

/**
 * Picks the flow direction, writing `CustomLayoutConfig.direction`.
 *
 * Separate from the engine dropdown on purpose: direction used to be baked into the mode string,
 * which meant the engine silently ignored it. Keeping it a first-class control makes the one
 * source of truth also the one thing the user clicks.
 */
export function DirectionSelectDropdown({
  value,
  defaultValue = "top-down",
  onDirectionChange,
  size = "md",
  disabled = false,
  className = "",
  "aria-label": ariaLabel = "Select flow direction",
}: DirectionSelectDropdownProps): React.JSX.Element {
  const active = value ?? defaultValue;
  return (
    <span style={TOOLTIP_HOST_STYLE} title={describeDirection(active)}>
      <Select<Direction>
        options={DIRECTION_OPTIONS}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onDirectionChange}
        placeholder="Select Direction"
        size={size}
        disabled={disabled}
        className={className}
        aria-label={ariaLabel}
      />
    </span>
  );
}

// Runtime exports (LAYOUT_MODE_DESCRIPTORS, DIRECTION_DESCRIPTORS, describeLayoutMode)
// deliberately stay in ./LayoutSelectDropdown.types: re-exporting them here would make this a
// mixed module and cost React Fast Refresh for both dropdowns.
export type {
  DirectionDescriptor,
  DirectionSelectDropdownProps,
  LayoutModeDescriptor,
  LayoutSelectDropdownProps,
} from "./LayoutSelectDropdown.types";
