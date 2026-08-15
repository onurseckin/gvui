import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFileText,
  IconHierarchy,
  IconInfoCircle,
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
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { MediaAsset } from "../../types/graphData";
import { formatBytes } from "./streamUtils";

export interface LightboxDialogProps {
  isOpen: boolean;
  assets: MediaAsset[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * Fullscreen high-DPI Lightbox modal dialog supporting:
 * - 100% to 400% zoom scaling with percentage badge
 * - Interactive pan navigation with grab / grabbing cursor
 * - Prev/Next keyboard navigation (ArrowLeft / ArrowRight) and Escape dismiss
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

  const resetPanAndZoom = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : assets.length - 1));
    resetPanAndZoom();
  }, [assets.length, resetPanAndZoom]);

  const handleNext = useCallback(() => {
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
      } else if (e.key === "Tab") {
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
      } else if (e.key === "ArrowLeft") {
        e.stopPropagation();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.stopPropagation();
        handleNext();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleZoomReset();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext, handleZoomIn, handleZoomOut, handleZoomReset]);

  if (!isOpen || !currentAsset) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getAssetIcon = (type?: string, url?: string, title?: string) => {
    if (
      type === "diagram" ||
      url?.toLowerCase().includes("diagram") ||
      title?.toLowerCase().includes("diagram")
    ) {
      return <IconHierarchy size={16} />;
    }
    if (
      type === "log" ||
      url?.toLowerCase().endsWith(".log") ||
      title?.toLowerCase().includes("log")
    ) {
      return <IconNotes size={16} />;
    }
    switch (type) {
      case "video":
        return <IconPlayerPlay size={16} />;
      case "audio":
        return <IconVolume size={16} />;
      case "document":
      case "code":
        return <IconFileText size={16} />;
      case "image":
      case "screenshot":
      default:
        return <IconPhoto size={16} />;
    }
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
            <span className="drawer-lightbox-type-icon">
              {getAssetIcon(currentAsset.type, currentAsset.url, currentAsset.title)}
            </span>
            <div className="drawer-lightbox-title-wrap">
              <h3 className="drawer-lightbox-title">
                {currentAsset.title ?? `Asset ${currentAsset.id}`}
              </h3>
              <span className="drawer-lightbox-counter">
                {`${currentIndex + 1} of ${assets.length}`}
              </span>
            </div>
            {currentAsset.dimensions && (
              <span className="drawer-lightbox-chip">
                {`${currentAsset.dimensions.width} × ${currentAsset.dimensions.height}`}
              </span>
            )}
            {typeof currentAsset.sizeBytes === "number" && (
              <span className="drawer-lightbox-chip">{formatBytes(currentAsset.sizeBytes)}</span>
            )}
          </div>

          <div className="drawer-lightbox-header-actions">
            {(!currentAsset.type ||
              currentAsset.type === "image" ||
              currentAsset.type === "screenshot" ||
              currentAsset.type === "diagram") && (
              <div className="drawer-lightbox-zoom-controls">
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

            <button
              type="button"
              className={`drawer-lightbox-action-btn ${showMetadata ? "is-active" : ""}`}
              onClick={() => setShowMetadata((prev) => !prev)}
              title="Toggle Info"
              aria-label="Toggle metadata panel"
            >
              <IconInfoCircle size={16} />
            </button>

            {currentAsset.url && (
              <a
                href={currentAsset.url}
                target="_blank"
                rel="noreferrer"
                className="drawer-lightbox-action-btn"
                title="Download / Open in new tab"
                aria-label="Download asset"
                download={currentAsset.title ?? currentAsset.id}
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
            {currentAsset.type === "video" ? (
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
            ) : currentAsset.type === "code" ||
              currentAsset.type === "log" ||
              currentAsset.type === "document" ? (
              <div className="drawer-lightbox-doc-preview">
                <pre className="drawer-pre">
                  <code>{currentAsset.description || currentAsset.url}</code>
                </pre>
              </div>
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
            ) : (
              <div
                className="drawer-lightbox-image-wrap"
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
                      {new Date(currentAsset.timestamp).toLocaleString()}
                    </span>
                  </div>
                )}
                {currentAsset.step !== undefined && (
                  <div className="drawer-lightbox-meta-item">
                    <span className="drawer-lightbox-meta-label">Workflow Step</span>
                    <span className="drawer-lightbox-meta-value">{`Step ${currentAsset.step}`}</span>
                  </div>
                )}
                {currentAsset.dimensions && (
                  <div className="drawer-lightbox-meta-item">
                    <span className="drawer-lightbox-meta-label">Dimensions</span>
                    <span className="drawer-lightbox-meta-value">
                      {`${currentAsset.dimensions.width} × ${currentAsset.dimensions.height}`}
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
                {currentAsset.url && (
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
                      download={currentAsset.title ?? currentAsset.id}
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
