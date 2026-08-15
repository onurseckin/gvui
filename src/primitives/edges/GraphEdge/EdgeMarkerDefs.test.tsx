import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { EdgeMarkerDefs } from "./EdgeMarkerDefs";

describe("EdgeMarkerDefs", () => {
  it("renders marker definitions for all 7 semantic edge kinds and neutral default", () => {
    const html = renderToString(
      <svg>
        <EdgeMarkerDefs />
      </svg>,
    );

    // 1. Default neutral & selected
    expect(html).toContain('id="edge-arrowhead"');
    expect(html).toContain('id="edge-arrowhead-selected"');

    // 2. 7 Semantic Markers
    expect(html).toContain('id="edge-arrowhead-spawn"');
    expect(html).toContain('id="edge-arrowhead-sequence"');
    expect(html).toContain('id="edge-arrowhead-data"');
    expect(html).toContain('id="edge-arrowhead-dependency"');
    expect(html).toContain('id="edge-arrowhead-loop"');
    expect(html).toContain('id="edge-arrowhead-gate"');
    expect(html).toContain('id="edge-arrowhead-critic"');

    // 3. Cycle & Circles
    expect(html).toContain('id="edge-arrowhead-cycle"');
    expect(html).toContain('id="edge-circle"');
    expect(html).toContain('id="edge-circle-connected"');
  });

  it("supports idPrefix when provided", () => {
    const html = renderToString(
      <svg>
        <EdgeMarkerDefs idPrefix="canvas-1" />
      </svg>,
    );

    expect(html).toContain('id="canvas-1-edge-arrowhead"');
    expect(html).toContain('id="canvas-1-edge-arrowhead-spawn"');
    expect(html).toContain('id="canvas-1-edge-arrowhead-data"');
  });
});
