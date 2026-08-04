import type { PositionedEdge, PositionedNode } from "../types/graphData";

/**
 * Raster + fit geometry for the export menu.
 *
 * The pure half of this module (bounds, fit scale, raster plan, filename) is deliberately free of
 * DOM access so it can be unit-tested; `pngExporter.test.ts` covers it. The HTML exporter imports
 * the same helpers rather than re-deriving them, so a PNG and an HTML export of the same graph open
 * on identical framing.
 */

export const GRAPH_EXPORT_PADDING = 80;

/**
 * Ceiling on total raster pixels. A canvas holds 4 bytes per pixel, so 40 MP is ~160 MB of backing
 * store before the PNG encoder allocates its own copy — past that, browsers start returning a null
 * blob or killing the tab, which would look to the user like a silent failure.
 */
export const DEFAULT_MAX_EXPORT_PIXELS = 40_000_000;

/** Beyond 4x, extra device pixels buy nothing visible and cost quadratic memory. */
const MAX_RASTER_SCALE = 4;

/** Keeps a pathological bounding box from collapsing the drawing to zero pixels. */
const MIN_FIT_SCALE = 0.01;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const FALLBACK_CANVAS_BACKGROUND = "#050505";

/** Matches the `translate(Xpx, Ypx)` that `GraphCanvas` writes inline on every node wrapper. */
const TRANSLATE_PATTERN = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/;

export interface Size {
  width: number;
  height: number;
}

export interface GraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FitTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface RasterPlan {
  /** Device pixels per CSS pixel actually used. */
  scale: number;
  pixelWidth: number;
  pixelHeight: number;
  /** True when the pixel cap forced a scale below the requested device pixel ratio. */
  isDownscaled: boolean;
}

export interface PngExportResult {
  fileName: string;
  pixelWidth: number;
  pixelHeight: number;
  isDownscaled: boolean;
}

/** Thrown for every failure the user needs told about, instead of downloading a blank image. */
export class GraphExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphExportError";
  }
}

/**
 * Bounding box of everything drawn: node rects, edge badge boxes, and edge route geometry.
 *
 * Edge paths are scanned as raw coordinate pairs rather than parsed as SVG commands. That
 * over-counts Bezier control points — a control point can sit outside the curve it shapes — which
 * errs towards a slightly roomier box. Being generous is the correct failure mode here: the
 * alternative clips real geometry off the edge of an export the user cannot scroll.
 */
export function computeGraphBounds(
  nodes: readonly PositionedNode[],
  edges?: readonly PositionedEdge[],
): GraphBounds {
  if (nodes.length === 0 && (!edges || edges.length === 0)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  for (const edge of edges ?? []) {
    if (edge.badgeRect) {
      minX = Math.min(minX, edge.badgeRect.x);
      minY = Math.min(minY, edge.badgeRect.y);
      maxX = Math.max(maxX, edge.badgeRect.x + edge.badgeRect.width);
      maxY = Math.max(maxY, edge.badgeRect.y + edge.badgeRect.height);
    } else if (typeof edge.labelX === "number" && typeof edge.labelY === "number") {
      minX = Math.min(minX, edge.labelX - 60);
      maxX = Math.max(maxX, edge.labelX + 60);
      minY = Math.min(minY, edge.labelY - 20);
      maxY = Math.max(maxY, edge.labelY + 20);
    }

    if (edge.points && edge.points.length > 0) {
      for (const point of edge.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
      continue;
    }

    const coordinates = edge.path ? edge.path.match(/[-+]?\d*\.?\d+/g) : null;
    if (!coordinates) continue;
    for (let i = 0; i + 1 < coordinates.length; i += 2) {
      const px = Number.parseFloat(coordinates[i]);
      const py = Number.parseFloat(coordinates[i + 1]);
      if (Number.isNaN(px) || Number.isNaN(py)) continue;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Largest uniform scale at which `content` fits inside `target`, clamped to `maxScale`.
 *
 * `maxScale` defaults to 1 because a graph smaller than the viewport should open at its natural
 * size: blowing a three-node graph up to fill a 4K window magnifies nothing but the padding.
 */
export function computeFitScale(content: Size, target: Size, maxScale = 1): number {
  if (
    !(content.width > 0) ||
    !(content.height > 0) ||
    !(target.width > 0) ||
    !(target.height > 0)
  ) {
    return maxScale;
  }

  const scale = Math.min(target.width / content.width, target.height / content.height);
  return Math.min(Math.max(scale, MIN_FIT_SCALE), maxScale);
}

/**
 * Transform that centres `bounds` (plus `padding` on every side) inside `target`. Apply as
 * `translate(translateX, translateY) scale(scale)` with `transform-origin: 0 0`, which is the same
 * order `GraphCanvas` uses, so a value computed here can be handed straight to the store.
 */
export function computeFitTransform(
  bounds: GraphBounds,
  target: Size,
  padding = GRAPH_EXPORT_PADDING,
  maxScale = 1,
): FitTransform {
  const content: Size = {
    width: bounds.maxX - bounds.minX + padding * 2,
    height: bounds.maxY - bounds.minY + padding * 2,
  };
  const scale = computeFitScale(content, target, maxScale);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    scale,
    translateX: target.width / 2 - centerX * scale,
    translateY: target.height / 2 - centerY * scale,
  };
}

/**
 * Chooses the device-pixel scale for a raster of `cssSize`, honouring `devicePixelRatio` up to the
 * point where the total pixel count would exceed `maxPixels`. Past that the scale drops
 * proportionally — the whole graph still fits, just at lower resolution, and `isDownscaled` says so
 * that the caller can tell the user rather than let them wonder why the text is soft.
 */
export function planRaster(
  cssSize: Size,
  devicePixelRatio: number,
  maxPixels = DEFAULT_MAX_EXPORT_PIXELS,
): RasterPlan {
  const cssWidth = Math.max(cssSize.width, 1);
  const cssHeight = Math.max(cssSize.height, 1);

  const requested =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const requestedScale = Math.min(Math.max(requested, 1), MAX_RASTER_SCALE);

  const cssPixels = cssWidth * cssHeight;
  let scale = requestedScale;
  let isDownscaled = false;

  if (cssPixels * scale * scale > maxPixels) {
    scale = Math.sqrt(maxPixels / cssPixels);
    isDownscaled = true;
  }

  return {
    scale,
    pixelWidth: Math.max(1, Math.floor(cssWidth * scale)),
    pixelHeight: Math.max(1, Math.floor(cssHeight * scale)),
    isDownscaled,
  };
}

/**
 * `gvui-export-<slug>.<ext>`. Everything outside `[a-z0-9]` collapses to a single dash so a graph
 * titled `reports/Q3 2026.json` cannot smuggle a path separator into the download name.
 */
export function deriveExportFilename(name: string, extension: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const ext = extension.replace(/^\.+/, "").toLowerCase() || "txt";
  return `gvui-export-${slug || "graph"}.${ext}`;
}

/** Anchor-click download. Shared with the HTML exporter so both paths revoke the URL the same way. */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Every CSS rule the document has, concatenated. Cross-origin sheets throw on `cssRules` access and
 * are skipped — the app's own styles are same-origin under both Vite dev and the built bundle, so
 * skipping costs nothing here but would otherwise abort the whole export.
 */
function collectDocumentCss(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      chunks.push(rule.cssText);
    }
  }
  return chunks.join("\n");
}

function readCssVariable(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Reads a node wrapper's graph-space rect back out of the inline style `GraphCanvas` wrote.
 *
 * Going through the inline style rather than `getBoundingClientRect` keeps this in graph
 * coordinates: the wrapper's client rect is post-pan/zoom, and dividing it back out would
 * reintroduce exactly the viewport dependence this export exists to remove.
 */
function readWrapperRect(element: HTMLElement): (Size & { x: number; y: number }) | null {
  const match = TRANSLATE_PATTERN.exec(element.style.transform);
  if (!match) return null;

  const width = Number.parseFloat(element.style.width) || element.offsetWidth;
  const height = Number.parseFloat(element.style.height) || element.offsetHeight;
  if (!(width > 0) || !(height > 0)) return null;

  return {
    x: Number.parseFloat(match[1]),
    y: Number.parseFloat(match[2]),
    width,
    height,
  };
}

/**
 * Builds a standalone SVG document covering `bounds` from the live canvas DOM.
 *
 * Node cards are HTML, not SVG, so they are cloned into `foreignObject` wrappers; the document's
 * own stylesheets are inlined into a `<style>` so those clones keep their colours, radii and badge
 * styling once detached from the page. Nothing in the result references an external URL, which is
 * what keeps the canvas untainted when it is drawn.
 *
 * `foreignObject` inside an SVG loaded as an image is the only way to rasterize HTML without
 * re-implementing every card as native SVG shapes. Chromium and Gecko rasterize it; a browser that
 * refuses fails the image load outright, which surfaces as a `GraphExportError` rather than a
 * silently node-less PNG.
 */
function buildExportSvg(bounds: GraphBounds, padding: number, background: string): SVGSVGElement {
  const stage = document.querySelector<HTMLElement>(".graph-transform-stage");
  if (!stage) {
    throw new GraphExportError(
      "Could not find the graph on the page. Open a graph before exporting a PNG.",
    );
  }

  const edgeLayer = stage.querySelector<SVGSVGElement>("svg.graph-svg-layer");
  if (!edgeLayer) {
    throw new GraphExportError("Could not find the graph SVG layer to serialize.");
  }

  const viewX = bounds.minX - padding;
  const viewY = bounds.minY - padding;
  const viewWidth = Math.max(bounds.maxX - bounds.minX + padding * 2, 1);
  const viewHeight = Math.max(bounds.maxY - bounds.minY + padding * 2, 1);

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("xmlns", SVG_NAMESPACE);
  svg.setAttribute("viewBox", `${viewX} ${viewY} ${viewWidth} ${viewHeight}`);

  const styleElement = document.createElementNS(SVG_NAMESPACE, "style");
  styleElement.textContent = collectDocumentCss();
  svg.appendChild(styleElement);

  const backdrop = document.createElementNS(SVG_NAMESPACE, "rect");
  backdrop.setAttribute("x", String(viewX));
  backdrop.setAttribute("y", String(viewY));
  backdrop.setAttribute("width", String(viewWidth));
  backdrop.setAttribute("height", String(viewHeight));
  backdrop.setAttribute("fill", background);
  svg.appendChild(backdrop);

  for (const child of Array.from(edgeLayer.childNodes)) {
    svg.appendChild(child.cloneNode(true));
  }

  const htmlLayer = stage.querySelector<HTMLElement>(".graph-html-layer");
  for (const wrapper of Array.from(
    htmlLayer?.querySelectorAll<HTMLElement>(".graph-node-wrapper") ?? [],
  )) {
    const rect = readWrapperRect(wrapper);
    const card = wrapper.firstElementChild;
    if (!rect || !card) continue;

    const foreignObject = document.createElementNS(SVG_NAMESPACE, "foreignObject");
    foreignObject.setAttribute("x", String(rect.x));
    foreignObject.setAttribute("y", String(rect.y));
    foreignObject.setAttribute("width", String(rect.width));
    foreignObject.setAttribute("height", String(rect.height));
    foreignObject.appendChild(card.cloneNode(true));
    svg.appendChild(foreignObject);
  }

  const badgeLayer = stage.querySelector<SVGSVGElement>("svg.graph-svg-badge-layer");
  for (const child of Array.from(badgeLayer?.childNodes ?? [])) {
    svg.appendChild(child.cloneNode(true));
  }

  return svg;
}

function rasterize(dataUrl: string, plan: RasterPlan, background: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const image = new Image();

    image.onerror = () => {
      reject(new GraphExportError("The browser could not rasterize the exported graph SVG."));
    };

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = plan.pixelWidth;
      canvas.height = plan.pixelHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        reject(new GraphExportError("Could not acquire a 2D canvas context for the PNG export."));
        return;
      }

      context.fillStyle = background;
      context.fillRect(0, 0, plan.pixelWidth, plan.pixelHeight);
      context.drawImage(image, 0, 0, plan.pixelWidth, plan.pixelHeight);

      try {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          reject(
            new GraphExportError("The browser returned an empty PNG. The graph may be too large."),
          );
        }, "image/png");
      } catch (error) {
        // A SecurityError here means the canvas is tainted. Reporting it beats handing the user a
        // file that silently contains nothing.
        reject(
          new GraphExportError(
            `The graph canvas could not be read back as an image: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    };

    image.src = dataUrl;
  });
}

export interface ExportGraphAsPNGOptions {
  nodes: readonly PositionedNode[];
  edges?: readonly PositionedEdge[];
  /** Graph title or id; run through `deriveExportFilename`. */
  name: string;
  padding?: number;
  maxPixels?: number;
}

/**
 * Renders the on-screen graph to a PNG sized to the graph's own bounding box, so the export shows
 * the whole graph no matter where the viewport happens to be panned or zoomed.
 */
export async function exportGraphAsPNG(options: ExportGraphAsPNGOptions): Promise<PngExportResult> {
  const padding = options.padding ?? GRAPH_EXPORT_PADDING;
  const bounds = computeGraphBounds(options.nodes, options.edges);

  if (bounds.maxX - bounds.minX <= 0 && bounds.maxY - bounds.minY <= 0) {
    throw new GraphExportError("There is no graph geometry to export yet.");
  }

  const background = readCssVariable("--bg-canvas", FALLBACK_CANVAS_BACKGROUND);
  const svg = buildExportSvg(bounds, padding, background);

  const cssSize: Size = {
    width: bounds.maxX - bounds.minX + padding * 2,
    height: bounds.maxY - bounds.minY + padding * 2,
  };
  const plan = planRaster(
    cssSize,
    typeof window === "undefined" ? 1 : window.devicePixelRatio,
    options.maxPixels,
  );

  // Intrinsic size in device pixels with the viewBox still in graph units: the browser then
  // rasterizes the vector art at full target resolution instead of upscaling a CSS-sized bitmap.
  svg.setAttribute("width", String(plan.pixelWidth));
  svg.setAttribute("height", String(plan.pixelHeight));

  const serialized = new XMLSerializer().serializeToString(svg);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;

  const blob = await rasterize(dataUrl, plan, background);
  const fileName = deriveExportFilename(options.name, "png");
  triggerDownload(blob, fileName);

  return {
    fileName,
    pixelWidth: plan.pixelWidth,
    pixelHeight: plan.pixelHeight,
    isDownscaled: plan.isDownscaled,
  };
}
