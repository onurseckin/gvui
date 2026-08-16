import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { CanvasAnnotation } from "../CanvasAnnotations/types";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import { BookmarkPackList } from "./BookmarkPackList";
import { ExportConfigForm } from "./ExportConfigForm";
import { SubgraphExportModal } from "./SubgraphExportModal";
import { SubgraphPreviewCanvas } from "./SubgraphPreviewCanvas";
import type { ExportConfig, ExtractedSubgraph } from "../../engine/subgraphExport/types";

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
  id: "test-pipeline-subgraph",
  title: "Test Subgraph Pipeline",
  description: "Pipeline for testing SubgraphExport UI components",
  sections: [
    {
      id: "sec-core",
      title: "Core Services",
      nodeIds: ["agent-01", "tool-01"],
    },
  ],
  nodes: [
    {
      id: "agent-01",
      name: "Coordinator Agent",
      kind: "orchestrator",
      status: "success",
      metrics: { durationMs: 1200, tokensIn: 1000, tokensOut: 400, costUsd: 0.015 },
    },
    {
      id: "tool-01",
      name: "Schema Generator",
      kind: "tool",
      status: "running",
      metrics: { durationMs: 800, tokensIn: 500, tokensOut: 200, costUsd: 0.008 },
    },
    {
      id: "agent-02",
      name: "Validator Engine",
      kind: "gate",
      status: "error",
      metrics: { durationMs: 2000, tokensIn: 1200, tokensOut: 600, costUsd: 0.02 },
    },
  ],
  edges: [
    { id: "e-1", source: "agent-01", target: "tool-01", kind: "sequence", label: "Execute Tool" },
    { id: "e-2", source: "tool-01", target: "agent-02", kind: "handoff", label: "Verify Result" },
  ],
};

const mockPositionedNodes: PositionedNode[] = [
  { ...mockDataset.nodes[0], x: 40, y: 40, width: 140, height: 70 },
  { ...mockDataset.nodes[1], x: 220, y: 40, width: 140, height: 70 },
  { ...mockDataset.nodes[2], x: 400, y: 40, width: 140, height: 70 },
];

const mockPositionedEdges: PositionedEdge[] = [
  { ...mockDataset.edges[0], path: "M 180 75 L 220 75" },
  { ...mockDataset.edges[1], path: "M 360 75 L 400 75" },
];

const mockBookmarks: CanvasAnnotation[] = [
  {
    id: "ann-t1",
    type: "bookmark",
    nodeId: "agent-01",
    title: "Coordinator Audit Note",
    content: "Check orchestration timeouts and worker retry counts.",
    author: { name: "Lead Dev", role: "human" },
    color: "blue",
    priority: "critical",
    category: "review",
    createdAt: "2026-08-15T09:00:00Z",
    updatedAt: "2026-08-15T09:00:00Z",
  },
  {
    id: "ann-t2",
    type: "sticky",
    nodeId: "tool-01",
    title: "Schema Tool Fix",
    content: "Ensure output conforms to strict JSON schema v1.",
    author: { name: "Validator Agent", role: "validator" },
    color: "amber",
    priority: "high",
    category: "bug",
    createdAt: "2026-08-15T09:10:00Z",
    updatedAt: "2026-08-15T09:10:00Z",
  },
];

describe("SubgraphExportModal Component", () => {
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

  it("does not render when isOpen is false", () => {
    let renderer: ReactTestRenderer | null = null;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <SubgraphExportModal isOpen={false} onClose={() => {}} dataset={mockDataset} />,
        );
      });
    });

    expect((renderer as ReactTestRenderer | null)?.toJSON()).toBeNull();
  });

  it("renders modal header, stats summary, and navigation tabs when isOpen is true", () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <SubgraphExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            positionedNodes={mockPositionedNodes}
            positionedEdges={mockPositionedEdges}
            selectedNodeIds={["agent-01", "tool-01"]}
            annotations={mockBookmarks}
          />,
        );
      });
    });

    const root = renderer.root;
    const title = root.findByProps({ className: "subgraph-modal-title" });
    expect(title.props.children).toBe("Export Subgraph & Bookmark Pack");

    // All 4 modal tabs rendered
    const allTabs = root.findAll(
      (n) =>
        typeof n.props.className === "string" && n.props.className.includes("subgraph-tab-btn"),
    );
    expect(allTabs.length).toBe(4);

    // Initial preview tab active
    const activeTab = root.find(
      (n) =>
        typeof n.props.className === "string" &&
        n.props.className.includes("subgraph-tab-btn active"),
    );
    expect(activeTab.props.children).toContain("Preview & Stats");
  });

  it("switches tabs and displays metadata config, bookmarks catalog, and code preview", () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <SubgraphExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            positionedNodes={mockPositionedNodes}
            positionedEdges={mockPositionedEdges}
            selectedNodeIds={["agent-01", "tool-01"]}
            annotations={mockBookmarks}
          />,
        );
      });
    });

    const root = renderer.root;
    const allTabs = root.findAll(
      (n) =>
        typeof n.props.className === "string" && n.props.className.includes("subgraph-tab-btn"),
    );

    // Switch to Metadata tab (index 1)
    silenceDeprecationWarnings(() => {
      act(() => {
        allTabs[1].props.onClick();
      });
    });

    const configForm = root.findByProps({ className: "subgraph-config-form " });
    expect(configForm).toBeDefined();

    // Switch to Bookmarks tab (index 2)
    silenceDeprecationWarnings(() => {
      act(() => {
        allTabs[2].props.onClick();
      });
    });

    const bookmarksCatalog = root.findByProps({ className: "subgraph-bookmarks-catalog " });
    expect(bookmarksCatalog).toBeDefined();

    // Switch to Code tab (index 3)
    silenceDeprecationWarnings(() => {
      act(() => {
        allTabs[3].props.onClick();
      });
    });

    const codeContainer = root.findByProps({ className: "subgraph-code-container" });
    expect(codeContainer).toBeDefined();
    const codePre = root.findByProps({ className: "subgraph-code-pre" });
    expect(codePre.props.children).toContain("schemaVersion");
  });

  it("switches export format in footer and updates output format", () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <SubgraphExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            positionedNodes={mockPositionedNodes}
            positionedEdges={mockPositionedEdges}
            selectedNodeIds={["agent-01", "tool-01"]}
          />,
        );
      });
    });

    const root = renderer.root;

    // Switch to Code tab
    const allTabs = root.findAll(
      (n) =>
        typeof n.props.className === "string" && n.props.className.includes("subgraph-tab-btn"),
    );
    silenceDeprecationWarnings(() => {
      act(() => {
        allTabs[3].props.onClick();
      });
    });

    // Find Mermaid format button in footer
    const formatButtons = root.findAll(
      (n) =>
        typeof n.props.children === "string" &&
        ["JSON Pack", "Markdown", "Graphviz", "Mermaid", "Dataset"].includes(n.props.children),
    );
    const mermaidBtn = formatButtons.find((b) => b.props.children === "Mermaid");
    expect(mermaidBtn).toBeDefined();

    silenceDeprecationWarnings(() => {
      act(() => {
        mermaidBtn?.props.onClick();
      });
    });

    const codePre = root.findByProps({ className: "subgraph-code-pre" });
    expect(codePre.props.children).toContain("flowchart TD");
    expect(codePre.props.children).toContain("Coordinator Agent");
  });

  it("handles copy to clipboard action", async () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <SubgraphExportModal
            isOpen={true}
            onClose={() => {}}
            dataset={mockDataset}
            positionedNodes={mockPositionedNodes}
            positionedEdges={mockPositionedEdges}
            selectedNodeIds={["agent-01"]}
          />,
        );
      });
    });

    const root = renderer.root;
    const copyButton = root.find(
      (n) => typeof n.props.children === "string" && n.props.children.includes("Copy to Clipboard"),
    );

    await silenceDeprecationWarnings(async () => {
      await act(async () => {
        await copyButton.props.onClick();
      });
    });

    expect(clipboardText).toContain("schemaVersion");
  });
});

describe("SubgraphPreviewCanvas Component", () => {
  const extracted: ExtractedSubgraph = {
    dataset: mockDataset,
    boundaryEdges: [
      {
        edge: mockDataset.edges[1],
        boundaryType: "outgoing",
        internalNodeId: "tool-01",
        externalNodeId: "agent-02",
      },
    ],
    annotations: mockBookmarks,
    positionedNodes: mockPositionedNodes,
    nodeIds: new Set(["agent-01", "tool-01"]),
    stats: {
      nodeCount: 2,
      internalEdgeCount: 1,
      boundaryIncomingCount: 0,
      boundaryOutgoingCount: 1,
      boundaryTotalCount: 1,
      annotationCount: 2,
      sectionCount: 1,
      totalTokens: 2100,
      totalDurationMs: 2000,
      totalCostUsd: 0.023,
    },
  };

  it("renders SVG elements, nodes, edges, boundary stubs, and pins", () => {
    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(<SubgraphPreviewCanvas extracted={extracted} />);
      });
    });

    const root = renderer.root;
    const svg = root.findByProps({ className: "subgraph-svg-canvas" });
    expect(svg).toBeDefined();

    // Check boundary stub rendered
    const boundaryStub = root.findByProps({ className: "subgraph-boundary-stub" });
    expect(boundaryStub).toBeDefined();
  });

  it("renders empty state when node count is zero", () => {
    const emptyExtracted: ExtractedSubgraph = {
      dataset: { id: "empty", title: "Empty", nodes: [], edges: [] },
      boundaryEdges: [],
      annotations: [],
      positionedNodes: [],
      nodeIds: new Set(),
      stats: {
        nodeCount: 0,
        internalEdgeCount: 0,
        boundaryIncomingCount: 0,
        boundaryOutgoingCount: 0,
        boundaryTotalCount: 0,
        annotationCount: 0,
        sectionCount: 0,
        totalTokens: 0,
        totalDurationMs: 0,
        totalCostUsd: 0,
      },
    };

    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(<SubgraphPreviewCanvas extracted={emptyExtracted} />);
      });
    });

    const root = renderer.root;
    const emptyMsg = root.findByProps({ className: "subgraph-canvas-empty " });
    expect(emptyMsg.props.children).toBeDefined();
  });
});

describe("BookmarkPackList Component", () => {
  it("renders bookmarks list and filters by priority", () => {
    let bookmarksState = [...mockBookmarks];
    const nodes = mockDataset.nodes.map((n) => ({ id: n.id, name: n.name }));

    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <BookmarkPackList
            bookmarks={bookmarksState}
            nodes={nodes}
            onBookmarksChange={(b) => {
              bookmarksState = b;
            }}
          />,
        );
      });
    });

    const root = renderer.root;
    const cards = root.findAllByProps({ className: "subgraph-bookmark-card" });
    expect(cards.length).toBe(2);

    // Delete a bookmark
    const deleteBtns = root.findAll((n) => n.props.title === "Remove bookmark from pack");
    expect(deleteBtns.length).toBe(2);

    silenceDeprecationWarnings(() => {
      act(() => {
        deleteBtns[0].props.onClick();
      });
    });

    expect(bookmarksState.length).toBe(1);
    expect(bookmarksState[0].id).toBe("ann-t2");
  });
});

describe("ExportConfigForm Component", () => {
  it("allows updating metadata fields, tags, and policy", () => {
    let formConfig: ExportConfig = {
      format: "json-bundle",
      packMetadata: {
        title: "Initial Title",
        version: "1.0.0",
        description: "Initial description",
        author: { name: "Dev", role: "human" },
        tags: ["alpha", "beta"],
        license: "MIT",
      },
      boundaryEdgePolicy: "none",
      includeAnnotations: true,
      includeMetrics: true,
    };

    let renderer!: ReactTestRenderer;
    silenceDeprecationWarnings(() => {
      act(() => {
        renderer = create(
          <ExportConfigForm
            config={formConfig}
            onChange={(cfg) => {
              formConfig = cfg;
            }}
            mode="selection"
            onModeChange={() => {}}
            closureDirection="downstream"
            onClosureDirectionChange={() => {}}
            closureDepth={2}
            onClosureDepthChange={() => {}}
            selectedCount={2}
            totalNodeCount={5}
          />,
        );
      });
    });

    const root = renderer.root;

    // Modify Title input
    const titleInput = root.findByProps({ value: "Initial Title" });
    silenceDeprecationWarnings(() => {
      act(() => {
        titleInput.props.onChange({ target: { value: "Updated Title" } });
      });
    });

    expect(formConfig.packMetadata.title).toBe("Updated Title");

    // Remove a tag
    const tagRemoveBtns = root.findAllByProps({ className: "subgraph-tag-remove" });
    expect(tagRemoveBtns.length).toBe(2);

    silenceDeprecationWarnings(() => {
      act(() => {
        tagRemoveBtns[0].props.onClick();
      });
    });

    expect(formConfig.packMetadata.tags).toEqual(["beta"]);
  });
});
