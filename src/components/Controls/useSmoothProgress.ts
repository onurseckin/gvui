import { useEffect, useState } from "react";

export function interpolateProgress(
  current: number,
  target: number,
  stepFactor: number = 0.25,
): number {
  const diff = target - current;
  if (Math.abs(diff) < 0.5) return Math.min(100, Math.max(0, target));
  const next = current + diff * stepFactor;
  return Math.min(100, Math.max(0, Math.round(next * 10) / 10));
}

export function useSmoothProgress(targetPercent: number, isCalculating: boolean): number {
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    if (!isCalculating) {
      setDisplayPercent(0);
      return;
    }

    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const delta = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      setDisplayPercent((prev) => {
        if (prev >= targetPercent) return targetPercent;
        const speed = Math.max(10, (targetPercent - prev) * 5);
        const next = Math.min(targetPercent, prev + speed * delta);
        return Math.round(next * 10) / 10;
      });

      if (displayPercent < targetPercent) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [targetPercent, isCalculating, displayPercent]);

  return displayPercent;
}
