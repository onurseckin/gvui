import { describe, expect, it } from "bun:test";
import { interpolateProgress } from "./useSmoothProgress";

describe("useSmoothProgress helper", () => {
  it("interpolates current percent toward target smoothly", () => {
    const p1 = interpolateProgress(10, 50, 0.2);
    expect(p1).toBeGreaterThan(10);
    expect(p1).toBeLessThanOrEqual(50);
  });

  it("clamps display percentage between 0 and 100", () => {
    expect(interpolateProgress(-10, 50, 0.5)).toBeGreaterThanOrEqual(0);
    expect(interpolateProgress(95, 120, 0.5)).toBeLessThanOrEqual(100);
  });

  it("calculates progress floor speed properly", () => {
    const target = 51;
    const prev = 50;
    const speed = Math.max(20, (target - prev) * 8);
    expect(speed).toEqual(20);
  });

  it("calculates proportional speed for larger deltas", () => {
    const target = 20;
    const prev = 0;
    const speed = Math.max(20, (target - prev) * 8);
    expect(speed).toEqual(160);
  });
});
