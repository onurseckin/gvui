import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { calculatePanFromFrustumDrag } from "../../components/Minimap/minimapMath";
import type { MinimapFrustumOverlayProps, Point2D } from "../../components/Minimap/types";

export const MinimapFrustumOverlay: FC<MinimapFrustumOverlayProps> = ({
  frustumRect,
  transform,
  zoomLevel,
  panOffset,
  viewportWidth,
  viewportHeight,
  bounds,
  onPanChange,
  interactive = true,
  className = "",
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<Point2D>({ x: 0, y: 0 });
  const initialPanRef = useRef<Point2D>({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<SVGGElement>) => {
      if (!interactive || !onPanChange) return;
      if (e.button !== 0) return;

      e.preventDefault?.();
      e.stopPropagation?.();

      setIsDragging(true);
      dragStartRef.current = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
      initialPanRef.current = { ...panOffset };
    },
    [interactive, onPanChange, panOffset],
  );

  useEffect(() => {
    if (!isDragging || !onPanChange) return;

    const handleMouseMove = (e: MouseEvent): void => {
      const deltaX = (e.clientX ?? 0) - dragStartRef.current.x;
      const deltaY = (e.clientY ?? 0) - dragStartRef.current.y;

      const newPan = calculatePanFromFrustumDrag(
        initialPanRef.current,
        deltaX,
        deltaY,
        transform.scale,
        zoomLevel,
        bounds,
        viewportWidth,
        viewportHeight,
      );

      onPanChange(newPan);
    };

    const handleMouseUp = (): void => {
      setIsDragging(false);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      }
    };
  }, [isDragging, onPanChange, transform.scale, zoomLevel, bounds, viewportWidth, viewportHeight]);

  const cornerSize = Math.min(6, Math.max(2, frustumRect.width * 0.15, frustumRect.height * 0.15));

  return (
    <g
      className={`minimap-frustum-overlay ${isDragging ? "is-dragging" : ""} ${className}`.trim()}
      onMouseDown={handleMouseDown}
      style={{ cursor: interactive ? (isDragging ? "grabbing" : "grab") : "default" }}
      data-testid="minimap-frustum"
      role="group"
      aria-label="Minimap viewport frustum"
    >
      {/* Main viewport rectangle */}
      <rect
        x={frustumRect.x}
        y={frustumRect.y}
        width={Math.max(1, frustumRect.width)}
        height={Math.max(1, frustumRect.height)}
        rx={3}
        ry={3}
        fill={isDragging ? "rgba(129, 140, 248, 0.22)" : "rgba(129, 140, 248, 0.12)"}
        stroke={isDragging ? "#a5b4fc" : "#818cf8"}
        strokeWidth={isDragging ? 2 : 1.5}
        strokeDasharray={isDragging ? "none" : undefined}
        className="minimap-frustum-rect"
      />

      {/* Top-Left Corner Handle */}
      <path
        d={`M ${frustumRect.x} ${frustumRect.y + cornerSize} L ${frustumRect.x} ${frustumRect.y} L ${frustumRect.x + cornerSize} ${frustumRect.y}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Top-Right Corner Handle */}
      <path
        d={`M ${frustumRect.x + frustumRect.width - cornerSize} ${frustumRect.y} L ${frustumRect.x + frustumRect.width} ${frustumRect.y} L ${frustumRect.x + frustumRect.width} ${frustumRect.y + cornerSize}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Bottom-Left Corner Handle */}
      <path
        d={`M ${frustumRect.x} ${frustumRect.y + frustumRect.height - cornerSize} L ${frustumRect.x} ${frustumRect.y + frustumRect.height} L ${frustumRect.x + cornerSize} ${frustumRect.y + frustumRect.height}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Bottom-Right Corner Handle */}
      <path
        d={`M ${frustumRect.x + frustumRect.width - cornerSize} ${frustumRect.y + frustumRect.height} L ${frustumRect.x + frustumRect.width} ${frustumRect.y + frustumRect.height} L ${frustumRect.x + frustumRect.width} ${frustumRect.y + frustumRect.height - cornerSize}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Center crosshair / grab indicator for sufficiently large frustums */}
      {frustumRect.width > 24 && frustumRect.height > 24 && (
        <circle
          cx={frustumRect.x + frustumRect.width / 2}
          cy={frustumRect.y + frustumRect.height / 2}
          r={2.5}
          fill={isDragging ? "#a5b4fc" : "#818cf8"}
          opacity={0.8}
        />
      )}
    </g>
  );
};

export default MinimapFrustumOverlay;
