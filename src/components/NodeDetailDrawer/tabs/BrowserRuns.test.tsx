import { afterEach, describe, expect, test } from "bun:test";
import * as bunTest from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToString } from "react-dom/server";

interface ModuleMocker {
  module(id: string, factory: () => unknown): void | Promise<void>;
}

const mock = (bunTest as unknown as { mock: ModuleMocker }).mock;

mock.module("@tanstack/react-router", () => ({
  useNavigate: () => () => Promise.resolve(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useGraphStore } from "../../../state/useGraphStore";
import type { GraphDataset, GraphNodeData } from "../../../types/graphData";
import { NodeDetailDrawer } from "..";
import { readBrowserTests } from "../nodeSchema";
import { AssetsTab } from "./AssetsTab";

function node(overrides: Partial<GraphNodeData> = {}): GraphNodeData {
  return { id: "node-validator-T-1", name: "Validator", kind: "agent", ...overrides };
}

const fullRun = {
  commandId: "cmd-visual",
  runner: "gvui-visual-suite",
  testFile: "tests/e2e/drawer.spec.ts",
  browser: "chromium",
  status: "passed",
  durationMs: 8200,
  viewport: { width: 1440, height: 900 },
  traces: ["test-results/trace.zip"],
  videos: ["test-results/session.webm"],
  reportPath: "test-results/report.json",
  evidence: {
    runner: "agent_reported",
    testFile: "agent_reported",
    browser: "agent_reported",
    viewport: "agent_reported",
    durationMs: "harness_observed",
    status: "harness_observed",
  },
};

function renderAssets(data: GraphNodeData): string {
  return renderToString(<AssetsTab node={data} />);
}

describe("browser runs reach the drawer", () => {
  test("a recorded run renders every fact it carried, each with its provenance", () => {
    const html = renderAssets(node({ browserTests: [fullRun] }));

    expect(html.includes("Browser Test Runs")).toBe(true);
    expect(html.includes("tests/e2e/drawer.spec.ts")).toBe(true);
    expect(html.includes("gvui-visual-suite")).toBe(true);
    expect(html.includes("chromium")).toBe(true);
    expect(html.includes("1440")).toBe(true);
    expect(html.includes("900")).toBe(true);
    expect(html.includes("8.20")).toBe(true);
    expect(html.includes("passed")).toBe(true);
    expect(html.includes("test-results/trace.zip")).toBe(true);
    expect(html.includes("test-results/session.webm")).toBe(true);
    expect(html.includes("test-results/report.json")).toBe(true);
    // The clock was measured and the viewport was claimed; the two never read alike.
    expect(html.includes("measured")).toBe(true);
    expect(html.includes("agent-reported")).toBe(true);
  });

  test("a field the run never reported renders as unknown, never as a default", () => {
    const html = renderAssets(
      node({
        browserTests: [{ commandId: "cmd-bare", status: "failed", evidence: {} }],
      }),
    );

    expect(html.includes("Browser Test Runs")).toBe(true);
    expect(html.includes("drawer-unknown-value")).toBe(true);
    expect(html.includes("1280")).toBe(false);
    expect(html.includes("720")).toBe(false);
    expect(html.includes("Playwright")).toBe(false);
  });

  test("a run across several viewports lists them all instead of naming one", () => {
    const html = renderAssets(
      node({
        browserTests: [
          {
            commandId: "cmd-multi",
            viewports: [
              { name: "desktop", width: 1440, height: 900 },
              { name: "mobile", width: 390, height: 844 },
              { width: 768, height: 1024 },
            ],
            evidence: { viewports: "agent_reported" },
          },
        ],
      }),
    );

    expect(html.includes("desktop 1440")).toBe(true);
    expect(html.includes("mobile 390")).toBe(true);
    // A viewport the run never named still gets its size shown rather than a made-up label.
    expect(html.includes("768 × 1024")).toBe(true);
  });

  test("a node with no browser run shows no run section at all", () => {
    const html = renderAssets(
      node({ assets: [{ id: "a-1", type: "image", url: "/shots/one.png", title: "One" }] }),
    );

    expect(html.includes("Browser Test Runs")).toBe(false);
    expect(html.includes("browser-run-card")).toBe(false);
  });

  test("an entry carrying no fact is not rendered as an empty run", () => {
    const html = renderAssets(
      node({ browserTests: [{}, "junk", 7] as unknown as GraphNodeData["browserTests"] }),
    );

    expect(html.includes("Browser Test Runs")).toBe(false);
  });
});

describe("reading browser runs tolerates what it does not understand", () => {
  test("an unknown key is ignored and the rest of the run survives", () => {
    const rows = readBrowserTests(
      node({
        browserTests: [
          { commandId: "cmd-1", browser: "webkit", somethingNew: { nested: true }, evidence: {} },
        ] as unknown as GraphNodeData["browserTests"],
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.browser).toBe("webkit");
  });

  test("a field of the wrong type is skipped without discarding the run", () => {
    const rows = readBrowserTests(
      node({
        browserTests: [
          {
            commandId: "cmd-1",
            browser: 42,
            durationMs: "fast",
            viewport: { width: "wide", height: 900 },
            traces: "trace.zip",
            evidence: { browser: "not-a-class", status: "harness_observed" },
          },
        ] as unknown as GraphNodeData["browserTests"],
      }),
    );

    expect(rows[0]?.commandId).toBe("cmd-1");
    expect(rows[0]?.browser).toBeUndefined();
    expect(rows[0]?.durationMs).toBeUndefined();
    expect(rows[0]?.viewport).toBeUndefined();
    expect(rows[0]?.traces).toEqual([]);
    expect(rows[0]?.evidence).toEqual({ status: "harness_observed" });
  });

  test("a node with no browserTests field at all reads as no runs", () => {
    expect(readBrowserTests(node())).toEqual([]);
    expect(readBrowserTests(node({ browserTests: [] }))).toEqual([]);
  });
});

describe("the drawer opens the assets view for a run with no media", () => {
  const dataset: GraphDataset = {
    id: "browser-run-dataset",
    title: "Browser run",
    nodes: [node({ browserTests: [fullRun] })],
    edges: [],
  };

  function renderDrawer(): { root: ReactTestRenderer["root"]; unmount: () => void } {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<NodeDetailDrawer />);
    });
    return { root: renderer.root, unmount: () => act(() => renderer.unmount()) };
  }

  afterEach(() => {
    act(() => {
      useGraphStore.setState({ dataset: null, selectedNodeId: null });
    });
  });

  test("the Assets tab appears because the node carries a browser run", () => {
    act(() => {
      useGraphStore.setState({ dataset, selectedNodeId: "node-validator-T-1" });
    });
    const { root, unmount } = renderDrawer();

    expect(root.findByProps({ "data-testid": "drawer-tab-assets" })).toBeDefined();

    unmount();
  });
});
