import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { stableAccent as primitiveAccent } from "../../primitives/vocabulary";
import type { GraphNodeData } from "../../types/graphData";
import { GenericFieldList, GenericValueView } from "./GenericFields";
import { collectGenericNodeFields, indexGenericFields } from "./nodeFields";
import {
  classifyValue,
  formatNumberValue,
  humanizeKey,
  isLinkLike,
  isScalarValue,
  summarizeValue,
} from "./valueShapes";
import {
  describeOpenEdgeKind,
  describeOpenIdentity,
  describeOpenKind,
  describeOpenStatus,
  NEUTRAL_ACCENT,
  stableAccent,
} from "./vocabulary";

describe("value shapes", () => {
  test("reads a value's shape from the value itself", () => {
    expect(classifyValue(null)).toBe("empty");
    expect(classifyValue(undefined)).toBe("empty");
    expect(classifyValue("   ")).toBe("empty");
    expect(classifyValue("https://example.org/a.png")).toBe("url");
    expect(classifyValue("/evidence/a.png")).toBe("text");
    expect(classifyValue(42)).toBe("number");
    expect(classifyValue(false)).toBe("boolean");
    expect(classifyValue([1, 2])).toBe("list");
    expect(classifyValue({ a: 1 })).toBe("record");
  });

  test("treats only an absolute web link as a link", () => {
    expect(isLinkLike("https://example.org")).toBe(true);
    expect(isLinkLike("http://example.org/x?y=1")).toBe(true);
    expect(isLinkLike("example.org")).toBe(false);
    expect(isLinkLike("/local/path.png")).toBe(false);
  });

  test("scalars and containers are told apart", () => {
    expect(isScalarValue("text")).toBe(true);
    expect(isScalarValue(null)).toBe(true);
    expect(isScalarValue([1])).toBe(false);
    expect(isScalarValue({})).toBe(false);
  });

  test("a non-finite number prints as what the dataset carried", () => {
    expect(formatNumberValue(60000)).toBe("60,000");
    expect(formatNumberValue(0.5)).toBe("0.5");
    expect(formatNumberValue(Number.NaN)).toBe("NaN");
    expect(formatNumberValue(Number.POSITIVE_INFINITY)).toBe("Infinity");
  });

  test("a key reads as words however the producer spelled it", () => {
    expect(humanizeKey("residual_risks")).toBe("Residual Risks");
    expect(humanizeKey("residualRisks")).toBe("Residual Risks");
    expect(humanizeKey("residual-risks")).toBe("Residual Risks");
    expect(humanizeKey("URL")).toBe("URL");
    expect(humanizeKey("")).toBe("");
  });

  test("a container is summarised by what it holds", () => {
    expect(summarizeValue([1])).toBe("1 item");
    expect(summarizeValue([1, 2, 3])).toBe("3 items");
    expect(summarizeValue({ a: 1, b: 2 })).toBe("2 fields");
    expect(summarizeValue(null)).toBe("empty");
    expect(summarizeValue(true)).toBe("true");
  });

  test("the generated accent is the one the canvas uses", () => {
    expect(stableAccent("premise")).toBe(primitiveAccent("premise"));
    expect(stableAccent("premise")).toBe(stableAccent("premise"));
    expect(stableAccent("premise")).not.toBe(stableAccent("observation"));
  });
});

describe("open vocabularies", () => {
  test("a preset role names the node's identity", () => {
    const identity = describeOpenIdentity({ telemetry: { role: "validator" } });
    expect(identity.label).toBe("VALIDATOR");
    expect(identity.recognized).toBe(true);
    expect(identity.source).toBe("role");
  });

  test("a role this renderer has never seen keeps its own name", () => {
    const identity = describeOpenIdentity({ metadata: { role: "devils-advocate" } });
    expect(identity.label).toBe("DEVILS ADVOCATE");
    expect(identity.recognized).toBe(false);
    expect(identity.accent).toBe(stableAccent("devils-advocate"));
  });

  test("a node with neither a role nor a kind is unknown, not the default silhouette", () => {
    const identity = describeOpenIdentity({});
    expect(identity.label).toBe("UNKNOWN");
    expect(identity.accent).toBe(NEUTRAL_ACCENT);
    expect(identity.source).toBe("none");
  });

  test("the kind breakdown counts kinds, never the role standing in for one", () => {
    expect(describeOpenKind({ kind: "gate" }).label).toBe("VALIDATOR GATE");
    expect(describeOpenKind({ kind: "premise" }).recognized).toBe(false);
    expect(describeOpenKind({ kind: "premise" }).label).toBe("PREMISE");
    expect(describeOpenKind({}).label).toBe("UNKNOWN");
  });

  test("an unrecorded status is unknown rather than a lifecycle claim", () => {
    const absent = describeOpenStatus({});
    expect(absent.recorded).toBe(false);
    expect(absent.label).toBe("unknown");
    expect(absent.color).toBe(NEUTRAL_ACCENT);

    const preset = describeOpenStatus({ status: "success" });
    expect(preset.recorded).toBe(true);
    expect(preset.recognized).toBe(true);
    expect(preset.label).toBe("Success");

    const own = describeOpenStatus({ status: "unresolved" });
    expect(own.recorded).toBe(true);
    expect(own.recognized).toBe(false);
    expect(own.label).toBe("Unresolved");
  });

  test("an edge kind outside the preset table reads as itself", () => {
    expect(describeOpenEdgeKind({ kind: "pushback" }).recognized).toBe(true);
    const own = describeOpenEdgeKind({ kind: "sparked-by" });
    expect(own.recognized).toBe(false);
    expect(own.label).toBe("SPARKED BY");
    expect(describeOpenEdgeKind({}).label).toBe("unknown");
  });
});

describe("fields with no dedicated view", () => {
  const node: GraphNodeData = {
    id: "n-1",
    name: "A node",
    kind: "premise",
    files: [{ path: "src/a.ts" }],
    telemetry: { role: "implementer" },
    group: "left",
    metadata: {
      role: "implementer",
      findings: [],
      confidence: "hunch",
      tags: ["water"],
    },
  };

  test("lists only what no purpose-built view claims", () => {
    const fields = collectGenericNodeFields(node);
    expect(fields.own.map((field) => field.key)).toEqual(["group"]);
    expect(fields.metadata.map((field) => field.key)).toEqual(["confidence", "tags"]);
    expect(fields.total).toBe(3);
  });

  test("a node whose every field has a view contributes nothing", () => {
    expect(collectGenericNodeFields({ id: "n", name: "n", kind: "agent" }).total).toBe(0);
  });

  test("a recorded browser run is claimed by its own card, not repeated as a raw field", () => {
    const withRun: GraphNodeData = {
      id: "n-run",
      name: "Validator",
      kind: "agent",
      browserTests: [{ commandId: "cmd-1", browser: "webkit", evidence: {} }],
    };

    expect(collectGenericNodeFields(withRun).total).toBe(0);
  });

  test("the graph-level index counts the nodes carrying each field", () => {
    const index = indexGenericFields([node, { ...node, id: "n-2" }]);
    const confidence = index.find((entry) => entry.key === "confidence");
    expect(confidence?.nodeCount).toBe(2);
    expect(confidence?.scope).toBe("metadata");
    expect(index.find((entry) => entry.key === "group")?.scope).toBe("node");
  });
});

describe("the generic renderer", () => {
  test("renders each shape as what it is", () => {
    const html = renderToString(
      <GenericFieldList
        fields={[
          { key: "confidence", value: "measured" },
          { key: "estimatedCostTry", value: 60000 },
          { key: "blocking", value: true },
          { key: "mitigation", value: null },
          { key: "tags", value: ["water", "roof"] },
          { key: "referenceUrl", value: "https://example.org/rain" },
          { key: "source", value: { station: "Kandilli", years: 30 } },
        ]}
      />,
    );

    expect(html).toContain("Confidence");
    expect(html).toContain("measured");
    expect(html).toContain("60,000");
    expect(html).toContain("true");
    expect(html).toContain("empty");
    expect(html).toContain("water");
    expect(html).toContain('href="https://example.org/rain"');
    expect(html).toContain("Station");
    expect(html).toContain("Kandilli");
    expect(html).toContain("2 items");
  });

  test("says an empty list and an empty object are empty rather than dropping them", () => {
    expect(renderToString(<GenericValueView value={[]} />)).toContain("empty list");
    expect(renderToString(<GenericValueView value={{}} />)).toContain("empty object");
  });

  test("gives a long or multi-line value room to be read", () => {
    const block = renderToString(<GenericValueView value={"first line\nsecond line"} />);
    expect(block).toContain("open-value--block");
    expect(block).toContain("second line");
  });

  test("summarises a container too deep to expand instead of hiding it", () => {
    const deep = { a: { b: { c: { d: { e: "buried" } } } } };
    const html = renderToString(<GenericValueView value={deep} />);
    expect(html).toContain("open-value--collapsed");
    expect(html).toContain("1 field");
  });
});
