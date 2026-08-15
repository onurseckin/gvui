/**
 * Canvas-backed `MeasurementProvider`.
 *
 * Three measurement backends, tried in order: `OffscreenCanvas` (works on the layout worker
 * thread, where there is no DOM), a detached `<canvas>` (main thread), and finally a deterministic
 * per-character estimate. The estimate is not a degenerate case — it is the only path available in
 * `bun test` and in SSR, so it must always produce finite, positive, stable numbers.
 */
import type { GraphNodeData } from "../../../types/graphData";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "../custom/config";
import { DEFAULT_NODE_TEMPLATE, type NodeRowSpec, type NodeTemplate } from "./nodeTemplate";
import {
  DEFAULT_FONT_STACKS,
  FONT_KEYS,
  getFontSpec,
  type FontFamilyRole,
  type FontSpec,
  type LabelBox,
  type LabelOptions,
  type MeasureNodesOptions,
  type MeasurementProvider,
  type Size,
} from "./types";

/** Multiplier from font size to line advance, matching the browser's default `normal`. */
const LINE_HEIGHT_RATIO = 1.35;

const ELLIPSIS = "…";

/** Structural view of the 2D contexts; both canvas flavours satisfy it. */
interface TextMeasuringContext {
  font: string;
  measureText(text: string): { width: number };
}

export interface CanvasMeasurerOptions {
  /**
   * Seam for tests and non-DOM hosts: returns the width of a single-line run. Injecting it also
   * makes cache behaviour observable, which is otherwise invisible from outside the provider.
   */
  measureTextWidth?: (text: string, fontSpec: FontSpec, fontKey: string) => number;
}

// -------------------------------------------------------------------------------------------
// Character-width estimate (no-canvas fallback)
// -------------------------------------------------------------------------------------------

const NARROW_CHARS = new Set(Array.from("ijltIf.,:;'`|!()[]{}-/\\"));
const WIDE_CHARS = new Set(Array.from("mwMW@%&"));
const MONO_RATIO = 0.6;

/**
 * Width of one character as a fraction of the font size. The buckets are coarse on purpose: the
 * estimate only has to be stable and never wildly under-report, because under-reporting is what
 * makes text overflow its reserved box and collide with a neighbour.
 */
function charWidthRatio(ch: string, mono: boolean): number {
  if (mono) return MONO_RATIO;
  if (ch === " ") return 0.28;
  if (NARROW_CHARS.has(ch)) return 0.33;
  if (WIDE_CHARS.has(ch)) return 0.9;
  const code = ch.codePointAt(0) ?? 0;
  // Emoji, CJK and other wide scripts render roughly full-em; treating them as latin would
  // under-reserve badly on tool chips, which routinely carry an icon glyph.
  if (code > 0x2000) return 1;
  if (ch >= "A" && ch <= "Z") return 0.66;
  if (ch >= "0" && ch <= "9") return 0.55;
  return 0.52;
}

function estimateTextWidth(text: string, spec: FontSpec): number {
  const mono = spec.family === "mono";
  let ratioSum = 0;
  for (const ch of text) {
    ratioSum += charWidthRatio(ch, mono);
  }
  const weightBump = spec.weight >= 600 ? 1.04 : 1;
  return ratioSum * spec.sizePx * weightBump;
}

// -------------------------------------------------------------------------------------------
// Provider
// -------------------------------------------------------------------------------------------

function createTextContext(): TextMeasuringContext | null {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const ctx = new OffscreenCanvas(1, 1).getContext("2d");
      if (ctx) return ctx;
    } catch {
      // Some hosts declare OffscreenCanvas but refuse a 2D context; fall through to <canvas>.
    }
  }
  if (typeof document !== "undefined") {
    try {
      const ctx = document.createElement("canvas").getContext("2d");
      if (ctx) return ctx;
    } catch {
      // Fall through to the estimate.
    }
  }
  return null;
}

interface WrapResult {
  lines: string[];
  widths: number[];
  truncated: boolean;
}

export function createCanvasMeasurer(options?: CanvasMeasurerOptions): MeasurementProvider {
  const textCache = new Map<string, number>();
  const labelCache = new Map<string, LabelBox>();
  const fontStringCache = new Map<string, string>();
  const familyStackCache = new Map<FontFamilyRole, string>();

  let context: TextMeasuringContext | null = null;
  let contextResolved = false;
  const injectedMeasure = options?.measureTextWidth;

  function getContext(): TextMeasuringContext | null {
    if (!contextResolved) {
      contextResolved = true;
      context = createTextContext();
    }
    return context;
  }

  /**
   * Reads the same custom properties the cards are styled with, so measurement follows a theme
   * change instead of silently measuring a font nobody renders.
   */
  function familyStack(role: FontFamilyRole): string {
    const cached = familyStackCache.get(role);
    if (cached !== undefined) return cached;

    let stack = DEFAULT_FONT_STACKS[role];
    if (typeof document !== "undefined" && typeof getComputedStyle === "function") {
      try {
        const value = getComputedStyle(document.documentElement)
          .getPropertyValue(role === "mono" ? "--font-mono" : "--font-sans")
          .trim();
        if (value) stack = value;
      } catch {
        // Detached document or a host without layout; the default stack stands.
      }
    }
    familyStackCache.set(role, stack);
    return stack;
  }

  function fontString(fontKey: string, spec: FontSpec): string {
    const cached = fontStringCache.get(fontKey);
    if (cached !== undefined) return cached;
    const resolved = `${spec.weight} ${spec.sizePx}px ${familyStack(spec.family)}`;
    fontStringCache.set(fontKey, resolved);
    return resolved;
  }

  function measureRun(text: string, fontKey: string): number {
    if (text.length === 0) return 0;
    const cacheKey = `${fontKey}|${text}`;
    const cached = textCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const spec = getFontSpec(fontKey);
    let width: number;
    if (injectedMeasure) {
      width = injectedMeasure(text, spec, fontKey);
    } else {
      const ctx = getContext();
      if (ctx) {
        ctx.font = fontString(fontKey, spec);
        width = ctx.measureText(text).width;
      } else {
        width = estimateTextWidth(text, spec);
      }
    }
    if (!Number.isFinite(width) || width < 0) {
      width = estimateTextWidth(text, spec);
    }

    textCache.set(cacheKey, width);
    return width;
  }

  /**
   * Greedy word wrap. Line widths are summed from token widths plus space widths rather than
   * re-measuring each growing prefix: prefixes would flood the cache with strings nobody ever
   * asks for again, and the kerning difference across a space is below a pixel.
   */
  function wrapRun(text: string, fontKey: string, maxWidth: number, maxLines: number): WrapResult {
    const trimmed = text.trim();
    if (trimmed.length === 0 || maxLines <= 0) {
      return { lines: [], widths: [], truncated: trimmed.length > 0 };
    }

    const lines: string[] = [];
    const widths: number[] = [];
    const spaceWidth = measureRun(" ", fontKey);
    let current = "";
    let currentWidth = 0;
    let stopped = false;

    // Pushes the working line and reports whether we already have enough lines to know that the
    // rest of the text is being dropped.
    function commit(): boolean {
      if (current.length === 0) return false;
      lines.push(current);
      widths.push(currentWidth);
      current = "";
      currentWidth = 0;
      return lines.length > maxLines;
    }

    for (const token of trimmed.split(/\s+/)) {
      if (token.length === 0) continue;
      const tokenWidth = measureRun(token, fontKey);

      if (current.length > 0) {
        const joined = currentWidth + spaceWidth + tokenWidth;
        if (joined <= maxWidth) {
          current = `${current} ${token}`;
          currentWidth = joined;
          continue;
        }
        if (commit()) {
          stopped = true;
          break;
        }
      }

      if (tokenWidth <= maxWidth) {
        current = token;
        currentWidth = tokenWidth;
        continue;
      }

      // A single token wider than the line (a URL, a hash, a path): break it by character.
      for (const ch of token) {
        const chWidth = measureRun(ch, fontKey);
        if (current.length > 0 && currentWidth + chWidth > maxWidth) {
          if (commit()) {
            stopped = true;
            break;
          }
        }
        current += ch;
        currentWidth += chWidth;
      }
      if (stopped) break;
    }

    if (!stopped) commit();

    let truncated = stopped;
    if (lines.length > maxLines) {
      truncated = true;
      lines.length = maxLines;
      widths.length = maxLines;
    }

    if (truncated && lines.length > 0) {
      const lastIndex = lines.length - 1;
      const ellipsized = ellipsize(lines[lastIndex], fontKey, maxWidth);
      lines[lastIndex] = ellipsized.text;
      widths[lastIndex] = ellipsized.width;
    }

    return { lines, widths, truncated };
  }

  /** Trims characters until the line plus an ellipsis fits, so a badge can never outgrow its box. */
  function ellipsize(
    line: string,
    fontKey: string,
    maxWidth: number,
  ): { text: string; width: number } {
    const ellipsisWidth = measureRun(ELLIPSIS, fontKey);
    const chars = Array.from(line);
    const charWidths = chars.map((ch) => measureRun(ch, fontKey));
    let width = charWidths.reduce((acc, w) => acc + w, 0);

    while (chars.length > 0 && width + ellipsisWidth > maxWidth) {
      chars.pop();
      const dropped = charWidths.pop() ?? 0;
      width -= dropped;
    }

    return { text: `${chars.join("")}${ELLIPSIS}`, width: width + ellipsisWidth };
  }

  function measureLabel(text: string, opts: LabelOptions): LabelBox {
    const fontKey = opts.fontKey ?? FONT_KEYS.edgeLabel;
    const maxWidth = Math.max(1, opts.maxWidth);
    const maxLines = Math.max(1, Math.floor(opts.maxLines));
    const cacheKey = `${fontKey}|${maxWidth}|${maxLines}|${text}`;

    const cached = labelCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const wrapped = wrapRun(text, fontKey, maxWidth, maxLines);
    const spec = getFontSpec(fontKey);
    const lineHeight = Math.round(spec.sizePx * LINE_HEIGHT_RATIO);
    const widest = wrapped.widths.reduce((acc, w) => Math.max(acc, w), 0);

    // Frozen because the box is handed out by reference on every cache hit; a caller mutating it
    // would silently corrupt every later measurement of the same label.
    const box: LabelBox = Object.freeze({
      width: Math.min(Math.ceil(widest), maxWidth),
      height: wrapped.lines.length * lineHeight,
      lines: Object.freeze(wrapped.lines) as string[],
      truncated: wrapped.truncated,
    });

    labelCache.set(cacheKey, box);
    return box;
  }

  interface RowMeasurement {
    /** Width the row wants if nothing forces it to wrap. */
    naturalWidth: number;
    lineCount: number;
  }

  function rowItems(
    node: GraphNodeData,
    row: NodeRowSpec,
  ): Array<{ text: string; fontKey: string; chrome: number }> {
    const items: Array<{ text: string; fontKey: string; chrome: number }> = [];
    for (const segment of row.segments) {
      for (const text of segment.select(node)) {
        const trimmed = text.trim();
        if (trimmed.length === 0) continue;
        items.push({ text: trimmed, fontKey: segment.fontKey, chrome: segment.itemChrome });
      }
    }
    return items;
  }

  /**
   * `availableWidth === null` is pass 1 (natural size, no wrapping); a number is pass 2, where the
   * row must fit the width the node settled on.
   */
  function measureRow(
    node: GraphNodeData,
    row: NodeRowSpec,
    availableWidth: number | null,
  ): RowMeasurement | null {
    const items = rowItems(node, row);
    if (items.length === 0) return null;

    const maxLines = row.maxLines ?? Number.POSITIVE_INFINITY;

    if (row.kind === "flow") {
      const widths = items.map((item) => measureRun(item.text, item.fontKey) + item.chrome);
      const natural =
        row.fixedChrome +
        widths.reduce((acc, w) => acc + w, 0) +
        row.itemGap * Math.max(0, widths.length - 1);

      if (availableWidth === null) {
        return { naturalWidth: natural, lineCount: 1 };
      }

      const usable = Math.max(1, availableWidth - row.fixedChrome);
      let lineCount = 1;
      let lineWidth = 0;
      for (const width of widths) {
        const advance = lineWidth === 0 ? width : lineWidth + row.itemGap + width;
        if (advance > usable && lineWidth > 0) {
          lineCount += 1;
          lineWidth = width;
        } else {
          lineWidth = advance;
        }
      }
      return { naturalWidth: natural, lineCount: Math.min(lineCount, maxLines) };
    }

    const natural =
      row.fixedChrome +
      items.reduce(
        (acc, item) => Math.max(acc, measureRun(item.text, item.fontKey) + item.chrome),
        0,
      );

    if (availableWidth === null) {
      return { naturalWidth: natural, lineCount: 1 };
    }

    const usable = Math.max(1, availableWidth - row.fixedChrome);
    let lineCount = 0;
    for (const item of items) {
      if (lineCount >= maxLines) break;
      const remaining = maxLines - lineCount;
      const wrapped = wrapRun(
        item.text,
        item.fontKey,
        Math.max(1, usable - item.chrome),
        remaining,
      );
      lineCount += Math.max(1, wrapped.lines.length);
    }
    return { naturalWidth: natural, lineCount: Math.min(lineCount, maxLines) };
  }

  function measureNode(
    node: GraphNodeData,
    template: NodeTemplate,
    min: number,
    max: number,
  ): Size {
    // Pass 1: what each row would take unwrapped, which is what decides the card's width.
    let widest = 0;
    for (const row of template.rows) {
      const measured = measureRow(node, row, null);
      if (measured) widest = Math.max(widest, measured.naturalWidth);
    }

    const width = Math.ceil(Math.min(Math.max(widest + template.padding * 2, min), max));
    const contentWidth = Math.max(1, width - template.padding * 2);

    // Pass 2: re-wrap at the chosen width and stack the resulting lines.
    // Only the bottom padding is charged: the header's negative top margin (see NodeCard.css)
    // cancels the card's top padding.
    let height = template.headerHeight + template.padding;
    for (const row of template.rows) {
      if (row.inHeader) continue;
      const measured = measureRow(node, row, contentWidth);
      if (!measured) continue;
      height += measured.lineCount * row.lineHeight + template.rowGap;
    }

    return { width, height: Math.ceil(height) };
  }

  function measureNodes(nodes: GraphNodeData[], opts?: MeasureNodesOptions): Size[] {
    const min = opts?.minNodeWidth ?? DEFAULT_CUSTOM_LAYOUT_CONFIG.minNodeWidth;
    const max = Math.max(min, opts?.maxNodeWidth ?? DEFAULT_CUSTOM_LAYOUT_CONFIG.maxNodeWidth);
    return nodes.map((node) => measureNode(node, DEFAULT_NODE_TEMPLATE, min, max));
  }

  function clearCache(): void {
    textCache.clear();
    labelCache.clear();
    fontStringCache.clear();
    familyStackCache.clear();
    // The context itself is kept: it holds no measurement state, only the last `font` assignment.
  }

  return { measureNodes, measureLabel, clearCache };
}

let defaultMeasurer: MeasurementProvider | null = null;

/**
 * Process-wide measurer. Shared on purpose: the text cache is the whole point, and node labels
 * repeat heavily across re-layouts of the same dataset.
 */
export function getDefaultMeasurer(): MeasurementProvider {
  if (!defaultMeasurer) {
    defaultMeasurer = createCanvasMeasurer();
  }
  return defaultMeasurer;
}

/** Drops the shared instance, so a theme/font change is picked up on the next measurement. */
export function resetDefaultMeasurer(): void {
  defaultMeasurer = null;
}
