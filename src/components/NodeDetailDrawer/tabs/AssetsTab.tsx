import {
  IconBrowser,
  IconCheck,
  IconClock,
  IconDeviceDesktop,
  IconFileText,
  IconMaximize,
  IconPhoto,
  IconPlayerPlay,
  IconVolume,
  IconX,
} from "@tabler/icons-react";
import type { FC } from "react";
import { memo, useMemo, useState } from "react";
import type { GraphNodeData, MediaAsset, PlaywrightMetadata } from "../../../types/graphData";
import { DrawerSection, formatBytes } from "../DrawerSection";
import { LightboxDialog } from "../LightboxDialog";

export interface AssetsTabProps {
  node: GraphNodeData;
}

type AssetFilter = "all" | "image" | "video" | "audio" | "document";

export const AssetsTab: FC<AssetsTabProps> = memo(function AssetsTab({ node }) {
  const [activeFilter, setActiveFilter] = useState<AssetFilter>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  const filteredAssets = useMemo(() => {
    if (activeFilter === "all") return assets;
    if (activeFilter === "image") return assets.filter((a) => a.type === "image" || !a.type);
    if (activeFilter === "video") return assets.filter((a) => a.type === "video");
    if (activeFilter === "audio") return assets.filter((a) => a.type === "audio");
    if (activeFilter === "document")
      return assets.filter((a) => a.type === "document" || a.type === "code" || a.type === "log");
    return assets;
  }, [assets, activeFilter]);

  const getAssetIcon = (type?: string) => {
    switch (type) {
      case "video":
        return <IconPlayerPlay size={14} />;
      case "audio":
        return <IconVolume size={14} />;
      case "document":
      case "code":
      case "log":
        return <IconFileText size={14} />;
      case "image":
      default:
        return <IconPhoto size={14} />;
    }
  };

  const imageCount = assets.filter((a) => a.type === "image" || !a.type).length;
  const videoCount = assets.filter((a) => a.type === "video").length;
  const docCount = assets.filter(
    (a) => a.type === "document" || a.type === "code" || a.type === "log",
  ).length;

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
                    : "drawer-status-pill--warn"
                }`}
              >
                {playwright.status === "passed" ? (
                  <>
                    <IconCheck size={12} /> Passed
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

      <DrawerSection title="Validator Media &amp; Inspection Assets" count={assets.length}>
        {assets.length > 3 && (
          <div className="drawer-asset-filter-bar">
            <button
              type="button"
              className={`drawer-filter-chip ${activeFilter === "all" ? "is-active" : ""}`}
              onClick={() => setActiveFilter("all")}
            >
              All ({assets.length})
            </button>
            {imageCount > 0 && (
              <button
                type="button"
                className={`drawer-filter-chip ${activeFilter === "image" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("image")}
              >
                Images ({imageCount})
              </button>
            )}
            {videoCount > 0 && (
              <button
                type="button"
                className={`drawer-filter-chip ${activeFilter === "video" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("video")}
              >
                Videos ({videoCount})
              </button>
            )}
            {docCount > 0 && (
              <button
                type="button"
                className={`drawer-filter-chip ${activeFilter === "document" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("document")}
              >
                Docs & Logs ({docCount})
              </button>
            )}
          </div>
        )}

        {filteredAssets.length === 0 ? (
          <div className="drawer-empty-state">No assets matching the selected filter.</div>
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
                    ) : (
                      <img
                        src={asset.thumbnailUrl ?? asset.url}
                        alt={asset.title ?? asset.id}
                        className="drawer-asset-thumb"
                        loading="lazy"
                      />
                    )}
                    <span className="drawer-asset-type-badge">
                      {getAssetIcon(asset.type)}
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
