import { describe, expect, it } from "bun:test";
import { LayoutInputError, normalizeGraph } from "./normalizeGraph";

describe("normalizeGraph", () => {
  it("throws LayoutInputError for duplicate node IDs", () => {
    const nodes = [
      { id: "A", width: 100, height: 50 },
      { id: "A", width: 100, height: 50 },
    ];
    expect(() => normalizeGraph(nodes, [])).toThrow(LayoutInputError);
  });

  it("throws LayoutInputError for duplicate edge IDs", () => {
    const nodes = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges = [
      { id: "e1", source: "A", target: "B" },
      { id: "e1", source: "A", target: "B" },
    ];
    expect(() => normalizeGraph(nodes, edges)).toThrow(LayoutInputError);
  });

  it("throws LayoutInputError for missing source or target endpoint", () => {
    const nodes = [{ id: "A", width: 100, height: 50 }];
    const edges = [{ id: "e1", source: "A", target: "MISSING" }];
    expect(() => normalizeGraph(nodes, edges)).toThrow(LayoutInputError);
  });

  it("throws LayoutInputError for empty node ID or non-positive dimensions", () => {
    expect(() => normalizeGraph([{ id: "", width: 100, height: 50 }], [])).toThrow(LayoutInputError);
    expect(() => normalizeGraph([{ id: "A", width: 0, height: 50 }], [])).toThrow(LayoutInputError);
    expect(() => normalizeGraph([{ id: "A", width: 100, height: -10 }], [])).toThrow(LayoutInputError);
  });

  it("produces deterministic node and edge order regardless of input order", () => {
    const nodes1 = [
      { id: "C", width: 100, height: 50 },
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const nodes2 = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges = [
      { id: "e2", source: "B", target: "C" },
      { id: "e1", source: "A", target: "B" },
    ];

    const norm1 = normalizeGraph(nodes1, edges);
    const norm2 = normalizeGraph(nodes2, edges);

    expect(norm1.nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);
    expect(norm2.nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);
    expect(norm1.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("discovers deterministic weak components sorted by lowest node ID", () => {
    const nodes = [
      { id: "Z", width: 100, height: 50 },
      { id: "Y", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "A", width: 100, height: 50 },
    ];
    const edges = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "Y", target: "Z" },
    ];

    const norm = normalizeGraph(nodes, edges);
    expect(norm.components).toEqual([
      ["A", "B"],
      ["Y", "Z"],
    ]);
  });

  it("defaults edge layoutRole to auto and preserves explicit valid layoutRole", () => {
    const nodes = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "A", target: "B", layoutRole: "cross" as const },
    ];
    const norm = normalizeGraph(nodes, edges);
    expect(norm.edges[0].layoutRole).toBe("auto");
    expect(norm.edges[1].layoutRole).toBe("cross");
  });

  it("throws LayoutInputError for invalid edge layoutRole", () => {
    const nodes = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges = [{ id: "e1", source: "A", target: "B", layoutRole: "invalid_role" as any }];
    expect(() => normalizeGraph(nodes, edges)).toThrow(LayoutInputError);
  });
});
