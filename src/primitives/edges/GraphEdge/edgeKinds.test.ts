import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { EDGE_KINDS, type EdgeKind } from "../../../types/graphData";
import {
  DEFAULT_EDGE_KIND,
  describeEdgeKind,
  EDGE_KIND_DESCRIPTORS,
  edgeKindStyleVars,
  getEdgeIconComponent,
  resolveEdgeAccent,
  resolveEdgeKind,
  GENERATED_EDGE_MARKER_ID,
  type EdgeKindDescriptor,
} from "./edgeKinds";

function treatmentSignature(descriptor: EdgeKindDescriptor): string {
  return [
    descriptor.stroke,
    descriptor.strokeWidth,
    descriptor.strokeDasharray ?? "solid",
    descriptor.markerShape,
    descriptor.reverseAnimated ? "reverse" : descriptor.animated ? "forward" : "static",
  ].join("|");
}

describe("edgeKinds", () => {
  describe("Every declared kind has a deliberate treatment", () => {
    it("registers a descriptor for all 19 producer edge kinds", () => {
      expect(EDGE_KINDS).toHaveLength(19);
      for (const kind of EDGE_KINDS) {
        const descriptor = EDGE_KIND_DESCRIPTORS[kind];
        expect(descriptor).toBeDefined();
        expect(descriptor.kind).toBe(kind);
        expect(descriptor.markerId).toBe(`edge-arrowhead-${kind}`);
        expect(descriptor.label.length).toBeGreaterThan(0);
      }
    });

    it("resolves every kind to itself rather than folding it into an archetype", () => {
      for (const kind of EDGE_KINDS) {
        expect(resolveEdgeKind(kind)).toBe(kind);
        expect(resolveEdgeKind({ kind })).toBe(kind);
      }
    });

    it("gives every kind a visually distinct stroke, dash, weight and marker combination", () => {
      const signatures = new Map<string, EdgeKind>();
      for (const kind of EDGE_KINDS) {
        const signature = treatmentSignature(EDGE_KIND_DESCRIPTORS[kind]);
        const clash = signatures.get(signature);
        expect(clash).toBeUndefined();
        signatures.set(signature, kind);
      }
      expect(signatures.size).toBe(19);
    });

    it("gives every kind its own accent colour", () => {
      const accents = new Set(EDGE_KINDS.map((kind) => EDGE_KIND_DESCRIPTORS[kind].accent));
      expect(accents.size).toBe(19);
    });
  });

  describe("A probe is not a rejection", () => {
    it("keeps probe and pushback on separate descriptors", () => {
      expect(resolveEdgeKind("probe")).toBe("probe");
      expect(resolveEdgeKind("pushback")).toBe("pushback");
      expect(describeEdgeKind("probe")).not.toBe(describeEdgeKind("pushback"));
    });

    it("renders a probe in an informational register and a pushback as a real problem", () => {
      const probe = describeEdgeKind("probe");
      const pushback = describeEdgeKind("pushback");

      expect(probe.tone).toBe("info");
      expect(probe.accent).toBe("#38bdf8");
      expect(probe.markerShape).toBe("hollow");
      expect(probe.strokeWidth).toBeLessThan(pushback.strokeWidth);

      expect(pushback.tone).toBe("error");
      expect(pushback.accent).toBe("#f43f5e");
      expect(pushback.markerShape).toBe("heavy");
    });

    it("keeps a probe distinct from a repair loop as well", () => {
      expect(describeEdgeKind("probe").accent).not.toBe(describeEdgeKind("loop").accent);
      expect(describeEdgeKind("pushback").accent).not.toBe(describeEdgeKind("loop").accent);
    });
  });

  describe("Asymmetric excursions", () => {
    it("draws branch, collect and backtrack as one family with three distinct treatments", () => {
      const branch = describeEdgeKind("branch");
      const collect = describeEdgeKind("collect");
      const backtrack = describeEdgeKind("backtrack");

      for (const descriptor of [branch, collect, backtrack]) {
        expect(descriptor.tone).toBe("excursion");
      }
      expect(new Set([branch.accent, collect.accent, backtrack.accent]).size).toBe(3);
      expect(branch.isDashed).toBe(true);
      expect(collect.isDashed).toBe(false);
      expect(backtrack.reverseAnimated).toBe(true);
    });

    it("reads signoff as terminal approval", () => {
      const signoff = describeEdgeKind("signoff");
      expect(signoff.tone).toBe("success");
      expect(signoff.markerShape).toBe("terminal");
      expect(signoff.isDashed).toBe(false);
      expect(signoff.strokeWidth).toBeGreaterThan(describeEdgeKind("sequence").strokeWidth);
    });

    it("keeps conditional and join distinct from sequence", () => {
      expect(resolveEdgeKind("conditional")).toBe("conditional");
      expect(resolveEdgeKind("join")).toBe("join");
      expect(describeEdgeKind("join").accent).not.toBe(describeEdgeKind("sequence").accent);
      expect(describeEdgeKind("conditional").accent).not.toBe(describeEdgeKind("sequence").accent);
    });
  });

  describe("Fallbacks and aliases", () => {
    it("defaults to sequence only when nothing identifies the edge", () => {
      expect(DEFAULT_EDGE_KIND).toBe("sequence");
      expect(resolveEdgeKind({})).toBe("sequence");
      expect(resolveEdgeKind(undefined)).toBe("sequence");
      expect(resolveEdgeKind(null)).toBe("sequence");
      expect(resolveEdgeKind("   ")).toBe("sequence");
    });

    it("resolves a kindless cycle to loop but never overrides a declared kind", () => {
      expect(resolveEdgeKind({ isCycle: true })).toBe("loop");
      expect(resolveEdgeKind({ kind: "pushback", isCycle: true })).toBe("pushback");
      expect(resolveEdgeKind({ kind: "sequence", isCycle: true })).toBe("sequence");
    });

    it("keeps only aliases that mean the same relationship", () => {
      expect(resolveEdgeKind("artifact")).toBe("data");
      expect(resolveEdgeKind("cycle")).toBe("loop");
      expect(resolveEdgeKind("rejection")).toBe("pushback");
      expect(resolveEdgeKind("review")).toBe("validation");
      expect(resolveEdgeKind("certificate")).toBe("signoff");
    });

    it("exposes an icon component for every declared icon name", () => {
      for (const kind of EDGE_KINDS) {
        const { iconName } = EDGE_KIND_DESCRIPTORS[kind];
        if (!iconName) continue;
        expect(getEdgeIconComponent(iconName)).toBeDefined();
      }
      expect(getEdgeIconComponent("NonExistent")).toBe(undefined);
      expect(getEdgeIconComponent(undefined)).toBe(undefined);
    });
  });

  describe("Per-edge accent", () => {
    it("takes the accent from the edge's kind, never from anything else", () => {
      expect(resolveEdgeAccent({ kind: "pushback" })).toBe(EDGE_KIND_DESCRIPTORS.pushback.accent);
      expect(resolveEdgeAccent({ kind: "signoff" })).toBe(EDGE_KIND_DESCRIPTORS.signoff.accent);
      expect(resolveEdgeAccent(undefined)).toBe(EDGE_KIND_DESCRIPTORS.sequence.accent);
    });

    it("honours a dataset-supplied accent over the kind accent", () => {
      expect(resolveEdgeAccent({ kind: "sequence", accent: "#123456" })).toBe("#123456");
    });

    it("publishes the treatment as custom properties", () => {
      const vars = edgeKindStyleVars(EDGE_KIND_DESCRIPTORS.probe) as Record<string, string>;
      expect(vars["--edge-kind-stroke"]).toBe("#38bdf8");
      expect(vars["--edge-kind-dash"]).toBe("3 3");
      expect(vars["--edge-kind-width"]).toBe("1.75px");
    });
  });

  describe("Relationships this renderer ships no preset for", () => {
    it("keeps an unfamiliar kind's own name instead of collapsing it into sequence", () => {
      expect(resolveEdgeKind("supersedes")).toBe("supersedes");
      expect(resolveEdgeKind({ kind: "supersedes" })).toBe("supersedes");

      const descriptor = describeEdgeKind("supersedes");
      expect(descriptor.kind).toBe("supersedes");
      expect(descriptor.label).toBe("SUPERSEDES");
      expect(descriptor.accent).not.toBe(EDGE_KIND_DESCRIPTORS.sequence.accent);
    });

    it("gives the same unfamiliar kind the same accent every time", () => {
      expect(describeEdgeKind("supersedes").accent).toBe(describeEdgeKind("supersedes").accent);
      expect(resolveEdgeAccent({ kind: "supersedes" })).toBe(describeEdgeKind("supersedes").accent);
    });

    it("tells two unfamiliar kinds apart from each other and from every preset", () => {
      const generated = ["supersedes", "annotates", "mirrors", "escalates", "quorum"];
      const accents = new Set(generated.map((kind) => describeEdgeKind(kind).accent));
      expect(accents.size).toBe(generated.length);

      const preset = new Set(EDGE_KINDS.map((kind) => EDGE_KIND_DESCRIPTORS[kind].accent));
      for (const accent of accents) expect(preset.has(accent)).toBe(false);
    });

    it("hands an unfamiliar kind a real arrowhead rather than none at all", () => {
      const descriptor = describeEdgeKind("supersedes");
      expect(descriptor.markerId).toBe(GENERATED_EDGE_MARKER_ID);
      expect(descriptor.markerShape).toBe("arrow");
    });

    it("never throws on a member outside the preset table", () => {
      for (const kind of ["", "  ", "SUPERSEDES", "weird::kind", "42"]) {
        expect(() => describeEdgeKind(kind)).not.toThrow();
      }
    });

    it("normalises case, so one relationship is one accent however it is spelled", () => {
      expect(resolveEdgeKind("SUPERSEDES")).toBe("supersedes");
    });
  });

  describe("Stylesheet stays in step with the descriptors", () => {
    const css = readFileSync(new URL("./GraphEdge.css", import.meta.url).pathname, "utf8");

    it("declares the same stroke, weight and dash for every kind as the descriptor table", () => {
      for (const kind of EDGE_KINDS) {
        const descriptor = EDGE_KIND_DESCRIPTORS[kind];
        expect(css).toContain(`.graph-edge-group.kind-${kind}`);
        const block = css.slice(css.indexOf(`.graph-edge-group.kind-${kind}`));
        const declarations = block.slice(0, block.indexOf("}"));
        expect(declarations).toContain(`--edge-kind-stroke: ${descriptor.stroke};`);
        expect(declarations).toContain(`--edge-kind-width: ${descriptor.strokeWidth}px;`);
        expect(declarations).toContain(
          `--edge-kind-dash: ${descriptor.strokeDasharray ?? "none"};`,
        );
        expect(declarations).toContain(`--edge-kind-text: ${descriptor.badgeTextColor};`);
      }
    });
  });
});
