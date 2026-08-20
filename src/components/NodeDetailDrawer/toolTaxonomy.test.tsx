import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { describeToolCategory, UNCATEGORISED_LABEL } from "../OpenSchema/vocabulary";
import type { GraphNodeData } from "../../types/graphData";
import {
  readBrowserTests,
  readScripts,
  readTelemetry,
  readTokenFootprint,
  readTools,
} from "./nodeSchema";
import { BrowserRunsSection } from "./tabs/BrowserRunsSection";
import { CostTab } from "./tabs/CostTab";
import { ScriptsTab } from "./tabs/ScriptsTab";
import { ToolsTab } from "./tabs/ToolsTab";

function node(overrides: Partial<GraphNodeData> = {}): GraphNodeData {
  return { id: "node-task-T-1", name: "Worker", kind: "agent", ...overrides };
}

describe("what kind of tool something is", () => {
  test("a preset category reads as itself and is marked recognised", () => {
    const described = describeToolCategory("browser-automation");
    expect(described.label).toBe("BROWSER AUTOMATION");
    expect(described.recognized).toBe(true);
    expect(described.recorded).toBe(true);
  });

  test("a category this renderer has never seen keeps its own name and its own accent", () => {
    const described = describeToolCategory("model-evaluation");
    expect(described.label).toBe("MODEL EVALUATION");
    expect(described.recognized).toBe(false);
    expect(described.recorded).toBe(true);
    expect(described.accent).not.toBe(describeToolCategory("build").accent);
  });

  test("a tool nobody categorised says so rather than being filed under a guess", () => {
    for (const value of [undefined, "", "   ", 7]) {
      const described = describeToolCategory(value);
      expect(described.label).toBe(UNCATEGORISED_LABEL);
      expect(described.recorded).toBe(false);
    }
  });
});

describe("tools in the drawer", () => {
  const tools = [
    {
      name: "Read",
      category: "file-edit",
      extras: { mode: "text", lines: 40, nested: { skipped: true } },
      evidence_class: "agent_reported" as const,
    },
    { name: "SomeRunner", category: "model-evaluation", evidence_class: "agent_reported" as const },
    { name: "Unfiled", evidence_class: "agent_reported" as const },
  ];

  test("the reader carries the category and the scalar extras, and skips a nested one", () => {
    const rows = readTools(node({ tools }));
    expect(rows[0]?.category).toBe("file-edit");
    expect(rows[0]?.extras).toEqual([
      { key: "mode", value: "text" },
      { key: "lines", value: "40" },
    ]);
    expect(rows[2]?.category).toBeUndefined();
    expect(rows[2]?.extras).toEqual([]);
  });

  test("every tool shows its category, familiar or not, and absence shows as absence", () => {
    const html = renderToString(<ToolsTab node={node({ tools })} />);
    expect(html.includes("FILE EDIT")).toBe(true);
    expect(html.includes("MODEL EVALUATION")).toBe(true);
    expect(html.includes(UNCATEGORISED_LABEL)).toBe(true);
    expect(html.includes("mode: text")).toBe(true);
  });
});

describe("a command's declared tool in the drawer", () => {
  const scripts = [
    {
      commandId: "cmd-1",
      argv: ["some-runner", "test"],
      exitCode: 0,
      startedAt: "2026-08-19T10:00:00.000Z",
      category: "test-runner",
      tool: "some-runner",
      extras: { shard: "2/4" },
      evidence_class: "harness_observed" as const,
      evidence: {
        category: "agent_reported" as const,
        tool: "agent_reported" as const,
        extras: "agent_reported" as const,
      },
    },
  ];

  test("the reader keeps the declaration and the provenance of each declared field", () => {
    const [row] = readScripts(node({ scripts }));
    expect(row?.category).toBe("test-runner");
    expect(row?.tool).toBe("some-runner");
    expect(row?.extras).toEqual([{ key: "shard", value: "2/4" }]);
    expect(row?.evidence.category).toBe("agent_reported");
  });

  test("a command nobody described shows no category and no tool", () => {
    const [row] = readScripts(
      node({
        scripts: [
          {
            commandId: "cmd-2",
            argv: ["some-runner"],
            exitCode: 0,
            startedAt: "2026-08-19T10:00:00.000Z",
            evidence_class: "harness_observed" as const,
          },
        ],
      }),
    );
    expect(row?.category).toBeUndefined();
    expect(row?.tool).toBeUndefined();
    expect(row?.extras).toEqual([]);
  });

  test("the declaration renders beside the command, labelled as reported", () => {
    const html = renderToString(<ScriptsTab node={node({ scripts })} />);
    expect(html.includes("category: TEST RUNNER")).toBe(true);
    expect(html.includes("tool: some-runner")).toBe(true);
    expect(html.includes("shard: 2/4")).toBe(true);
  });
});

describe("a browser run in the drawer", () => {
  const runs = [
    {
      commandId: "cmd-visual",
      category: "browser-automation",
      runner: "some-runner",
      testFile: "tests/e2e/a.spec.ts",
      extras: { traceFormat: "zip" },
      evidence: { category: "derived" as const, runner: "agent_reported" as const },
    },
  ];

  test("the reader carries the category and the extras", () => {
    const [row] = readBrowserTests(node({ browserTests: runs }));
    expect(row?.category).toBe("browser-automation");
    expect(row?.extras).toEqual([{ key: "traceFormat", value: "zip" }]);
  });

  test("a run that carried only a category is still a run that happened", () => {
    const rows = readBrowserTests(
      node({ browserTests: [{ category: "browser-automation", evidence: {} }] }),
    );
    expect(rows).toHaveLength(1);
  });

  test("the category and what else the runner said both render", () => {
    const html = renderToString(
      <BrowserRunsSection runs={readBrowserTests(node({ browserTests: runs }))} />,
    );
    expect(html.includes("BROWSER AUTOMATION")).toBe(true);
    expect(html.includes("traceFormat: zip")).toBe(true);
  });
});

describe("model telemetry in the drawer", () => {
  const telemetry = {
    agentId: "worker-1",
    provider: { value: "some-provider", evidence_class: "host_reported" as const },
    model: { value: "vendor-model-9-huge-20260101", evidence_class: "host_reported" as const },
    contextWindow: { value: 200000, evidence_class: "host_reported" as const },
    tokenExtras: {
      cache_read_input_tokens: { value: 91000, evidence_class: "host_reported" as const },
    },
  };

  test("the reader carries provider, context window and the host's own counters", () => {
    const view = readTelemetry(node({ telemetry }));
    expect(view.provider?.value).toBe("some-provider");
    expect(view.contextWindow?.value).toBe(200000);
    expect(view.tokenExtras).toEqual([
      {
        name: "cache_read_input_tokens",
        value: { value: 91000, evidenceClass: "host_reported", isEstimated: false },
      },
    ]);
  });

  test("the counters reach the token footprint under the names the host used", () => {
    expect(readTokenFootprint(node({ telemetry })).otherCounters).toEqual([
      {
        name: "cache_read_input_tokens",
        value: 91000,
        evidenceClass: "host_reported",
        isEstimated: false,
      },
    ]);
  });

  test("a node whose host reported none of it carries none of it", () => {
    const view = readTelemetry(node({ telemetry: { agentId: "worker-2" } }));
    expect(view.provider).toBeUndefined();
    expect(view.contextWindow).toBeUndefined();
    expect(view.tokenExtras).toEqual([]);
    expect(readTokenFootprint(node()).otherCounters).toEqual([]);
  });

  test("a counter that is not a labelled number is not a counter", () => {
    // A dataset may carry anything; a counter that is not a labelled number is simply not read.
    const malformed = { tokenExtras: { cache_read: 91000, other: { value: "lots" } } };
    const view = readTelemetry(
      node({ telemetry: malformed as unknown as GraphNodeData["telemetry"] }),
    );
    expect(view.tokenExtras).toEqual([]);
  });
});

describe("model telemetry on the cost view", () => {
  test("provider, context window and the host's own counters all render", () => {
    const html = renderToString(
      <CostTab
        node={node({
          telemetry: {
            provider: { value: "some-provider", evidence_class: "host_reported" },
            model: { value: "vendor-model-9-huge-20260101", evidence_class: "host_reported" },
            contextWindow: { value: 200000, evidence_class: "host_reported" },
            tokenExtras: {
              cache_read_input_tokens: { value: 91000, evidence_class: "host_reported" },
            },
          },
        })}
      />,
    );

    expect(html.includes("some-provider")).toBe(true);
    expect(html.includes("vendor-model-9-huge-20260101")).toBe(true);
    expect(html.includes("Context Window")).toBe(true);
    expect(html.includes("cache_read_input_tokens")).toBe(true);
    expect(html.includes("Other Counters Reported")).toBe(true);
  });

  test("a node whose host reported none of it says unknown and shows no counter section", () => {
    const html = renderToString(<CostTab node={node()} />);

    expect(html.includes("Provider")).toBe(true);
    expect(html.includes("unknown")).toBe(true);
    expect(html.includes("Other Counters Reported")).toBe(false);
  });
});
