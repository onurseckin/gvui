/**
 * Timeline Replay, Scrubbing, and Execution Timing Breakdown Engine.
 * Reconstructs terminal output buffers at arbitrary timestamps and computes latency metrics.
 * 100% Zero-any type-safe implementation.
 */

import { parseAnsi } from "./ansiParser";
import type {
  RecordedExecutionTrace,
  ReplayBufferState,
  TimelineEvent,
  TimingBreakdown,
} from "./types";

/**
 * Finds the index of the last event that occurred at or before target timestamp.
 */
export function findEventIndexAtTime(trace: RecordedExecutionTrace, timestampMs: number): number {
  if (!trace.events || trace.events.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < trace.events.length; i++) {
    const ev = trace.events[i];
    if (ev && ev.timestampMs <= timestampMs) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}

/**
 * Finds timestamp corresponding to a given event index.
 */
export function findTimeAtEventIndex(trace: RecordedExecutionTrace, eventIndex: number): number {
  if (!trace.events || trace.events.length === 0) return 0;
  if (eventIndex < 0) return 0;
  if (eventIndex >= trace.events.length) {
    const last = trace.events[trace.events.length - 1];
    return last?.timestampMs ?? trace.totalDurationMs;
  }
  return trace.events[eventIndex]?.timestampMs ?? 0;
}

/**
 * Reconstructs the terminal buffer state at a given timestamp.
 */
export function computeReplayBuffer(
  trace: RecordedExecutionTrace,
  targetTimestampMs: number,
  isPlaying: boolean = false,
  playbackSpeed: number = 1,
): ReplayBufferState {
  const boundedTime = Math.max(0, Math.min(targetTimestampMs, trace.totalDurationMs));
  const completedEvents: TimelineEvent[] = [];

  let accumulatedStdout = "";
  let accumulatedStderr = "";
  let fullCombinedStream = "";

  for (const ev of trace.events) {
    if (ev.timestampMs <= boundedTime) {
      completedEvents.push(ev);
      if (ev.type === "stdout_chunk") {
        accumulatedStdout += ev.data;
        fullCombinedStream += ev.data;
      } else if (ev.type === "stderr_chunk") {
        accumulatedStderr += ev.data;
        fullCombinedStream += ev.data;
      }
    } else {
      break;
    }
  }

  const parsedAnsi = parseAnsi(fullCombinedStream);
  const isFinished = boundedTime >= trace.totalDurationMs;

  return {
    currentTimeMs: boundedTime,
    isPlaying,
    playbackSpeed,
    visibleStdout: accumulatedStdout,
    visibleStderr: accumulatedStderr,
    visibleLines: parsedAnsi.lines,
    completedEventsCount: completedEvents.length,
    totalEventsCount: trace.events.length,
    isFinished,
  };
}

/**
 * Reconstructs terminal buffer state after executing up to a specific event index.
 */
export function computeReplayBufferAtEventIndex(
  trace: RecordedExecutionTrace,
  targetEventIndex: number,
  isPlaying: boolean = false,
  playbackSpeed: number = 1,
): ReplayBufferState {
  const boundedIdx = Math.max(-1, Math.min(targetEventIndex, trace.events.length - 1));
  const targetTime = boundedIdx >= 0 ? (trace.events[boundedIdx]?.timestampMs ?? 0) : 0;
  return computeReplayBuffer(trace, targetTime, isPlaying, playbackSpeed);
}

/**
 * Calculates comprehensive execution timing metrics and chunk latency distribution.
 */
export function calculateTimingBreakdown(trace: RecordedExecutionTrace): TimingBreakdown {
  const totalDurationMs = Math.max(1, trace.totalDurationMs);
  let ttfbMs = totalDurationMs;
  let firstChunkFound = false;
  let stdoutDurationMs = 0;
  let stderrDurationMs = 0;
  let bytesTotal = 0;
  let chunkCount = 0;

  const latencies: number[] = [];
  let prevTimestamp = 0;

  let pipelineStagesCount = 0;

  for (const ev of trace.events) {
    if (ev.type === "pipeline_step") {
      pipelineStagesCount++;
    }

    if (ev.type === "stdout_chunk" || ev.type === "stderr_chunk") {
      chunkCount++;
      bytesTotal += new TextEncoder().encode(ev.data).length;

      if (!firstChunkFound) {
        firstChunkFound = true;
        ttfbMs = ev.timestampMs;
      }

      if (ev.type === "stdout_chunk") {
        stdoutDurationMs = Math.max(stdoutDurationMs, ev.timestampMs);
      } else {
        stderrDurationMs = Math.max(stderrDurationMs, ev.timestampMs);
      }

      const delta = ev.timestampMs - prevTimestamp;
      if (delta >= 0) {
        latencies.push(delta);
      }
      prevTimestamp = ev.timestampMs;
    }
  }

  if (!firstChunkFound) {
    ttfbMs = 0;
  }

  const sumLatencies = latencies.reduce((acc, v) => acc + v, 0);
  const averageChunkLatencyMs =
    latencies.length > 0 ? Math.round((sumLatencies / latencies.length) * 10) / 10 : 0;
  const maxChunkLatencyMs = latencies.length > 0 ? Math.max(...latencies) : 0;

  const throughputBytesPerSec =
    totalDurationMs > 0 ? Math.round((bytesTotal / (totalDurationMs / 1000)) * 10) / 10 : 0;

  return {
    totalDurationMs,
    ttfbMs,
    stdoutDurationMs,
    stderrDurationMs,
    chunkCount,
    averageChunkLatencyMs,
    maxChunkLatencyMs,
    pipelineStagesCount: Math.max(1, pipelineStagesCount),
    bytesTotal,
    throughputBytesPerSec,
  };
}
