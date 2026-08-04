import type { LayoutMode } from "../../../state/useGraphStore";
import type { Direction } from "../../../engine/layout/custom/config";
import type { SelectSize } from "../../atoms/Select";

/**
 * One entry of the layout menu. `description` is carried alongside the label because the shared
 * `Select` atom renders a plain string label — surfaces that can show the long form (the settings
 * panel, tooltips) read it from here rather than duplicating the copy.
 */
export interface LayoutModeDescriptor {
  value: LayoutMode;
  label: string;
  description: string;
}

/**
 * The whole menu: two engines, one line each. Direction is NOT in here — it is a separate control
 * writing `layoutConfig.direction`, because an engine and the way its ranks flow are independent
 * choices and fusing them into one string is what made `left-right` unselectable in practice.
 */
export const LAYOUT_MODE_DESCRIPTORS: LayoutModeDescriptor[] = [
  {
    value: "layered",
    label: "Layered",
    description: "Ranks the graph by flow and routes edges through reserved lanes.",
  },
  {
    value: "radial",
    label: "Radial",
    description: "Concentric rings around a root, sized by each branch's share of the graph.",
  },
];

/** Long form of an option, for surfaces that can show more than the Select atom's string label. */
export function describeLayoutMode(mode: LayoutMode): string {
  return LAYOUT_MODE_DESCRIPTORS.find((descriptor) => descriptor.value === mode)?.description ?? "";
}

/** One entry of the direction menu. Mirrors `LayoutModeDescriptor` so both menus read the same. */
export interface DirectionDescriptor {
  value: Direction;
  label: string;
  description: string;
}

/**
 * The single source of user-facing direction copy. Shared by the canvas toolbar and the settings
 * panel so the two can never disagree about what `right-left` is called.
 */
export const DIRECTION_DESCRIPTORS: DirectionDescriptor[] = [
  { value: "top-down", label: "Top-down", description: "Ranks increase downward." },
  { value: "bottom-up", label: "Bottom-up", description: "Ranks increase upward." },
  { value: "left-right", label: "Left-right", description: "Ranks increase rightward." },
  { value: "right-left", label: "Right-left", description: "Ranks increase leftward." },
];

export interface LayoutSelectDropdownProps {
  value?: LayoutMode;
  defaultValue?: LayoutMode;
  onLayoutChange?: (layout: LayoutMode) => void;
  size?: SelectSize;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export interface DirectionSelectDropdownProps {
  value?: Direction;
  defaultValue?: Direction;
  onDirectionChange?: (direction: Direction) => void;
  size?: SelectSize;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}
