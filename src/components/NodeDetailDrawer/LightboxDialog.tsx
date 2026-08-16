import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDownload,
  IconFileCode,
  IconFileText,
  IconFileTypePdf,
  IconHierarchy,
  IconInfoCircle,
  IconMarkdown,
  IconNotes,
  IconPhoto,
  IconPhotoOff,
  IconPlayerPlay,
  IconVolume,
  IconX,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaAsset } from "../../types/graphData";
import { copyToClipboard, formatBytes, sanitizeFilename } from "./streamUtils";

const isPdf = (a?: MediaAsset): boolean => {
  if (!a) return false;
  if (a.type === "pdf" || a.mimeType === "application/pdf") return true;
  const url = typeof a.url === "string" ? a.url.toLowerCase() : "";
  return (
    url.endsWith(".pdf") ||
    /\.pdf(\?.*)?$/i.test(url) ||
    Boolean(a.title && a.title.toLowerCase().includes("pdf"))
  );
};

const isCode = (a?: MediaAsset): boolean => {
  if (!a) return false;
  if (a.type === "code") return true;
  const url = typeof a.url === "string" ? a.url : "";
  return (
    /\.(ts|tsx|js|jsx|json|py|rs|go|sh|css|html|yaml|yml|toml|graphql|sql)$/i.test(url) ||
    Boolean(
      a.mimeType &&
      (a.mimeType.includes("javascript") ||
        a.mimeType.includes("json") ||
        a.mimeType.includes("typescript") ||
        a.mimeType.includes("python") ||
        a.mimeType.includes("code")),
    )
  );
};

const isLog = (a?: MediaAsset): boolean => {
  if (!a) return false;
  if (a.type === "log") return true;
  const url = typeof a.url === "string" ? a.url.toLowerCase() : "";
  return url.endsWith(".log") || Boolean(a.title && a.title.toLowerCase().includes("log"));
};

const isMarkdown = (a?: MediaAsset): boolean => {
  if (!a) return false;
  if (a.type === "markdown") return true;
  const url = typeof a.url === "string" ? a.url : "";
  return (
    /\.(md|markdown)$/i.test(url) || Boolean(a.title && a.title.toLowerCase().includes("markdown"))
  );
};

const isDiagram = (a?: MediaAsset): boolean => {
  if (!a) return false;
  if (a.type === "diagram") return true;
  const url = typeof a.url === "string" ? a.url.toLowerCase() : "";
  return (
    url.includes("diagram") ||
    /\.(svg|drawio|excalidraw)$/i.test(url) ||
    Boolean(a.title && a.title.toLowerCase().includes("diagram"))
  );
};

const isDocument = (a?: MediaAsset): boolean => {
  if (!a) return false;
  if (
    a.type === "document" ||
    a.type === "pdf" ||
    a.type === "markdown" ||
    a.type === "code" ||
    isPdf(a) ||
    isMarkdown(a) ||
    isCode(a)
  ) {
    return true;
  }
  const url = typeof a.url === "string" ? a.url : "";
  return (
    Boolean(
      a.mimeType &&
      (a.mimeType === "application/pdf" ||
        a.mimeType.startsWith("text/") ||
        a.mimeType.includes("pdf") ||
        a.mimeType.includes("document") ||
        a.mimeType.includes("msword") ||
        a.mimeType.includes("spreadsheet") ||
        a.mimeType.includes("csv")),
    ) || /\.(pdf|md|markdown|txt|rtf|docx?|xlsx?|pptx?|csv)$/i.test(url)
  );
};

const isImage = (a?: MediaAsset): boolean => {
  if (!a) return false;
  if (
    isPdf(a) ||
    isCode(a) ||
    isLog(a) ||
    isMarkdown(a) ||
    a.type === "video" ||
    a.type === "audio"
  ) {
    return false;
  }
  const url = typeof a.url === "string" ? a.url : "";
  if (isDiagram(a) && !/\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(url)) {
    return false;
  }
  if (a.type === "image" || a.type === "screenshot" || a.type === "diagram") {
    return true;
  }
  if (/\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(url)) {
    return true;
  }
  if (Boolean(a.mimeType && a.mimeType.startsWith("image/"))) {
    return true;
  }
  return false;
};

export interface LightboxDialogProps {
  isOpen: boolean;
  assets: MediaAsset[];
  initialIndex?: number;
  onClose: () => void;
}

interface CodeToken {
  type:
    | "keyword"
    | "string"
    | "number"
    | "comment"
    | "function"
    | "type"
    | "punctuation"
    | "log-level"
    | "timestamp"
    | "plain";
  value: string;
  variant?: "error" | "warn" | "info" | "debug";
}

interface HighlightedLine {
  lineNumber: number;
  tokens: CodeToken[];
}

/**
 * Tokenize a single line of log or code for high-fidelity syntax highlighting.
 */
function tokenizeLine(line: string, isLogFile: boolean): CodeToken[] {
  if (!line) return [{ type: "plain", value: "" }];

  const tokens: CodeToken[] = [];

  if (isLogFile) {
    const logRegex =
      /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?|\[\d{2}:\d{2}:\d{2}\])|(\b(?:ERROR|FATAL|CRITICAL|FAIL|FAILED)\b)|(\b(?:WARN|WARNING)\b)|(\b(?:INFO|NOTICE)\b)|(\b(?:DEBUG|TRACE)\b)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+\b)|([^\s\w]+)|([^\s]+)/g;

    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = logRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: "plain", value: line.slice(lastIndex, match.index) });
      }

      if (match[1]) {
        tokens.push({ type: "timestamp", value: match[1] });
      } else if (match[2]) {
        tokens.push({ type: "log-level", value: match[2], variant: "error" });
      } else if (match[3]) {
        tokens.push({ type: "log-level", value: match[3], variant: "warn" });
      } else if (match[4]) {
        tokens.push({ type: "log-level", value: match[4], variant: "info" });
      } else if (match[5]) {
        tokens.push({ type: "log-level", value: match[5], variant: "debug" });
      } else if (match[6]) {
        tokens.push({ type: "string", value: match[6] });
      } else if (match[7]) {
        tokens.push({ type: "number", value: match[7] });
      } else if (match[8]) {
        tokens.push({ type: "punctuation", value: match[8] });
      } else {
        tokens.push({ type: "plain", value: match[0] });
      }

      lastIndex = logRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      tokens.push({ type: "plain", value: line.slice(lastIndex) });
    }

    return tokens;
  }

  const commentMatch = line.match(/^(\s*)((\/\/|#|\/\*).*)$/);
  if (commentMatch && commentMatch[1] !== undefined && commentMatch[2] !== undefined) {
    if (commentMatch[1]) {
      tokens.push({ type: "plain", value: commentMatch[1] });
    }
    tokens.push({ type: "comment", value: commentMatch[2] });
    return tokens;
  }

  const codeRegex =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/.*|\/\*.*?\*\/|#.*)|(\b(?:const|let|var|function|return|import|export|from|as|default|class|extends|interface|type|enum|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|async|await|yield|new|typeof|instanceof|void|delete|in|of|def|fn|pub|struct|impl|use|mut|self|true|false|null|undefined|nil)\b)|(\b\d+(?:\.\d+)?\b)|(\b[A-Z][a-zA-Z0-9_$]*\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|([{}()[\].,;:?+\-*/%&|^!=<>]+)|([a-zA-Z_$][a-zA-Z0-9_$]*)|(\s+)/g;

  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = codeRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "plain", value: line.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      tokens.push({ type: "string", value: match[1] });
    } else if (match[2]) {
      tokens.push({ type: "comment", value: match[2] });
    } else if (match[3]) {
      tokens.push({ type: "keyword", value: match[3] });
    } else if (match[4]) {
      tokens.push({ type: "number", value: match[4] });
    } else if (match[5]) {
      tokens.push({ type: "type", value: match[5] });
    } else if (match[6]) {
      tokens.push({ type: "function", value: match[6] });
    } else if (match[7]) {
      tokens.push({ type: "punctuation", value: match[7] });
    } else if (match[8]) {
      tokens.push({ type: "plain", value: match[8] });
    } else if (match[9]) {
      tokens.push({ type: "plain", value: match[9] });
    }

    lastIndex = codeRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ type: "plain", value: line.slice(lastIndex) });
  }

  return tokens;
}

function highlightSource(source: string, isLogFile: boolean): HighlightedLine[] {
  const rawLines = source.split(/\r?\n/);
  return rawLines.map((line, idx) => ({
    lineNumber: idx + 1,
    tokens: tokenizeLine(line, isLogFile),
  }));
}

interface CodeViewerProps {
  asset: MediaAsset;
  isLogFile: boolean;
}

const CodeViewer: FC<CodeViewerProps> = memo(function CodeViewer({ asset, isLogFile }) {
  const [copied, setCopied] = useState<boolean>(false);

  const rawContent = useMemo(() => {
    if (typeof asset.metadata?.content === "string") return asset.metadata.content;
    if (typeof asset.metadata?.code === "string") return asset.metadata.code;
    if (typeof asset.description === "string") return asset.description;
    return `// Asset: ${asset.title ?? asset.id}\n// Path: ${asset.url}\n// Size: ${formatBytes(asset.sizeBytes ?? 0)}`;
  }, [asset]);

  const lines = useMemo(() => {
    return highlightSource(rawContent, isLogFile);
  }, [rawContent, isLogFile]);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(rawContent);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [rawContent]);

  const fileExt = useMemo(() => {
    const url = asset.url || "";
    const cleanUrl = url.split("?")[0].split("#")[0];
    const parts = cleanUrl.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : isLogFile ? "LOG" : "CODE";
  }, [asset.url, isLogFile]);

  return (
    <div className="drawer-lightbox-code-viewer">
      <div className="drawer-lightbox-code-toolbar">
        <div className="drawer-lightbox-code-toolbar-left">
          <span className="drawer-lightbox-lang-badge">{fileExt}</span>
          <span className="drawer-lightbox-code-chip">{lines.length} lines</span>
          {typeof asset.sizeBytes === "number" && (
            <span className="drawer-lightbox-code-chip">{formatBytes(asset.sizeBytes)}</span>
          )}
        </div>
        <div className="drawer-lightbox-code-toolbar-right">
          <button
            type="button"
            className={`drawer-copy-btn ${copied ? "is-copied" : ""}`}
            onClick={handleCopy}
            aria-label="Copy code content"
          >
            {copied ? (
              <>
                <IconCheck size={13} />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <IconCopy size={13} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      <div className="drawer-lightbox-code-container">
        <table className="drawer-code-table">
          <tbody>
            {lines.map((line) => (
              <tr key={line.lineNumber} className="drawer-code-row">
                <td className="drawer-code-lineno" data-line-number={line.lineNumber}>
                  {line.lineNumber}
                </td>
                <td className="drawer-code-content">
                  <code>
                    {line.tokens.map((tok, tIdx) => {
                      const className = tok.variant
                        ? `token token-${tok.type} token-${tok.type}--${tok.variant}`
                        : `token token-${tok.type}`;
                      return (
                        <span key={tIdx} className={className}>
                          {tok.value}
                        </span>
                      );
                    })}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

interface PdfViewerProps {
  asset: MediaAsset;
}

const PdfViewer: FC<PdfViewerProps> = memo(function PdfViewer({ asset }) {
  return (
    <div className="drawer-lightbox-pdf-container">
      <div className="drawer-lightbox-pdf-toolbar">
        <div className="drawer-lightbox-pdf-toolbar-left">
          <span className="drawer-lightbox-pdf-tag">
            <IconFileTypePdf size={16} />
            <span>PDF Document</span>
          </span>
          <span className="drawer-lightbox-pdf-title">{asset.title ?? asset.id}</span>
        </div>
        <div className="drawer-lightbox-pdf-toolbar-right">
          {typeof asset.sizeBytes === "number" && (
            <span className="drawer-lightbox-chip">{formatBytes(asset.sizeBytes)}</span>
          )}
          {asset.url && (
            <a
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              className="drawer-lightbox-action-btn"
              title="Open in new window"
              aria-label="Open PDF in new tab"
            >
              <IconDownload size={16} />
            </a>
          )}
        </div>
      </div>
      <div className="drawer-lightbox-pdf-viewport">
        <object
          data={asset.url}
          type="application/pdf"
          className="drawer-lightbox-pdf-object"
          aria-label={asset.title ?? "PDF Document Preview"}
        >
          <iframe
            src={asset.url}
            title={asset.title ?? "PDF Document"}
            className="drawer-lightbox-pdf-iframe"
          >
            <div className="drawer-lightbox-pdf-fallback">
              <IconFileTypePdf size={48} className="drawer-lightbox-pdf-icon" />
              <h4 className="drawer-lightbox-pdf-fallback-title">{asset.title ?? asset.id}</h4>
              <p className="drawer-lightbox-pdf-fallback-desc">
                PDF document preview. Click below to view or download.
              </p>
              {asset.url && (
                <a
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                  className="drawer-lightbox-fallback-btn"
                >
                  <IconDownload size={14} /> Open PDF directly
                </a>
              )}
            </div>
          </iframe>
        </object>
      </div>
    </div>
  );
});

interface DocumentViewerProps {
  asset: MediaAsset;
}

const DocumentViewer: FC<DocumentViewerProps> = memo(function DocumentViewer({ asset }) {
  const [copied, setCopied] = useState<boolean>(false);

  const rawContent = useMemo(() => {
    if (typeof asset.metadata?.content === "string") return asset.metadata.content;
    if (typeof asset.metadata?.code === "string") return asset.metadata.code;
    if (typeof asset.description === "string") return asset.description;
    return undefined;
  }, [asset]);

  const handleCopy = useCallback(async () => {
    if (!rawContent) return;
    const success = await copyToClipboard(rawContent);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [rawContent]);

  const docExt = useMemo(() => {
    const url = asset.url || "";
    const cleanUrl = url.split("?")[0].split("#")[0];
    const parts = cleanUrl.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "DOC";
  }, [asset.url]);

  return (
    <div className="drawer-lightbox-doc-card">
      <div className="drawer-lightbox-doc-header">
        <div className="drawer-lightbox-doc-header-left">
          <span className="drawer-lightbox-doc-tag">
            <IconFileText size={16} />
            <span>{docExt} Document</span>
          </span>
          <h4 className="drawer-lightbox-doc-title">{asset.title ?? asset.id}</h4>
        </div>
        <div className="drawer-lightbox-doc-header-right">
          {typeof asset.sizeBytes === "number" && (
            <span className="drawer-lightbox-chip">{formatBytes(asset.sizeBytes)}</span>
          )}
          {rawContent && (
            <button
              type="button"
              className={`drawer-copy-btn ${copied ? "is-copied" : ""}`}
              onClick={handleCopy}
              aria-label="Copy document text"
            >
              {copied ? (
                <>
                  <IconCheck size={13} />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <IconCopy size={13} />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
          {asset.url && (
            <a
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              className="drawer-lightbox-action-btn"
              title="Open / Download document"
              aria-label="Open document in new tab"
              download={asset.title ?? asset.id}
            >
              <IconDownload size={16} />
            </a>
          )}
        </div>
      </div>
      <div className="drawer-lightbox-doc-body">
        {rawContent ? (
          <pre className="drawer-pre drawer-lightbox-doc-pre">
            <code>{rawContent}</code>
          </pre>
        ) : (
          <div className="drawer-lightbox-doc-fallback">
            <IconFileText size={48} className="drawer-lightbox-doc-icon" />
            <h5 className="drawer-lightbox-doc-fallback-title">{asset.title ?? asset.id}</h5>
            <p className="drawer-lightbox-doc-fallback-desc">
              {asset.description || "Binary document or structured data file artifact."}
            </p>
            {asset.url && (
              <a
                href={asset.url}
                target="_blank"
                rel="noreferrer"
                className="drawer-lightbox-fallback-btn"
                download={asset.title ?? asset.id}
              >
                <IconDownload size={14} /> Open or Download {docExt} File
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Fullscreen high-DPI Lightbox modal dialog supporting:
 * - 100% to 400% zoom scaling with percentage badge
 * - Interactive pan navigation with grab / grabbing cursor and clamping
 * - PDF rendering preview with toolbar and responsive container
 * - Syntax-highlighted code and log viewers with line numbers and copy buttons
 * - Dedicated document viewer cards for non-image document formats
 * - Prev/Next keyboard navigation (ArrowLeft / ArrowRight) with single-asset guards and Escape dismiss
 * - Metadata inspector sidebar and direct download links
 */
export const LightboxDialog: FC<LightboxDialogProps> = memo(function LightboxDialog({
  isOpen,
  assets,
  initialIndex = 0,
  onClose,
}) {
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [showMetadata, setShowMetadata] = useState<boolean>(true);
  const [hasImageError, setHasImageError] = useState<boolean>(false);

  const startDragRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setCurrentIndex(Math.max(0, Math.min(initialIndex, assets.length - 1)));
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setHasImageError(false);
  }, [initialIndex, assets.length]);

  useEffect(() => {
    setHasImageError(false);
  }, [currentIndex]);

  // Initial focus management & focus restoration on unmount / dismiss
  useEffect(() => {
    if (!isOpen) return;

    if (typeof document !== "undefined" && document.activeElement) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
    }

    const timer = setTimeout(() => {
      if (closeBtnRef.current) {
        closeBtnRef.current.focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      if (
        previousActiveElementRef.current &&
        typeof previousActiveElementRef.current.focus === "function" &&
        (typeof document === "undefined" ||
          document.body.contains(previousActiveElementRef.current))
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen]);

  const currentAsset: MediaAsset | undefined = assets[currentIndex];

  const currentDimensions = useMemo(() => {
    if (!currentAsset) return undefined;
    if (
      currentAsset.dimensions &&
      typeof currentAsset.dimensions.width === "number" &&
      typeof currentAsset.dimensions.height === "number"
    ) {
      return currentAsset.dimensions;
    }
    if (currentAsset.metadata?.dimensions && typeof currentAsset.metadata.dimensions === "object") {
      const d = currentAsset.metadata.dimensions as { width?: unknown; height?: unknown };
      if (typeof d.width === "number" && typeof d.height === "number") {
        return { width: d.width, height: d.height };
      }
    }
    if (currentAsset.metadata?.viewport && typeof currentAsset.metadata.viewport === "object") {
      const v = currentAsset.metadata.viewport as { width?: unknown; height?: unknown };
      if (typeof v.width === "number" && typeof v.height === "number") {
        return { width: v.width, height: v.height };
      }
    }
    const assetObj = currentAsset as unknown as {
      viewport?: { width?: unknown; height?: unknown };
    };
    if (assetObj.viewport && typeof assetObj.viewport === "object") {
      const v = assetObj.viewport;
      if (typeof v.width === "number" && typeof v.height === "number") {
        return { width: v.width, height: v.height };
      }
    }
    const match = (currentAsset.description || currentAsset.title || currentAsset.url || "").match(
      /\b(\d{3,4})[x×](\d{3,4})\b/,
    );
    if (match && match[1] && match[2]) {
      return { width: Number(match[1]), height: Number(match[2]) };
    }
    return undefined;
  }, [currentAsset]);

  const resetPanAndZoom = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handlePrev = useCallback(() => {
    if (assets.length <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : assets.length - 1));
    resetPanAndZoom();
  }, [assets.length, resetPanAndZoom]);

  const handleNext = useCallback(() => {
    if (assets.length <= 1) return;
    setCurrentIndex((prev) => (prev < assets.length - 1 ? prev + 1 : 0));
    resetPanAndZoom();
  }, [assets.length, resetPanAndZoom]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => {
      const next = Math.min(4, Math.round((z + 0.5) * 10) / 10);
      return next;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => {
      const next = Math.max(1, Math.round((z - 0.5) * 10) / 10);
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleZoomReset = useCallback(() => {
    resetPanAndZoom();
  }, [resetPanAndZoom]);

  const handleZoomToggle = useCallback(() => {
    setZoom((z) => {
      if (z === 1) {
        return 2;
      }
      setPanOffset({ x: 0, y: 0 });
      return 1;
    });
  }, []);

  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const handleCopyUrl = useCallback(async () => {
    if (!currentAsset?.url) return;
    const success = await copyToClipboard(currentAsset.url);
    if (success) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  }, [currentAsset?.url]);

  // Pan event handlers with bounded coordinate clamping to prevent dragging offscreen
  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (zoom <= 1) return;
      setIsPanning(true);
      startDragRef.current = { x: e.clientX, y: e.clientY };
      initialPanRef.current = { ...panOffset };
    },
    [zoom, panOffset],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!isPanning || zoom <= 1) return;
      const dx = e.clientX - startDragRef.current.x;
      const dy = e.clientY - startDragRef.current.y;
      const rawX = initialPanRef.current.x + dx;
      const rawY = initialPanRef.current.y + dy;
      const maxOffset = Math.round(zoom * 800);
      setPanOffset({
        x: Math.max(-maxOffset, Math.min(maxOffset, rawX)),
        y: Math.max(-maxOffset, Math.min(maxOffset, rawY)),
      });
    },
    [isPanning, zoom],
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) setIsPanning(false);
  }, [isPanning]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const container =
          dialogRef.current ||
          (typeof document !== "undefined" && typeof document.querySelector === "function"
            ? document.querySelector<HTMLElement>(".drawer-lightbox-overlay")
            : null);
        if (!container) return;
        const focusableElements = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => {
          if (typeof window !== "undefined" && window.getComputedStyle) {
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") {
              return false;
            }
          }
          return true;
        });

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === firstElement ||
            !container.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (
            document.activeElement === lastElement ||
            !container.contains(document.activeElement)
          ) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
        return;
      }

      // Guard zoom and navigation hotkeys when typing in editable form inputs or contenteditable elements
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName ? target.tagName.toUpperCase() : "";
        const isEditable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          target.getAttribute("contenteditable") === "true" ||
          target.getAttribute("contenteditable") === "";
        if (isEditable) {
          return;
        }
      }

      if (e.key === "ArrowLeft") {
        e.stopPropagation();
        if (assets.length > 1) {
          handlePrev();
        }
      } else if (e.key === "ArrowRight") {
        e.stopPropagation();
        if (assets.length > 1) {
          handleNext();
        }
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleZoomReset();
      } else if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        handleZoomToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    onClose,
    handlePrev,
    handleNext,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleZoomToggle,
    assets.length,
  ]);

  if (!isOpen || !currentAsset) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const isCurrentPdf = isPdf(currentAsset);
  const isCurrentCode = isCode(currentAsset);
  const isCurrentLog = isLog(currentAsset);
  const isCurrentMarkdown = isMarkdown(currentAsset);
  const isCurrentDiagram = isDiagram(currentAsset);
  const isCurrentDoc =
    isDocument(currentAsset) && !currentAsset.url.match(/\.(png|jpe?g|webp|gif|svg)$/i);
  const isImageOrDiagram =
    isImage(currentAsset) ||
    (isCurrentDiagram && /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(currentAsset.url));

  const getAssetIcon = (asset: MediaAsset) => {
    if (isDiagram(asset)) return <IconHierarchy size={16} />;
    if (isPdf(asset)) return <IconFileTypePdf size={16} />;
    if (isCode(asset)) return <IconFileCode size={16} />;
    if (isLog(asset)) return <IconNotes size={16} />;
    if (isMarkdown(asset)) return <IconMarkdown size={16} />;
    if (asset.type === "video") return <IconPlayerPlay size={16} />;
    if (asset.type === "audio") return <IconVolume size={16} />;
    if (isDocument(asset)) return <IconFileText size={16} />;
    return <IconPhoto size={16} />;
  };

  return (
    <div
      ref={dialogRef}
      className="drawer-lightbox-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Media Asset Lightbox: ${currentAsset.title ?? currentAsset.id}`}
      tabIndex={-1}
    >
      <div className="drawer-lightbox-dialog">
        <header className="drawer-lightbox-header">
          <div className="drawer-lightbox-header-left">
            <span className="drawer-lightbox-type-icon">{getAssetIcon(currentAsset)}</span>
            <div className="drawer-lightbox-title-wrap">
              <h3 className="drawer-lightbox-title">
                {currentAsset.title ?? `Asset ${currentAsset.id}`}
              </h3>
              <span className="drawer-lightbox-counter">
                {`${currentIndex + 1} of ${assets.length}`}
              </span>
            </div>
            {currentDimensions && (
              <span
                className="drawer-lightbox-chip"
                title="Resolution"
                aria-label={`Resolution ${currentDimensions.width} × ${currentDimensions.height}`}
              >
                {`${currentDimensions.width} × ${currentDimensions.height}`}
              </span>
            )}
            {typeof currentAsset.sizeBytes === "number" && (
              <span className="drawer-lightbox-chip">{formatBytes(currentAsset.sizeBytes)}</span>
            )}
            {currentAsset.author && (
              <span className="drawer-lightbox-chip" title="Author attribution">
                {currentAsset.author}
              </span>
            )}
          </div>

          <div className="drawer-lightbox-header-actions">
            {isImageOrDiagram && (
              <div className="drawer-lightbox-zoom-controls">
                <button
                  type="button"
                  className={`drawer-lightbox-action-btn ${zoom > 1 ? "is-active" : ""}`}
                  onClick={handleZoomToggle}
                  title="Toggle Zoom 100% / 200% (Z)"
                  aria-label="Toggle zoom 100% / 200%"
                >
                  <span style={{ fontSize: "11px", fontWeight: 700 }}>
                    {zoom > 1 ? "100%" : "200%"}
                  </span>
                </button>
                <button
                  type="button"
                  className="drawer-lightbox-action-btn"
                  onClick={handleZoomIn}
                  title="Zoom In (+)"
                  aria-label="Zoom in"
                  disabled={zoom >= 4}
                  aria-disabled={zoom >= 4}
                >
                  <IconZoomIn size={16} />
                </button>
                <button
                  type="button"
                  className="drawer-lightbox-action-btn"
                  onClick={handleZoomOut}
                  title="Zoom Out (-)"
                  aria-label="Zoom out"
                  disabled={zoom <= 1}
                  aria-disabled={zoom <= 1}
                >
                  <IconZoomOut size={16} />
                </button>
                <button
                  type="button"
                  className="drawer-lightbox-action-btn"
                  onClick={handleZoomReset}
                  title="Reset Zoom (0)"
                  aria-label="Reset zoom"
                  disabled={zoom === 1 && panOffset.x === 0 && panOffset.y === 0}
                  aria-disabled={zoom === 1 && panOffset.x === 0 && panOffset.y === 0}
                >
                  <IconZoomReset size={16} />
                </button>
                <span className="drawer-lightbox-zoom-pct">{`${Math.round(zoom * 100)}%`}</span>
              </div>
            )}

            {currentAsset.url && currentAsset.url.trim().length > 0 && (
              <button
                type="button"
                className="drawer-lightbox-action-btn"
                onClick={handleCopyUrl}
                title="Copy Asset URL / Path"
                aria-label="Copy asset URL"
              >
                {copiedUrl ? (
                  <IconCheck size={16} style={{ color: "#34d399" }} />
                ) : (
                  <IconCopy size={16} />
                )}
              </button>
            )}

            <button
              type="button"
              className={`drawer-lightbox-action-btn ${showMetadata ? "is-active" : ""}`}
              onClick={() => setShowMetadata((prev) => !prev)}
              title="Toggle Info"
              aria-label="Toggle metadata panel"
            >
              <IconInfoCircle size={16} />
            </button>

            {currentAsset.url && currentAsset.url.trim().length > 0 && (
              <a
                href={currentAsset.url}
                target="_blank"
                rel="noreferrer"
                className="drawer-lightbox-action-btn"
                title="Download / Open in new tab"
                aria-label="Download asset"
                download={sanitizeFilename(currentAsset.title ?? currentAsset.id)}
              >
                <IconDownload size={16} />
              </a>
            )}

            <button
              ref={closeBtnRef}
              type="button"
              className="drawer-lightbox-action-btn drawer-lightbox-close-btn"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close dialog"
            >
              <IconX size={18} />
            </button>
          </div>
        </header>

        <div className="drawer-lightbox-main">
          {assets.length > 1 && (
            <button
              type="button"
              className="drawer-lightbox-nav-btn drawer-lightbox-nav-prev"
              onClick={handlePrev}
              title="Previous Asset (Left Arrow)"
              aria-label="Previous asset"
            >
              <IconChevronLeft size={24} />
            </button>
          )}

          <div
            className={`drawer-lightbox-viewport ${zoom > 1 ? "is-zoomed" : ""}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default",
            }}
          >
            {!currentAsset.url || !currentAsset.url.trim() ? (
              <div className="drawer-lightbox-fallback">
                <IconPhotoOff size={48} className="drawer-lightbox-fallback-icon" />
                <h4 className="drawer-lightbox-fallback-title">Asset URL Unavailable</h4>
                <p className="drawer-lightbox-fallback-desc">
                  No valid URL or file path was provided for this asset artifact.
                </p>
              </div>
            ) : currentAsset.type === "video" ? (
              <video
                src={currentAsset.url}
                controls
                autoPlay
                className="drawer-lightbox-video"
                poster={currentAsset.thumbnailUrl}
              >
                Your browser does not support the video tag.
              </video>
            ) : currentAsset.type === "audio" ? (
              <div className="drawer-lightbox-audio-wrap">
                <audio src={currentAsset.url} controls autoPlay className="drawer-lightbox-audio">
                  Your browser does not support the audio tag.
                </audio>
              </div>
            ) : isCurrentPdf ? (
              <PdfViewer asset={currentAsset} />
            ) : isCurrentCode || isCurrentLog || isCurrentMarkdown ? (
              <CodeViewer asset={currentAsset} isLogFile={isCurrentLog} />
            ) : isCurrentDoc ? (
              <DocumentViewer asset={currentAsset} />
            ) : hasImageError ? (
              <div className="drawer-lightbox-fallback">
                <IconPhotoOff size={48} className="drawer-lightbox-fallback-icon" />
                <h4 className="drawer-lightbox-fallback-title">Image failed to load</h4>
                <p className="drawer-lightbox-fallback-desc">
                  The image asset at <code>{currentAsset.url}</code> could not be loaded or is
                  unreachable.
                </p>
                {currentAsset.url && (
                  <a
                    href={currentAsset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="drawer-lightbox-fallback-btn"
                  >
                    <IconDownload size={14} /> Open direct URL
                  </a>
                )}
              </div>
            ) : isImageOrDiagram ? (
              <div
                className="drawer-lightbox-image-wrap"
                onDoubleClick={handleZoomToggle}
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                  transition: isPanning ? "none" : "transform 0.15s ease-out",
                  transformOrigin: "center center",
                }}
              >
                <img
                  src={currentAsset.url}
                  alt={currentAsset.title ?? currentAsset.id}
                  className="drawer-lightbox-img"
                  loading="eager"
                  draggable={false}
                  onError={() => setHasImageError(true)}
                />
              </div>
            ) : (
              <DocumentViewer asset={currentAsset} />
            )}
          </div>

          {assets.length > 1 && (
            <button
              type="button"
              className="drawer-lightbox-nav-btn drawer-lightbox-nav-next"
              onClick={handleNext}
              title="Next Asset (Right Arrow)"
              aria-label="Next asset"
            >
              <IconChevronRight size={24} />
            </button>
          )}

          {showMetadata && (
            <aside className="drawer-lightbox-sidebar">
              <h4 className="drawer-lightbox-sidebar-title">Asset Details</h4>
              <div className="drawer-lightbox-meta-list">
                {currentAsset.description && (
                  <div className="drawer-lightbox-meta-item">
                    <span className="drawer-lightbox-meta-label">Description</span>
                    <p className="drawer-lightbox-meta-value">{currentAsset.description}</p>
                  </div>
                )}
                {currentAsset.author && (
                  <div className="drawer-lightbox-meta-item">
                    <span className="drawer-lightbox-meta-label">Author / Generator</span>
                    <span className="drawer-lightbox-meta-value">{currentAsset.author}</span>
                  </div>
                )}
                {currentAsset.timestamp && (
                  <div className="drawer-lightbox-meta-item">
                    <span className="drawer-lightbox-meta-label">Captured</span>
                    <span className="drawer-lightbox-meta-value">
                      {(() => {
                        const d = new Date(currentAsset.timestamp);
                        return isNaN(d.getTime())
                          ? String(currentAsset.timestamp)
                          : d.toLocaleString();
                      })()}
                    </span>
                  </div>
                )}
                {currentAsset.step !== undefined && (
                  <div className="drawer-lightbox-meta-item">
                    <span className="drawer-lightbox-meta-label">Workflow Step</span>
                    <span className="drawer-lightbox-meta-value">{`Step ${currentAsset.step}`}</span>
                  </div>
                )}
                {currentDimensions && (
                  <div className="drawer-lightbox-meta-item">
                    <span className="drawer-lightbox-meta-label">Dimensions</span>
                    <span className="drawer-lightbox-meta-value">
                      {`${currentDimensions.width} × ${currentDimensions.height}`}
                    </span>
                  </div>
                )}
                {typeof currentAsset.sizeBytes === "number" && (
                  <div className="drawer-lightbox-meta-item">
                    <span className="drawer-lightbox-meta-label">File Size</span>
                    <span className="drawer-lightbox-meta-value">
                      {formatBytes(currentAsset.sizeBytes)}
                    </span>
                  </div>
                )}
                {currentAsset.mimeType && (
                  <div className="drawer-lightbox-meta-item">
                    <span className="drawer-lightbox-meta-label">MIME Type</span>
                    <code className="drawer-lightbox-meta-code">{currentAsset.mimeType}</code>
                  </div>
                )}
                {currentAsset.url && currentAsset.url.trim().length > 0 && (
                  <div className="drawer-lightbox-meta-item">
                    <span className="drawer-lightbox-meta-label">Source URL</span>
                    <code className="drawer-lightbox-meta-code drawer-lightbox-url">
                      {currentAsset.url}
                    </code>
                    <a
                      href={currentAsset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="drawer-lightbox-download-link"
                      download={sanitizeFilename(currentAsset.title ?? currentAsset.id)}
                    >
                      <IconDownload size={12} /> Download Asset
                    </a>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
});

LightboxDialog.displayName = "LightboxDialog";
