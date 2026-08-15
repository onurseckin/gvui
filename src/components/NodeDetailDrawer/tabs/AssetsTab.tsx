import {
  IconBrowser,
  IconCheck,
  IconClock,
  IconDeviceDesktop,
  IconFileText,
  IconHierarchy,
  IconMaximize,
  IconNotes,
  IconPhoto,
  IconPhotoOff,
  IconPlayerPlay,
  IconVolume,
  IconX,
} from "@tabler/icons-react";
import type { FC } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import type { GraphNodeData, MediaAsset, PlaywrightMetadata } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { LightboxDialog } from "../LightboxDialog";
import { formatBytes } from "../streamUtils";

export interface AssetsTabProps {
  node: GraphNodeData;
}

export type AssetFilter = "all" | "screenshots" | "diagrams" | "documents" | "logs";

/**
 * Assets and media gallery tab supporting Playwright E2E execution summaries,
 * interactive media filters (All, Screenshots, Diagrams, Documents, Logs),
 * thumbnail cards, and full-resolution interactive Lightbox modal dialogs.
 */
export const AssetsTab: FC<AssetsTabProps> = memo(function AssetsTab({ node }) {
  const [activeFilter, setActiveFilter] = useState<AssetFilter>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());

  const handleThumbnailError = useCallback((id: string) => {
    setFailedThumbnails((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const assets: MediaAsset[] = useMemo(() => {
    const list: MediaAsset[] = [];
    const seenIds = new Set<string>();

    const addAsset = (a?: MediaAsset) => {
      if (!a || !a.url) return;
      const id = a.id || a.url;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        list.push({ ...a, id });
      }
    };

    for (const a of node.mediaAssets ?? []) addAsset(a);
    for (const a of node.screenshots ?? []) addAsset({ ...a, type: a.type || "image" });
    for (const a of node.metadata?.mediaAssets ?? []) addAsset(a);
    for (const a of node.metadata?.screenshots ?? []) addAsset({ ...a, type: a.type || "image" });
    for (const a of node.metadata?.assets ?? []) addAsset(a);
    for (const a of node.metadata?.playwrightMetadata?.screenshots ?? [])
      addAsset({ ...a, type: a.type || "image" });

    return list;
  }, [node]);

  const playwright: PlaywrightMetadata | undefined = node.metadata?.playwrightMetadata;

  const isScreenshot = (a: MediaAsset) => {
    const isDiag =
      a.type === "diagram" ||
      a.url.toLowerCase().includes("diagram") ||
      (a.title && a.title.toLowerCase().includes("diagram"));
    return (
      !isDiag &&
      (a.type === "image" ||
        a.type === "screenshot" ||
        !a.type ||
        a.url.toLowerCase().includes("screenshot") ||
        (a.title && a.title.toLowerCase().includes("screenshot")))
    );
  };

  const isDiagram = (a: MediaAsset) => {
    return (
      a.type === "diagram" ||
      a.url.toLowerCase().includes("diagram") ||
      (a.title !== undefined && a.title.toLowerCase().includes("diagram"))
    );
  };

  const isDocument = (a: MediaAsset) => {
    return (
      a.type === "document" ||
      a.type === "code" ||
      (a.mimeType !== undefined && a.mimeType.startsWith("text/"))
    );
  };

  const isLog = (a: MediaAsset) => {
    return (
      a.type === "log" ||
      a.url.toLowerCase().endsWith(".log") ||
      (a.title !== undefined && a.title.toLowerCase().includes("log"))
    );
  };

  const filteredAssets = useMemo(() => {
    if (activeFilter === "all") return assets;
    if (activeFilter === "screenshots") return assets.filter(isScreenshot);
    if (activeFilter === "diagrams") return assets.filter(isDiagram);
    if (activeFilter === "documents") return assets.filter(isDocument);
    if (activeFilter === "logs") return assets.filter(isLog);
    return assets;
  }, [assets, activeFilter]);

  const screenshotsCount = useMemo(() => assets.filter(isScreenshot).length, [assets]);
  const diagramsCount = useMemo(() => assets.filter(isDiagram).length, [assets]);
  const documentsCount = useMemo(() => assets.filter(isDocument).length, [assets]);
  const logsCount = useMemo(() => assets.filter(isLog).length, [assets]);

  const getAssetIcon = (type?: string, url?: string, title?: string) => {
    if (
      type === "diagram" ||
      url?.toLowerCase().includes("diagram") ||
      title?.toLowerCase().includes("diagram")
    ) {
      return <IconHierarchy size={14} />;
    }
    if (
      type === "log" ||
      url?.toLowerCase().endsWith(".log") ||
      title?.toLowerCase().includes("log")
    ) {
      return <IconNotes size={14} />;
    }
    switch (type) {
      case "video":
        return <IconPlayerPlay size={14} />;
      case "audio":
        return <IconVolume size={14} />;
      case "document":
      case "code":
        return <IconFileText size={14} />;
      case "image":
      case "screenshot":
      default:
        return <IconPhoto size={14} />;
    }
  };

  return (
    <div className="drawer-tab-content">
      {playwright && (
        <DrawerSection title="Playwright Test Suite Execution">
          <div className="drawer-playwright-card">
            <div className="drawer-playwright-header">
              <span className="drawer-playwright-icon">
                <IconBrowser size={16} />
              </span>
              <span className="drawer-playwright-title">
                {playwright.testFile ?? "Automated E2E Suite"}
              </span>
              <span
                className={`drawer-status-pill ${
                  playwright.status === "passed"
                    ? "drawer-status-pill--success"
                    : playwright.status === "timedOut"
                      ? "drawer-status-pill--warn"
                      : "drawer-status-pill--error"
                }`}
              >
                {playwright.status === "passed" ? (
                  <>
                    <IconCheck size={12} /> Passed
                  </>
                ) : playwright.status === "timedOut" ? (
                  <>
                    <IconClock size={12} /> Timed Out
                  </>
                ) : (
                  <>
                    <IconX size={12} /> {playwright.status ?? "Failed"}
                  </>
                )}
              </span>
            </div>

            <div className="drawer-playwright-meta-grid">
              {playwright.browser && (
                <div className="drawer-metric">
                  <span className="drawer-metric-label">Engine</span>
                  <span className="drawer-metric-value">{playwright.browser}</span>
                </div>
              )}
              {playwright.viewport && (
                <div className="drawer-metric">
                  <span className="drawer-metric-label">Viewport</span>
                  <span className="drawer-metric-value">
                    <IconDeviceDesktop
                      size={12}
                      style={{
                        display: "inline",
                        verticalAlign: "middle",
                        marginRight: 4,
                      }}
                    />
                    {playwright.viewport.width} &times; {playwright.viewport.height}
                  </span>
                </div>
              )}
              {typeof playwright.durationMs === "number" && (
                <div className="drawer-metric">
                  <span className="drawer-metric-label">Duration</span>
                  <span className="drawer-metric-value">
                    <IconClock
                      size={12}
                      style={{
                        display: "inline",
                        verticalAlign: "middle",
                        marginRight: 4,
                      }}
                    />
                    {(playwright.durationMs / 1000).toFixed(2)}s
                  </span>
                </div>
              )}
            </div>
          </div>
        </DrawerSection>
      )}

      <DrawerSection title="Validator Media & Inspection Assets" count={assets.length}>
        {assets.length > 1 && (
          <div className="drawer-asset-filter-bar" role="tablist" aria-label="Asset filters">
            <button
              type="button"
              className={`drawer-filter-chip ${activeFilter === "all" ? "is-active" : ""}`}
              onClick={() => setActiveFilter("all")}
            >
              {`All (${assets.length})`}
            </button>
            {screenshotsCount > 0 && (
              <button
                type="button"
                className={`drawer-filter-chip ${activeFilter === "screenshots" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("screenshots")}
              >
                {`Screenshots (${screenshotsCount})`}
              </button>
            )}
            {diagramsCount > 0 && (
              <button
                type="button"
                className={`drawer-filter-chip ${activeFilter === "diagrams" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("diagrams")}
              >
                {`Diagrams (${diagramsCount})`}
              </button>
            )}
            {documentsCount > 0 && (
              <button
                type="button"
                className={`drawer-filter-chip ${activeFilter === "documents" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("documents")}
              >
                {`Documents (${documentsCount})`}
              </button>
            )}
            {logsCount > 0 && (
              <button
                type="button"
                className={`drawer-filter-chip ${activeFilter === "logs" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("logs")}
              >
                {`Logs (${logsCount})`}
              </button>
            )}
          </div>
        )}

        {filteredAssets.length === 0 ? (
          <div className="drawer-empty-state">
            {assets.length === 0
              ? "No assets or media artifacts recorded for this node."
              : "No assets matching the selected filter."}
          </div>
        ) : (
          <div className="drawer-asset-gallery-grid">
            {filteredAssets.map((asset, index) => {
              const originalIndex = assets.indexOf(asset);
              return (
                <div
                  key={asset.id}
                  className="drawer-asset-card"
                  onClick={() => setLightboxIndex(originalIndex >= 0 ? originalIndex : index)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setLightboxIndex(originalIndex >= 0 ? originalIndex : index);
                    }
                  }}
                  aria-label={`Inspect ${asset.title ?? asset.id} in Lightbox`}
                >
                  <div className="drawer-asset-thumb-wrap">
                    {asset.type === "video" ? (
                      <div className="drawer-asset-thumb-placeholder">
                        <IconPlayerPlay size={28} />
                      </div>
                    ) : asset.type === "code" ||
                      asset.type === "log" ||
                      asset.type === "document" ? (
                      <div className="drawer-asset-thumb-placeholder">
                        <IconFileText size={28} />
                      </div>
                    ) : failedThumbnails.has(asset.id) ? (
                      <div className="drawer-asset-thumb-placeholder drawer-asset-thumb-placeholder--error">
                        <IconPhotoOff size={24} />
                        <span className="drawer-asset-thumb-error-label">Failed to load</span>
                      </div>
                    ) : (
                      <img
                        src={asset.thumbnailUrl ?? asset.url}
                        alt={asset.title ?? asset.id}
                        className="drawer-asset-thumb"
                        loading="lazy"
                        onError={() => handleThumbnailError(asset.id)}
                      />
                    )}
                    <span className="drawer-asset-type-badge">
                      {getAssetIcon(asset.type, asset.url, asset.title)}
                      <span>{asset.type ?? "image"}</span>
                    </span>
                    <div className="drawer-asset-hover-overlay">
                      <IconMaximize size={20} />
                      <span>Inspect</span>
                    </div>
                  </div>

                  <div className="drawer-asset-info">
                    <h5 className="drawer-asset-title">{asset.title ?? asset.id}</h5>
                    <div className="drawer-asset-meta-row">
                      {asset.step !== undefined && (
                        <span className="drawer-chip drawer-chip--sm">Step {asset.step}</span>
                      )}
                      {typeof asset.sizeBytes === "number" && (
                        <span className="drawer-asset-size">{formatBytes(asset.sizeBytes)}</span>
                      )}
                    </div>
                    {asset.description && <p className="drawer-asset-desc">{asset.description}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DrawerSection>

      {lightboxIndex !== null && (
        <LightboxDialog
          isOpen={true}
          assets={assets}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
});

AssetsTab.displayName = "AssetsTab";
