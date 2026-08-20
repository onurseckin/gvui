import { describe, expect, test } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { GraphNodeData, MediaAsset } from "../../../types/graphData";
import { AssetsTab } from "./AssetsTab";

function nodeWith(assets: MediaAsset[]): GraphNodeData {
  return { id: "n1", name: "Node", assets };
}

function renderTab(node: GraphNodeData): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<AssetsTab node={node} />);
  });
  return renderer;
}

function chipLabels(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType("button")
    .flatMap((button) =>
      button.children.filter((child): child is string => typeof child === "string"),
    );
}

/**
 * Which role produced an asset is a fact the run records. Reading it out of an id, a title or an
 * author string would let any file with the right letters in its name claim to be evidence.
 */
describe("AssetsTab producer attribution", () => {
  test("counts an asset as validation evidence on the recorded stage", () => {
    const renderer = renderTab(
      nodeWith([
        { id: "one", type: "image", url: "/one.png", metadata: { stage: "validation" } },
        { id: "two", type: "image", url: "/two.png", metadata: { stage: "execution" } },
        { id: "three", type: "image", url: "/three.png", metadata: { stage: "critic" } },
      ]),
    );
    const labels = chipLabels(renderer);
    expect(labels).toContain("Validation Evidence (1)");
    expect(labels).toContain("Worker Snapshots (1)");
    expect(labels).toContain("Critic Certifications (1)");
    expect(labels.some((label) => label.startsWith("Producer unknown"))).toBe(false);
  });

  test("refuses to read a producer out of an id, a title, an author or a description", () => {
    const renderer = renderTab(
      nodeWith([
        { id: "asset-val-1", type: "image", url: "/a.png", title: "Validation finding evidence" },
        { id: "b", type: "image", url: "/b.png", author: "worker-agent-2" },
        { id: "c", type: "image", url: "/c.png", description: "critic completeness signoff" },
      ]),
    );
    const labels = chipLabels(renderer);
    expect(labels).toContain("Producer unknown (3)");
    expect(labels.some((label) => label.startsWith("Validation Evidence"))).toBe(false);
    expect(labels.some((label) => label.startsWith("Worker Snapshots"))).toBe(false);
    expect(labels.some((label) => label.startsWith("Critic Certifications"))).toBe(false);
  });

  test("honours the explicit flags a caller records on an asset", () => {
    const renderer = renderTab(
      nodeWith([
        { id: "one", type: "image", url: "/one.png", metadata: { isValidationEvidence: true } },
        { id: "two", type: "image", url: "/two.png", metadata: { validatorId: "V-1" } },
        { id: "three", type: "image", url: "/three.png", metadata: { isWorkerSnapshot: true } },
        { id: "four", type: "image", url: "/four.png", metadata: { isCriticCertification: true } },
      ]),
    );
    const labels = chipLabels(renderer);
    expect(labels).toContain("Validation Evidence (2)");
    expect(labels).toContain("Worker Snapshots (1)");
    expect(labels).toContain("Critic Certifications (1)");
  });

  test("ignores a stage value outside the recorded vocabulary", () => {
    const renderer = renderTab(
      nodeWith([
        { id: "one", type: "image", url: "/one.png", metadata: { stage: "validated" } },
        { id: "two", type: "image", url: "/two.png", metadata: { stage: "validation" } },
      ]),
    );
    expect(chipLabels(renderer)).toContain("Producer unknown (1)");
    expect(chipLabels(renderer)).toContain("Validation Evidence (1)");
  });

  test("shows only unattributed assets under the unattributed filter", () => {
    const renderer = renderTab(
      nodeWith([
        {
          id: "one",
          type: "image",
          url: "/one.png",
          title: "Recorded Shot",
          metadata: { stage: "validation" },
        },
        { id: "two", type: "image", url: "/two.png", title: "Orphan Shot" },
      ]),
    );
    const button = renderer.root
      .findAllByType("button")
      .find((candidate) => candidate.children.includes("Producer unknown (1)"));
    expect(button).toBeDefined();
    act(() => {
      button?.props.onClick();
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json.includes("Orphan Shot")).toBe(true);
    expect(json.includes("Recorded Shot")).toBe(false);
  });

  test("types an asset from what it declares, not from words in its title", () => {
    const renderer = renderTab(
      nodeWith([
        { id: "one", type: "image", url: "/one.png", title: "Screenshot of the PDF diagram" },
        { id: "two", type: "pdf", url: "/two.pdf", title: "Quarterly" },
      ]),
    );
    const labels = chipLabels(renderer);
    expect(labels).toContain("Screenshots (1)");
    expect(labels).toContain("Documents (1)");
    expect(labels.some((label) => label.startsWith("Diagrams"))).toBe(false);
  });

  test("shows no MIME chip for an asset that declares neither a type nor an extension", () => {
    const json = JSON.stringify(
      renderTab(nodeWith([{ id: "one", type: "image", url: "/api/files/9" }])).toJSON(),
    );
    expect(json.includes("image/png")).toBe(false);
    expect(json.includes("image/raw")).toBe(false);
  });

  test("shows the pixel size a record states and never one read out of a name", () => {
    const renderer = renderTab(
      nodeWith([
        {
          id: "recorded",
          type: "image",
          url: "/recorded.png",
          dimensions: { width: 800, height: 600 },
        },
        {
          id: "from-metadata",
          type: "image",
          url: "/from-metadata.png",
          metadata: { viewport: { width: 1440, height: 900 } },
        },
        {
          id: "named-only",
          type: "image",
          url: "/capture-1920x1080.png",
          title: "Desktop 1920x1080 capture",
          description: "rendered at 1280x720",
        },
      ]),
    );
    const labels = renderer.root
      .findAll((node) => typeof node.props?.["aria-label"] === "string")
      .map((node) => String(node.props["aria-label"]))
      .filter((label) => label.startsWith("Resolution"));
    expect(labels).toEqual(["Resolution 800×600", "Resolution 1440×900"]);
  });

  test("credits a finding's screenshot to the recorded author and invents none", () => {
    const withFindings: GraphNodeData = {
      id: "n1",
      name: "Node",
      metadata: {
        findings: [
          {
            id: "f1",
            severity: "important",
            observation: "unnamed author",
            status: "open",
            screenshots: [{ id: "shot-1", type: "image", url: "/shot-1.png", title: "Shot One" }],
          },
          {
            id: "f2",
            severity: "important",
            observation: "named validator",
            status: "open",
            validatorId: "V-7",
            screenshots: [{ id: "shot-2", type: "image", url: "/shot-2.png", title: "Shot Two" }],
          },
        ],
      },
    };
    const json = JSON.stringify(renderTab(withFindings).toJSON());
    expect(json.includes("V-7")).toBe(true);
    expect(json.includes('"Validator"')).toBe(false);
  });
});
