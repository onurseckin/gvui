import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import type { Rect } from "../../../engine/layout/custom/types";
import {
  EdgeBadgeOverlay,
  MAX_BADGE_WIDTH,
  MAX_DETAIL_LENGTH,
  formatCompactBadgeDetail,
  resolveEdgeDisplayText,
  sanitizeStepBadge,
} from "./EdgeBadgeOverlay";
import { EDGE_KIND_DESCRIPTORS } from "./edgeKinds";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 100x28 badge centred on (150, 100). */
const BADGE_RECT: Rect = { x: 100, y: 86, width: 100, height: 28 };

function hasDashedConnector(html: string): boolean {
  return html.includes("stroke-dasharray");
}

describe("sanitizeStepBadge", () => {
  it("strips 'Step', 'step:', 'Step -', etc. and returns pure step identifiers", () => {
    expect(sanitizeStepBadge("Step 2")).toBe("2");
    expect(sanitizeStepBadge("step: 04")).toBe("04");
    expect(sanitizeStepBadge("Step-3")).toBe("3");
    expect(sanitizeStepBadge(5)).toBe("5");
    expect(sanitizeStepBadge("3 -> 2")).toBe("3 -> 2");
  });

  it("returns undefined for undefined, null, or empty step values", () => {
    expect(sanitizeStepBadge(undefined)).toBe(undefined);
    expect(sanitizeStepBadge(null as unknown as undefined)).toBe(undefined);
    expect(sanitizeStepBadge("")).toBe(undefined);
    expect(sanitizeStepBadge("   ")).toBe(undefined);
  });
});

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

  it("propagates the edge's own accent via CSS variable and style", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={100}
        y={100}
        kind="sequence"
        label="Accent Handoff"
        accentColor="#8b5cf6"
      />,
    );
    expect(html).toContain("--edge-kind-stroke:#8b5cf6");
  });

  it("falls back to the kind accent so a badge never borrows a node colour", () => {
    const html = renderToString(<EdgeBadgeOverlay x={100} y={100} kind="probe" label="prove it" />);
    expect(html).toContain("--edge-kind-stroke:#38bdf8");
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

describe("formatCompactBadgeDetail", () => {
  it("exports MAX_DETAIL_LENGTH equal to 24", () => {
    expect(MAX_DETAIL_LENGTH).toBe(24);
  });

  it("preserves short detail chips intact", () => {
    expect(formatCompactBadgeDetail("3 Findings")).toBe("3 Findings");
    expect(formatCompactBadgeDetail("2.4k tokens")).toBe("2.4k tokens");
    expect(formatCompactBadgeDetail("Pass")).toBe("Pass");
  });

  it("strictly respects the 24-character exact boundary", () => {
    const exactly24 = "123456789012345678901234";
    expect(exactly24.length).toBe(24);
    expect(formatCompactBadgeDetail(exactly24)).toBe("123456789012345678901234");

    const exactly23 = "12345678901234567890123";
    expect(exactly23.length).toBe(23);
    expect(formatCompactBadgeDetail(exactly23)).toBe("12345678901234567890123");

    const exactly25 = "1234567890123456789012345";
    expect(exactly25.length).toBe(25);
    const res25 = formatCompactBadgeDetail(exactly25);
    expect(res25).toBeDefined();
    expect(res25!.length).toBe(24);
    expect(res25).toBe("123456789012345678901...");
  });

  it("truncates multi-line sentence details to max 24 chars with ellipsis", () => {
    const longDetail = "This worker performs task validation and analysis across multiple files";
    const truncated = formatCompactBadgeDetail(longDetail);
    expect(truncated).toBeDefined();
    expect(truncated!.length).toBeLessThanOrEqual(24);
    expect(truncated!.endsWith("...")).toBe(true);
    expect(truncated).toBe("This worker performs...");
  });

  it("handles extreme detail lengths (2000+ chars) gracefully", () => {
    const extremeDetail = "A".repeat(3000);
    const truncated = formatCompactBadgeDetail(extremeDetail);
    expect(truncated).toBeDefined();
    expect(truncated!.length).toBe(24);
    expect(truncated).toBe(`${"A".repeat(21)}...`);
  });

  it("trims trailing whitespace before ellipsis cleanly", () => {
    // 20 characters before spaces, so slice(0, 21) takes 20 chars + 1 space -> trimEnd -> 20 chars + "..."
    const spaceBeforeCut = "12345678901234567890   subsequent text";
    const truncated = formatCompactBadgeDetail(spaceBeforeCut);
    expect(truncated).toBeDefined();
    expect(truncated!.length).toBeLessThanOrEqual(24);
    expect(truncated).toBe("12345678901234567890...");
  });

  it("handles unicode and emojis in detail text cleanly", () => {
    const unicodeDetail = "🎯 5 Validator Pushbacks Logged in Audit";
    const truncated = formatCompactBadgeDetail(unicodeDetail);
    expect(truncated).toBeDefined();
    expect(truncated!.length).toBeLessThanOrEqual(24);
    expect(truncated!.endsWith("...")).toBe(true);
  });

  it("flattens multi-line details with newlines and carriage returns before truncating", () => {
    const multilineDetail = "First line\nSecond line\r\nThird line detail";
    const formatted = formatCompactBadgeDetail(multilineDetail);
    expect(formatted).toBeDefined();
    expect(formatted).not.toContain("\n");
    expect(formatted).not.toContain("\r");
    expect(formatted!.length).toBeLessThanOrEqual(24);
    expect(formatted).toBe("First line Second lin...");
  });

  it("returns undefined for empty, null, or whitespace-only details", () => {
    expect(formatCompactBadgeDetail(undefined)).toBe(undefined);
    expect(formatCompactBadgeDetail("")).toBe(undefined);
    expect(formatCompactBadgeDetail("   \n\t  ")).toBe(undefined);
  });
});

describe("Edge Prefix Cleaning in resolveEdgeDisplayText", () => {
  it("strips 'EDGE:', 'EDGE -', and 'edge: ' prefixes cleanly", () => {
    expect(resolveEdgeDisplayText("EDGE: Dispatches Worker", "SPAWN", false)).toBe(
      "Dispatches Worker",
    );
    expect(resolveEdgeDisplayText("EDGE - Dispatches Worker", "SPAWN", false)).toBe(
      "Dispatches Worker",
    );
    expect(resolveEdgeDisplayText("edge: payload data", "DATA", false)).toBe("payload data");
  });

  it("collapses internal multi-line and extra whitespace to single spaces", () => {
    expect(resolveEdgeDisplayText("Validator\nPushback\n  (Round 3)  ", "LOOP", false)).toBe(
      "Validator Pushback (Round 3)",
    );
  });
});

describe("Redundant Step Prefix Cleaner in EdgeBadgeOverlay", () => {
  it("cleans redundant 'Step X:' prefix from label when stepNumber or container stepBadge is already set", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={100}
        y={100}
        kind="spawn"
        stepNumber={2}
        label="Step 2: Dispatches Worker"
      />,
    );
    expect(html).toContain("2");
    expect(html).toContain("Dispatches Worker");
    expect(html).not.toContain("Step 2: Dispatches Worker");
  });

  it("renders concise chips like 'Validator Pushback (Round 3)' with detail '3 Findings'", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={100}
        y={100}
        kind="loop"
        container={{
          title: "Validator Pushback (Round 3)",
          detail: "3 Findings",
        }}
      />,
    );
    expect(html).toContain("Validator Pushback (Round 3)");
    expect(html).toContain("3 Findings");
    expect(html).toContain("edge-badge-detail");
  });
});

describe("Native HTML Badge Overlay Support", () => {
  it("renders native HTML <div> without <foreignObject> when renderMode='html' or asHtml={true}", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={150}
        y={100}
        kind="spawn"
        label="Dispatches Worker"
        stepNumber="2"
        renderMode="html"
      />,
    );

    expect(html).toContain("edge-badge-html-overlay");
    expect(html).toContain("edge-badge-group");
    expect(html).toContain("kind-spawn");
    expect(html).toContain("Dispatches Worker");
    expect(html).toContain("2");
    expect(html).not.toContain("<foreignObject");
    expect(html).not.toContain("<g");
    expect(html).not.toContain("<rect");
  });

  it("supports interactive click and keyboard navigation in native HTML mode", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={150}
        y={100}
        kind="gate"
        label="Validation Gate"
        asHtml={true}
        onClick={() => {}}
      />,
    );

    expect(html).toContain("edge-badge-html-overlay");
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("is-clickable");
    expect(html).not.toContain("<foreignObject");
  });

  it("includes CSS styling for .edge-badge-html-overlay in EdgeBadgeOverlay.css", () => {
    const css = readFileSync(new URL("./EdgeBadgeOverlay.css", import.meta.url).pathname, "utf-8");
    expect(css).toContain(".edge-badge-html-overlay");
    expect(css).toContain(".edge-step-badge");
    expect(css).toContain(".edge-bundle-chip");
    expect(css).toContain(".edge-badge-detail");
  });
});

describe("Extreme Label Length & Complex Boundary Handling", () => {
  it("bounds extreme length labels (1000+ chars) to MAX_BADGE_WIDTH in SVG mode", () => {
    const extremeLabel = "VeryLongLabelWord_".repeat(60);
    const html = renderToString(
      <EdgeBadgeOverlay x={200} y={150} kind="data" label={extremeLabel} />,
    );

    expect(html).toContain(`width="${MAX_BADGE_WIDTH}"`);
    expect(html).toContain(`x="-${MAX_BADGE_WIDTH / 2}"`);
    expect(html).toContain("edge-badge-label");
  });

  it("bounds extreme length labels in native HTML mode", () => {
    const extremeLabel = "VeryLongLabelWord_".repeat(60);
    const html = renderToString(
      <EdgeBadgeOverlay x={200} y={150} kind="data" label={extremeLabel} asHtml={true} />,
    );

    expect(html).toContain("edge-badge-html-overlay");
    expect(html).toContain(`width:${MAX_BADGE_WIDTH}px`);
    expect(html).toContain(`left:${200 - MAX_BADGE_WIDTH / 2}px`);
  });

  it("cleans complex deeply nested prefix noise and multiline whitespace cleanly", () => {
    const noisyLabel = "  \n  EDGE: [CYCLE - (Step 4: Dispatch Subagent Worker Process)] \n ";
    expect(resolveEdgeDisplayText(noisyLabel, "SPAWN", true)).toBe(
      "Step 4: Dispatch Subagent Worker Process",
    );

    // If rendered with stepNumber = 4, redundant step prefix is stripped
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="spawn" stepNumber={4} label={noisyLabel} />,
    );
    expect(html).toContain("4");
    expect(html).toContain("Dispatch Subagent Worker Process");
    expect(html).not.toContain("Step 4: Dispatch");
  });
});

describe("Semantic Edge Kinds & Centered Typography Audit", () => {
  const allKinds = (
    [
      "spawn",
      "sequence",
      "data",
      "dependency",
      "loop",
      "gate",
      "critic",
      "probe",
      "pushback",
    ] as const
  ).map((kind) => ({
    kind,
    expectedClass: `kind-${kind}`,
    label: EDGE_KIND_DESCRIPTORS[kind].label,
    color: EDGE_KIND_DESCRIPTORS[kind].accent,
  }));

  it("renders each semantic kind in SVG mode with centered layout and balanced padding", () => {
    for (const item of allKinds) {
      const html = renderToString(
        <EdgeBadgeOverlay x={120} y={80} kind={item.kind} label={item.label} />,
      );

      expect(html).toContain(item.expectedClass);
      expect(html).toContain(item.label);
      expect(html).toContain("justify-content:center");
      expect(html).toContain("text-align:center");
      expect(html).toContain("padding:0 8px");
      expect(html).toContain("box-sizing:border-box");
    }
  });

  it("renders each semantic kind in Native HTML mode with centered layout and balanced padding", () => {
    for (const item of allKinds) {
      const html = renderToString(
        <EdgeBadgeOverlay x={120} y={80} kind={item.kind} label={item.label} renderMode="html" />,
      );

      expect(html).toContain("edge-badge-html-overlay");
      expect(html).toContain(item.expectedClass);
      expect(html).toContain(item.label);
      expect(html).toContain("justify-content:center");
      expect(html).toContain("text-align:center");
      expect(html).toContain("padding:0 8px");
    }
  });

  it("stamps each kind's colours onto the badge from the descriptor table", () => {
    for (const item of allKinds) {
      const html = renderToString(
        <EdgeBadgeOverlay x={120} y={80} kind={item.kind} label={item.label} />,
      );
      expect(html).toContain(`--edge-kind-stroke:${item.color}`);
      expect(html).toContain(`--edge-kind-text:${EDGE_KIND_DESCRIPTORS[item.kind].badgeTextColor}`);
    }
  });

  it("takes its colours from the descriptor properties rather than a per-kind block", () => {
    const css = readFileSync(new URL("./EdgeBadgeOverlay.css", import.meta.url).pathname, "utf-8");

    expect(css).toContain("--edge-kind-stroke");
    expect(css).toContain("--edge-kind-text");
    expect(css).toContain("--edge-kind-badge-bg");
    expect(css).toContain("--edge-kind-badge-border");
    for (const item of allKinds) {
      expect(css).not.toContain(`.edge-badge-group.${item.expectedClass}`);
    }

    // Typography centering & zero whitespace gap properties still live here.
    expect(css).toContain("justify-content: center");
    expect(css).toContain("text-align: center");
    expect(css).toContain("padding: 0 8px");
    expect(css).toContain("box-sizing: border-box");
    expect(css).toContain("text-overflow: ellipsis");
  });
});

describe("High-Traffic & Bundle Badge Rendering", () => {
  it("renders high-traffic glow and bundle counter chip in SVG mode", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={150}
        y={100}
        kind="data"
        label="Context Pipe"
        bundleCount={6}
        isHighTraffic={true}
        traffic={{
          volume: 18,
          messagesCount: 18,
          status: "congested",
          glowColor: "#06b6d4",
        }}
      />,
    );

    expect(html).toContain("high-traffic");
    expect(html).toContain("x6");
    expect(html).toContain("edge-bundle-chip");
    expect(html).toContain("Context Pipe");
    expect(html).toContain("#06b6d4");
    expect(html).toContain("drop-shadow(0 0 6px #06b6d4)");
  });

  it("renders high-traffic glow and bundle counter chip in Native HTML mode", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={150}
        y={100}
        kind="spawn"
        label="Worker Stream"
        bundleCount={4}
        isHighTraffic={true}
        renderMode="html"
      />,
    );

    expect(html).toContain("edge-badge-html-overlay");
    expect(html).toContain("high-traffic");
    expect(html).toContain("x4");
    expect(html).toContain("edge-bundle-chip");
    expect(html).toContain("Worker Stream");
  });

  it("does not render bundle chip when bundleCount is 1 or undefined", () => {
    const htmlSingle = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="sequence" label="Single Flow" bundleCount={1} />,
    );
    expect(htmlSingle).not.toContain("edge-bundle-chip");
    expect(htmlSingle).not.toContain("x1");

    const htmlUndefined = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="sequence" label="Undefined Flow" />,
    );
    expect(htmlUndefined).not.toContain("edge-bundle-chip");
  });

  it("automatically triggers high-traffic styling when traffic status is congested", () => {
    const html = renderToString(
      <EdgeBadgeOverlay
        x={100}
        y={100}
        kind="data"
        label="Heavy Pipe"
        traffic={{ status: "congested" }}
      />,
    );
    expect(html).toContain("high-traffic");
  });

  it("automatically triggers high-traffic styling for feedback loops (cycles)", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="loop" isCycle={true} label="Feedback Loop" />,
    );
    expect(html).toContain("high-traffic");
    expect(html).toContain("cycle");
  });
});

describe("A declared kind outranks isCycle in the badge label", () => {
  it("labels a declared probe back-edge PROBE, not Feedback Loop", () => {
    const html = renderToString(<EdgeBadgeOverlay x={150} y={100} kind="probe" isCycle />);
    expect(html).toContain(EDGE_KIND_DESCRIPTORS.probe.label);
    expect(html).not.toContain("Feedback Loop");
    expect(html).not.toContain("variant-loop");
  });

  it("labels a declared pushback back-edge PUSHBACK, not Feedback Loop", () => {
    const html = renderToString(<EdgeBadgeOverlay x={150} y={100} kind="pushback" isCycle />);
    expect(html).toContain(EDGE_KIND_DESCRIPTORS.pushback.label);
    expect(html).not.toContain("Feedback Loop");
  });

  it("still names a back-edge that declared no kind at all", () => {
    const html = renderToString(<EdgeBadgeOverlay x={150} y={100} isCycle />);
    expect(html).toContain("Feedback Loop");
  });
});
