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

    // 1. Default neutral, selected & highlighted
    expect(html).toContain('id="edge-arrowhead"');
    expect(html).toContain('id="edge-arrowhead-selected"');
    expect(html).toContain('id="edge-arrowhead-highlighted"');

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

  it("harmonizes arrowhead marker colors dynamically using fill='context-stroke'", () => {
    const html = renderToString(
      <svg>
        <EdgeMarkerDefs />
      </svg>,
    );

    // All arrowheads and connected circles should dynamically inherit stroke color via context-stroke
    expect(html).toContain('fill="context-stroke"');

    // Confirm that hardcoded color fills are not used on arrowhead paths
    expect(html).not.toContain('fill="#06b6d4"');
    expect(html).not.toContain('fill="#6366f1"');
    expect(html).not.toContain('fill="#64748b"');
    expect(html).not.toContain('fill="#f43f5e"');
    expect(html).not.toContain('fill="#f59e0b"');
    expect(html).not.toContain('fill="#10b981"');
    expect(html).not.toContain('fill="#eab308"');
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
