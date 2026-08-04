/**
 * The measurement boundary: text goes in, boxes come out. Nothing downstream of this module —
 * ranking, ordering, routing, the Rust engine itself — ever sees a string.
 */
export type {
  FontFamilyRole,
  FontKey,
  FontSpec,
  LabelBox,
  LabelOptions,
  MeasureNodesOptions,
  MeasurementProvider,
  Size,
} from "./types";
export {
  DEFAULT_FONT_STACKS,
  FALLBACK_FONT_SPEC,
  FONT_KEYS,
  FONT_SPECS,
  getFontSpec,
} from "./types";

export type { NodeRowKind, NodeRowSegment, NodeRowSpec, NodeTemplate } from "./nodeTemplate";
export { DEFAULT_NODE_TEMPLATE } from "./nodeTemplate";

export type { CanvasMeasurerOptions } from "./canvasMeasurer";
export { createCanvasMeasurer, getDefaultMeasurer, resetDefaultMeasurer } from "./canvasMeasurer";
