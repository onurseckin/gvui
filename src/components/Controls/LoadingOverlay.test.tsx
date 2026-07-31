import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { LoadingOverlay } from "./LoadingOverlay";

describe("LoadingOverlay Component", () => {
  it("renders minimalist loading overlay with detail text", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={65}
        stageText="Stage 3 of 5"
        detail="Computing A* orthogonal routes..."
      />
    );

    expect(html.includes("loading-overlay-backdrop")).toBe(true);
    expect(html.includes("Computing A* orthogonal routes...")).toBe(true);
    expect(html.includes("loading-overlay-card")).toBe(false);
    expect(html.includes("Topology")).toBe(false);
    expect(html.includes("✓")).toBe(false);
  });

  it("falls back to stageText when detail is empty", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={50}
        stageText="Processing layout..."
        detail=""
      />
    );

    expect(html.includes("Processing layout...")).toBe(true);
    expect(html.includes("loading-overlay-card")).toBe(false);
  });
});


