import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { EdgeMarkerDefs } from "./EdgeMarkerDefs";

describe("EdgeMarkerDefs", () => {
  it("renders marker definitions for all source node archetypes, semantic edge kinds, and neutral default", () => {
    const html = renderToString(
      <svg>
        <EdgeMarkerDefs />
      </svg>,
    );

    // 1. Default neutral, selected & highlighted
    expect(html).toContain('id="edge-arrowhead"');
    expect(html).toContain('id="edge-arrowhead-default"');
    expect(html).toContain('id="edge-arrowhead-selected"');
    expect(html).toContain('id="edge-arrowhead-highlighted"');

    // 2. Source Node Archetype Markers
    expect(html).toContain('id="edge-arrowhead-prompt"');
    expect(html).toContain('id="edge-arrowhead-planner"');
    expect(html).toContain('id="edge-arrowhead-orchestrator"');
    expect(html).toContain('id="edge-arrowhead-worker"');
    expect(html).toContain('id="edge-arrowhead-agent"');
    expect(html).toContain('id="edge-arrowhead-gate"');
    expect(html).toContain('id="edge-arrowhead-critic"');
    expect(html).toContain('id="edge-arrowhead-loop"');

    // 3. Semantic Markers & Cycles
    expect(html).toContain('id="edge-arrowhead-spawn"');
    expect(html).toContain('id="edge-arrowhead-sequence"');
    expect(html).toContain('id="edge-arrowhead-data"');
    expect(html).toContain('id="edge-arrowhead-dependency"');
    expect(html).toContain('id="edge-arrowhead-cycle"');

    // 4. Circle Markers
    expect(html).toContain('id="edge-circle"');
    expect(html).toContain('id="edge-circle-connected"');
  });

  it("defines explicit colored fills for markers preventing Chromium context-stroke drop to black", () => {
    const html = renderToString(
      <svg>
        <EdgeMarkerDefs />
      </svg>,
    );

    // Explicit archetype colored fills
    expect(html).toContain('fill="#8b5cf6"'); // prompt
    expect(html).toContain('fill="#3b82f6"'); // planner / orchestrator
    expect(html).toContain('fill="#06b6d4"'); // worker / agent / spawn
    expect(html).toContain('fill="#10b981"'); // gate
    expect(html).toContain('fill="#818cf8"'); // critic / selected / highlighted
    expect(html).toContain('fill="#f43f5e"'); // loop / cycle
    expect(html).toContain('fill="#6366f1"'); // data
    expect(html).toContain('fill="#64748b"'); // dependency
    expect(html).toContain('fill="#94a3b8"'); // default / sequence
  });

  it("supports idPrefix when provided", () => {
    const html = renderToString(
      <svg>
        <EdgeMarkerDefs idPrefix="canvas-1" />
      </svg>,
    );

    expect(html).toContain('id="canvas-1-edge-arrowhead"');
    expect(html).toContain('id="canvas-1-edge-arrowhead-prompt"');
    expect(html).toContain('id="canvas-1-edge-arrowhead-planner"');
    expect(html).toContain('id="canvas-1-edge-arrowhead-worker"');
    expect(html).toContain('id="canvas-1-edge-arrowhead-spawn"');
    expect(html).toContain('id="canvas-1-edge-arrowhead-data"');
  });
});
