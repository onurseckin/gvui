import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ExportModal } from "./ExportModal";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceDeprecationWarnings<T>(fn: () => T): T {
  const origError = console.error;
  console.error = (msg?: unknown, ...args: unknown[]) => {
    if (typeof msg === "string") {
      if (
        msg.includes("react-test-renderer is deprecated") ||
        msg.includes("not wrapped in act") ||
        msg.includes("inside a test was not wrapped in act") ||
        msg.includes("When testing, code that causes React state updates")
      ) {
        return;
      }
    }
    origError(msg, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = origError;
  }
}

const mockDataset: GraphDataset = {
  id: "pipeline-test-modal",
  title: "Test Export Modal Pipeline",
  description: "Testing export modal format selectors and controls",
  sections: [
    {
      id: "sec-test",
      title: "Testing Section",
      nodeIds: ["node-1", "node-2"],
    },
  ],
  nodes: [
    {
      id: "node-1",
      name: "Planner Agent",
      kind: "orchestrator",
      status: "running",
      step: 1,
      description: "Generates step by step plan",
      tools: [{ name: "planner", type: "generic" }],
      metrics: { tokensIn: 800, tokensOut: 200, costUsd: 0.005, durationMs: 1500 },
      metadata: {
        findings: [
          { id: "f-1", severity: "important", observation: "Need re-check", status: "open" },
        ],
      },
    },
    {
      id: "node-2",
      name: "Validator Gate",
      kind: "gate",
      status: "success",
      step: 2,
      description: "Checks contracts and coverage",
    },
  ],
  edges: [
    {
      id: "edge-1",
      source: "node-1",
      target: "node-2",
      kind: "sequence",
      label: "proceed",
    },
  ],
};

const mockPositionedNodes: PositionedNode[] = [
  { ...mockDataset.nodes[0], x: 20, y: 20, width: 260, height: 140 },
  { ...mockDataset.nodes[1], x: 340, y: 20, width: 260, height: 140 },
];

const mockPositionedEdges: PositionedEdge[] = [
  { ...mockDataset.edges[0], path: "M 280 90 L 340 90", labelX: 310, labelY: 80 },
];

describe("ExportModal Component", () => {
  let clipboardText = "";
  let originalClipboard: unknown;

  beforeEach(() => {
    clipboardText = "";
    if (typeof navigator !== "undefined") {
      originalClipboard = navigator.clipboard;
      (navigator as unknown as { clipboard: unknown }).clipboard = {
        writeText: async (text: string) => {
          clipboardText = text;
        },
      };
    }
  });

  afterEach(() => {
    if (typeof navigator !== "undefined" && originalClipboard) {
      (navigator as unknown as { clipboard: unknown }).clipboard = originalClipboard;
    }
  });

  it("does not render dialog content when isOpen is false", () => {
    let renderer: ReactTestRenderer | null = null;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(<ExportModal isOpen={false} onClose={() => {}} dataset={mockDataset} />);
      });
    });

    expect((renderer as ReactTestRenderer | null)?.toJSON()).toBeNull();
  });

  it("renders modal header, dataset badge, and all 5 format tabs when isOpen is true", () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <ExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            positionedNodes={mockPositionedNodes}
            positionedEdges={mockPositionedEdges}
          />,
        );
      });
    });

    const root = renderer.root;
    const title = root.findByProps({ className: "export-modal-title" });
    expect(title.props.children).toBe("Export Graph");

    const datasetBadge = root.findByProps({ className: "export-modal-dataset-badge" });
    expect(datasetBadge.props.children).toBe("Test Export Modal Pipeline");

    // All 5 format tabs rendered
    const tabs = root.findAllByProps({ role: "tab" });
    expect(tabs.length).toBe(5);

    const tabLabels = tabs.map((t) => t.props.id);
    expect(tabLabels).toEqual(["tab-svg", "tab-png", "tab-mermaid", "tab-slq", "tab-html"]);
  });

  it("switches format tabs and updates live preview panel", () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <ExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            positionedNodes={mockPositionedNodes}
            positionedEdges={mockPositionedEdges}
            defaultFormat="svg"
          />,
        );
      });
    });

    const root = renderer.root;

    // Initially SVG tab is active
    let activeTab = root.find(
      (node) => node.props.role === "tab" && node.props["aria-selected"] === true,
    );
    expect(activeTab.props.id).toBe("tab-svg");

    // Switch to Mermaid tab
    const mermaidTab = root.findByProps({ id: "tab-mermaid" });
    silenceDeprecationWarnings(() => {
      act(() => {
        mermaidTab.props.onClick();
      });
    });

    activeTab = root.find(
      (node) => node.props.role === "tab" && node.props["aria-selected"] === true,
    );
    expect(activeTab.props.id).toBe("tab-mermaid");

    const codeViewer = root.findByProps({ className: "export-preview-code-viewer" });
    expect(codeViewer.props.children).toContain("flowchart TD");
    expect(codeViewer.props.children).toContain("Planner Agent");

    // Switch to SLQ tab
    const slqTab = root.findByProps({ id: "tab-slq" });
    silenceDeprecationWarnings(() => {
      act(() => {
        slqTab.props.onClick();
      });
    });

    const slqViewer = root.findByProps({ className: "export-preview-code-viewer" });
    expect(slqViewer.props.children).toContain("CREATE TABLE IF NOT EXISTS gvui_graphs");

    // Switch to Offline HTML tab
    const htmlTab = root.findByProps({ id: "tab-html" });
    silenceDeprecationWarnings(() => {
      act(() => {
        htmlTab.props.onClick();
      });
    });

    const checklist = root.findByProps({ className: "export-checklist" });
    expect(checklist).toBeDefined();
  });

  it("changes SQL dialect on SLQ tab and updates live code output", () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <ExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            defaultFormat="slq"
          />,
        );
      });
    });

    const root = renderer.root;
    const select = root.findByProps({ className: "export-select-control" });
    expect(select.props.value).toBe("sqlite");

    silenceDeprecationWarnings(() => {
      act(() => {
        select.props.onChange({ target: { value: "json-relational" } });
      });
    });

    const codeViewer = root.findByProps({ className: "export-preview-code-viewer" });
    expect(codeViewer.props.children).toContain('"schemaVersion": "1.0.0"');
    expect(codeViewer.props.children).toContain('"tables"');
  });

  it("changes Mermaid layout direction (Top-Down to Left-Right)", () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <ExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            defaultFormat="mermaid"
          />,
        );
      });
    });

    const root = renderer.root;
    let codeViewer = root.findByProps({ className: "export-preview-code-viewer" });
    expect(codeViewer.props.children).toContain("flowchart TD");

    // Click Left-Right button
    const lrBtn = root.find(
      (node) => node.type === "button" && node.props.children === "Left-Right",
    );
    silenceDeprecationWarnings(() => {
      act(() => {
        lrBtn.props.onClick();
      });
    });

    codeViewer = root.findByProps({ className: "export-preview-code-viewer" });
    expect(codeViewer.props.children).toContain("flowchart LR");
  });

  it("changes resolution scale on PNG tab", () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <ExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            positionedNodes={mockPositionedNodes}
            positionedEdges={mockPositionedEdges}
            defaultFormat="png"
          />,
        );
      });
    });

    const root = renderer.root;
    const btn4x = root.find(
      (node) => node.type === "button" && node.props.children === "4x (Ultra HD)",
    );
    silenceDeprecationWarnings(() => {
      act(() => {
        btn4x.props.onClick();
      });
    });

    const stats = root.findByProps({ className: "export-preview-stats" });
    const statsText = Array.isArray(stats.props.children)
      ? stats.props.children.join("")
      : String(stats.props.children);
    expect(statsText).toContain("4x Scale");
  });

  it("copies formatted export content to clipboard and displays copied confirmation", async () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <ExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            defaultFormat="mermaid"
          />,
        );
      });
    });

    const root = renderer.root;
    const copyBtn = root.find((node) => node.props.title === "Copy export content to clipboard");

    await silenceDeprecationWarnings(async () => {
      await act(async () => {
        await copyBtn.props.onClick();
      });
    });

    expect(clipboardText).toContain("flowchart TD");
    expect(clipboardText).toContain("Planner Agent");

    const toast = root.findByProps({ className: "export-toast-banner" });
    expect(toast).toBeDefined();
  });

  it("triggers download callback on Download click", async () => {
    let exportedFormat = "";
    let exportedFilename = "";

    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <ExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            defaultFormat="svg"
            onExportSuccess={(format, filename) => {
              exportedFormat = format;
              exportedFilename = filename;
            }}
          />,
        );
      });
    });

    const root = renderer.root;
    const downloadBtn = root.find((node) => node.props.title === "Download file");

    await silenceDeprecationWarnings(async () => {
      await act(async () => {
        await downloadBtn.props.onClick();
      });
    });

    expect(exportedFormat).toBe("svg");
    expect(exportedFilename).toBe("test-export-modal-pipeline");
  });

  it("handles keyboard navigation between tabs with ArrowRight and ArrowLeft", () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <ExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            defaultFormat="svg"
          />,
        );
      });
    });

    const root = renderer.root;
    const svgTab = root.findByProps({ id: "tab-svg" });

    silenceDeprecationWarnings(() => {
      act(() => {
        svgTab.props.onKeyDown({ key: "ArrowRight", preventDefault: () => {} });
      });
    });

    let activeTab = root.find(
      (node) => node.props.role === "tab" && node.props["aria-selected"] === true,
    );
    expect(activeTab.props.id).toBe("tab-png");

    silenceDeprecationWarnings(() => {
      act(() => {
        activeTab.props.onKeyDown({ key: "ArrowLeft", preventDefault: () => {} });
      });
    });

    activeTab = root.find(
      (node) => node.props.role === "tab" && node.props["aria-selected"] === true,
    );
    expect(activeTab.props.id).toBe("tab-svg");
  });

  it("calls onClose when close button is clicked", () => {
    let isClosed = false;
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <ExportModal
            isOpen={true}
            onClose={() => {
              isClosed = true;
            }}
            dataset={mockDataset}
          />,
        );
      });
    });

    const root = renderer.root;
    const closeBtn = root.findByProps({ className: "export-modal-close-btn" });
    silenceDeprecationWarnings(() => {
      act(() => {
        closeBtn.props.onClick();
      });
    });

    expect(isClosed).toBe(true);
  });
});
