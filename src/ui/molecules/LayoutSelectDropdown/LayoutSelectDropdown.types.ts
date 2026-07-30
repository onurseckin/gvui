import type { LayoutMode } from "../../../state/useGraphStore";
import type { SelectSize } from "../../atoms/Select";

export interface LayoutSelectDropdownProps {
  value?: LayoutMode;
  defaultValue?: LayoutMode;
  onLayoutChange?: (layout: LayoutMode) => void;
  size?: SelectSize;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}
