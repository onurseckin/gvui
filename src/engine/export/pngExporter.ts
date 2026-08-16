import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import { computeGraphBounds, type GraphBounds, type RasterPlan } from "../../utils/pngExporter";
import { exportPositionedGraphToSvg, type SvgExportOptions } from "./svgExporter";

export interface PngExportOptions {
  scale?: 1 | 2 | 4 | number;
  theme?: "dark" | "light" | "transparent";
  backgroundColor?: string;
  padding?: number;
  includeAnnotations?: boolean;
  includeBadges?: boolean;
  includeMetrics?: boolean;
  maxPixels?: number;
  name?: string;
}

export interface PngExportResult {
  fileName: string;
  pixelWidth: number;
  pixelHeight: number;
  scale: number;
  isDownscaled: boolean;
  blob?: Blob;
  dataUrl?: string;
}

export const DEFAULT_MAX_EXPORT_PIXELS = 40_000_000;
export const DEFAULT_PNG_SCALE = 2;

/**
 * Computes raster dimensions given graph bounds and requested scale factor,
 * safely clamping to the maximum pixel limit to prevent browser OOM.
 */
export function computePngDimensions(
  bounds: GraphBounds,
  requestedScale = DEFAULT_PNG_SCALE,
  padding = 40,
  maxPixels = DEFAULT_MAX_EXPORT_PIXELS,
): RasterPlan {
  const widthCss = Math.max(bounds.maxX - bounds.minX + padding * 2, 200);
  const heightCss = Math.max(bounds.maxY - bounds.minY + padding * 2, 120);

  const baseArea = widthCss * heightCss;
  let effectiveScale = Math.max(0.25, requestedScale);
  let isDownscaled = false;

  const totalPixels = baseArea * effectiveScale * effectiveScale;
  if (totalPixels > maxPixels && baseArea > 0) {
    effectiveScale = Math.min(effectiveScale, Math.sqrt(maxPixels / baseArea));
    isDownscaled = true;
  }

  const pixelWidth = Math.round(widthCss * effectiveScale);
  const pixelHeight = Math.round(heightCss * effectiveScale);

  return {
    scale: effectiveScale,
    pixelWidth,
    pixelHeight,
    isDownscaled,
  };
}

/**
 * Derives a clean filename for PNG export.
 */
export function derivePngFilename(rawName?: string, scale?: number): string {
  const base = (rawName || "graph")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = scale && scale > 1 ? `@${scale}x` : "";
  return `${base || "graph"}${suffix}.png`;
}

/**
 * Converts an SVG XML string into a Raster PNG Blob and DataURL using an offscreen canvas.
 * Works seamlessly in modern browsers; provides a fallback in Node / Bun test environments.
 */
export async function renderSvgToRaster(
  svgString: string,
  pixelWidth: number,
  pixelHeight: number,
  backgroundColor?: string,
): Promise<{ blob: Blob; dataUrl: string }> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    // Headless / Test mock fallback
    const mockBlob = new Blob([svgString], { type: "image/png" });
    return {
      blob: mockBlob,
      dataUrl: `data:image/png;base64,${btoa(encodeURIComponent(svgString))}`,
    };
  }

  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(new Error(`Failed to load SVG image into canvas: ${String(e)}`));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Unable to create 2D canvas context for PNG export");
    }

    if (backgroundColor && backgroundColor !== "transparent") {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    }

    ctx.drawImage(img, 0, 0, pixelWidth, pixelHeight);

    const dataUrl = canvas.toDataURL("image/png");
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Canvas toBlob conversion failed"));
      }, "image/png");
    });

    return { blob, dataUrl };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * Exports positioned graph to PNG with high-resolution scaling and theme background options.
 */
export async function exportGraphAsPng(options: {
  nodes: readonly PositionedNode[];
  edges?: readonly PositionedEdge[];
  name?: string;
  scale?: number;
  theme?: "dark" | "light" | "transparent";
  backgroundColor?: string;
  padding?: number;
  includeAnnotations?: boolean;
  includeMetrics?: boolean;
  maxPixels?: number;
}): Promise<PngExportResult> {
  const nodes = options.nodes;
  const edges = options.edges ?? [];
  const padding = options.padding ?? 40;
  const scale = options.scale ?? DEFAULT_PNG_SCALE;
  const theme = options.theme ?? "dark";
  const bounds = computeGraphBounds(nodes, edges);

  const plan = computePngDimensions(bounds, scale, padding, options.maxPixels);

  const svgOptions: SvgExportOptions = {
    theme,
    padding,
    includeAnnotations: options.includeAnnotations,
    includeMetrics: options.includeMetrics,
    title: options.name,
  };

  const svgString = exportPositionedGraphToSvg(nodes, edges, svgOptions);

  let bgColor = options.backgroundColor;
  if (!bgColor) {
    if (theme === "dark") bgColor = "#0c0d12";
    else if (theme === "light") bgColor = "#f8fafc";
    else bgColor = "transparent";
  }

  const { blob, dataUrl } = await renderSvgToRaster(
    svgString,
    plan.pixelWidth,
    plan.pixelHeight,
    bgColor,
  );
  const fileName = derivePngFilename(options.name, scale);

  return {
    fileName,
    pixelWidth: plan.pixelWidth,
    pixelHeight: plan.pixelHeight,
    scale: plan.scale,
    isDownscaled: plan.isDownscaled,
    blob,
    dataUrl,
  };
}

/**
 * Triggers client-side download of a PNG blob or data URL.
 */
export function downloadPng(blobOrDataUrl: Blob | string, filename = "graph-export.png"): void {
  if (typeof document === "undefined") return;

  const url =
    typeof blobOrDataUrl === "string" ? blobOrDataUrl : URL.createObjectURL(blobOrDataUrl);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (typeof blobOrDataUrl !== "string") {
    URL.revokeObjectURL(url);
  }
}
