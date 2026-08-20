import { describe, expect, test } from "bun:test";
import { exportGraphAsHTML } from "./htmlExporter";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../types/graphData";

function positioned(node: Partial<PositionedNode>): PositionedNode {
  return {
    id: "n1",
    name: "Implementer",
    kind: "agent",
    x: 0,
    y: 0,
    width: 240,
    height: 120,
    ...node,
  } as PositionedNode;
}

interface DownloadHost {
  document: { createElement: () => Record<string, unknown>; body: Record<string, () => void> };
}

/**
 * The exporter finishes by handing its blob to an anchor click, and these tests run without a DOM.
 * Standing one up for the duration of the call keeps the assertions on the document the exporter
 * wrote rather than on the browser plumbing that delivers it.
 */
async function exportedHtml(
  nodes: PositionedNode[],
  edges: PositionedEdge[] = [],
): Promise<string> {
  const dataset: GraphDataset = { id: "d", title: "Export", nodes, edges };
  let captured: Blob | undefined;

  const host = globalThis as unknown as Partial<DownloadHost>;
  const priorDocument = host.document;
  host.document = {
    createElement: () => ({ click: () => {} }),
    body: { appendChild: () => {}, removeChild: () => {} },
  };
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = (blob: Blob): string => {
    captured = blob;
    return "blob:captured";
  };
  const revokeObjectURL = URL.revokeObjectURL;
  URL.revokeObjectURL = (): void => {};

  try {
    await exportGraphAsHTML(dataset, {
      positioned: { nodes, edges },
      targetViewport: { width: 1600, height: 900 },
    });
  } finally {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    if (priorDocument === undefined) delete host.document;
    else host.document = priorDocument;
  }

  if (captured === undefined) throw new Error("the exporter wrote no document");
  return captured.text();
}

describe("exportGraphAsHTML node header", () => {
  test("titles the model chip with the reported model and nothing else", async () => {
    const html = await exportedHtml([
      positioned({
        telemetry: {
          model: { value: "reported-model-a", evidence_class: "host_reported" },
          modelTier: { value: "l", evidence_class: "host_reported" },
        },
      }),
    ]);
    expect(html).toContain('title="reported-model-a"');
    expect(html).toContain("tier-l");
  });

  test("draws no model chip for a node whose run reported no model", async () => {
    const html = await exportedHtml([positioned({ id: "silent", name: "Silent" })]);
    // The class name also appears in the inlined stylesheet, so the assertion is on the markup the
    // card emitted rather than on the document as a whole.
    expect(html).toContain('data-node-id="silent"');
    expect(html).not.toContain('<span class="node-card-model-chip');
  });

  test("reads no model out of a retired flat spelling", async () => {
    const html = await exportedHtml([
      positioned({ id: "flat", name: "Flat", model: "flat-model", harnessModel: "flat-harness" }),
    ]);
    expect(html).not.toContain("flat-model");
    expect(html).not.toContain("flat-harness");
  });
});
