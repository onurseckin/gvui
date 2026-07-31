import type { FC } from "react";
import "./CircularProgressLoader.css";

export interface CircularProgressLoaderProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
}

export const CircularProgressLoader: FC<CircularProgressLoaderProps> = ({
  percent,
  size = 120,
  strokeWidth = 8,
}) => {
  const safePercent = Math.min(100, Math.max(0, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - safePercent / 100);

  return (
    <div className="circular-loader-wrapper" style={{ width: size, height: size }}>
      <svg className="circular-loader-svg" width={size} height={size}>
        <defs>
          <linearGradient id="loaderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1f6beb" />
            <stop offset="100%" stopColor="#3fb950" />
          </linearGradient>
        </defs>
        <circle
          className="circular-loader-bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="circular-loader-fg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="circular-loader-center">
        <span className="circular-loader-percent">{`${Math.round(safePercent)}%`}</span>
      </div>
    </div>
  );
};
