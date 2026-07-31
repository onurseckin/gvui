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
    expect(html).toContain("is-done");
    expect(html).toContain("is-active");
    expect(html).toContain("✓");
  });

  it("renders checkmarks for all completed stages when progress is 100%", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={100}
        stageText="Complete"
        detail="Render complete"
      />
    );

    expect(html).toContain("100%");
    const checkmarkMatches = html.match(/✓/g);
    expect(checkmarkMatches).not.toBeNull();
    expect(checkmarkMatches?.length).toBe(5);
  });
});

