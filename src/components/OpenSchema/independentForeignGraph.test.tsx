import { afterEach, describe, expect, test } from "bun:test";
import * as bunTest from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

interface ModuleMocker {
  module(id: string, factory: () => unknown): void | Promise<void>;
}

const mock = (bunTest as unknown as { mock: ModuleMocker }).mock;

mock.module("@tanstack/react-router", () => ({
  useNavigate: () => () => Promise.resolve(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset } from "../../types/graphData";
import { NodeDetailDrawer } from "../NodeDetailDrawer";
import { Sidebar } from "../Sidebar";
import {
  describeOpenEdgeKind,
  describeOpenIdentity,
  describeOpenKind,
  describeOpenStatus,
} from ".";

/** A trawler fleet's logistics sketch: no orchestration word appears anywhere in it. */
const fleet: GraphDataset = {
  id: "verifier-fleet",
  title: "Fleet on the Black Sea",
  sections: [
    {
      id: "sec-hulls",
      title: "Hulls",
      description: "the boats themselves",
      nodeIds: ["v-lodos", "v-poyraz"],
    },
  ],
  nodes: [
    {
      id: "v-lodos",
      name: "Lodos",
      kind: "trawler",
      status: "moored",
      description: "wooden hull, 1974",
      metadata: {
        role: "skipper-owned",
        homePort: "Şile",
        holdTonnes: 14.5,
        icemaker: false,
        lastRefit: null,
        certificates: ["hull-2026", "radio-2025"],
        radio: { callsign: "TC-LOD", channel: 16, backup: { channel: 9, tested: true } },
        manual: "https://example.org/lodos/manual.pdf",
      },
    },
    {
      id: "v-poyraz",
      name: "Poyraz",
      kind: "longliner",
      status: "at-sea",
      metadata: { role: "cooperative", homePort: "Rize" },
    },
    { id: "v-bare", name: "Unnamed skiff" },
  ],
  edges: [
    { id: "e-tows", source: "v-lodos", target: "v-poyraz", kind: "tows" },
    { id: "e-none", source: "v-poyraz", target: "v-bare" },
  ],
};

function renderJson(element: Parameters<typeof create>[0]): {
  root: ReactTestRenderer["root"];
  json: () => string;
  unmount: () => void;
} {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  return {
    root: renderer.root,
    json: () => JSON.stringify(renderer.toJSON()),
    unmount: () => act(() => renderer.unmount()),
  };
}

function select(nodeId: string): void {
  act(() => {
    useGraphStore.setState({ dataset: fleet, selectedNodeId: nodeId });
  });
}

afterEach(() => {
  act(() => {
    useGraphStore.setState({ dataset: null, selectedNodeId: null });
  });
});

describe("verifier probe: an unanticipated graph", () => {
  test("an unknown kind never wears a preset identity and accents are stable and distinct", () => {
    const trawler = describeOpenKind({ kind: "trawler" });
    const longliner = describeOpenKind({ kind: "longliner" });
    expect(trawler.recognized).toBe(false);
    expect(trawler.label).toBe("TRAWLER");
    expect(trawler.accent).not.toBe(longliner.accent);
    expect(describeOpenKind({ kind: "trawler" }).accent).toBe(trawler.accent);
    // must not borrow a preset's colour
    expect(trawler.accent).not.toBe(describeOpenKind({ kind: "agent" }).accent);

    const identity = describeOpenIdentity(fleet.nodes[0]!);
    expect(identity.recognized).toBe(false);
    expect(identity.label.toLowerCase()).not.toContain("worker");
    expect(identity.label.toLowerCase()).not.toContain("agent");
  });

  test("an unrecorded status is unknown, a foreign status is itself", () => {
    const none = describeOpenStatus({});
    expect(none.recorded).toBe(false);
    expect(none.label.toLowerCase()).toBe("unknown");
    const moored = describeOpenStatus({ status: "moored" });
    expect(moored.recorded).toBe(true);
    expect(moored.recognized).toBe(false);
    expect(moored.label).toBe("Moored");
    expect(moored.color).not.toBe(describeOpenStatus({ status: "at-sea" }).color);
  });

  test("an unknown edge kind is not dressed as sequence, an absent one is unknown", () => {
    const tows = describeOpenEdgeKind({ kind: "tows" });
    expect(tows.recognized).toBe(false);
    expect(tows.label).toBe("TOWS");
    expect(describeOpenEdgeKind({}).label.toLowerCase()).toBe("unknown");
  });

  test("the drawer surfaces every arbitrary property of a foreign node", () => {
    select("v-lodos");
    const { root, json, unmount } = renderJson(<NodeDetailDrawer />);
    const propertiesTab = root.findAllByProps({ "data-testid": "drawer-tab-properties" });
    expect(propertiesTab.length).toBeGreaterThan(0);
    act(() => {
      (propertiesTab[0]!.props as { onClick: () => void }).onClick();
    });
    const html = json();
    for (const token of [
      "Home Port",
      "Şile",
      "Hold Tonnes",
      "14.5",
      "Icemaker",
      "false",
      "Last Refit",
      "empty",
      "hull-2026",
      "Callsign",
      "TC-LOD",
      "https://example.org/lodos/manual.pdf",
    ]) {
      expect(html).toContain(token);
    }
    // nested depth 3 still readable
    expect(html).toContain("Backup");
    unmount();
  });

  test("a node carrying nothing orchestration-shaped gets no cost or dependency tabs and no invented status", () => {
    select("v-bare");
    const { root, json, unmount } = renderJson(<NodeDetailDrawer />);
    expect(root.findAllByProps({ "data-testid": "drawer-tab-cost" }).length).toBe(0);
    const html = json();
    expect(html).not.toContain("Pending");
    expect(html.toLowerCase()).toContain("unknown");
    unmount();
  });

  test("the sidebar names this graph's own kinds, roles and statuses", () => {
    select("v-lodos");
    const { json, unmount } = renderJson(
      <Sidebar currentFile="fleet.json" onSelectSample={() => {}} />,
    );
    const html = json();
    for (const token of ["TRAWLER", "LONGLINER", "TOWS", "homePort", "Moored", "At Sea"]) {
      expect(html).toContain(token);
    }
    unmount();
  });
});
