/**
 * The text/layout boundary of the v2 pipeline.
 *
 * The Rust engine never sees a string: it receives boxes. Everything that turns text into a box
 * lives behind `MeasurementProvider`, which is why the node card design can change without
 * touching a line of layout code — only the template in `nodeTemplate.ts` moves.
 */
import type { GraphNodeData } from "../../../types/graphData";

export interface Size {
  width: number;
  height: number;
}

export interface LabelBox {
  width: number;
  height: number;
  lines: string[];
  truncated: boolean;
}

export interface LabelOptions {
  maxWidth: number;
  maxLines: number;
  /**
   * Optional: `customLayoutAdapter` measures edge labels without naming a font, so the provider
   * falls back to `FONT_KEYS.edgeLabel`. Callers rendering in a different font pass their key.
   */
  fontKey?: string;
}

export interface MeasureNodesOptions {
  /** Defaults to `DEFAULT_CUSTOM_LAYOUT_CONFIG.minNodeWidth`. */
  minNodeWidth?: number;
  /** Defaults to `DEFAULT_CUSTOM_LAYOUT_CONFIG.maxNodeWidth`. */
  maxNodeWidth?: number;
}

export interface MeasurementProvider {
  measureNodes(nodes: GraphNodeData[], opts?: MeasureNodesOptions): Size[];
  measureLabel(text: string, opts: LabelOptions): LabelBox;
  clearCache(): void;
}

// -------------------------------------------------------------------------------------------
// Font registry
// -------------------------------------------------------------------------------------------

export type FontFamilyRole = "sans" | "mono";

export interface FontSpec {
  weight: number;
  sizePx: number;
  family: FontFamilyRole;
}

/**
 * Named text roles rather than raw font strings: a role is what the *card* declares, and the
 * concrete font is resolved once from the CSS custom properties the card actually renders with.
 */
export const FONT_KEYS = {
  nodeTitle: "node-title",
  nodeTypeTag: "node-type-tag",
  nodeBody: "node-body",
  nodeChip: "node-chip",
  nodeMetrics: "node-metrics",
  edgeLabel: "edge-label",
} as const;

export type FontKey = (typeof FONT_KEYS)[keyof typeof FONT_KEYS];

/** Sizes/weights mirror `NodeCard.css` and `GraphEdge.css`; drift here shows up as clipped text. */
export const FONT_SPECS: Readonly<Record<string, FontSpec | undefined>> = Object.freeze({
  [FONT_KEYS.nodeTitle]: { weight: 600, sizePx: 13, family: "sans" },
  // Shared by `.node-card-type-tag` and `.node-card-model-chip`, which are the same 10px mono.

  [FONT_KEYS.nodeTypeTag]: { weight: 600, sizePx: 10, family: "mono" },
  [FONT_KEYS.nodeBody]: { weight: 400, sizePx: 11, family: "sans" },
  [FONT_KEYS.nodeChip]: { weight: 600, sizePx: 11, family: "mono" },
  [FONT_KEYS.nodeMetrics]: { weight: 500, sizePx: 10, family: "mono" },
  [FONT_KEYS.edgeLabel]: { weight: 600, sizePx: 11, family: "mono" },
});

export const FALLBACK_FONT_SPEC: FontSpec = Object.freeze({
  weight: 400,
  sizePx: 12,
  family: "sans",
});

export function getFontSpec(fontKey: string): FontSpec {
  return FONT_SPECS[fontKey] ?? FALLBACK_FONT_SPEC;
}

/** Used when no `document` is available to read `--font-sans` / `--font-mono` from. */
export const DEFAULT_FONT_STACKS: Readonly<Record<FontFamilyRole, string>> = Object.freeze({
  sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
});
