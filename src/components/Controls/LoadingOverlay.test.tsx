import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { LoadingOverlay } from "./LoadingOverlay";

describe("LoadingOverlay Component", () => {
  it("renders stage name, percentage, and detail message", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={65}
        stageText="Stage 3 of 5"
        detail="Computing A* orthogonal routes..."
        nodeCount={12}
        edgeCount={13}
      />
    );

    expect(html).toContain("65%");
    expect(html).toContain("Stage 3 of 5");
    expect(html).toContain("Computing A* orthogonal routes...");
    expect(html).toContain("12 Nodes");
    expect(html).toContain("13 Edges");
  });
});
