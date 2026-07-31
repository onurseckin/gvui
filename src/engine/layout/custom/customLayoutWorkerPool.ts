export interface LayoutProgressInfo {
  stageIndex: number;
  totalStages: number;
  percent: number;
  stageText: string;
  detail: string;
}

export function deriveProgressState(
  stageIndex: number,
  totalStages: number,
  detail: string,
): LayoutProgressInfo {
  const safeTotal = Math.max(1, totalStages);
  const safeStage = Math.min(Math.max(1, stageIndex), safeTotal);
  const percent = Math.round((safeStage / safeTotal) * 100);
  const stageText = `Stage ${safeStage} of ${safeTotal}`;

  return {
    stageIndex: safeStage,
    totalStages: safeTotal,
    percent,
    stageText,
    detail,
  };
}
