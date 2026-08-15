import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import type { Rect } from "../../../engine/layout/custom/types";
import { EdgeBadgeOverlay } from "./EdgeBadgeOverlay";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 100x28 badge centred on (150, 100). */
const BADGE_RECT: Rect = { x: 100, y: 86, width: 100, height: 28 };

function hasDashedConnector(html: string): boolean {
  return html.includes("stroke-dasharray");
}

describe("EdgeBadgeOverlay connector", () => {
  it("draws no connector when the anchor sits inside the badge rect", () => {
    // This is the `on-edge` label placement, the default: the edge runs through the badge's
    // centre, so a dashed line to the anchor would point at the badge from inside itself.
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

  it("still renders the CYCLE badge with no label text", () => {
    const html = renderToString(<EdgeBadgeOverlay x={0} y={0} isCycle />);
    expect(html.includes("CYCLE")).toBe(true);
  });
});

describe("EdgeBadgeOverlay Semantic Types", () => {
  it("renders spawn badge with IconRocket and kind-spawn class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="spawn" label="dispatch agent" />,
    );
    expect(html).toContain("kind-spawn");
    expect(html).toContain("dispatch agent");
    expect(html).toContain("tabler-icon-rocket");
  });

  it("renders data badge with IconFileText and kind-data class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="data" label="output.json" />,
    );
    expect(html).toContain("kind-data");
    expect(html).toContain("output.json");
    expect(html).toContain("tabler-icon-file-text");
  });

  it("renders dependency badge with IconLink and kind-dependency class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="dependency" label="needs approval" />,
    );
    expect(html).toContain("kind-dependency");
    expect(html).toContain("needs approval");
    expect(html).toContain("tabler-icon-link");
  });

  it("renders loop badge with IconAlertTriangle and kind-loop class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="loop" label="rejection loop" />,
    );
    expect(html).toContain("kind-loop");
    expect(html).toContain("rejection loop");
    expect(html).toContain("tabler-icon-alert-triangle");
  });

  it("renders gate badge with IconShieldCheck and kind-gate class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="gate" label="security gate" />,
    );
    expect(html).toContain("kind-gate");
    expect(html).toContain("security gate");
    expect(html).toContain("tabler-icon-shield-check");
  });

  it("renders critic badge with IconCertificate and kind-critic class", () => {
    const html = renderToString(
      <EdgeBadgeOverlay x={100} y={100} kind="critic" label="final signoff" />,
    );
    expect(html).toContain("kind-critic");
    expect(html).toContain("final signoff");
    expect(html).toContain("tabler-icon-certificate");
  });

  it("renders rich container details with stepBadge and detail text", () => {
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
  });

  it("renders high-traffic glowing badge with traffic chip and bundle counter", () => {
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
    expect(html).toContain("12 msgs");
    expect(html).toContain("x4");
    expect(html).toContain("edge-traffic-chip");
    expect(html).toContain("edge-bundle-chip");
    expect(html).toContain("#06b6d4");
  });
});
