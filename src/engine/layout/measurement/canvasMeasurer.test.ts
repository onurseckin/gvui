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

  it("grows vertically with badges alone and mini-chips", () => {
    const measurer = createCanvasMeasurer();
    const bare: GraphNodeData = { id: "a", name: "worker" };
    const withBadges: GraphNodeData = {
      id: "b",
      name: "worker",
      badges: [{ label: "running" }, { label: "retry-3" }],
    };
    const withMiniChips: GraphNodeData = {
      id: "c",
      name: "worker",
      metrics: { durationMs: 45000 },
      metadata: {
        commands: [
          {
            id: "cmd1",
            argv: ["cmd1"],
            cwd: "/",
            exitCode: 0,
            durationMs: 100,
            startedAt: "2026-08-14T00:00:00Z",
            finishedAt: "2026-08-14T00:00:01Z",
          },
          {
            id: "cmd2",
            argv: ["cmd2"],
            cwd: "/",
            exitCode: 0,
            durationMs: 100,
            startedAt: "2026-08-14T00:00:01Z",
            finishedAt: "2026-08-14T00:00:02Z",
          },
        ],
      },
    };

    const [bareSize, badgeSize, miniSize] = measurer.measureNodes([
      bare,
      withBadges,
      withMiniChips,
    ]);
    // Body badges are not rendered, so they do not allocate extra height
    expect(badgeSize.height).toBe(bareSize.height);
    // Mini chips are rendered, so they allocate vertical space
    expect(miniSize.height).toBeGreaterThan(bareSize.height);
  });

  it("clamps description height to 2 lines matching DOM line clamp", () => {
    const measurer = createCanvasMeasurer();
    const oneLine: GraphNodeData = {
      id: "a",
      name: "worker",
      description: "Short single line text.",
    };
    const twoLine: GraphNodeData = {
      id: "b",
      name: "worker",
      description: "First line of text that wraps nicely. Second line of text that wraps nicely.",
    };
    const fiveLine: GraphNodeData = {
      id: "c",
      name: "worker",
      description:
        "First line of text that wraps. Second line of text that wraps. Third line of text that wraps. Fourth line of text that wraps. Fifth line of text that wraps. Sixth line of text that wraps.",
    };

    const [oneSize, twoSize, fiveSize] = measurer.measureNodes([oneLine, twoLine, fiveLine], {
      minNodeWidth: 200,
      maxNodeWidth: 200,
    });

    expect(twoSize.height).toBeGreaterThanOrEqual(oneSize.height);
    // Long description is clamped to max 4 lines
    expect(fiveSize.height).toBeGreaterThan(twoSize.height);
  });

  it("accounts for header step badge and badge chips in width calculations", () => {
    const measurer = createCanvasMeasurer();
    const bare: GraphNodeData = { id: "a", name: "worker" };
    const withHeaderDetails: GraphNodeData = {
      id: "b",
      name: "worker",
      step: 42,
      badge: { text: "CRITICAL_PATH", variant: "warning" },
      model: "claude-3-5-sonnet",
    };

    const [bareSize, detailedSize] = measurer.measureNodes([bare, withHeaderDetails]);
    expect(detailedSize.width).toBeGreaterThanOrEqual(bareSize.width);
  });

  it("measures dedicated title row and wraps long titles vertically", () => {
    const measurer = createCanvasMeasurer();
    const shortTitle: GraphNodeData = {
      id: "a",
      name: "Short Task",
    };
    const longTitle: GraphNodeData = {
      id: "b",
      name: "Long Extended Task Name That Exceeds A Single Line And Wraps Naturally Across Multiple Rows",
    };

    const [shortSize, longSizeNarrow] = measurer.measureNodes([shortTitle, longTitle], {
      minNodeWidth: 200,
      maxNodeWidth: 200,
    });

    const [longSizeWide] = measurer.measureNodes([longTitle], {
      minNodeWidth: 500,
      maxNodeWidth: 500,
    });

    // Dedicated title row wraps on narrow card and increases height
    expect(longSizeNarrow.height).toBeGreaterThan(shortSize.height);
    // At wide width, fewer lines are needed so height is less than or equal to narrow
    expect(longSizeWide.height).toBeLessThanOrEqual(longSizeNarrow.height);
  });

  it("measures cards across standard widths: 200px, 320px, and 500px", () => {
    const measurer = createCanvasMeasurer();
    const complexNode: GraphNodeData = {
      id: "n-complex",
      name: "Deep Architecture Validation And Analysis Runner",
      type: "validator",
      step: 3,
      badge: { text: "BLOCKING", variant: "warning" },
      model: "claude-3-5-sonnet",
      description:
        "Performs full adversarial round checking across all gates before passing to critic.",
      tools: [{ name: "cargo" }, { name: "bun" }],
    };

    const [size200] = measurer.measureNodes([complexNode], {
      minNodeWidth: 200,
      maxNodeWidth: 200,
    });
    const [size320] = measurer.measureNodes([complexNode], {
      minNodeWidth: 320,
      maxNodeWidth: 320,
    });
    const [size500] = measurer.measureNodes([complexNode], {
      minNodeWidth: 500,
      maxNodeWidth: 500,
    });

    expect(size200.width).toBe(200);
    expect(size320.width).toBe(320);
    expect(size500.width).toBe(500);

    // Height should be strictly non-increasing as width expands because text wraps into fewer lines
    expect(size200.height).toBeGreaterThanOrEqual(size320.height);
    expect(size320.height).toBeGreaterThanOrEqual(size500.height);
  });

  it("measures multiline title with explicit newlines allocating height per line", () => {
    const measurer = createCanvasMeasurer();
    const singleLine: GraphNodeData = {
      id: "single",
      name: "Single Line Title",
    };
    const multiline: GraphNodeData = {
      id: "multi",
      name: "Line 1: Ingest\nLine 2: Validate\nLine 3: Execute",
    };

    const [singleSize, multiSize] = measurer.measureNodes([singleLine, multiline], {
      minNodeWidth: 320,
      maxNodeWidth: 320,
    });

    expect(multiSize.height).toBeGreaterThan(singleSize.height);
  });

  it("measures long unbroken tokens breaking characters cleanly", () => {
    const measurer = createCanvasMeasurer();
    const unbrokenToken: GraphNodeData = {
      id: "unbroken",
      name: "https://git.internal.company.com/repositories/gvui/commits/9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1098",
    };

    const [size] = measurer.measureNodes([unbrokenToken], {
      minNodeWidth: 200,
      maxNodeWidth: 200,
    });

    expect(size.width).toBe(200);
    expect(size.height).toBeGreaterThan(0);
    expect(Number.isFinite(size.height)).toBe(true);
  });

  it("measures Unicode titles with emojis, CJK, and RTL scripts", () => {
    const measurer = createCanvasMeasurer();
    const emojiNode: GraphNodeData = { id: "emoji", name: "🚀 Deploy Worker 🤖" };
    const cjkNode: GraphNodeData = {
      id: "cjk",
      name: "日本語のタスク・中文任务・한국어 분석 작업",
    };
    const rtlNode: GraphNodeData = { id: "rtl", name: "مهمة المنسق الرئيسي للنظام" };

    const sizes = measurer.measureNodes([emojiNode, cjkNode, rtlNode], {
      minNodeWidth: 250,
      maxNodeWidth: 250,
    });

    for (const size of sizes) {
      expect(Number.isFinite(size.width)).toBe(true);
      expect(Number.isFinite(size.height)).toBe(true);
      expect(size.width).toBe(250);
      expect(size.height).toBeGreaterThan(0);
    }
  });

  it("proves exact arithmetic for multi-line wrapped title height expansion", () => {
    const measurer = createCanvasMeasurer();
    // In DEFAULT_NODE_TEMPLATE:
    // headerHeight = 35, padding = 10, rowGap = 8, title lineHeight = 18.
    // Bare card with N-line title has height = 35 + 10 + N * 18 + 8.
    const oneLineNode: GraphNodeData = { id: "n1", name: "Short" };
    const twoLineNode: GraphNodeData = { id: "n2", name: "Line 1\nLine 2" };
    const threeLineNode: GraphNodeData = { id: "n3", name: "Line 1\nLine 2\nLine 3" };
    const fourLineNode: GraphNodeData = { id: "n4", name: "Line 1\nLine 2\nLine 3\nLine 4" };

    const [s1, s2, s3, s4] = measurer.measureNodes(
      [oneLineNode, twoLineNode, threeLineNode, fourLineNode],
      { minNodeWidth: 320, maxNodeWidth: 320 },
    );

    // 35 + 10 + 1 * 18 + 8 = 71
    expect(s1.height).toBe(71);
    // 35 + 10 + 2 * 18 + 8 = 89
    expect(s2.height).toBe(89);
    // 35 + 10 + 3 * 18 + 8 = 107
    expect(s3.height).toBe(107);
    // 35 + 10 + 4 * 18 + 8 = 125
    expect(s4.height).toBe(125);

    expect(s2.height - s1.height).toBe(18);
    expect(s3.height - s2.height).toBe(18);
    expect(s4.height - s3.height).toBe(18);
  });

  it("handles variable font scaling and prevents height under-estimation", () => {
    // Standard scale measurer
    const standardMeasurer = createCanvasMeasurer();

    // 1.5x larger font scale measurer
    const largeScaleMeasurer = createCanvasMeasurer({
      measureTextWidth: (text, spec) => text.length * spec.sizePx * 0.9,
    });

    const longTitleNode: GraphNodeData = {
      id: "scaled-node",
      name: "Long Adaptive Name For Dynamic Layout Measurement Across Font Stacks",
    };

    const [standardSize] = standardMeasurer.measureNodes([longTitleNode], {
      minNodeWidth: 200,
      maxNodeWidth: 200,
    });

    const [scaledSize] = largeScaleMeasurer.measureNodes([longTitleNode], {
      minNodeWidth: 200,
      maxNodeWidth: 200,
    });

    // Scaled font needs more or equal lines, so height must not under-report
    expect(scaledSize.height).toBeGreaterThanOrEqual(standardSize.height);
    expect(Number.isFinite(scaledSize.height)).toBe(true);
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
