import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as bunTest from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

interface ModuleMocker {
  module(id: string, factory: () => unknown): void | Promise<void>;
}

const mock = (bunTest as unknown as { mock: ModuleMocker }).mock;

let lastNavigatedArgs: unknown = null;
const mockNavigate = (args: unknown) => {
  lastNavigatedArgs = args;
  return Promise.resolve();
};

mock.module("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useGraphFilesStore } from "../../state/useGraphFilesStore";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset } from "../../types/graphData";
import {
  Sidebar,
  SidebarFileList,
  SidebarFilterControls,
  SidebarModelBreakdown,
  SidebarNodeStatus,
  SidebarReviewRounds,
  SidebarRoleBreakdown,
  SidebarSectionBreakdown,
  SidebarTelemetry,
  TokenFootprintBreakdown,
} from "./index";
import * as tokenFootprintModule from "./TokenFootprintBreakdown";
import { calculateGraphTokenFootprint, extractNodeTokenFootprint } from "./TokenFootprintBreakdown";

describe("Sidebar Component & Subcomponents", () => {
  /** A capsule exported before the evidence spine: real values, no recorded provenance. */
  const sparseDataset: GraphDataset = {
    id: "test-graph-1",
    title: "Test Orchestration Graph",
    nodes: [
      {
        id: "node-1",
        name: "Dispatcher",
        kind: "orchestrator",
        status: "success",
        telemetry: { model: { value: "model-alpha", evidence_class: "host_reported" } },
        metrics: { tokensIn: 1200, tokensOut: 800, costUsd: 0.015, durationMs: 2500, retries: 0 },
      },
      {
        id: "node-2",
        name: "Worker Agent 1",
        kind: "agent",
        status: "running",
        hostAgent: { model: "model-beta" },
        metrics: { tokensIn: 3000, tokensOut: 1500, costUsd: 0.008, durationMs: 4200, retries: 1 },
      },
      {
        id: "node-3",
        name: "Worker Agent 2",
        kind: "agent",
        status: "error",
        telemetry: { model: { value: "model-alpha", evidence_class: "host_reported" } },
        metrics: { tokensIn: 500, tokensOut: 200, costUsd: 0.003, durationMs: 1100, retries: 2 },
      },
      {
        id: "node-4",
        name: "CLI Tool",
        kind: "tool",
        status: "success",
        tools: [{ name: "bash_exec" }],
        metrics: { durationMs: 800 },
      },
      { id: "node-5", name: "Validator Gate", kind: "gate", status: "pending" },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2" },
      { id: "e1-3", source: "node-1", target: "node-3" },
      { id: "e2-4", source: "node-2", target: "node-4" },
      { id: "e3-5", source: "node-3", target: "node-5" },
    ],
  };

  /** A capsule from the current producer: declared roles, evidence classes, a branch region. */
  const contractDataset: GraphDataset = {
    id: "contract-graph",
    title: "Contract Graph",
    sections: [
      {
        id: "sec-branch-1",
        title: "Branch B-1",
        nodeIds: ["sub-1"],
        reason: "docs and code touched different scopes",
        parentNodeId: "impl-1",
        status: "collected",
      },
    ],
    nodes: [
      {
        id: "coord-1",
        name: "Coordinator",
        kind: "orchestrator",
        status: "success",
        telemetry: {
          role: "coordinator",
          model: { value: "claude-opus-4", evidence_class: "host_reported" },
        },
      },
      {
        id: "impl-1",
        name: "Implementer",
        kind: "agent",
        status: "success",
        telemetry: {
          role: "implementer",
          model: { value: "claude-sonnet-4", evidence_class: "host_reported" },
          modelTier: { value: "m", evidence_class: "host_reported" },
          tokensIn: { value: 1000, evidence_class: "host_reported" },
          tokensOut: { value: 400, evidence_class: "host_reported" },
        },
        stateTransitions: [
          {
            at: "2026-08-18T10:00:00.000Z",
            actor: "validator-1",
            from: "submitted",
            to: "validating",
            reason: "adversarial probe",
            attempt: 1,
            evidence_class: "harness_observed",
            verdict: "probe",
            round: 1,
            findingClass: "probe_demand",
            findingCount: 1,
          },
          {
            at: "2026-08-18T10:05:00.000Z",
            actor: "validator-1",
            from: "validating",
            to: "changes_requested",
            reason: "defect found",
            attempt: 2,
            evidence_class: "harness_observed",
            verdict: "reject",
            round: 1,
            findingClass: "defect",
            findingCount: 1,
          },
        ],
        metadata: {
          findings: [
            {
              id: "F-1",
              severity: "important",
              observation: "prove the migration is reversible",
              status: "open",
              class: "probe_demand",
            },
            {
              id: "F-2",
              severity: "critical",
              observation: "null deref on empty input",
              status: "open",
              class: "defect",
            },
          ],
        },
      },
      {
        id: "val-1",
        name: "Validator",
        kind: "agent",
        status: "success",
        telemetry: { role: "validator" },
      },
      {
        id: "rep-1",
        name: "Repairer",
        kind: "agent",
        status: "success",
        telemetry: { role: "repairer" },
      },
      {
        id: "critic-1",
        name: "Critic",
        kind: "critic",
        status: "success",
        telemetry: { role: "completeness-critic" },
      },
      {
        id: "sub-1",
        name: "Sub implementer",
        kind: "agent",
        status: "success",
        sectionId: "sec-branch-1",
        telemetry: {
          role: "sub-implementer",
          tokensIn: { value: 50, evidence_class: "derived", is_estimated: true },
        },
      },
    ],
    edges: [
      { id: "e-probe", source: "val-1", target: "impl-1", kind: "probe" },
      { id: "e-push", source: "val-1", target: "impl-1", kind: "pushback" },
      { id: "e-branch", source: "impl-1", target: "sub-1", kind: "branch" },
    ],
  };

  beforeEach(() => {
    lastNavigatedArgs = null;
    act(() => {
      useGraphStore.setState({ dataset: null, currentFile: "sample.json", activeFilter: "all" });
      useGraphFilesStore.setState({
        files: ["graph-1.json", "graph-2.json", "graph-3.json"],
        isRefreshing: false,
        error: null,
      });
    });
  });

  afterEach(() => {
    act(() => {
      useGraphStore.setState({ dataset: null, currentFile: "", activeFilter: "all" });
    });
  });

  describe("SidebarTelemetry", () => {
    it("summarises the run shape and sums only recorded duration and cost", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarTelemetry dataset={sparseDataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "telemetry-nodes-count" }).children).toEqual(["5"]);
      expect(root.findByProps({ "data-testid": "telemetry-edges-count" }).children).toEqual(["4"]);
      expect(root.findByProps({ "data-testid": "telemetry-regions-count" }).children).toEqual([
        "0",
      ]);
      // 2500 + 4200 + 1100 + 800 = 8600ms, over the four nodes that recorded one.
      expect(root.findByProps({ "data-testid": "telemetry-duration" }).children).toEqual(["8.6s"]);
      expect(root.findByProps({ "data-testid": "telemetry-duration-coverage" }).children).toEqual([
        "4",
        "/",
        "5",
        " nodes",
      ]);
      expect(root.findByProps({ "data-testid": "telemetry-cost" }).children).toEqual(["$0.026"]);
    });

    it("renders unknown, not zero, when nothing recorded a duration or a cost", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarTelemetry dataset={contractDataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "telemetry-duration" }).children).toEqual([
        "unknown",
      ]);
      expect(root.findByProps({ "data-testid": "telemetry-cost" }).children).toEqual(["unknown"]);
      expect(root.findByProps({ "data-testid": "telemetry-cost-note" })).toBeDefined();
      expect(root.findAllByProps({ "data-testid": "telemetry-cost-coverage" }).length).toBe(0);
    });

    it("counts the branch regions the run recorded", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarTelemetry dataset={contractDataset} />);
      });
      expect(
        renderer!.root.findByProps({ "data-testid": "telemetry-regions-count" }).children,
      ).toEqual(["1"]);
    });

    it("renders empty state when no graph is loaded", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarTelemetry dataset={null} />);
      });
      expect(renderer!.root.findByProps({ className: "sidebar-empty-state" }).children).toEqual([
        "No graph loaded",
      ]);
    });
  });

  describe("SidebarNodeStatus", () => {
    it("renders active node counts broken down by status", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarNodeStatus dataset={sparseDataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "status-count-success" }).children).toEqual(["2"]);
      expect(root.findByProps({ "data-testid": "status-count-running" }).children).toEqual(["1"]);
      expect(root.findByProps({ "data-testid": "status-count-error" }).children).toEqual(["1"]);
      expect(root.findByProps({ "data-testid": "status-count-pending" }).children).toEqual(["1"]);
    });

    it("buckets a node with no recorded status as unknown, never as pending", () => {
      const dataset: GraphDataset = {
        id: "no-status",
        title: "No Status",
        nodes: [
          { id: "a", name: "Recorded", kind: "agent", status: "success" },
          { id: "b", name: "Never recorded", kind: "agent" },
          { id: "c", name: "Also never recorded", kind: "agent" },
        ],
        edges: [],
      };

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarNodeStatus dataset={dataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "status-count-unknown" }).children).toEqual(["2"]);
      // Pending is a lifecycle claim; absence is a claim about our records. They never merge.
      expect(root.findAllByProps({ "data-testid": "status-count-pending" }).length).toBe(0);
      expect(root.findByProps({ "data-testid": "status-item-unknown" }).props.className).toContain(
        "is-unknown",
      );
    });

    it("renders empty state when dataset is null", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarNodeStatus dataset={null} />);
      });
      expect(renderer!.root.findByProps({ className: "sidebar-empty-state" }).children).toEqual([
        "No active nodes",
      ]);
    });
  });

  describe("SidebarModelBreakdown", () => {
    it("groups a node whose model was never reported under an explicit unknown", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarModelBreakdown dataset={sparseDataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "model-count-model-alpha" }).children).toEqual([
        "2",
      ]);
      expect(root.findByProps({ "data-testid": "model-count-model-beta" }).children).toEqual(["1"]);

      // The CLI tool and the gate reported no model at all.
      const unknownCount = root.findByProps({ "data-testid": "model-count-unknown" });
      expect(unknownCount.children).toEqual(["2"]);

      const unknownItem = root.findByProps({ "data-testid": "model-item-unknown" });
      expect(unknownItem.props.className).toContain("is-unknown");
      expect(root.findAllByProps({ "data-testid": "model-item-Unspecified" }).length).toBe(0);
    });

    it("labels a model with no stated provenance as unverified and a host-reported one as host-reported", () => {
      let sparseRenderer: ReactTestRenderer;
      act(() => {
        sparseRenderer = create(<SidebarModelBreakdown dataset={sparseDataset} />);
      });
      const sparseItem = sparseRenderer!.root.findByProps({
        "data-testid": "model-item-model-beta",
      });
      expect(sparseItem.findByProps({ "data-testid": "evidence-chip-unknown" }).children).toEqual([
        "unverified",
      ]);

      let contractRenderer: ReactTestRenderer;
      act(() => {
        contractRenderer = create(<SidebarModelBreakdown dataset={contractDataset} />);
      });
      const contractItem = contractRenderer!.root.findByProps({
        "data-testid": "model-item-claude-sonnet-4",
      });
      expect(
        contractItem.findByProps({ "data-testid": "evidence-chip-host_reported" }).children,
      ).toEqual(["host-reported"]);
      expect(contractItem.findByProps({ className: "model-tier-chip tier-m" }).children).toEqual([
        "m",
      ]);
    });

    it("says so when no node reported a model at all", () => {
      const noModels: GraphDataset = {
        id: "no-models",
        title: "No Models",
        nodes: [{ id: "n1", name: "Node 1", kind: "agent" }],
        edges: [],
      };

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarModelBreakdown dataset={noModels} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "model-count-unknown" }).children).toEqual(["1"]);
      expect(root.findByProps({ "data-testid": "model-breakdown-note" })).toBeDefined();
    });
  });

  describe("SidebarRoleBreakdown", () => {
    it("groups declared roles into the realigned role vocabulary", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarRoleBreakdown dataset={contractDataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "role-group-count-coordination" }).children).toEqual(
        ["1"],
      );
      expect(root.findByProps({ "data-testid": "role-group-count-implementer" }).children).toEqual([
        "1",
      ]);
      expect(root.findByProps({ "data-testid": "role-group-count-validator" }).children).toEqual([
        "1",
      ]);
      expect(root.findByProps({ "data-testid": "role-group-count-repairer" }).children).toEqual([
        "1",
      ]);
      expect(root.findByProps({ "data-testid": "role-group-count-critic" }).children).toEqual([
        "1",
      ]);
      expect(root.findByProps({ "data-testid": "role-group-count-sub-agent" }).children).toEqual([
        "1",
      ]);
      expect(root.findByProps({ "data-testid": "role-chip-sub-implementer" })).toBeDefined();
      // Every role was declared, so nothing is flagged as inferred.
      expect(root.findAllByProps({ "data-testid": "role-group-derived-implementer" }).length).toBe(
        0,
      );
    });

    it("flags roles inferred from the node kind and buckets roleless nodes as unknown", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarRoleBreakdown dataset={sparseDataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "role-group-count-implementer" }).children).toEqual([
        "2",
      ]);
      expect(root.findByProps({ "data-testid": "role-group-derived-implementer" })).toBeDefined();
      // The CLI tool node carries no role and no role-bearing kind.
      expect(root.findByProps({ "data-testid": "role-group-count-unknown" }).children).toEqual([
        "1",
      ]);
    });
  });

  describe("SidebarSectionBreakdown", () => {
    it("lists each branch region with its recorded reason and status", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarSectionBreakdown dataset={contractDataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "region-count-sec-branch-1" }).children).toEqual([
        "1",
      ]);
      expect(root.findByProps({ "data-testid": "region-reason-sec-branch-1" }).children).toEqual([
        "docs and code touched different scopes",
      ]);
      expect(root.findByProps({ "data-testid": "section-ungrouped-note" })).toBeDefined();
    });

    it("says the reason is unknown rather than inventing one for a region that owes one", () => {
      const reasonless: GraphDataset = {
        ...contractDataset,
        sections: [{ id: "sec-x", title: "Region X", nodeIds: ["sub-1"], parentNodeId: "impl-1" }],
      };

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarSectionBreakdown dataset={reasonless} />);
      });

      expect(renderer!.root.findByProps({ "data-testid": "region-reason-sec-x" }).children).toEqual(
        ["Reason unknown — the run recorded none."],
      );
    });

    it("asks no reason of a region that is a plain grouping", () => {
      const grouping: GraphDataset = {
        ...contractDataset,
        sections: [
          {
            id: "sec-theme",
            title: "Water in, water out",
            description: "Everything about supply and demand",
            nodeIds: ["sub-1"],
          },
        ],
      };

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarSectionBreakdown dataset={grouping} />);
      });

      const root = renderer!.root;
      expect(root.findAllByProps({ "data-testid": "region-reason-sec-theme" }).length).toBe(0);
      expect(root.findByProps({ "data-testid": "region-description-sec-theme" }).children).toEqual([
        "Everything about supply and demand",
      ]);
    });

    it("renders an empty state when the run recorded no regions", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarSectionBreakdown dataset={sparseDataset} />);
      });
      expect(
        renderer!.root.findByProps({ "data-testid": "section-breakdown-empty" }),
      ).toBeDefined();
    });
  });

  describe("SidebarReviewRounds", () => {
    it("counts probe rounds apart from pushback rounds", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarReviewRounds dataset={contractDataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "review-probe-rounds" }).children).toEqual(["1"]);
      expect(root.findByProps({ "data-testid": "review-pushback-rounds" }).children).toEqual(["1"]);
      expect(root.findByProps({ "data-testid": "review-card-probe" }).props.className).toContain(
        "review-probe",
      );
      expect(root.findByProps({ "data-testid": "review-card-pushback" }).props.className).toContain(
        "review-pushback",
      );
    });

    it("separates proof demands from asserted defects", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarReviewRounds dataset={contractDataset} />);
      });

      const root = renderer!.root;
      expect(
        root.findByProps({ "data-testid": "review-probe-detail" }).children.join(""),
      ).toContain("1 proof demand");
      expect(
        root.findByProps({ "data-testid": "review-pushback-detail" }).children.join(""),
      ).toContain("1 defect");
    });

    it("renders an empty state when no review activity was recorded", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarReviewRounds dataset={sparseDataset} />);
      });
      expect(renderer!.root.findByProps({ "data-testid": "review-rounds-empty" })).toBeDefined();
    });
  });

  describe("SidebarFilterControls", () => {
    it("renders the realigned role chips with accurate counts", () => {
      let selectedFilter = "";
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFilterControls
            dataset={contractDataset}
            activeFilter="all"
            onFilterChange={(f) => {
              selectedFilter = f;
            }}
          />,
        );
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "filter-count-all" }).children).toEqual(["6"]);
      expect(root.findByProps({ "data-testid": "filter-count-coordination" }).children).toEqual([
        "1",
      ]);
      expect(root.findByProps({ "data-testid": "filter-count-implementers" }).children).toEqual([
        "1",
      ]);
      expect(root.findByProps({ "data-testid": "filter-count-repairers" }).children).toEqual(["1"]);
      expect(root.findByProps({ "data-testid": "filter-count-sub-agents" }).children).toEqual([
        "1",
      ]);
      expect(root.findByProps({ "data-testid": "filter-count-critics" }).children).toEqual(["1"]);

      act(() => {
        root.findByProps({ "data-testid": "filter-btn-repairers" }).props.onClick();
      });
      expect(selectedFilter).toBe("repairers");
    });

    it("treats the orchestrators spelling as the coordination chip", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFilterControls
            dataset={contractDataset}
            activeFilter="orchestrators"
            onFilterChange={() => {}}
          />,
        );
      });

      const coordinationBtn = renderer!.root.findByProps({
        "data-testid": "filter-btn-coordination",
      });
      expect(coordinationBtn.props["aria-pressed"]).toBe(true);
    });

    it("toggles an active filter back to all", () => {
      let selectedFilter = "errors";
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFilterControls
            dataset={sparseDataset}
            activeFilter="errors"
            onFilterChange={(f) => {
              selectedFilter = f;
            }}
          />,
        );
      });

      const errorBtn = renderer!.root.findByProps({ "data-testid": "filter-btn-errors" });
      expect(errorBtn.props["aria-pressed"]).toBe(true);
      act(() => {
        errorBtn.props.onClick();
      });
      expect(selectedFilter).toBe("all");
    });

    it("marks the active filter with aria-pressed and the active class", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFilterControls
            dataset={sparseDataset}
            activeFilter="success"
            onFilterChange={() => {}}
          />,
        );
      });

      const root = renderer!.root;
      const successBtn = root.findByProps({ "data-testid": "filter-btn-success" });
      expect(successBtn.props["aria-pressed"]).toBe(true);
      expect(successBtn.props.className).toContain("active");

      const allBtn = root.findByProps({ "data-testid": "filter-btn-all" });
      expect(allBtn.props["aria-pressed"]).toBe(false);
      expect(allBtn.props.className).not.toContain("active");
    });
  });

  describe("SidebarFileList", () => {
    it("renders file list with active highlight, aria-current='true', node count badge, and handles selection", () => {
      let selectedFile = "";
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFileList
            files={["pipeline.json", "crawler.json"]}
            currentFile="pipeline.json"
            dataset={sparseDataset}
            onSelectFile={(f) => {
              selectedFile = f;
            }}
          />,
        );
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "sidebar-files-count" }).children).toEqual(["2"]);

      const item1 = root.findByProps({ "data-testid": "file-item-pipeline.json" });
      expect(item1.props.className).toContain("active");
      expect(item1.props["aria-current"]).toBe("true");

      const activeBadge = root.findByProps({ "data-testid": "active-file-node-count" });
      expect(activeBadge.children).toEqual(["5", " ", "nodes"]);

      const item2 = root.findByProps({ "data-testid": "file-item-crawler.json" });
      expect(item2.props.className).not.toContain("active");
      expect(item2.props["aria-current"]).toBe(undefined);

      act(() => {
        item2.props.onClick();
      });
      expect(selectedFile).toBe("crawler.json");
    });

    it("filters files dynamically with search input and supports clear button", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFileList
            files={["alpha-run.json", "beta-worker.json", "gamma-audit.json"]}
            currentFile="alpha-run.json"
            onSelectFile={() => {}}
          />,
        );
      });

      const root = renderer!.root;
      const searchInput = root.findByProps({ "data-testid": "sidebar-file-search-input" });
      expect(searchInput).toBeDefined();

      act(() => {
        searchInput.props.onChange({ target: { value: "beta" } });
      });

      expect(root.findByProps({ "data-testid": "file-item-beta-worker.json" })).toBeDefined();
      expect(root.findAllByProps({ "data-testid": "file-item-alpha-run.json" }).length).toBe(0);
      expect(root.findByProps({ "data-testid": "sidebar-files-count" }).children).toEqual(["1"]);

      act(() => {
        root.findByProps({ "data-testid": "sidebar-file-search-clear" }).props.onClick();
      });

      expect(root.findByProps({ "data-testid": "file-item-alpha-run.json" })).toBeDefined();
      expect(root.findByProps({ "data-testid": "file-item-gamma-audit.json" })).toBeDefined();

      act(() => {
        searchInput.props.onChange({ target: { value: "non-existent" } });
      });
      expect(root.findByProps({ "data-testid": "sidebar-file-empty-search" })).toBeDefined();
    });

    it("renders empty state message when files list is empty", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarFileList files={[]} currentFile="" onSelectFile={() => {}} />);
      });
      expect(
        renderer!.root.findByProps({ className: "sidebar-empty-state" }).children[0],
      ).toContain("No graph files yet");
    });
  });

  describe("Sidebar Collapsible Accordions", () => {
    it("collapses and expands every breakdown through the shared accordion", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <div>
            <SidebarTelemetry dataset={contractDataset} />
            <SidebarRoleBreakdown dataset={contractDataset} />
            <SidebarSectionBreakdown dataset={contractDataset} />
            <SidebarReviewRounds dataset={contractDataset} />
            <SidebarModelBreakdown dataset={contractDataset} />
            <TokenFootprintBreakdown dataset={contractDataset} />
          </div>,
        );
      });

      const root = renderer!.root;
      const cases: readonly [string, string][] = [
        ["sidebar-telemetry-header", "telemetry-nodes-count"],
        ["sidebar-role-breakdown-header", "role-group-count-implementer"],
        ["sidebar-section-breakdown-header", "region-count-sec-branch-1"],
        ["sidebar-review-rounds-header", "review-probe-rounds"],
        ["sidebar-model-breakdown-header", "model-item-claude-sonnet-4"],
        ["token-footprint-breakdown-header", "token-footprint-coverage"],
      ];

      for (const [headerId, bodyId] of cases) {
        const header = root.findByProps({ "data-testid": headerId });
        expect(root.findByProps({ "data-testid": bodyId })).toBeDefined();
        act(() => {
          header.props.onClick();
        });
        expect(root.findAllByProps({ "data-testid": bodyId }).length).toBe(0);
        act(() => {
          header.props.onClick();
        });
        expect(root.findByProps({ "data-testid": bodyId })).toBeDefined();
      }
    });
  });

  describe("Sidebar Full Integration", () => {
    it("renders every graph-level section together and drives the store filter", () => {
      act(() => {
        useGraphStore.setState({ dataset: contractDataset, activeFilter: "tools" });
      });

      let selectedSample = "";
      let settingsOpened = false;

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <Sidebar
            currentFile="graph-1.json"
            onSelectSample={(id) => {
              selectedSample = id;
            }}
            onOpenSettings={() => {
              settingsOpened = true;
            }}
          />,
        );
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "sidebar" })).toBeDefined();
      for (const testId of [
        "sidebar-files",
        "sidebar-telemetry",
        "sidebar-role-breakdown",
        "sidebar-section-breakdown",
        "sidebar-review-rounds",
        "sidebar-node-status",
        "token-footprint-breakdown",
        "sidebar-model-breakdown",
      ]) {
        expect(root.findByProps({ "data-testid": testId })).toBeDefined();
      }

      expect(root.findByProps({ "data-testid": "filter-btn-tools" }).props["aria-pressed"]).toBe(
        true,
      );

      act(() => {
        root.findByProps({ "data-testid": "filter-btn-validators" }).props.onClick();
      });
      expect(useGraphStore.getState().activeFilter).toBe("validators");

      act(() => {
        root.findByProps({ "data-testid": "file-item-graph-2.json" }).props.onClick();
      });
      expect(selectedSample).toBe("graph-2.json");
      expect(lastNavigatedArgs).toEqual({
        to: "/graphs/$fileId",
        params: { fileId: "graph-2.json" },
      });

      act(() => {
        root.findByProps({ title: "Developer Settings & Graph Testing" }).props.onClick();
      });
      expect(settingsOpened).toBe(true);
      expect(lastNavigatedArgs).toEqual({ to: "/testing" });
    });

    it("displays refresh error banner when refresh error occurs", () => {
      act(() => {
        useGraphFilesStore.setState({ error: "Failed to fetch graph directory listing" });
      });

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<Sidebar currentFile="sample.json" onSelectSample={() => {}} />);
      });

      expect(renderer!.root.findByProps({ className: "sidebar-refresh-error" }).children).toEqual([
        "Failed to fetch graph directory listing",
      ]);
    });
  });

  describe("TokenFootprintBreakdown", () => {
    it("exports no pricing table, so no dollar figure can be synthesised", () => {
      expect(Object.keys(tokenFootprintModule)).not.toContain("TIER_PRICING");
    });

    it("extracts only reported counts and never prices an unpriced node", () => {
      const reported = extractNodeTokenFootprint(contractDataset.nodes[1]!);
      expect(reported.reported).toBe(true);
      expect(reported.promptTokens).toBe(1000);
      expect(reported.completionTokens).toBe(400);
      expect(reported.costRecorded).toBe(false);
      expect(reported.costUsd).toBe(0);
      expect(reported.model).toBe("claude-sonnet-4");
      expect(reported.evidence).toBe("host_reported");

      const silent = extractNodeTokenFootprint(contractDataset.nodes[2]!);
      expect(silent.reported).toBe(false);
      expect(silent.totalTokens).toBe(0);
      expect(silent.model).toBeUndefined();
    });

    it("aggregates over reporting nodes only and carries the weakest evidence class", () => {
      const analytics = calculateGraphTokenFootprint(contractDataset);
      expect(analytics).not.toBeNull();
      expect(analytics!.nodesCount).toBe(6);
      expect(analytics!.reportingNodes).toBe(2);
      expect(analytics!.totalTokens).toBe(1450);
      expect(analytics!.recordedCostUsd).toBeUndefined();
      // host_reported for the implementer, derived for the estimated sub-agent: the weaker wins.
      expect(analytics!.evidence).toBe("derived");
      expect(analytics!.hasEstimates).toBe(true);
    });

    it("splits the token total across the role groups that reported usage", () => {
      const analytics = calculateGraphTokenFootprint(contractDataset);
      const shares = analytics!.roleShares;
      expect(shares.map((entry) => entry.group)).toEqual(["implementer", "sub-agent"]);
      expect(shares[0]!.totalTokens).toBe(1400);
      expect(shares[1]!.totalTokens).toBe(50);
    });

    it("sums a recorded cost and leaves it absent when nothing recorded one", () => {
      expect(calculateGraphTokenFootprint(sparseDataset)!.recordedCostUsd).toBeCloseTo(0.026, 6);
      expect(calculateGraphTokenFootprint(contractDataset)!.recordedCostUsd).toBeUndefined();
      expect(calculateGraphTokenFootprint(null)).toBeNull();
    });

    it("renders unknown for cost and flags the aggregate as estimated", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<TokenFootprintBreakdown dataset={contractDataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "token-footprint-total-cost" }).children).toEqual([
        "unknown",
      ]);
      expect(root.findByProps({ "data-testid": "token-footprint-coverage" }).children).toEqual([
        "2",
        " of ",
        "6",
        " nodes reported usage",
      ]);
      expect(root.findByProps({ "data-testid": "evidence-chip-derived" }).children).toEqual([
        "derived · estimated",
      ]);
    });

    it("says the run has no token data instead of showing a confident zero", () => {
      const tokenless: GraphDataset = {
        id: "tokenless",
        title: "Tokenless",
        nodes: [{ id: "n1", name: "Node 1", kind: "agent" }],
        edges: [],
      };

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<TokenFootprintBreakdown dataset={tokenless} />);
      });

      const root = renderer!.root;
      const message = root.findByProps({ "data-testid": "token-footprint-unreported" });
      expect(message.children.join("")).toContain("not zero tokens");
      expect(root.findAllByProps({ "data-testid": "token-footprint-total-cost" }).length).toBe(0);
    });

    it("totals counts that stated no provenance, labelled as unverified", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<TokenFootprintBreakdown dataset={sparseDataset} />);
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "token-footprint-input-tokens" }).children).toEqual([
        "4.7k",
      ]);
      expect(root.findByProps({ "data-testid": "token-footprint-total-cost" }).children).toEqual([
        "$0.026",
      ]);
      expect(root.findByProps({ "data-testid": "evidence-chip-unknown" })).toBeDefined();
    });
  });
});
