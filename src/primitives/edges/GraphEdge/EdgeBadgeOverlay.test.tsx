import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import type { Rect } from "../../../engine/layout/custom/types";
import { EdgeBadgeOverlay, MAX_BADGE_WIDTH, resolveEdgeDisplayText } from "./EdgeBadgeOverlay";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 100x28 badge centred on (150, 100). */
const BADGE_RECT: Rect = { x: 100, y: 86, width: 100, height: 28 };

function hasDashedConnector(html: string): boolean {
  return html.includes("stroke-dasharray");
}

describe("resolveEdgeDisplayText", () => {
  it("strips legacy 'CYCLE (...)' wrapper from title", () => {
    expect(resolveEdgeDisplayText("CYCLE (Repair Task #2)", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task #2",
    );
    expect(resolveEdgeDisplayText("CYCLE(Repair Task #2)", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task #2",
    );
  });

  it("strips legacy 'CYCLE:' and 'CYCLE -' prefixes from title", () => {
    expect(resolveEdgeDisplayText("CYCLE: Fix lint error", "LOOP / PUSHBACK", true)).toBe(
      "Fix lint error",
    );
    expect(resolveEdgeDisplayText("CYCLE - Retry execution", "LOOP / PUSHBACK", true)).toBe(
      "Retry execution",
    );
  });

  it("strips compound and nested cycle prefixes robustly without stray brackets or punctuation", () => {
    expect(resolveEdgeDisplayText("CYCLE: (Repair Task #1)", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task #1",
    );
    expect(resolveEdgeDisplayText("CYCLE - (Repair Task)", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task",
    );
    expect(resolveEdgeDisplayText("CYCLE: Repair Task", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task",
    );
    expect(resolveEdgeDisplayText("Cycle [Repair Task]", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task",
    );
    expect(resolveEdgeDisplayText("CYCLE: [Repair Task #1]", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task #1",
    );
    expect(resolveEdgeDisplayText("CYCLE: {Repair Task #1}", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task #1",
    );
    expect(resolveEdgeDisplayText("CYCLE: <Repair Task #1>", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task #1",
    );
    expect(resolveEdgeDisplayText("CYCLE: ((Repair Task))", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task",
    );
    expect(resolveEdgeDisplayText("CYCLE: - (Retry loop)", "LOOP / PUSHBACK", true)).toBe(
      "Retry loop",
    );
  });

  it("preserves nested inner parentheses when only outer cycle brackets are stripped", () => {
    expect(resolveEdgeDisplayText("CYCLE: (Repair Task (v2))", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task (v2)",
    );
    expect(resolveEdgeDisplayText("CYCLE: Repair Task (v2)", "LOOP / PUSHBACK", true)).toBe(
      "Repair Task (v2)",
    );
  });

  it("returns 'Feedback Loop' when cycle title is empty or just 'CYCLE' or empty brackets", () => {
    expect(resolveEdgeDisplayText("CYCLE", "LOOP / PUSHBACK", true)).toBe("Feedback Loop");
    expect(resolveEdgeDisplayText("CYCLE: ", "LOOP / PUSHBACK", true)).toBe("Feedback Loop");
    expect(resolveEdgeDisplayText("CYCLE: ()", "LOOP / PUSHBACK", true)).toBe("Feedback Loop");
    expect(resolveEdgeDisplayText("CYCLE: []", "LOOP / PUSHBACK", true)).toBe("Feedback Loop");
    expect(resolveEdgeDisplayText("CYCLE: {}", "LOOP / PUSHBACK", true)).toBe("Feedback Loop");
    expect(resolveEdgeDisplayText("", "LOOP / PUSHBACK", true)).toBe("Feedback Loop");
    expect(resolveEdgeDisplayText(undefined, "LOOP / PUSHBACK", true)).toBe("Feedback Loop");
    expect(resolveEdgeDisplayText("   ", "LOOP / PUSHBACK", true)).toBe("Feedback Loop");
  });

  it("returns descriptor label when non-cycle title is undefined or empty", () => {
    expect(resolveEdgeDisplayText(undefined, "SEQUENCE", false)).toBe("SEQUENCE");
    expect(resolveEdgeDisplayText("", "SPAWN / DISPATCH", false)).toBe("SPAWN / DISPATCH");
  });

  it("returns raw title when non-cycle has custom label", () => {
    expect(resolveEdgeDisplayText("custom step data", "DATA HANDOFF", false)).toBe(
      "custom step data",
    );
  });
});

describe("EdgeBadgeOverlay connector", () => {
  it("draws no connector when the anchor sits inside the badge rect", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={150}
        y={100}
        label="retries: 3"
        badgeRect={BADGE_RECT}
        anchorPoint={{ x: 150, y: 100 }}
      />,
    );
    expect(html.includes("retries: 3")).toBe(true);
    expect(hasDashedConnector(html)).toBe(false);
  });

  it("draws no connector for an anchor that is off-centre but still under the badge", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={150}
        y={100}
        label="ok"
        badgeRect={BADGE_RECT}
        anchorPoint={{ x: 190, y: 92 }}
      />,
    );
    expect(hasDashedConnector(html)).toBe(false);
  });

  it("draws no connector for an anchor exactly on the badge boundary", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={150}
        y={100}
        label="ok"
        badgeRect={BADGE_RECT}
        anchorPoint={{ x: 200, y: 114 }}
      />,
    );
    expect(hasDashedConnector(html)).toBe(false);
  });

  it("draws a connector when the anchor falls outside the badge rect", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={150}
        y={100}
        label="ok"
        badgeRect={BADGE_RECT}
        anchorPoint={{ x: 320, y: 100 }}
      />,
    );
    expect(hasDashedConnector(html)).toBe(true);
    expect(html.includes("<line")).toBe(true);
    expect(html.includes('x1="170"')).toBe(true);
    expect(html.includes('y1="0"')).toBe(true);
    expect(html.includes('x2="0"')).toBe(true);
    expect(html.includes('y2="0"')).toBe(true);
  });

  it("renders a genuine leader path when its anchor is outside the badge", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={150}
        y={100}
        label="ok"
        badgeRect={BADGE_RECT}
        anchorPoint={{ x: 320, y: 240 }}
        leaderPoints={[
          { x: 320, y: 240 },
          { x: 260, y: 160 },
          { x: 150, y: 100 },
        ]}
      />,
    );
    expect(hasDashedConnector(html)).toBe(true);
    expect(html.includes("<path")).toBe(true);
    expect(html.includes('d="M 170 140 L 110 60 L 0 0"')).toBe(true);
  });

  it("suppresses the leader path too when its anchor is inside the badge", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={150}
        y={100}
        label="ok"
        badgeRect={BADGE_RECT}
        anchorPoint={{ x: 150, y: 100 }}
        leaderPoints={[
          { x: 150, y: 100 },
          { x: 150, y: 102 },
        ]}
      />,
    );
    expect(hasDashedConnector(html)).toBe(false);
    expect(html.includes("<path")).toBe(false);
  });

  it("draws no connector when there is no anchor at all", () => {
    const html = renderToString(<EdgeBadgeOverlay x={150} y={100} label="ok" />);
    expect(hasDashedConnector(html)).toBe(false);
  });

  it("renders nothing without a label or a cycle flag or kind", () => {
    expect(renderToString(<EdgeBadgeOverlay x={0} y={0} label="   " />)).toBe("");
  });

  it("renders Feedback Loop badge for cycle with no label text", () => {
    const html = renderToString(<EdgeBadgeOverlay x={0} y={0} isCycle />);
    expect(html.includes("Feedback Loop")).toBe(true);
    expect(html.includes("CYCLE (")).toBe(false);
  });

  it("renders raw cycle text when title has legacy CYCLE wrapper", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={0} y={0} isCycle label="CYCLE (Repair Pass #2)" />,
    );
    expect(html.includes("Repair Pass #2")).toBe(true);
    expect(html.includes("CYCLE (")).toBe(false);
  });
});

describe("EdgeBadgeOverlay Semantic Types", () => {
  it("renders spawn badge with clean typography and kind-spawn class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="spawn" label="dispatch agent" />,
    );
    expect(html).toContain("kind-spawn");
    expect(html).toContain("dispatch agent");
    expect(html).not.toContain("tabler-icon");
  });

  it("renders data badge with clean typography and kind-data class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="data" label="output.json" />,
    );
    expect(html).toContain("kind-data");
    expect(html).toContain("output.json");
    expect(html).not.toContain("tabler-icon");
  });

  it("renders dependency badge with clean typography and kind-dependency class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="dependency" label="needs approval" />,
    );
    expect(html).toContain("kind-dependency");
    expect(html).toContain("needs approval");
    expect(html).not.toContain("tabler-icon");
  });

  it("renders loop badge with clean typography and kind-loop class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="loop" label="rejection loop" />,
    );
    expect(html).toContain("kind-loop");
    expect(html).toContain("rejection loop");
    expect(html).not.toContain("tabler-icon");
  });

  it("renders gate badge with clean typography and kind-gate class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="gate" label="security gate" />,
    );
    expect(html).toContain("kind-gate");
    expect(html).toContain("security gate");
    expect(html).not.toContain("tabler-icon");
  });

  it("renders critic badge with clean typography and kind-critic class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="critic" label="final signoff" />,
    );
    expect(html).toContain("kind-critic");
    expect(html).toContain("final signoff");
    expect(html).not.toContain("tabler-icon");
  });

  it("renders rich container details with pure numeric stepBadge and detail text", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={100}
        y={100}
        kind="spawn"
        container={{
          stepBadge: "04",
          title: "Dispatch Worker",
          detail: "2.4k tokens",
          variant: "cyan",
        }}
      />,
    );
    expect(html).toContain("04");
    expect(html).toContain("Dispatch Worker");
    expect(html).toContain("2.4k tokens");
    expect(html).not.toContain("Step 04");
  });

  it("strips 'Step' prefix from stepNumber or container", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} stepNumber="Step 2" label="Dispatches Task" />,
    );
    expect(html).toContain("2");
    expect(html).toContain("Dispatches Task");
    expect(html).not.toContain("Step 2");
  });

  it("renders high-traffic glowing badge with bundle counter and without on-canvas traffic chips", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={100}
        y={100}
        kind="data"
        label="Context Sync Stream"
        bundleCount={4}
        traffic={{
          volume: 12,
          messagesCount: 12,
          tokens: 45200,
          status: "active",
          glowColor: "#06b6d4",
          glowIntensity: 0.8,
        }}
        isHighTraffic={true}
      />,
    );

    expect(html).toContain("high-traffic");
    expect(html).toContain("Context Sync Stream");
    expect(html).toContain("x4");
    expect(html).toContain("edge-bundle-chip");
    expect(html).not.toContain("edge-traffic-chip");
    expect(html).toContain("#06b6d4");
  });

  it("propagates sourceAccentColor via CSS variable and style", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={100}
        y={100}
        kind="sequence"
        label="Accent Handoff"
        sourceAccentColor="#8b5cf6"
      />,
    );
    expect(html).toContain("--edge-source-accent:#8b5cf6");
  });

  it("renders with centered flex typography and text-align center", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="spawn" label="Centered Text" />,
    );
    expect(html).toContain("justify-content:center");
    expect(html).toContain("text-align:center");
    expect(html).toContain("min-width:0");
    expect(html).toContain("flex-shrink:1");
    expect(html).toContain("Centered Text");
  });

  it("exports MAX_BADGE_WIDTH equal to 280 and clamps badge width to MAX_BADGE_WIDTH for long labels", () => {
    expect(MAX_BADGE_WIDTH).toBe(280);

    const veryLongText =
      "This is an extraordinarily long edge label description that exceeds the maximum allowed overlay badge width threshold and must be truncated with ellipsis";
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="data" label={veryLongText} />,
    );

    // Bounded by MAX_BADGE_WIDTH (280)
    expect(html).toContain(`width="${MAX_BADGE_WIDTH}"`);
    expect(html).toContain(`x="-${MAX_BADGE_WIDTH / 2}"`);
    expect(html).toContain(veryLongText);
    expect(html).toContain("edge-badge-label");
  });

  it("applies is-hovered class when isHovered prop is true", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="spawn" label="Hovered Overlay" isHovered={true} />,
    );
    expect(html).toContain("edge-badge-group");
    expect(html).toContain("is-hovered");
    expect(html).toContain("edge-badge-rect");
  });

  it("does not attach role='button' or tabIndex for static non-interactive badges", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="spawn" label="Static Non-interactive" />,
    );
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('tabindex="0"');
    expect(html).toContain("cursor:default");
  });

  it("attaches role='button' and tabIndex={0} when onClick or badge.clickable is true", () => {
    const htmlWithOnClick = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="spawn" label="Clickable Action" onClick={() => {}} />,
    );
    expect(htmlWithOnClick).toContain('role="button"');
    expect(htmlWithOnClick).toContain('tabindex="0"');
    expect(htmlWithOnClick).toContain("is-clickable");
    expect(htmlWithOnClick).toContain("cursor:pointer");

    const htmlWithBadgeClickable = renderToString(
      <EdgeBadgeOverlay
        x={100}
        y={100}
        kind="data"
        badge={{ text: "Data Payload", clickable: true }}
      />,
    );
    expect(htmlWithBadgeClickable).toContain('role="button"');
    expect(htmlWithBadgeClickable).toContain('tabindex="0"');
  });

  it("handles keyboard Enter and Space activation via onKeyDown on interactive badge", async () => {
    const { create, act } = await import("react-test-renderer");
    let clicked = false;

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <svg>
          <EdgeBadgeOverlay
            x={100}
            y={100}
            kind="spawn"
            label="Interactive Badge"
            onClick={() => {
              clicked = true;
            }}
          />
        </svg>,
      );
    });

    const root = renderer!.root;
    const group = root.findByProps({ role: "button" });

    // Press Enter
    clicked = false;
    act(() => {
      group.props.onKeyDown({
        key: "Enter",
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });
    expect(clicked).toBe(true);

    // Press Space
    clicked = false;
    act(() => {
      group.props.onKeyDown({
        key: " ",
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });
    expect(clicked).toBe(true);

    // Press non-activation key
    clicked = false;
    act(() => {
      group.props.onKeyDown({
        key: "ArrowRight",
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });
    expect(clicked).toBe(false);
  });

  it("includes focus-visible outline indicator styling in EdgeBadgeOverlay.css", () => {
    const css = readFileSync(new URL("./EdgeBadgeOverlay.css", import.meta.url).pathname, "utf-8");
    expect(css).toContain(".edge-badge-group:focus-visible");
    expect(css).toContain("outline: 2px solid var(--accent-color, #818cf8)");
    expect(css).toContain("outline-offset: 2px");
  });
});
