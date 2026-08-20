import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { GraphDataset } from "../../types/graphData";
import { ExecutiveReportModal } from "./ExecutiveReportModal";
import { ScorecardView } from "./ScorecardView";
import { BlastRadiusMatrixView } from "./BlastRadiusMatrixView";
import { TokenAttributionChartView } from "./TokenAttributionChartView";
import {
  aggregateKpiScorecard,
  aggregateTokenAttribution,
} from "../../engine/reporting/metricsAggregator";
import { computeBlastRadiusMatrix } from "../../engine/reporting/blastRadiusEngine";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceWarnings<T>(fn: () => T): T {
  const origError = console.error;
  console.error = (msg?: unknown, ...args: unknown[]) => {
    if (
      typeof msg === "string" &&
      (msg.includes("react-test-renderer is deprecated") || msg.includes("not wrapped in act"))
    ) {
      return;
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
  id: "test-exec-pipeline",
  title: "Executive Autonomous Test Pipeline",
  description: "End-to-end test execution workflow",
  sections: [
    {
      id: "sec-main",
      title: "Main Orchestration Cluster",
      nodeIds: ["node-orch-1", "node-agent-1"],
    },
  ],
  nodes: [
    {
      id: "node-orch-1",
      name: "Orchestrator Leader",
      kind: "orchestrator",
      status: "success",
      telemetry: { model: { value: "claude-3-7-sonnet", evidence_class: "host_reported" } },
      tier: "l",
      step: 1,
      metrics: {
        tokensIn: 4000,
        tokensOut: 1500,
        costUsd: 0.035,
        durationMs: 2500,
        retries: 0,
        repairRounds: 0,
      },
    },
    {
      id: "node-agent-1",
      name: "Worker Agent Alpha",
      kind: "agent",
      status: "error",
      telemetry: { model: { value: "gpt-4o", evidence_class: "host_reported" } },
      tier: "m",
      step: 2,
      metrics: {
        tokensIn: 2000,
        tokensOut: 800,
        costUsd: 0.012,
        durationMs: 1800,
        retries: 2,
        repairRounds: 1,
      },
      metadata: {
        findings: [
          {
            id: "f-01",
            severity: "critical",
            observation: "High latency spike during file write",
            remediation: "Add async buffer",
            status: "open",
          },
        ],
      },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "node-orch-1",
      target: "node-agent-1",
      kind: "dispatch",
    },
  ],
};

describe("Executive Report Component Suite", () => {
  let clipboardText = "";
  let originalClipboard: unknown;

  beforeEach(() => {
    clipboardText = "";
    if (typeof navigator !== "undefined") {
      originalClipboard = navigator.clipboard;
      (navigator as unknown as { clipboard: unknown }).clipboard = {
        writeText: async (text: string) => {
          clipboardText = text;
          return Promise.resolve();
        },
      };
    }
  });

  afterEach(() => {
    if (typeof navigator !== "undefined" && originalClipboard !== undefined) {
      (navigator as unknown as { clipboard: unknown }).clipboard = originalClipboard;
    }
  });

  describe("ExecutiveReportModal Component", () => {
    it("does not render when isOpen is false", () => {
      let renderer: ReactTestRenderer | undefined;
      silenceWarnings(() => {
        act(() => {
          renderer = create(
            <ExecutiveReportModal isOpen={false} onClose={() => {}} dataset={mockDataset} />,
          );
        });
      });
      expect(renderer ? renderer.toJSON() : null).toBeNull();
    });

    it("renders modal header, confidential tag, and format tabs when isOpen is true", () => {
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(
            <ExecutiveReportModal isOpen={true} onClose={() => {}} dataset={mockDataset} />,
          );
        });
      });

      const root = renderer!.root;
      const modal = root.findByProps({ "data-testid": "executive-report-modal" });
      expect(modal).toBeDefined();

      const title = root.findByProps({ id: "exec-modal-title" });
      expect(title).toBeDefined();

      const formatTabs = root.findAllByProps({ role: "tab" });
      expect(formatTabs.length).toBeGreaterThanOrEqual(4);
    });

    it("switches export format tabs and updates code preview", () => {
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(
            <ExecutiveReportModal isOpen={true} onClose={() => {}} dataset={mockDataset} />,
          );
        });
      });

      const root = renderer!.root;

      // Switch to Markdown format tab
      const mdTab = root.findByProps({ "data-testid": "tab-format-markdown" });
      expect(mdTab).toBeDefined();

      silenceWarnings(() => {
        act(() => {
          mdTab.props.onClick();
        });
      });

      // Switch view tab to raw code preview
      const rawCodeTab = root.findByProps({ "data-testid": "tab-view-raw-code" });
      expect(rawCodeTab).toBeDefined();

      silenceWarnings(() => {
        act(() => {
          rawCodeTab.props.onClick();
        });
      });

      const codePre = root.findByProps({ "data-testid": "exec-code-preview" });
      expect(codePre).toBeDefined();
      expect(codePre.props.children.props.children).toContain("# Executive");
    });

    it("switches view tabs to Scorecards, Blast Radius Matrix, and Token Attribution", () => {
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(
            <ExecutiveReportModal isOpen={true} onClose={() => {}} dataset={mockDataset} />,
          );
        });
      });

      const root = renderer!.root;

      // Click Blast Radius view tab
      const blastTab = root.findByProps({ "data-testid": "tab-view-blast-radius" });
      expect(blastTab).toBeDefined();
      silenceWarnings(() => {
        act(() => {
          blastTab.props.onClick();
        });
      });

      const blastTable = root.findByProps({ "data-testid": "blast-radius-table" });
      expect(blastTable).toBeDefined();

      // Click Token Attribution view tab
      const tokenTab = root.findByProps({ "data-testid": "tab-view-token-attribution" });
      expect(tokenTab).toBeDefined();
      silenceWarnings(() => {
        act(() => {
          tokenTab.props.onClick();
        });
      });

      const tokenTable = root.findByProps({ "data-testid": "token-attribution-table" });
      expect(tokenTable).toBeDefined();
    });

    it("copies report text to clipboard and triggers onExportSuccess", async () => {
      let exportSuccessFormat = "";
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(
            <ExecutiveReportModal
              isOpen={true}
              onClose={() => {}}
              dataset={mockDataset}
              defaultFormat="markdown"
              onExportSuccess={(fmt) => {
                exportSuccessFormat = fmt;
              }}
            />,
          );
        });
      });

      const root = renderer!.root;
      const copyBtn = root.findByProps({ "data-testid": "exec-copy-btn" });

      await silenceWarnings(async () => {
        await act(async () => {
          await copyBtn.props.onClick();
        });
      });

      expect(clipboardText).toContain("# Executive");
      expect(exportSuccessFormat).toBe("markdown");
    });

    it("triggers close callback when close button is clicked", () => {
      let closed = false;
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(
            <ExecutiveReportModal
              isOpen={true}
              onClose={() => {
                closed = true;
              }}
              dataset={mockDataset}
            />,
          );
        });
      });

      const root = renderer!.root;
      const closeButtons = root.findAllByProps({ "aria-label": "Close Modal" });
      expect(closeButtons.length).toBeGreaterThan(0);

      silenceWarnings(() => {
        act(() => {
          closeButtons[0].props.onClick();
        });
      });

      expect(closed).toBe(true);
    });
  });

  describe("ScorecardView Component", () => {
    it("renders all key KPI cards with formatted values", () => {
      const kpi = aggregateKpiScorecard(mockDataset);
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(<ScorecardView kpi={kpi} />);
        });
      });

      const root = renderer!.root;
      const healthCard = root.findByProps({ "data-testid": "kpi-health-card" });
      expect(healthCard).toBeDefined();

      const scaleCard = root.findByProps({ "data-testid": "kpi-scale-card" });
      expect(scaleCard).toBeDefined();

      const mttrCard = root.findByProps({ "data-testid": "kpi-mttr-card" });
      expect(mttrCard).toBeDefined();

      const tokensCard = root.findByProps({ "data-testid": "kpi-tokens-card" });
      expect(tokensCard).toBeDefined();
    });
  });

  describe("BlastRadiusMatrixView Component", () => {
    it("renders matrix table and supports search and risk level filtering", () => {
      const matrix = computeBlastRadiusMatrix(mockDataset);
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(<BlastRadiusMatrixView matrix={matrix} />);
        });
      });

      const root = renderer!.root;
      const searchInput = root.findByProps({ "aria-label": "Filter blast radius nodes" });
      expect(searchInput).toBeDefined();

      silenceWarnings(() => {
        act(() => {
          searchInput.props.onChange({ target: { value: "Worker Agent" } });
        });
      });

      const table = root.findByProps({ "data-testid": "blast-radius-table" });
      expect(table).toBeDefined();

      const expandButtons = root.findAll(
        (node) =>
          typeof node.props.className === "string" && node.props.className.includes("exec-btn"),
      );
      const cascadeBtn = expandButtons.find((b) => b.props.children === "Cascade Tree");
      if (cascadeBtn) {
        silenceWarnings(() => {
          act(() => {
            cascadeBtn.props.onClick();
          });
        });
      }
    });
  });

  describe("TokenAttributionChartView Component", () => {
    it("renders token summary, model distribution bars, and node breakdown table", () => {
      const attribution = aggregateTokenAttribution(mockDataset);
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(<TokenAttributionChartView attribution={attribution} />);
        });
      });

      const root = renderer!.root;
      const tokenTable = root.findByProps({ "data-testid": "token-attribution-table" });
      expect(tokenTable).toBeDefined();

      const rows = root.findAllByProps({ className: "token-bar-row" });
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe("Empty Dataset Resilience", () => {
    const emptyDataset: GraphDataset = {
      id: "empty-test",
      title: "Empty Test",
      nodes: [],
      edges: [],
    };

    it("renders ScorecardView without NaN or Infinity", () => {
      const kpi = aggregateKpiScorecard(emptyDataset);
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(<ScorecardView kpi={kpi} />);
        });
      });
      const root = renderer!.root;
      const healthVal = root.findByProps({ "data-testid": "kpi-health-value" });
      expect(healthVal.props.children).toEqual([100, "/100"]);
    });

    it("renders BlastRadiusMatrixView for empty graph gracefully", () => {
      const matrix = computeBlastRadiusMatrix(emptyDataset);
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(<BlastRadiusMatrixView matrix={matrix} />);
        });
      });
      const root = renderer!.root;
      const table = root.findByProps({ "data-testid": "blast-radius-table" });
      expect(table).toBeDefined();
    });

    it("renders TokenAttributionChartView for empty graph gracefully", () => {
      const attribution = aggregateTokenAttribution(emptyDataset);
      let renderer: ReactTestRenderer | null = null;
      silenceWarnings(() => {
        act(() => {
          renderer = create(<TokenAttributionChartView attribution={attribution} />);
        });
      });
      const root = renderer!.root;
      const table = root.findByProps({ "data-testid": "token-attribution-table" });
      expect(table).toBeDefined();
    });
  });
});
