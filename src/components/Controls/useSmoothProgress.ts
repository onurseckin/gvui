import { useEffect, useState } from "react";

const safeRequestAnimationFrame =
  typeof requestAnimationFrame !== "undefined"
    ? requestAnimationFrame
    : (cb: FrameRequestCallback): number =>
        setTimeout(() => cb(performance.now()), 16) as unknown as number;

const safeCancelAnimationFrame =
  typeof cancelAnimationFrame !== "undefined"
    ? cancelAnimationFrame
    : (id: number): void => clearTimeout(id);

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
  const [displayPercent, setDisplayPercent] = useState(isCalculating ? targetPercent : 0);

  useEffect(() => {
    if (!isCalculating) {
      setDisplayPercent(0);
      return;
    }

    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      // Cap maximum delta time to prevent large leaps during background tab switching
      const delta = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      setDisplayPercent((prev) => {
        if (prev >= targetPercent) return targetPercent;
        // Move at steady speed proportional to remaining delta with a minimum floor of 20%/sec
        const speed = Math.max(20, (targetPercent - prev) * 8);
        const next = Math.min(targetPercent, prev + speed * delta);
        return Math.round(next * 10) / 10;
      });

      animationFrameId = safeRequestAnimationFrame(animate);
    };

    animationFrameId = safeRequestAnimationFrame(animate);
    return () => safeCancelAnimationFrame(animationFrameId);
  }, [targetPercent, isCalculating]);

  return displayPercent;
}

