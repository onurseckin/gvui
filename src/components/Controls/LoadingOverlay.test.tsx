import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { LoadingOverlay } from "./LoadingOverlay";

// Tell React 19 test utilities that act(...) environment is enabled
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LoadingOverlay Component", () => {
  it("renders minimalist loading overlay with detail text", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={65}
        stageText="Stage 3 of 5"
        detail="Computing A* orthogonal routes..."
      />,
    );

    expect(html.includes("loading-overlay-backdrop")).toBe(true);
    expect(html.includes("Computing A* orthogonal routes...")).toBe(true);
  });

  it("falls back to stageText when detail is empty", () => {
    const html = renderToString(
      <LoadingOverlay percent={50} stageText="Processing layout..." detail="" />,
    );

    expect(html.includes("Processing layout...")).toBe(true);
  });
});
