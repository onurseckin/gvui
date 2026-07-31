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

    expect(html).toContain("loading-overlay-backdrop");
    expect(html).toContain("Computing A* orthogonal routes...");
    expect(html).not.toContain("loading-overlay-card");
    expect(html).not.toContain("Topology");
    expect(html).not.toContain("✓");
  });

  it("falls back to stageText when detail is empty", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={50}
        stageText="Processing layout..."
        detail=""
      />
    );

    expect(html).toContain("Processing layout...");
    expect(html).not.toContain("loading-overlay-card");
  });
});


