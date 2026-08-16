import { describe, expect, it } from "bun:test";
import {
  calculateTimingBreakdown,
  computeReplayBuffer,
  computeReplayBufferAtEventIndex,
  findEventIndexAtTime,
  findTimeAtEventIndex,
} from "../../engine/sandbox/replayEngine";
import type { RecordedExecutionTrace } from "../../engine/sandbox/types";

describe("replayEngine Unit Tests", () => {
  const sampleTrace: RecordedExecutionTrace = {
    id: "trace-test-01",
    command: "echo 1 && echo 2 && echo 3",
    startedAt: "2026-08-15T12:00:00Z",
    totalDurationMs: 300,
    exitCode: 0,
    cwd: "/workspace",
    env: { USER: "tester" },
    events: [
      { id: "e-1", timestampMs: 0, type: "spawn", stream: "system", data: "spawn" },
      { id: "e-2", timestampMs: 50, type: "pipeline_step", stream: "system", data: "stage 1" },
      {
        id: "e-3",
        timestampMs: 80,
        type: "stdout_chunk",
        stream: "stdout",
        data: "1\n",
        chunkIndex: 1,
      },
      { id: "e-4", timestampMs: 140, type: "pipeline_step", stream: "system", data: "stage 2" },
      {
        id: "e-5",
        timestampMs: 180,
        type: "stdout_chunk",
        stream: "stdout",
        data: "2\n",
        chunkIndex: 2,
      },
      { id: "e-6", timestampMs: 220, type: "pipeline_step", stream: "system", data: "stage 3" },
      {
        id: "e-7",
        timestampMs: 260,
        type: "stdout_chunk",
        stream: "stdout",
        data: "3\n",
        chunkIndex: 3,
      },
      { id: "e-8", timestampMs: 300, type: "exit", stream: "system", data: "exit 0", exitCode: 0 },
    ],
  };

  describe("findEventIndexAtTime & findTimeAtEventIndex", () => {
    it("finds correct event index given timestamp", () => {
      expect(findEventIndexAtTime(sampleTrace, 0)).toBe(0);
      expect(findEventIndexAtTime(sampleTrace, 60)).toBe(1);
      expect(findEventIndexAtTime(sampleTrace, 180)).toBe(4);
      expect(findEventIndexAtTime(sampleTrace, 400)).toBe(7);
    });

    it("finds timestamp given event index", () => {
      expect(findTimeAtEventIndex(sampleTrace, 0)).toBe(0);
      expect(findTimeAtEventIndex(sampleTrace, 2)).toBe(80);
      expect(findTimeAtEventIndex(sampleTrace, 7)).toBe(300);
    });
  });

  describe("computeReplayBuffer", () => {
    it("reconstructs partial buffer at t=0ms", () => {
      const buffer = computeReplayBuffer(sampleTrace, 0);
      expect(buffer.currentTimeMs).toBe(0);
      expect(buffer.visibleStdout).toBe("");
      expect(buffer.completedEventsCount).toBe(1);
      expect(buffer.isFinished).toBe(false);
    });

    it("reconstructs buffer after intermediate stdout chunk (t=100ms)", () => {
      const buffer = computeReplayBuffer(sampleTrace, 100);
      expect(buffer.visibleStdout).toBe("1\n");
      expect(buffer.visibleLines.length).toBe(1);
      expect(buffer.visibleLines[0]!.plainText).toBe("1");
      expect(buffer.completedEventsCount).toBe(3);
    });

    it("reconstructs full buffer at completion (t=300ms)", () => {
      const buffer = computeReplayBuffer(sampleTrace, 300);
      expect(buffer.visibleStdout).toBe("1\n2\n3\n");
      expect(buffer.visibleLines.length).toBe(3);
      expect(buffer.completedEventsCount).toBe(8);
      expect(buffer.isFinished).toBe(true);
    });
  });

  describe("computeReplayBufferAtEventIndex", () => {
    it("reconstructs buffer step-by-step using event index", () => {
      const step2 = computeReplayBufferAtEventIndex(sampleTrace, 2);
      expect(step2.visibleStdout).toBe("1\n");

      const step4 = computeReplayBufferAtEventIndex(sampleTrace, 4);
      expect(step4.visibleStdout).toBe("1\n2\n");
    });
  });

  describe("calculateTimingBreakdown", () => {
    it("computes accurate latency metrics and throughput", () => {
      const metrics = calculateTimingBreakdown(sampleTrace);
      expect(metrics.totalDurationMs).toBe(300);
      expect(metrics.ttfbMs).toBe(80); // First stdout chunk is at 80ms
      expect(metrics.stdoutDurationMs).toBe(260); // Last stdout chunk is at 260ms
      expect(metrics.chunkCount).toBe(3);
      expect(metrics.pipelineStagesCount).toBe(3);
      expect(metrics.throughputBytesPerSec).toBeGreaterThan(0);
    });
  });
});
