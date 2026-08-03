import { useCallback, useEffect, useRef, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;

export interface UsePanZoomReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoomLevel: number;
  panOffset: { x: number; y: number };
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  resetTransform: () => void;
}

export function usePanZoom(): UsePanZoomReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoomLevel = useGraphStore((state) => state.zoomLevel);
  const panOffset = useGraphStore((state) => state.panOffset);
  const setZoomLevel = useGraphStore((state) => state.setZoomLevel);
  const setPanOffset = useGraphStore((state) => state.setPanOffset);
  const resetViewport = useGraphStore((state) => state.resetViewport);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const rawDelta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const zoomSensitivity = useGraphStore.getState().layoutConfig.zoomSensitivity ?? 1.0;
      const effectiveSensitivity = 0.0006 * zoomSensitivity;
      const zoomFactor = Math.exp(-rawDelta * effectiveSensitivity);

      const currentZoom = useGraphStore.getState().zoomLevel;
      const currentPan = useGraphStore.getState().panOffset;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * zoomFactor));

      if (newZoom === currentZoom) return;

      const pointInGraphX = (mouseX - currentPan.x) / currentZoom;
      const pointInGraphY = (mouseY - currentPan.y) / currentZoom;
      const newPanX = mouseX - pointInGraphX * newZoom;
      const newPanY = mouseY - pointInGraphY * newZoom;

      setZoomLevel(newZoom);
      setPanOffset({ x: newPanX, y: newPanY });
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [setZoomLevel, setPanOffset]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".node-card") || target.closest("button") || target.closest("a")) {
      return;
    }

    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...useGraphStore.getState().panOffset };
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent): void => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanOffset({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      });
    };

    const handleMouseUp = (): void => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, setPanOffset]);

  return {
    containerRef,
    zoomLevel,
    panOffset,
    isDragging,
    handleMouseDown,
    resetTransform: resetViewport,
  };
}
