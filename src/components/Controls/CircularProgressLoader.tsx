import type { FC } from "react";
import "./CircularProgressLoader.css";

export interface CircularProgressLoaderProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
}

export const CircularProgressLoader: FC<CircularProgressLoaderProps> = ({
  percent,
  size = 72,
  strokeWidth = 3.5,
}) => {
  const safePercent = Math.min(100, Math.max(0, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - safePercent / 100);

  return (
    <div className="circular-loader-wrapper" style={{ width: size, height: size }}>
      <svg className="circular-loader-svg" width={size} height={size}>
        <circle
          className="circular-loader-bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={3}
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
    </div>
  );
};

