import {
  IconBrowser,
  IconCheck,
  IconClock,
  IconCopy,
  IconDeviceDesktop,
  IconFileCode,
  IconFileText,
  IconFileTypePdf,
  IconHierarchy,
  IconMarkdown,
  IconMaximize,
  IconNotes,
  IconPhoto,
  IconPhotoOff,
  IconPlayerPlay,
  IconShieldCheck,
  IconVolume,
  IconX,
} from "@tabler/icons-react";
import type { FC, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import type { GraphNodeData, MediaAsset, PlaywrightMetadata } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { LightboxDialog } from "../LightboxDialog";
import { copyToClipboard, formatBytes } from "../streamUtils";

export interface AssetsTabProps {
  node: GraphNodeData;
}

export type AssetFilter =
  | "all"
  | "validation"
  | "worker"
  | "critic"
  | "screenshots"
  | "diagrams"
  | "documents"
  | "logs";

const isPdf = (a: MediaAsset): boolean => {
  return (
    a.type === "pdf" ||
    a.mimeType === "application/pdf" ||
    a.url.toLowerCase().endsWith(".pdf") ||
    /\.pdf(\?.*)?$/i.test(a.url) ||
    (a.title !== undefined && a.title.toLowerCase().includes("pdf"))
  );
};

const isCode = (a: MediaAsset): boolean => {
  return (
    a.type === "code" ||
    /\.(ts|tsx|js|jsx|json|py|rs|go|sh|css|html|yaml|yml|toml|graphql|sql)$/i.test(a.url) ||
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

const isLog = (a: MediaAsset): boolean => {
  return (
    a.type === "log" ||
    a.url.toLowerCase().endsWith(".log") ||
    (a.title !== undefined && a.title.toLowerCase().includes("log"))
  );
};

const isMarkdown = (a: MediaAsset): boolean => {
  return (
    a.type === "markdown" ||
    /\.(md|markdown)$/i.test(a.url) ||
    (a.title !== undefined && a.title.toLowerCase().includes("markdown"))
  );
};

const isDiagram = (a: MediaAsset): boolean => {
  return (
    a.type === "diagram" ||
    a.url.toLowerCase().includes("diagram") ||
    /\.(svg|drawio|excalidraw)$/i.test(a.url) ||
    (a.title !== undefined && a.title.toLowerCase().includes("diagram"))
  );
};

const isDocument = (a: MediaAsset): boolean => {
  return (
    a.type === "document" ||
    a.type === "pdf" ||
    a.type === "markdown" ||
    a.type === "code" ||
    isPdf(a) ||
    isMarkdown(a) ||
    isCode(a) ||
    Boolean(
      a.mimeType &&
      (a.mimeType === "application/pdf" ||
        a.mimeType.startsWith("text/") ||
        a.mimeType.includes("pdf") ||
        a.mimeType.includes("document") ||
        a.mimeType.includes("msword") ||
        a.mimeType.includes("spreadsheet") ||
        a.mimeType.includes("csv")),
    ) ||
    /\.(pdf|md|markdown|txt|rtf|docx?|xlsx?|pptx?|csv)$/i.test(a.url)
  );
};

const isScreenshot = (a: MediaAsset): boolean => {
  if (isDiagram(a) || isPdf(a) || isCode(a) || isLog(a) || isMarkdown(a) || isDocument(a)) {
    return false;
  }
  return (
    a.type === "image" ||
    a.type === "screenshot" ||
    !a.type ||
    a.url.toLowerCase().includes("screenshot") ||
    (a.title !== undefined && a.title.toLowerCase().includes("screenshot"))
  );
};

const isValidationEvidence = (a: MediaAsset): boolean => {
  const author = (a.author ?? "").toLowerCase();
  const title = (a.title ?? "").toLowerCase();
  const desc = (a.description ?? "").toLowerCase();
  const id = (a.id ?? "").toLowerCase();
  return (
    author.includes("validator") ||
    author.includes("gate") ||
    title.includes("validator") ||
    title.includes("validation") ||
    title.includes("finding") ||
    title.includes("evidence") ||
    title.includes("pushback") ||
    desc.includes("validator") ||
    desc.includes("validation") ||
    desc.includes("evidence") ||
    id.includes("finding") ||
    id.includes("val") ||
    Boolean(a.metadata?.isValidationEvidence || a.metadata?.validatorId)
  );
};

const isWorkerSnapshot = (a: MediaAsset): boolean => {
  const author = (a.author ?? "").toLowerCase();
  const title = (a.title ?? "").toLowerCase();
  const desc = (a.description ?? "").toLowerCase();
  return (
    author.includes("worker") ||
    author.includes("agent") ||
    author.includes("planner") ||
    author.includes("executor") ||
    title.includes("worker") ||
    title.includes("execution") ||
    title.includes("snapshot") ||
    title.includes("step") ||
    desc.includes("worker") ||
    desc.includes("playwright") ||
    a.step !== undefined ||
    Boolean(a.metadata?.isWorkerSnapshot)
  );
};

const isCriticCertification = (a: MediaAsset): boolean => {
  const author = (a.author ?? "").toLowerCase();
  const title = (a.title ?? "").toLowerCase();
  const desc = (a.description ?? "").toLowerCase();
  return (
    author.includes("critic") ||
    author.includes("auditor") ||
    title.includes("critic") ||
    title.includes("certification") ||
    title.includes("completeness") ||
    title.includes("signoff") ||
    desc.includes("critic") ||
    desc.includes("completeness") ||
    Boolean(a.metadata?.isCriticCertification)
  );
};

const getAssetIcon = (asset: MediaAsset): ReactNode => {
  if (isDiagram(asset)) return <IconHierarchy size={14} />;
  if (isPdf(asset)) return <IconFileTypePdf size={14} />;
  if (isCode(asset)) return <IconFileCode size={14} />;
  if (isLog(asset)) return <IconNotes size={14} />;
  if (isMarkdown(asset)) return <IconMarkdown size={14} />;
  if (asset.type === "video") return <IconPlayerPlay size={14} />;
  if (asset.type === "audio") return <IconVolume size={14} />;
  if (isDocument(asset)) return <IconFileText size={14} />;
  return <IconPhoto size={14} />;
};

const getTypeLabel = (asset: MediaAsset): string => {
  if (isDiagram(asset)) return "diagram";
  if (isPdf(asset)) return "pdf";
  if (isCode(asset)) return "code";
  if (isLog(asset)) return "log";
  if (isMarkdown(asset)) return "markdown";
  if (asset.type === "video") return "video";
  if (asset.type === "audio") return "audio";
  if (isDocument(asset)) return "document";
  return asset.type ?? "image";
};

const getInferredMime = (asset: MediaAsset): string => {
  if (asset.mimeType) return asset.mimeType;
  if (isPdf(asset)) return "application/pdf";
  if (asset.url.endsWith(".png")) return "image/png";
  if (asset.url.endsWith(".jpg") || asset.url.endsWith(".jpeg")) return "image/jpeg";
  if (asset.url.endsWith(".webp")) return "image/webp";
  if (asset.url.endsWith(".svg")) return "image/svg+xml";
  if (asset.url.endsWith(".mp4")) return "video/mp4";
  if (asset.url.endsWith(".json")) return "application/json";
  if (asset.url.endsWith(".ts")) return "application/typescript";
  if (asset.url.endsWith(".log") || isLog(asset)) return "text/plain";
  if (isMarkdown(asset)) return "text/markdown";
  return asset.type ? `${asset.type}/raw` : "image/png";
};

/**
 * Assets and media gallery tab supporting Playwright E2E execution summaries,
 * stage filters (Validation Evidence, Worker Snapshots, Critic Certifications),
 * interactive media filters (All, Screenshots, Diagrams, Documents, Logs),
 * thumbnail preview tiles with dimensions, MIME tags, author attribution,
 * and full-resolution interactive Lightbox modal dialogs.
 */
export const AssetsTab: FC<AssetsTabProps> = memo(function AssetsTab({ node }) {
  const [activeFilter, setActiveFilter] = useState<AssetFilter>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);

  const handleThumbnailError = useCallback((id: string) => {
    setFailedThumbnails((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleCopyUrl = useCallback(
    async (url: string, id: string, e: ReactMouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const ok = await copyToClipboard(url);
      if (ok) {
        setCopiedAssetId(id);
        setTimeout(() => setCopiedAssetId(null), 2000);
      }
    },
    [],
  );

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

    // Collect screenshots from findings
    for (const finding of node.metadata?.findings ?? []) {
      for (const a of finding.screenshots ?? []) {
        addAsset({
          ...a,
          type: a.type || "image",
          author: a.author || finding.validatorId || finding.author || "Validator",
          metadata: { ...a.metadata, isValidationEvidence: true, validatorId: finding.validatorId },
        });
      }
    }

    return list;
  }, [node]);

  const playwright: PlaywrightMetadata | undefined = node.metadata?.playwrightMetadata;

  const filteredAssets = useMemo(() => {
    if (activeFilter === "all") return assets;
    if (activeFilter === "validation") return assets.filter(isValidationEvidence);
    if (activeFilter === "worker") return assets.filter(isWorkerSnapshot);
    if (activeFilter === "critic") return assets.filter(isCriticCertification);
    if (activeFilter === "screenshots") return assets.filter(isScreenshot);
    if (activeFilter === "diagrams") return assets.filter(isDiagram);
    if (activeFilter === "documents") return assets.filter(isDocument);
    if (activeFilter === "logs") return assets.filter(isLog);
    return assets;
  }, [assets, activeFilter]);

  const validationCount = useMemo(() => assets.filter(isValidationEvidence).length, [assets]);
  const workerCount = useMemo(() => assets.filter(isWorkerSnapshot).length, [assets]);
  const criticCount = useMemo(() => assets.filter(isCriticCertification).length, [assets]);
  const screenshotsCount = useMemo(() => assets.filter(isScreenshot).length, [assets]);
  const diagramsCount = useMemo(() => assets.filter(isDiagram).length, [assets]);
  const documentsCount = useMemo(() => assets.filter(isDocument).length, [assets]);
  const logsCount = useMemo(() => assets.filter(isLog).length, [assets]);

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
            {validationCount > 0 && (
              <button
                type="button"
                className={`drawer-filter-chip ${activeFilter === "validation" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("validation")}
              >
                {`Validation Evidence (${validationCount})`}
              </button>
            )}
            {workerCount > 0 && (
              <button
                type="button"
                className={`drawer-filter-chip ${activeFilter === "worker" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("worker")}
              >
                {`Worker Snapshots (${workerCount})`}
              </button>
            )}
            {criticCount > 0 && (
              <button
                type="button"
                className={`drawer-filter-chip ${activeFilter === "critic" ? "is-active" : ""}`}
                onClick={() => setActiveFilter("critic")}
              >
                {`Critic Certifications (${criticCount})`}
              </button>
            )}
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
              const label = getTypeLabel(asset);
              const mime = getInferredMime(asset);
              const isCopied = copiedAssetId === asset.id;

              return (
                <div
                  key={asset.id}
                  className={`drawer-asset-card drawer-asset-card--${label}`}
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
                      <div className="drawer-asset-thumb-placeholder drawer-asset-thumb-placeholder--video">
                        <IconPlayerPlay size={28} />
                      </div>
                    ) : asset.type === "audio" ? (
                      <div className="drawer-asset-thumb-placeholder drawer-asset-thumb-placeholder--audio">
                        <IconVolume size={28} />
                      </div>
                    ) : isPdf(asset) ? (
                      <div className="drawer-asset-thumb-placeholder drawer-asset-thumb-placeholder--pdf">
                        <IconFileTypePdf size={28} className="drawer-asset-placeholder-icon" />
                        <span className="drawer-asset-placeholder-tag">PDF</span>
                        {asset.description && (
                          <span className="drawer-asset-placeholder-preview">
                            {asset.description}
                          </span>
                        )}
                      </div>
                    ) : isCode(asset) ? (
                      <div className="drawer-asset-thumb-placeholder drawer-asset-thumb-placeholder--code">
                        <div className="drawer-asset-placeholder-header">
                          <IconFileCode size={16} />
                          <span className="drawer-asset-placeholder-lang">
                            {asset.url.split(".").pop()?.toUpperCase() ?? "CODE"}
                          </span>
                        </div>
                        <div className="drawer-asset-placeholder-snippet">
                          <code>{asset.description || asset.url}</code>
                        </div>
                      </div>
                    ) : isLog(asset) ? (
                      <div className="drawer-asset-thumb-placeholder drawer-asset-thumb-placeholder--log">
                        <div className="drawer-asset-placeholder-header">
                          <IconNotes size={16} />
                          <span className="drawer-asset-placeholder-lang">LOG</span>
                        </div>
                        <div className="drawer-asset-placeholder-snippet">
                          <code>{asset.description || asset.url}</code>
                        </div>
                      </div>
                    ) : isMarkdown(asset) ? (
                      <div className="drawer-asset-thumb-placeholder drawer-asset-thumb-placeholder--markdown">
                        <div className="drawer-asset-placeholder-header">
                          <IconMarkdown size={16} />
                          <span className="drawer-asset-placeholder-lang">MD</span>
                        </div>
                        <div className="drawer-asset-placeholder-snippet">
                          <code>{asset.description || asset.url}</code>
                        </div>
                      </div>
                    ) : isDocument(asset) && !asset.url.match(/\.(png|jpe?g|webp|gif|svg)$/i) ? (
                      <div className="drawer-asset-thumb-placeholder drawer-asset-thumb-placeholder--doc">
                        <IconFileText size={28} />
                        <span className="drawer-asset-placeholder-tag">Doc</span>
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
                    <span className={`drawer-asset-type-badge drawer-asset-type-badge--${label}`}>
                      {getAssetIcon(asset)}
                      <span>{label}</span>
                    </span>
                    <div className="drawer-asset-hover-overlay">
                      <IconMaximize size={20} />
                      <span>Inspect</span>
                    </div>
                  </div>

                  <div className="drawer-asset-info">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "6px",
                      }}
                    >
                      <h5 className="drawer-asset-title">{asset.title ?? asset.id}</h5>
                      <button
                        type="button"
                        onClick={(e) => handleCopyUrl(asset.url, asset.id, e)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: isCopied ? "#34d399" : "#71717a",
                          cursor: "pointer",
                          padding: "2px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "2px",
                          fontSize: "10px",
                        }}
                        title="Copy Asset URL"
                        aria-label={`Copy URL for ${asset.title ?? asset.id}`}
                      >
                        {isCopied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                      </button>
                    </div>

                    <div className="drawer-asset-meta-row" style={{ flexWrap: "wrap", gap: "4px" }}>
                      {asset.step !== undefined && (
                        <span className="drawer-chip drawer-chip--sm">Step {asset.step}</span>
                      )}
                      {asset.dimensions && (
                        <span className="drawer-chip drawer-chip--sm" title="Resolution">
                          {`${asset.dimensions.width}×${asset.dimensions.height}`}
                        </span>
                      )}
                      {typeof asset.sizeBytes === "number" && (
                        <span className="drawer-asset-size">{formatBytes(asset.sizeBytes)}</span>
                      )}
                      {mime && (
                        <span
                          className="drawer-chip drawer-chip--sm"
                          style={{ fontFamily: "var(--font-mono)", fontSize: "9px" }}
                        >
                          {mime}
                        </span>
                      )}
                      {asset.author && (
                        <span
                          className="drawer-chip drawer-chip--sm"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            color: "#38bdf8",
                          }}
                        >
                          <IconShieldCheck size={10} />
                          <span>{asset.author}</span>
                        </span>
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
