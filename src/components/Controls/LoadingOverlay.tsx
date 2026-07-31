import { useEffect, useRef, useState, type FC } from "react";
import { CircularProgressLoader } from "./CircularProgressLoader";
import { useSmoothProgress } from "./useSmoothProgress";
import "./LoadingOverlay.css";

export interface StepItem {
  id?: string;
  label: string;
  status: "completed" | "active" | "upcoming";
}

export interface LoadingOverlayProps {
  percent: number;
  stageText?: string;
  detail?: string;
  steps?: (string | StepItem)[];
  nodeCount?: number;
  edgeCount?: number;
}

const StatusIcon: FC<{ status: "completed" | "active" | "upcoming" }> = ({ status }) => {
  if (status === "upcoming") {
    return (
      <svg
        className="step-status-icon is-upcoming"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
      >
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      </svg>
    );
  }

  const className = `step-status-icon ${status === "completed" ? "is-completed" : "is-active"}`;

  return (
    <svg className={className} viewBox="0 0 16 16" width="14" height="14" fill="none">
      <circle cx="8" cy="8" r="6" fill="currentColor" />
    </svg>
  );
};

export const LoadingOverlay: FC<LoadingOverlayProps> = ({
  percent,
  stageText = "",
  detail = "",
  steps,
}) => {
  const smoothPercent = useSmoothProgress(percent, true);
  const safePercent = Math.min(100, Math.max(0, smoothPercent));
  const rawText = detail || stageText;

  const [history, setHistory] = useState<string[]>([]);
  const [currentText, setCurrentText] = useState(rawText);
  const [upcomingQueue, setUpcomingQueue] = useState<string[]>([]);

  const lastEnqueuedRef = useRef<string>(rawText);

  useEffect(() => {
    if (rawText && rawText !== lastEnqueuedRef.current) {
      lastEnqueuedRef.current = rawText;
      if (!currentText) {
        setCurrentText(rawText);
      } else {
        setUpcomingQueue((prev) => [...prev, rawText]);
      }
    }
  }, [rawText, currentText]);

  useEffect(() => {
    const timer = setInterval(() => {
      setUpcomingQueue((prevQueue) => {
        if (prevQueue.length === 0) return prevQueue;
        const [nextText, ...rest] = prevQueue;
        setCurrentText((prevCurrent) => {
          if (prevCurrent && prevCurrent !== nextText) {
            setHistory((prevHistory) => [...prevHistory, prevCurrent]);
          }
          return nextText;
        });
        return rest;
      });
    }, 30);

    return () => clearInterval(timer);
  }, []);

  const displayText = currentText || rawText;

  const getStepsFromProps = (
    stepsProp: (string | StepItem)[],
    activeText: string
  ): StepItem[] => {
    const normalized: StepItem[] = stepsProp.map((item, idx) => {
      if (typeof item === "string") {
        return { id: `prop-step-${idx}`, label: item, status: "upcoming" };
      }
      return {
        id: item.id || `prop-step-${idx}`,
        label: item.label,
        status: item.status || "upcoming",
      };
    });

    const hasExplicitStatus = normalized.some((s) => s.status !== "upcoming");
    if (hasExplicitStatus) {
      return normalized;
    }

    let activeIdx = normalized.findIndex((s) => s.label === activeText);
    if (activeIdx === -1 && normalized.length > 0) {
      activeIdx = 0;
    }

    return normalized.map((step, idx) => {
      if (idx < activeIdx) return { ...step, status: "completed" };
      if (idx === activeIdx) return { ...step, status: "active" };
      return { ...step, status: "upcoming" };
    });
  };

  const allSteps: StepItem[] = steps
    ? getStepsFromProps(steps, displayText)
    : [
        ...history.map((label, idx) => ({
          id: `hist-${idx}`,
          label,
          status: "completed" as const,
        })),
        ...(displayText
          ? [
              {
                id: "active-step",
                label: displayText,
                status: "active" as const,
              },
            ]
          : []),
        ...upcomingQueue.map((label, idx) => ({
          id: `queue-${idx}`,
          label,
          status: "upcoming" as const,
        })),
      ];

  const total = allSteps.length;
  let visibleSteps: StepItem[] = allSteps;

  if (total > 5) {
    let activeIdx = allSteps.findIndex((s) => s.status === "active");
    if (activeIdx === -1) {
      activeIdx = total - 1;
    }

    let start = activeIdx - 2;
    if (start < 0) start = 0;
    if (start + 5 > total) start = total - 5;
    if (start < 0) start = 0;

    visibleSteps = allSteps.slice(start, start + 5);
  }

  return (
    <div className="loading-overlay-backdrop">
      <div className="loading-overlay-content">
        <CircularProgressLoader percent={safePercent} size={72} strokeWidth={3.5} />
        {visibleSteps.length > 0 && (
          <div className="loading-steps-window">
            {visibleSteps.map((step) => (
              <div key={step.id} className={`loading-step-item is-${step.status}`}>
                <StatusIcon status={step.status} />
                <span className="loading-overlay-text">{step.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
