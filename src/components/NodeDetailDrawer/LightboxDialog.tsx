import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFileText,
  IconInfoCircle,
  IconPhoto,
  IconPlayerPlay,
  IconVolume,
  IconX,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { memo, useCallback, useEffect, useState } from "react";
import type { MediaAsset } from "../../types/graphData";
import { formatBytes } from "./DrawerSection";

export interface LightboxDialogProps {
  isOpen: boolean;
  assets: MediaAsset[];
  initialIndex?: number;
  onClose: () => void;
}

export const LightboxDialog: FC<LightboxDialogProps> = memo(function LightboxDialog({
  isOpen,
  assets,
  initialIndex = 0,
  onClose,
}) {
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [zoom, setZoom] = useState<number>(1);
  const [showMetadata, setShowMetadata] = useState<boolean>(true);

  useEffect(() => {
    setCurrentIndex(Math.max(0, Math.min(initialIndex, assets.length - 1)));
    setZoom(1);
  }, [initialIndex, assets.length]);

  const currentAsset: MediaAsset | undefined = assets[currentIndex];

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : assets.length - 1));
    setZoom(1);
  }, [assets.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < assets.length - 1 ? prev + 1 : 0));
    setZoom(1);
  }, [assets.length]);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(3, z + 0.25)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(0.5, z - 0.25)), []);
  const handleZoomReset = useCallback(() => setZoom(1), []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
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

  const getAssetIcon = (type?: string) => {
    switch (type) {
      case "video":
        return <IconPlayerPlay size={16} />;
      case "audio":
        return <IconVolume size={16} />;
      case "document":
      case "code":
      case "log":
        return <IconFileText size={16} />;
      case "image":
      default:
        return <IconPhoto size={16} />;
    }
  };

  return (
    <div
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
            <span className="drawer-lightbox-type-icon">{getAssetIcon(currentAsset.type)}</span>
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
                {currentAsset.dimensions.width} &times; {currentAsset.dimensions.height}
              </span>
            )}
            {typeof currentAsset.sizeBytes === "number" && (
              <span className="drawer-lightbox-chip">{formatBytes(currentAsset.sizeBytes)}</span>
            )}
          </div>

          <div className="drawer-lightbox-header-actions">
            {currentAsset.type === "image" && (
              <div className="drawer-lightbox-zoom-controls">
                <button
                  type="button"
                  className="drawer-lightbox-action-btn"
                  onClick={handleZoomIn}
                  title="Zoom In (+)"
                  aria-label="Zoom in"
                >
                  <IconZoomIn size={16} />
                </button>
                <button
                  type="button"
                  className="drawer-lightbox-action-btn"
                  onClick={handleZoomOut}
                  title="Zoom Out (-)"
                  aria-label="Zoom out"
                >
                  <IconZoomOut size={16} />
                </button>
                <button
                  type="button"
                  className="drawer-lightbox-action-btn"
                  onClick={handleZoomReset}
                  title="Reset Zoom (0)"
                  aria-label="Reset zoom"
                >
                  <IconZoomReset size={16} />
                </button>
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
                download
              >
                <IconDownload size={16} />
              </a>
            )}

            <button
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

          <div className="drawer-lightbox-viewport">
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
            ) : (
              <div
                className="drawer-lightbox-image-wrap"
                style={{
                  transform: `scale(${zoom})`,
                  transition: "transform 0.15s ease-out",
                }}
              >
                <img
                  src={currentAsset.url}
                  alt={currentAsset.title ?? currentAsset.id}
                  className="drawer-lightbox-img"
                  loading="eager"
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
