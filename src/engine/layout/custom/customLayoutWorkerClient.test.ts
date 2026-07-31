import { describe, expect, it } from "bun:test";
import { computeCustomLayoutAsync } from "./customLayoutWorkerClient";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("customLayoutWorkerClient", () => {
  it("resolves layout asynchronously via computeCustomLayoutAsync fallback or worker", async () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const result = await computeCustomLayoutAsync({ nodes, edges, timeoutMs: 3000 });

    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
    expect(result.validation.isValid).toBe(true);
  });

  it("handles cancellation via AbortSignal", async () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const controller = new AbortController();
    controller.abort();

    let errorEmitted = false;
    try {
      await computeCustomLayoutAsync({ nodes, edges, signal: controller.signal });
    } catch (err) {
      errorEmitted = true;
      expect((err as Error).message).toContain("cancelled");
    }
    expect(errorEmitted).toBe(true);
  });
});
