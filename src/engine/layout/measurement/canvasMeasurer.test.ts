import { describe, expect, it } from "bun:test";
import { createCanvasMeasurer, getDefaultMeasurer } from "./canvasMeasurer";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "../custom/config";
import type { GraphNodeData } from "../../../types/graphData";
import type { FontSpec } from "./types";

// bun:test runs without a DOM, so every case here exercises the deterministic character-width
// fallback — the same path the layout worker uses before a canvas is available.

const LABEL_OPTS = { maxWidth: 200, maxLines: 3 };

describe("measureLabel", () => {
  it("greedily wraps words at maxWidth", () => {
    const measurer = createCanvasMeasurer();
    const word = "abcdefgh";
    const single = measurer.measureLabel(word, { maxWidth: 10000, maxLines: 1 });

    // Room for two words plus a space, never three.
    const maxWidth = Math.floor(single.width * 2.5);
    const box = measurer.measureLabel(`${word} ${word} ${word} ${word} ${word} ${word}`, {
      maxWidth,
      maxLines: 10,
    });

    expect(box.lines).toHaveLength(3);
    expect(box.truncated).toBe(false);
    expect(box.width).toBeLessThanOrEqual(maxWidth);
    expect(box.height).toBeGreaterThan(single.height);
  });

  it("stops at maxLines and ellipsizes the last line", () => {
    const measurer = createCanvasMeasurer();
    const text =
      "deploys the rendered manifest bundle to every regional cluster and waits for the rollout to settle";
    const box = measurer.measureLabel(text, { maxWidth: 120, maxLines: 2 });

    expect(box.lines).toHaveLength(2);
    expect(box.truncated).toBe(true);
    expect(box.lines[1]).toContain("…");
    expect(box.width).toBeLessThanOrEqual(120);
  });

  it("breaks a single over-long token by character", () => {
    const measurer = createCanvasMeasurer();
    const token = "x".repeat(200);
    const box = measurer.measureLabel(token, { maxWidth: 100, maxLines: 50 });

    expect(box.lines.length).toBeGreaterThan(1);
    expect(box.truncated).toBe(false);
    expect(box.lines.join("")).toBe(token);
    expect(box.width).toBeLessThanOrEqual(100);
  });

  it("bounds a pathological label instead of letting it become a 1400px badge", () => {
    const measurer = createCanvasMeasurer();
    const box = measurer.measureLabel("word ".repeat(40).trim(), LABEL_OPTS);

    expect(box.width).toBeLessThanOrEqual(LABEL_OPTS.maxWidth);
    expect(box.lines.length).toBeLessThanOrEqual(LABEL_OPTS.maxLines);
    expect(box.truncated).toBe(true);
  });

  it("returns an empty box for empty text", () => {
    const measurer = createCanvasMeasurer();
    const box = measurer.measureLabel("", LABEL_OPTS);

    expect(box.lines).toHaveLength(0);
    expect(box.width).toBe(0);
    expect(box.height).toBe(0);
    expect(box.truncated).toBe(false);
  });
});

describe("measurement caching", () => {
  it("serves a repeated label from cache without re-measuring text", () => {
    let calls = 0;
    const measureTextWidth = (text: string, fontSpec: FontSpec): number => {
      calls += 1;
      return text.length * fontSpec.sizePx * 0.6;
    };
    const measurer = createCanvasMeasurer({ measureTextWidth });

    const first = measurer.measureLabel("retry with backoff", LABEL_OPTS);
    const afterFirst = calls;
    expect(afterFirst).toBeGreaterThan(0);

    const second = measurer.measureLabel("retry with backoff", LABEL_OPTS);
    expect(calls).toBe(afterFirst);
    expect(second).toBe(first);

    measurer.clearCache();
    measurer.measureLabel("retry with backoff", LABEL_OPTS);
    expect(calls).toBeGreaterThan(afterFirst);
  });
});

describe("measureNodes", () => {
  it("clamps node width at both ends", () => {
    const measurer = createCanvasMeasurer();
    const [narrow, wide] = measurer.measureNodes([
      { id: "a", name: "A" },
      { id: "b", name: "x".repeat(400) },
    ]);

    expect(narrow.width).toBe(DEFAULT_CUSTOM_LAYOUT_CONFIG.minNodeWidth);
    expect(wide.width).toBe(DEFAULT_CUSTOM_LAYOUT_CONFIG.maxNodeWidth);
  });

  it("honours explicit width bounds over the config defaults", () => {
    const measurer = createCanvasMeasurer();
    const [size] = measurer.measureNodes([{ id: "a", name: "A" }], {
      minNodeWidth: 260,
      maxNodeWidth: 300,
    });

    expect(size.width).toBe(260);
  });

  it("makes a card with a longer description taller", () => {
    const measurer = createCanvasMeasurer();
    const [short, long] = measurer.measureNodes([
      { id: "a", name: "planner", description: "Short." },
      {
        id: "b",
        name: "planner",
        description:
          "Collects every upstream artefact, reconciles it against the recorded plan, and emits a diff that the reviewer agent can act on without re-reading the whole repository.",
      },
    ]);

    expect(long.height).toBeGreaterThan(short.height);
  });

  it("grows with badges and tools rather than ignoring them", () => {
    const measurer = createCanvasMeasurer();
    const bare: GraphNodeData = { id: "a", name: "worker" };
    const decorated: GraphNodeData = {
      id: "b",
      name: "worker",
      badges: [{ label: "running" }, { label: "retry-3" }],
      tools: [{ name: "grep" }, { name: "bash" }],
    };
    const [bareSize, decoratedSize] = measurer.measureNodes([bare, decorated]);

    expect(decoratedSize.height).toBeGreaterThan(bareSize.height);
    expect(decoratedSize.width).toBeGreaterThanOrEqual(bareSize.width);
  });

  it("returns finite positive sizes with no canvas available", () => {
    const node: GraphNodeData = {
      id: "n1",
      name: "orchestrator",
      type: "agent",
      description: "Fans work out to the pool and reduces the results.",
      model: "claude-opus",
      harnessModel: "harness-v2",
      badges: [{ label: "ok", variant: "success" }],
      tools: [{ name: "read" }],
      context: { repoPath: "/srv/repo" },
      metadata: { attempts: 3, prompt: "ignored because it lives in a collapsed details block" },
    };
    const [size] = getDefaultMeasurer().measureNodes([node]);

    expect(Number.isFinite(size.width)).toBe(true);
    expect(Number.isFinite(size.height)).toBe(true);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});
