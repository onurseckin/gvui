import { useEffect, useRef, useState, type FC } from "react";
import { CircularProgressLoader } from "./CircularProgressLoader";
import { useSmoothProgress } from "./useSmoothProgress";
import "./LoadingOverlay.css";

export interface LoadingOverlayProps {
  percent: number;
  stageText?: string;
  detail?: string;
  nodeCount?: number;
  edgeCount?: number;
}

export const LoadingOverlay: FC<LoadingOverlayProps> = ({
  percent,
  stageText = "",
  detail = "",
}) => {
  const smoothPercent = useSmoothProgress(percent, true);
  const safePercent = Math.min(100, Math.max(0, smoothPercent));
  const rawText = detail || stageText;

  const [currentText, setCurrentText] = useState(rawText);
  const displayQueueRef = useRef<string[]>([]);
  const lastEnqueuedRef = useRef<string>(rawText);

  useEffect(() => {
    if (rawText && rawText !== lastEnqueuedRef.current) {
      lastEnqueuedRef.current = rawText;
      if (!currentText) {
        setCurrentText(rawText);
      } else {
        displayQueueRef.current.push(rawText);
      }
    }
  }, [rawText, currentText]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (displayQueueRef.current.length > 0) {
        const nextText = displayQueueRef.current.shift();
        if (nextText !== undefined) {
          setCurrentText(nextText);
        }
      }
    }, 30);

    return () => clearInterval(timer);
  }, []);

  const displayText = currentText || rawText;

  return (
    <div className="loading-overlay-backdrop">
      <div className="loading-overlay-content">
        <CircularProgressLoader percent={safePercent} size={72} strokeWidth={3.5} />
        {displayText && <div className="loading-overlay-text">{displayText}</div>}
      </div>
    </div>
  );
};



