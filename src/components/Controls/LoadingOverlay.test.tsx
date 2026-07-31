import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { LoadingOverlay } from "./LoadingOverlay";

describe("LoadingOverlay Component", () => {
  it("renders 5-step visual stage indicators with checkmarks", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={65}
        stageText="Stage 3 of 5"
        detail="Computing A* orthogonal routes..."
        nodeCount={12}
        edgeCount={13}
      />
    );

    expect(html).toContain("Topology");
    expect(html).toContain("Ranking");
    expect(html).toContain("A* Routing");
    expect(html).toContain("Crossings");
    expect(html).toContain("Render");
    expect(html).toContain("65%");
  });
});

