// `tsconfig.app.json` scopes ambient types to `vite/client`, so the node typings this file needs to
// read the shipped dataset off disk have to be pulled in here alone.
/// <reference types="node" />

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import {
  classifyTransition,
  readAssets,
  readBranchContext,
  readScripts,
  readStateTransitions,
  readTelemetry,
  readTokenFootprint,
  readTools,
  resolveAssetIds,
} from "./nodeSchema";
import { AssetsTab } from "./tabs/AssetsTab";
import { CostTab } from "./tabs/CostTab";
import { DiffsTab } from "./tabs/DiffsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { RawProvenanceTab } from "./tabs/RawProvenanceTab";
import { ScriptsTab } from "./tabs/ScriptsTab";
import { StateMachineTab } from "./tabs/StateMachineTab";
import { SubagentLineageTree } from "./tabs/SubagentLineageTree";
import { ToolsTab } from "./tabs/ToolsTab";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GRAPHS_DIR = fileURLToPath(new URL("../../../public/data/graphs", import.meta.url));

function loadShippedDatasets(): GraphDataset[] {
  return readdirSync(GRAPHS_DIR)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .map((name) => JSON.parse(readFileSync(`${GRAPHS_DIR}/${name}`, "utf-8")) as GraphDataset);
}

/** A node written by the current producer: canonical assets, scripts, tools and transitions. */
function canonicalNode(): GraphNodeData {
  return {
    id: "node-task-t01",
    name: "Implementer: drawer honesty",
    kind: "agent",
    status: "success",
    assets: [
      { id: "asset-shot-1", type: "image", url: "/evidence/shot-1.png", title: "Drawer" },
      { id: "asset-shot-2", type: "image", url: "/evidence/shot-2.png", title: "Tabs" },
    ],
    telemetry: {
      agentId: "impl-t01",
      role: "implementer",
      host: "claude-code",
      grantStatus: "released",
      model: { value: "claude-opus-5", evidence_class: "host_reported" },
      modelTier: { value: "l", evidence_class: "derived" },
      tokensIn: { value: 4200, evidence_class: "derived", is_estimated: true },
    },
    scripts: [
      {
        commandId: "C-01",
        argv: ["bun", "test", "src/components"],
        cwd: "/repo",
        exitCode: 0,
        status: "completed",
        startedAt: "2026-08-19T10:00:00.000Z",
        finishedAt: "2026-08-19T10:00:04.000Z",
        durationMs: 4000,
        actor: "impl-t01",
        logPath: "commands/C-01/stdout.log",
        stdoutTail: "169 pass 0 fail",
        evidence_class: "harness_observed",
      },
      {
        commandId: "C-02",
        argv: ["bun", "x", "tsc", "-b"],
        exitCode: null,
        startedAt: "2026-08-19T10:01:00.000Z",
        evidence_class: "harness_observed",
      },
    ],
    tools: [
      {
        name: "Bash",
        evidence_class: "host_reported",
        firstReportedAt: "2026-08-19T10:00:00.000Z",
      },
      { name: "WebSearch", evidence_class: "agent_reported" },
    ],
    stateTransitions: [
      {
        at: "2026-08-19T09:00:00.000Z",
        actor: "coordinator",
        from: "pending",
        to: "claimed",
        reason: "lease granted",
        attempt: 1,
        evidence_class: "harness_observed",
      },
      {
        at: "2026-08-19T11:00:00.000Z",
        actor: "val-t01",
        from: "validating",
        to: "validating",
        reason: "adversarial probe recorded",
        attempt: 1,
        evidence_class: "harness_observed",
        verdict: "probe",
        round: 1,
        findingClass: "probe_demand",
        findingCount: 1,
      },
      {
        at: "2026-08-19T12:00:00.000Z",
        actor: "val-t01",
        from: "validating",
        to: "rejected",
        reason: "review recorded",
        attempt: 2,
        evidence_class: "harness_observed",
        verdict: "reject",
        round: 1,
        findingClass: "defect",
        findingCount: 3,
      },
    ],
    metadata: {
      role: "implementer",
      repairRounds: 1,
      probeRounds: 1,
      findings: [
        {
          id: "finding-1",
          severity: "critical",
          observation: "Screenshot shows a fabricated cost",
          status: "open",
          screenshotAssetIds: ["asset-shot-2", "asset-not-owned-here"],
        },
      ],
    },
  } as unknown as GraphNodeData;
}

/** A node whose values carry no evidence labels: real numbers, unrecorded provenance. */
function unlabelledNode(): GraphNodeData {
  return {
    id: "node-unlabelled",
    name: "Unlabelled Implementer",
    kind: "agent",
    status: "success",
    metrics: {
      tokensIn: 306,
      tokensOut: 217,
      tokens: { inputTokens: 306, outputTokens: 217, totalTokens: 523, isEstimated: true },
      hostAgent: { hostTool: "antigravity", modelName: "Gemini 3.7 Flash (High)", modelTier: "l" },
    },
    metadata: {
      commands: [
        {
          id: "cmd-legacy",
          argv: ["bun", "run", "audit"],
          cwd: "/repo",
          exitCode: 0,
          durationMs: 1200,
          startedAt: "2026-08-15T00:00:00.000Z",
          finishedAt: "2026-08-15T00:00:01.200Z",
        },
      ],
    },
  } as unknown as GraphNodeData;
}

describe("canonical node schema readers", () => {
  test("readAssets takes node.assets as the one home a node's evidence has", () => {
    const canonical = readAssets(canonicalNode());
    expect(canonical.map((asset) => asset.id)).toEqual(["asset-shot-1", "asset-shot-2"]);
  });

  test("readAssets reports absence rather than inventing a gallery", () => {
    expect(readAssets({ id: "node-bare", name: "Bare" })).toEqual([]);
  });

  test("resolveAssetIds resolves finding references and reports the ids this node does not own", () => {
    const node = canonicalNode();
    const { resolved, unresolved } = resolveAssetIds(
      ["asset-shot-2", "asset-not-owned-here"],
      readAssets(node),
    );
    expect(resolved.map((asset) => asset.id)).toEqual(["asset-shot-2"]);
    expect(unresolved).toEqual(["asset-not-owned-here"]);
  });

  test("readScripts prefers canonical scripts and keeps a null exit code null", () => {
    const scripts = readScripts(canonicalNode());
    expect(scripts.length).toBe(2);
    expect(scripts[0]?.source).toBe("canonical");
    expect(scripts[0]?.argv).toEqual(["bun", "test", "src/components"]);
    expect(scripts[0]?.logPath).toBe("commands/C-01/stdout.log");
    expect(scripts[0]?.evidenceClass).toBe("harness_observed");
    expect(scripts[1]?.exitCode).toBeNull();
    expect(scripts[1]?.durationMs).toBeUndefined();
  });

  test("readScripts falls back to the metadata command records", () => {
    const scripts = readScripts(unlabelledNode());
    expect(scripts.length).toBe(1);
    expect(scripts[0]?.source).toBe("legacy");
    expect(scripts[0]?.evidenceClass).toBeUndefined();
  });

  test("readTools keeps each tool's evidence class and marks the unlabelled entries", () => {
    const tools = readTools(canonicalNode());
    expect(tools.map((tool) => tool.evidenceClass)).toEqual(["host_reported", "agent_reported"]);

    const unlabelledTools = readTools({
      id: "n",
      name: "n",
      tools: [{ name: "run_command" }],
    });
    expect(unlabelledTools[0]?.evidenceClass).toBeUndefined();
    expect(unlabelledTools[0]?.source).toBe("legacy");
  });

  test("classifyTransition keeps a probe apart from a pushback", () => {
    expect(classifyTransition({ verdict: "probe", to: "validating" })).toBe("probe");
    expect(classifyTransition({ findingClass: "probe_demand", to: "validating" })).toBe("probe");
    expect(classifyTransition({ verdict: "reject", to: "rejected" })).toBe("pushback");
    expect(classifyTransition({ findingClass: "defect", to: "validating" })).toBe("pushback");
    expect(classifyTransition({ to: "claimed" })).toBe("plain");
  });

  test("readStateTransitions carries the review payload that caused the move", () => {
    const rows = readStateTransitions(canonicalNode());
    expect(rows.length).toBe(3);
    expect(rows[1]?.transitionClass).toBe("probe");
    expect(rows[1]?.round).toBe(1);
    expect(rows[2]?.transitionClass).toBe("pushback");
    expect(rows[2]?.findingCount).toBe(3);
    expect(readStateTransitions({ id: "n", name: "n" })).toEqual([]);
  });

  test("readTelemetry keeps evidence classes and leaves an unreported field absent", () => {
    const telemetry = readTelemetry(canonicalNode());
    expect(telemetry.model?.value).toBe("claude-opus-5");
    expect(telemetry.model?.evidenceClass).toBe("host_reported");
    expect(telemetry.modelTier?.evidenceClass).toBe("derived");
    expect(telemetry.tokensIn?.isEstimated).toBe(true);
    expect(telemetry.thinkingLevel).toBeUndefined();
    expect(telemetry.tokensOut).toBeUndefined();
  });

  test("readTelemetry reads a host record's model without claiming a provenance for it", () => {
    const telemetry = readTelemetry(unlabelledNode());
    expect(telemetry.model?.value).toBe("Gemini 3.7 Flash (High)");
    expect(telemetry.model?.evidenceClass).toBeUndefined();
    expect(telemetry.host).toBe("antigravity");
  });

  test("readTokenFootprint never produces a cost the dataset did not carry", () => {
    expect(readTokenFootprint(canonicalNode()).costUsd).toBeUndefined();

    const unlabelled = readTokenFootprint(unlabelledNode());
    expect(unlabelled.totalTokens).toBe(523);
    expect(unlabelled.isEstimated).toBe(true);
    expect(unlabelled.costUsd).toBeUndefined();

    const priced = readTokenFootprint({
      id: "n",
      name: "n",
      metrics: { tokensIn: 10, tokensOut: 5, costUsd: 0.25 },
    });
    expect(priced.costUsd).toBe(0.25);
  });

  test("readBranchContext reads the branch reason off the node's own section", () => {
    const branchNode: GraphNodeData = {
      id: "node-branch-B-1-sub-1",
      name: "Sub-task: migrate fixtures",
      kind: "agent",
      sectionId: "section-branch-B-1",
      metadata: {
        branchId: "B-1",
        branchReason: "fixture migration is larger than the plan assumed",
        subTaskId: "sub-1",
        subTaskStatus: "submitted",
        parentTaskId: "task-04",
        writeScope: ["src/fixtures/**"],
        depth: 1,
      },
    };
    const dataset: GraphDataset = {
      id: "ds",
      title: "Branching Run",
      nodes: [branchNode],
      edges: [],
      sections: [
        {
          id: "section-branch-B-1",
          title: "Branch of task-04",
          nodeIds: ["node-branch-B-1-sub-1"],
          reason: "fixture migration is larger than the plan assumed",
          parentNodeId: "node-task-task-04",
          status: "collected",
        },
      ],
    } as unknown as GraphDataset;

    const branch = readBranchContext(branchNode, dataset);
    expect(branch?.reason).toBe("fixture migration is larger than the plan assumed");
    expect(branch?.subTaskId).toBe("sub-1");
    expect(branch?.parentNodeId).toBe("node-task-task-04");
    expect(branch?.sectionStatus).toBe("collected");
    expect(readBranchContext({ id: "n", name: "n" })).toBeUndefined();
  });
});

describe("StateMachineTab", () => {
  test("renders every recorded move with its actor, attempt and reason", () => {
    const html = renderToString(<StateMachineTab node={canonicalNode()} />);
    expect(html.includes("pending")).toBe(true);
    expect(html.includes("claimed")).toBe(true);
    expect(html.includes("lease granted")).toBe(true);
    expect(html.includes("Attempt 1")).toBe(true);
    expect(html.includes("val-t01")).toBe(true);
  });

  test("renders a probe round and a pushback round as different things", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<StateMachineTab node={canonicalNode()} />);
    });

    const probeCards = renderer.root.findAll(
      (instance) => instance.props.className === "state-transition-card is-probe",
    );
    const pushbackCards = renderer.root.findAll(
      (instance) => instance.props.className === "state-transition-card is-pushback",
    );
    expect(probeCards.length).toBe(1);
    expect(pushbackCards.length).toBe(1);

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Adversarial Probe");
    expect(json).toContain("A probe is not a rejection");
    expect(json).toContain("Pushback");
    expect(json).toContain("3 findings");

    expect(json).toContain("1 probe round");
    expect(json).toContain("1 pushback");

    act(() => renderer.unmount());
  });

  test("renders an explicit empty state when nothing was recorded", () => {
    const html = renderToString(<StateMachineTab node={{ id: "n", name: "Bare Node" }} />);
    expect(html.includes("No state transitions were recorded for this node.")).toBe(true);
  });
});

describe("ScriptsTab", () => {
  test("renders real argv, exit code, duration, log path and stdout tail", () => {
    const html = renderToString(<ScriptsTab node={canonicalNode()} />);
    expect(html.includes("bun test src/components")).toBe(true);
    expect(html.includes("exit 0")).toBe(true);
    expect(html.includes("4.0s")).toBe(true);
    expect(html.includes("commands/C-01/stdout.log")).toBe(true);
    expect(html.includes("169 pass 0 fail")).toBe(true);
  });

  test("renders an unreported exit code, duration and log tail as unknown", () => {
    const html = renderToString(<ScriptsTab node={canonicalNode()} />);
    expect(html.includes("unknown")).toBe(true);
    expect(html.includes("no stderr recorded")).toBe(true);
  });

  test("falls back to the metadata command records without rendering them twice", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ScriptsTab node={unlabelledNode()} />);
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("bun run audit");
    expect(json.split("bun run audit").length - 1).toBe(1);
    act(() => renderer.unmount());
  });

  test("renders an explicit empty state when no script ran", () => {
    const html = renderToString(<ScriptsTab node={{ id: "n", name: "Bare Node" }} />);
    expect(html.includes("No scripts were recorded for this node.")).toBe(true);
  });
});

describe("ToolsTab", () => {
  test("separates a host-reported tool from an agent-reported one", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ToolsTab node={canonicalNode()} />);
    });

    expect(renderer.root.findByProps({ "data-testid": "tool-group-host_reported" })).toBeDefined();
    expect(renderer.root.findByProps({ "data-testid": "tool-group-agent_reported" })).toBeDefined();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("host-reported");
    expect(json).toContain("agent-reported");
    expect(json).toContain("Bash");
    expect(json).toContain("WebSearch");

    act(() => renderer.unmount());
  });

  test("marks a tool with no evidence class as unlabelled rather than measured", () => {
    const html = renderToString(
      <ToolsTab node={{ id: "n", name: "n", tools: [{ name: "run_command" }] }} />,
    );
    expect(html.includes("unlabelled")).toBe(true);
    expect(html.includes("measured")).toBe(false);
  });

  test("renders an explicit empty state when no tool was recorded", () => {
    const html = renderToString(<ToolsTab node={{ id: "n", name: "Bare Node" }} />);
    expect(html.includes("No tool usage was recorded for this node.")).toBe(true);
  });
});

describe("telemetry and branch rendering in OverviewTab", () => {
  test("renders an unreported model, tier and thinking level as an explicit unknown", () => {
    const html = renderToString(
      <OverviewTab
        node={{ id: "node-plain", name: "Plain Node", kind: "agent" }}
        inputs={[]}
        outputs={[]}
        nodeNamesById={new Map()}
      />,
    );
    expect(html.includes("Host Agent Attribution")).toBe(true);
    expect(html.includes("drawer-unknown-value")).toBe(true);
    expect(html.includes("Unspecified")).toBe(false);
  });

  test("labels an estimated token count as estimated", () => {
    const html = renderToString(
      <OverviewTab node={canonicalNode()} inputs={[]} outputs={[]} nodeNamesById={new Map()} />,
    );
    expect(html.includes("estimated")).toBe(true);
    expect(html.includes("host-reported")).toBe(true);
  });

  test("shows a branch sub-agent's own sub-task and the recorded branch reason", () => {
    const branchNode: GraphNodeData = {
      id: "node-branch-B-2-sub-3",
      name: "Sub-task: split the layout audit",
      kind: "agent",
      sectionId: "section-branch-B-2",
      metadata: {
        branchId: "B-2",
        branchReason: "the audit exceeded the parent's write scope",
        subTaskId: "sub-3",
        subTaskStatus: "submitted",
        parentTaskId: "task-07",
        writeScope: ["src/engine/**"],
      },
    };
    const dataset: GraphDataset = {
      id: "ds",
      title: "Branching Run",
      nodes: [branchNode],
      edges: [],
      sections: [
        {
          id: "section-branch-B-2",
          title: "Branch of task-07",
          nodeIds: ["node-branch-B-2-sub-3"],
          reason: "the audit exceeded the parent's write scope",
        },
      ],
    } as unknown as GraphDataset;

    const html = renderToString(
      <OverviewTab
        node={branchNode}
        inputs={[]}
        outputs={[]}
        nodeNamesById={new Map()}
        dataset={dataset}
      />,
    );
    expect(html.includes("Branch Sub-task")).toBe(true);
    expect(html.includes("sub-3")).toBe(true);
    expect(html.includes("the audit exceeded the parent&#x27;s write scope")).toBe(true);
    expect(html.includes("task-07")).toBe(true);
    expect(html.includes("src/engine/**")).toBe(true);
  });
});

describe("RawProvenanceTab evidence inventory", () => {
  test("indexes what the node actually carries and names the absent ones", () => {
    const html = renderToString(<RawProvenanceTab node={canonicalNode()} />);
    expect(html.includes("Recorded Evidence")).toBe(true);
    expect(html.includes("2 · see Scripts")).toBe(true);
    expect(html.includes("3 · see State Machine")).toBe(true);
    expect(html.includes("none recorded")).toBe(true);
    expect(html.includes("impl-t01")).toBe(true);
  });
});

describe("a field the run never recorded stays unrecorded", () => {
  test("a browser run that reported no outcome is unknown, not failed", () => {
    const html = renderToString(
      <AssetsTab
        node={{
          id: "n-visual",
          name: "Visual check",
          browserTests: [
            {
              commandId: "cmd-visual",
              browser: "chromium",
              traces: ["traces/run-1.zip"],
              videos: ["videos/run-1.webm"],
              evidence: { browser: "agent_reported" },
            },
          ],
        }}
      />,
    );

    expect(html.includes("Browser Test Runs")).toBe(true);
    expect(html.includes("failed")).toBe(false);
    expect(html.includes("drawer-unknown-value")).toBe(true);
    // The trace and the video exist nowhere else, so the run record has to carry them.
    expect(html.includes("traces/run-1.zip")).toBe(true);
    expect(html.includes("videos/run-1.webm")).toBe(true);
  });

  test("a file whose mode was never recorded is not shown as a write", () => {
    const html = renderToString(
      <DiffsTab
        node={{
          id: "n-files",
          name: "Touched files",
          files: [{ path: "src/a.ts" }, { path: "src/b.ts", mode: "write" }],
        }}
      />,
    );

    expect(html.includes("src/a.ts")).toBe(true);
    expect(html.includes("Unrecorded mode (1)")).toBe(true);
    expect(html.includes("Modified")).toBe(true);
  });
});

describe("the shipped dataset renders", () => {
  const datasets = loadShippedDatasets();

  test("every shipped node renders without a fabricated dollar figure", () => {
    expect(datasets.length).toBeGreaterThan(0);
    for (const dataset of datasets) {
      for (const node of dataset.nodes) {
        const html = renderToString(<CostTab node={node} dataset={dataset} />);
        expect(html.includes("NaN")).toBe(false);
        // No node in the shipped capsule reported a cost, so none may show one.
        expect(html.includes("no cost recorded")).toBe(true);
        expect(html.includes("$")).toBe(false);
      }
    }
  });

  test("a node with a real context window and provider-specific counter renders both, not just the schema shape", () => {
    // Both fields are optional in the schema and render nothing by default (EvidenceChip below), so
    // a suite that never exercises a node carrying them would pass even if the render path broke.
    // At least one shipped node must genuinely carry both, or this assertion catches the regression.
    let sawContextWindow = false;
    let sawTokenExtra = false;
    for (const dataset of datasets) {
      for (const node of dataset.nodes) {
        const telemetry = readTelemetry(node);
        const footprint = readTokenFootprint(node);
        if (telemetry.contextWindow === undefined && footprint.otherCounters.length === 0) continue;
        const html = renderToString(<CostTab node={node} dataset={dataset} />);
        if (telemetry.contextWindow !== undefined) {
          sawContextWindow = true;
          expect(html).toContain('data-testid="node-context-window"');
          expect(html).toContain(">200k<");
        }
        for (const counter of footprint.otherCounters) {
          sawTokenExtra = true;
          expect(html).toContain('data-testid="other-counter"');
          expect(html).toContain(counter.name);
        }
      }
    }
    expect(sawContextWindow).toBe(true);
    expect(sawTokenExtra).toBe(true);
  });

  test("every shipped node renders its overview and provenance", () => {
    for (const dataset of datasets) {
      for (const node of dataset.nodes) {
        const overview = renderToString(
          <OverviewTab
            node={node}
            inputs={[]}
            outputs={[]}
            nodeNamesById={new Map()}
            dataset={dataset}
          />,
        );
        expect(overview.length).toBeGreaterThan(0);
        expect(renderToString(<RawProvenanceTab node={node} />).length).toBeGreaterThan(0);
      }
    }
  });

  test("a node that never recorded a probe round shows no round count at all, and a node that recorded a real zero shows that zero", () => {
    for (const dataset of datasets) {
      for (const node of dataset.nodes) {
        const html = renderToString(<CostTab node={node} dataset={dataset} />);
        const recorded = typeof node.metadata?.probeRounds === "number";
        // The structural nodes (prompt, plan, critic, terminal) never had rounds tracked at all, so
        // they show the absence rather than a manufactured zero. The task, validator and gate nodes
        // in this run genuinely went through zero probe rounds, and that measured zero must render
        // as the number it is, not be collapsed into "never recorded".
        expect(html.includes("never recorded for this node")).toBe(!recorded);
      }
    }
  });

  test("the prompt node's lineage is empty rather than the whole run", () => {
    for (const dataset of datasets) {
      const promptNode = dataset.nodes.find((node) => node.kind === "input");
      if (!promptNode) continue;
      const html = renderToString(
        <SubagentLineageTree node={promptNode} dataset={dataset} onSelectNode={() => {}} />,
      );
      expect(html.includes("No subagent lineage")).toBe(true);
      for (const other of dataset.nodes) {
        if (other.id === promptNode.id) continue;
        expect(html.includes(other.name)).toBe(false);
      }
    }
  });
});
