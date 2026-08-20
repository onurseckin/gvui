import type { GraphEdgeData, IoPort } from "../../types/graphData";

/**
 * Format raw byte size into human-readable representation.
 * Enforces strict finite number validation.
 */
export function formatBytes(bytes: number): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || Number.isNaN(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format token count into compact notation (e.g. 840, 12.4k, 1.2M).
 * Enforces strict finite number validation.
 */
export function formatTokens(value: number): string {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value) || value <= 0) {
    return "0";
  }
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) {
    const thousands = value / 1000;
    return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`;
  }
  const millions = value / 1_000_000;
  return `${millions < 10 ? millions.toFixed(1) : Math.round(millions)}M`;
}

/**
 * Format duration in milliseconds into human-readable timing (e.g. 450ms, 2.3s, 3m 12s).
 * Enforces strict finite number validation.
 */
export function formatDuration(ms: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || Number.isNaN(ms) || ms <= 0) {
    return "0ms";
  }
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Format cost in USD to appropriate precision.
 * Enforces strict finite number validation.
 */
export function formatCost(usd: number): string {
  if (typeof usd !== "number" || !Number.isFinite(usd) || Number.isNaN(usd) || usd <= 0) {
    return "$0";
  }
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

/**
 * Calculate UTF-8 byte length for payload string.
 */
export function getByteLength(str: string): number {
  if (!str) return 0;
  return new TextEncoder().encode(str).length;
}

/**
 * Robust clipboard copy utility that attempts navigator.clipboard.writeText
 * and falls back to an off-screen textarea with document.execCommand('copy')
 * if navigator.clipboard is unavailable, throws, or rejects (e.g. in insecure contexts or headless environments).
 * Returns a Promise<boolean> indicating whether the copy succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern navigator.clipboard.writeText
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy execCommand fallback
    }
  }

  // 2. Fallback to document.execCommand('copy') with off-screen textarea
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      // Prevent scrolling to bottom of page in some browsers
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.width = "2em";
      textarea.style.height = "2em";
      textarea.style.padding = "0";
      textarea.style.border = "none";
      textarea.style.outline = "none";
      textarea.style.boxShadow = "none";
      textarea.style.background = "transparent";
      textarea.setAttribute("readonly", "");
      textarea.setAttribute("aria-hidden", "true");
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      return Boolean(successful);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Convert graph edge data into an IoPort stream without generic boilerplate labels.
 * Strips repeating "(handoff)" and default placeholders in favor of descriptive peer names.
 */
export function edgeToPort(edge: GraphEdgeData, direction: "in" | "out"): IoPort {
  const peerNode = direction === "in" ? edge.source : edge.target;
  const defaultLabel = direction === "in" ? `Input from ${peerNode}` : `Output to ${peerNode}`;

  let label = edge.handoff?.summary || edge.condition || edge.label || "";
  if (!label || label === "(handoff)" || label.toLowerCase() === "summary") {
    label = defaultLabel;
  }

  return {
    node: peerNode,
    kind: edge.handoff?.kind ?? "summary",
    label,
    tokens: edge.handoff?.tokens,
  };
}

/**
 * Sanitize a filename by removing query strings, hash fragments, path traversal components,
 * illegal filesystem characters, and leading/trailing dots/spaces.
 */
export function sanitizeFilename(filename: string, fallback = "asset"): string {
  if (!filename || typeof filename !== "string") return fallback;

  // 1. Strip query string and hash
  let clean = filename.split("?")[0].split("#")[0];

  // 2. Normalize backslashes to forward slashes
  clean = clean.replace(/\\/g, "/");

  // 3. Remove path traversal segments and extract base name
  const segments = clean.split("/").filter((s) => s.trim().length > 0 && s !== "." && s !== "..");
  const base = segments.pop() ?? "";

  // 4. Strip illegal/dangerous characters (\0, control chars, : * ? " < > | / \)
  const sanitized = base
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/^\.+/, "")
    .trim();

  return sanitized.length > 0 ? sanitized : fallback;
}

/**
 * Resolve a clean, safe download filename given a resource URL and optional suggested filename.
 * Handles data:, blob:, file://, http/https, relative, and extensionless paths with sensible defaults.
 */
export function resolveDownloadFilename(url: string, suggestedFilename?: string): string {
  if (
    suggestedFilename &&
    typeof suggestedFilename === "string" &&
    suggestedFilename.trim().length > 0
  ) {
    const sanitizedSuggested = sanitizeFilename(suggestedFilename);
    if (sanitizedSuggested && sanitizedSuggested !== "asset") {
      return sanitizedSuggested;
    }
  }

  if (!url || typeof url !== "string" || !url.trim()) {
    return "asset";
  }

  const trimmedUrl = url.trim();

  // Data URIs: e.g. data:image/png;base64,...
  if (trimmedUrl.startsWith("data:")) {
    const mimeMatch = trimmedUrl.match(/^data:([^;,]+)/i);
    const mime = mimeMatch ? mimeMatch[1].toLowerCase() : "";
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "image/svg+xml": "svg",
      "image/gif": "gif",
      "image/avif": "avif",
      "image/bmp": "bmp",
      "application/pdf": "pdf",
      "application/json": "json",
      "text/plain": "txt",
      "text/markdown": "md",
      "text/html": "html",
      "text/css": "css",
      "text/javascript": "js",
      "application/javascript": "js",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
    };
    const ext = extMap[mime] ?? (mime.startsWith("image/") ? mime.slice(6) : "png");
    return `asset.${ext}`;
  }

  // Blob URIs: e.g. blob:http://localhost:3000/d3b07384-d113-4944-9c8e-3243f11a8a2d
  if (trimmedUrl.startsWith("blob:")) {
    const cleanBlob = trimmedUrl.slice(5).split("?")[0].split("#")[0];
    const segment = cleanBlob.split("/").filter(Boolean).pop() ?? "";
    const sanitized = sanitizeFilename(segment, "asset");
    return sanitized.includes(".") ? sanitized : `${sanitized}.png`;
  }

  // file:// or http:// or relative path
  let pathOnly = trimmedUrl;
  if (pathOnly.startsWith("file://")) {
    pathOnly = pathOnly.slice(7);
  }
  const cleanUrl = pathOnly.split("?")[0].split("#")[0].replace(/\\/g, "/");
  const lastSegment = cleanUrl.split("/").filter(Boolean).pop() ?? "";
  const sanitized = sanitizeFilename(lastSegment, "asset");
  return sanitized;
}

/**
 * Normalize an asset URL into a browser-loadable URL.
 * Leaves already-portable references alone (data:, blob:, http(s):, and the importer's own
 * /data/... paths). Converts local filesystem paths (/Users/..., C:\..., file:///...) and capsule
 * paths into the Vite /api/assets bridge endpoint so they can be loaded by <img> elements in the
 * browser — that bridge only exists on the machine the path is actually valid on.
 */
export function normalizeAssetUrl(url?: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Data or blob URIs are already loadable by <img>
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  // Remote HTTP/HTTPS URIs are loadable as-is
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Already routed through /api/assets
  if (trimmed.startsWith("/api/assets")) {
    return trimmed;
  }

  // Root-relative paths under the app's own public assets (what the capsule importer writes
  // portable asset references as) are already servable as a static file in dev, preview and the
  // nginx-served prod build alike. Routing these through /api/assets would break them: that bridge
  // is dev-server-only and, for a path in this shape, would try to resolve it as a literal
  // filesystem path rooted at "/" rather than the app's public directory.
  if (trimmed.startsWith("/data/")) {
    return trimmed;
  }

  // Strip file:// prefix if present
  let cleanPath = trimmed;
  if (cleanPath.startsWith("file://")) {
    cleanPath = cleanPath.slice(7);
  }

  // Route local file and capsule paths through /api/assets bridge
  return `/api/assets?path=${encodeURIComponent(cleanPath)}`;
}

/**
 * Trigger browser download or opening of an asset URL (data, blob, local file://, or http/https)
 * with strict filename sanitization and safe default fallbacks.
 */
export function downloadAssetFile(url: string, filename?: string): void {
  if (!url || typeof url !== "string" || !url.trim()) return;
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    try {
      const targetName = resolveDownloadFilename(url, filename);
      const link = document.createElement("a");
      link.href = url;
      link.download = targetName;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // Graceful fallback for non-DOM or restricted environments
    }
  }
}
