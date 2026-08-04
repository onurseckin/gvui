import type { LayoutMode } from "../../../state/useGraphStore";
import type { SelectSize } from "../../atoms/Select";

/**
 * One entry of the layout menu. `description` is carried alongside the label because the shared
 * `Select` atom renders a plain string label — surfaces that can show the long form (the engine
 * options panel, tooltips) read it from here rather than duplicating the copy.
 */
export interface LayoutModeDescriptor {
  value: LayoutMode;
  label: string;
  description: string;
}

/**
 * Menu order doubles as the preference order: `layered` first because it is the default mode.
 * Lives beside the types rather than in `index.tsx` so importing the copy does not pull a
 * component module (and does not break React Fast Refresh for the dropdown).
 */
export const LAYOUT_MODE_DESCRIPTORS: LayoutModeDescriptor[] = [
  {
    value: "layered",
    label: "Layered",
    description: "Ranked layers with orthogonal routing. The default.",
  },
  {
    value: "layered-spline",
    label: "Layered (spline)",
    description: "Same ranks, curved edges instead of orthogonal ones.",
  },
  {
    value: "left-right",
    label: "Left-to-right",
    description: "Layered ranks flowing horizontally, for wide traces.",
  },
  {
    value: "organic",
    label: "Organic",
    description: "Stress majorization; clusters emerge, ranks do not apply.",
  },
  {
    value: "radial",
    label: "Radial",
    description: "Concentric rings around a root node.",
  },
  {
    value: "grid",
    label: "Grid",
    description: "Uniform packing; ignores topology, useful as a baseline.",
  },
];

/** Long form of an option, for surfaces that can show more than the Select atom's string label. */
export function describeLayoutMode(mode: LayoutMode): string {
  return LAYOUT_MODE_DESCRIPTORS.find((descriptor) => descriptor.value === mode)?.description ?? "";
}

export interface LayoutSelectDropdownProps {
  value?: LayoutMode;
  defaultValue?: LayoutMode;
  onLayoutChange?: (layout: LayoutMode) => void;
  size?: SelectSize;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}
