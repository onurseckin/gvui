import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FC,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useGraphStore } from "../../state/useGraphStore";
import { Button } from "../../ui";
import { exportGraphAsHTML } from "../../utils/htmlExporter";
import { exportGraphAsPNG, GraphExportError } from "../../utils/pngExporter";
import "./ExportMenu.css";

type ExportKind = "png" | "html";

interface MenuPosition {
  top: number;
  /** Distance from the right edge of the window, so the menu stays right-aligned to its trigger. */
  right: number;
}

interface ExportStatus {
  tone: "note" | "error";
  message: string;
}

const MENU_GAP_PX = 6;

function describeError(error: unknown): string {
  if (error instanceof GraphExportError) return error.message;
  if (error instanceof Error) return error.message;
  return "The export failed for an unknown reason.";
}

/**
 * The toolbar's Export control: one button, a small menu of formats.
 *
 * The menu is portalled to `document.body` and tagged `data-gvui-portal` — the same marker the
 * `Select` atom's popup carries — so the toolbar's own outside-click handlers can recognise it as
 * chrome belonging to the toolbar rather than a click landing somewhere else on the page.
 */
export const ExportMenu: FC = () => {
  const dataset = useGraphStore((state) => state.dataset);
  const hasGeometry = useGraphStore((state) => state.positionedNodes.length > 0);

  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, right: 0 });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const isDisabled = !dataset || !hasGeometry;

  const placeMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPosition({
      top: rect.bottom + MENU_GAP_PX,
      right: Math.max(window.innerWidth - rect.right, 8),
    });
  }, []);

  const closeMenu = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    setStatus(null);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const openMenu = useCallback(() => {
    placeMenu();
    setStatus(null);
    setIsOpen(true);
  }, [placeMenu]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popupRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setIsOpen(false);
      setStatus(null);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeMenu(true);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", placeMenu);
    // Capture phase: the canvas and the sidebar both scroll without bubbling scroll to the window,
    // and a menu left behind at a stale offset points at nothing.
    window.addEventListener("scroll", placeMenu, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [isOpen, closeMenu, placeMenu]);

  useEffect(() => {
    if (!isOpen) return;
    const first = popupRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']");
    first?.focus();
  }, [isOpen]);

  const runExport = useCallback(async (kind: ExportKind) => {
    const {
      dataset: current,
      positionedNodes,
      positionedEdges,
      layoutMode,
      layoutConfig,
    } = useGraphStore.getState();

    if (!current) {
      setStatus({ tone: "error", message: "Load a graph before exporting." });
      return;
    }

    setIsBusy(true);
    setStatus(null);

    try {
      if (kind === "png") {
        const result = await exportGraphAsPNG({
          nodes: positionedNodes,
          edges: positionedEdges,
          name: current.title || current.id,
        });
        if (result.isDownscaled) {
          setStatus({
            tone: "note",
            message: `Saved at ${result.pixelWidth}x${result.pixelHeight}px — the full-resolution raster exceeded the memory cap, so it was scaled down.`,
          });
          return;
        }
      } else {
        await exportGraphAsHTML(current, {
          mode: layoutMode,
          configPartial: layoutConfig,
          positioned: { nodes: positionedNodes, edges: positionedEdges },
        });
      }
      setIsOpen(false);
    } catch (error) {
      setStatus({ tone: "error", message: describeError(error) });
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleMenuKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    const items = Array.from(
      popupRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [],
    );
    if (items.length === 0) return;

    event.preventDefault();
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + delta + items.length) % items.length;
    items[nextIndex].focus();
  }, []);

  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" && !isOpen && !isDisabled) {
        event.preventDefault();
        openMenu();
      }
    },
    [isDisabled, isOpen, openMenu],
  );

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        className="toolbar-btn gvui-export-trigger"
        onClick={() => (isOpen ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        disabled={isDisabled}
        title={isDisabled ? "Load a graph to export it" : "Export this graph"}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
      >
        Export <span className="gvui-export-caret">▾</span>
      </Button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popupRef}
            id={menuId}
            data-gvui-portal="export-menu"
            className="gvui-export-menu"
            role="menu"
            aria-label="Export format"
            style={{ top: `${position.top}px`, right: `${position.right}px` }}
            onKeyDown={handleMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              className="gvui-export-item"
              disabled={isBusy}
              onClick={() => void runExport("png")}
            >
              <span className="gvui-export-item-label">Export PNG</span>
              <span className="gvui-export-item-hint">Whole graph, fit to image</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="gvui-export-item"
              disabled={isBusy}
              onClick={() => void runExport("html")}
            >
              <span className="gvui-export-item-label">Export HTML</span>
              <span className="gvui-export-item-hint">Standalone, pan and zoom</span>
            </button>

            {isBusy && (
              <p className="gvui-export-status" role="status">
                Exporting…
              </p>
            )}
            {!isBusy && status && (
              <p
                className={`gvui-export-status gvui-export-status--${status.tone}`}
                role={status.tone === "error" ? "alert" : "status"}
              >
                {status.message}
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
};

export default ExportMenu;
