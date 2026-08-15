import { describe, expect, it } from "bun:test";
import {
  DEFAULT_EDGE_KIND,
  describeEdgeKind,
  EDGE_KIND_DESCRIPTORS,
  getEdgeIconComponent,
  resolveEdgeKind,
  type SemanticEdgeKind,
} from "./edgeKinds";

describe("edgeKinds", () => {
  describe("7 Distinct Semantic Edge Types", () => {
    it("1. spawn (dispatch) has Cyan/Blue dashed styling with IconRocket", () => {
      const desc = describeEdgeKind("spawn");
      expect(desc.kind).toBe("spawn");
      expect(desc.accent).toBe("#06b6d4");
      expect(desc.stroke).toBe("#06b6d4");
      expect(desc.isDashed).toBe(true);
      expect(desc.strokeDasharray).toBe("6 4");
      expect(desc.iconName).toBe("IconRocket");
      expect(desc.IconComponent).toBeDefined();
      expect(desc.badgeTextColor).toBe("#67e8f9");
      expect(desc.markerId).toBe("edge-arrowhead-spawn");
    });

    it("2. sequence (linear flow) is neutral dark-mode zinc (#3f3f46), clean and understated", () => {
      const desc = describeEdgeKind("sequence");
      expect(desc.kind).toBe("sequence");
      expect(desc.stroke).toBe("#3f3f46");
      expect(desc.isDashed).toBe(false);
      expect(desc.strokeDasharray).toBe(undefined);
      expect(desc.badgeBorder).toBe("#3f3f46");
      expect(desc.badgeTextColor).toBe("#a1a1aa");
      expect(desc.markerId).toBe("edge-arrowhead-sequence");
    });

    it("3. data / handoff (artifact pass) has Indigo solid curve with IconFileText", () => {
      const desc = describeEdgeKind("data");
      expect(desc.kind).toBe("data");
      expect(desc.accent).toBe("#6366f1");
      expect(desc.stroke).toBe("#6366f1");
      expect(desc.isDashed).toBe(false);
      expect(desc.strokeDasharray).toBe(undefined);
      expect(desc.iconName).toBe("IconFileText");
      expect(desc.IconComponent).toBeDefined();
      expect(desc.badgeTextColor).toBe("#a5b4fc");
      expect(desc.markerId).toBe("edge-arrowhead-data");
    });

    it("4. dependency (unlocked requirement) has Slate dashed styling with IconLink", () => {
      const desc = describeEdgeKind("dependency");
      expect(desc.kind).toBe("dependency");
      expect(desc.accent).toBe("#64748b");
      expect(desc.stroke).toBe("#64748b");
      expect(desc.isDashed).toBe(true);
      expect(desc.strokeDasharray).toBe("5 4");
      expect(desc.iconName).toBe("IconLink");
      expect(desc.IconComponent).toBeDefined();
      expect(desc.badgeTextColor).toBe("#94a3b8");
      expect(desc.markerId).toBe("edge-arrowhead-dependency");
    });

    it("5. loop / pushback (rejection cycle) has Crimson reverse-pulsating dashes with IconAlertTriangle", () => {
      const desc = describeEdgeKind("loop");
      expect(desc.kind).toBe("loop");
      expect(desc.accent).toBe("#f43f5e");
      expect(desc.stroke).toBe("#f43f5e");
      expect(desc.isDashed).toBe(true);
      expect(desc.strokeDasharray).toBe("6 4");
      expect(desc.animated).toBe(true);
      expect(desc.reverseAnimated).toBe(true);
      expect(desc.iconName).toBe("IconAlertTriangle");
      expect(desc.IconComponent).toBeDefined();
      expect(desc.badgeTextColor).toBe("#fda4af");
      expect(desc.markerId).toBe("edge-arrowhead-loop");
    });

    it("6. gate / validation (review pass) has Emerald Green solid with IconShieldCheck", () => {
      const desc = describeEdgeKind("gate");
      expect(desc.kind).toBe("gate");
      expect(desc.accent).toBe("#10b981");
      expect(desc.stroke).toBe("#10b981");
      expect(desc.isDashed).toBe(false);
      expect(desc.strokeDasharray).toBe(undefined);
      expect(desc.iconName).toBe("IconShieldCheck");
      expect(desc.IconComponent).toBeDefined();
      expect(desc.badgeTextColor).toBe("#6ee7b7");
      expect(desc.markerId).toBe("edge-arrowhead-gate");
    });

    it("7. critic / signoff has Metallic Gold solid with IconCertificate", () => {
      const desc = describeEdgeKind("critic");
      expect(desc.kind).toBe("critic");
      expect(desc.accent).toBe("#eab308");
      expect(desc.stroke).toBe("#eab308");
      expect(desc.isDashed).toBe(false);
      expect(desc.strokeDasharray).toBe(undefined);
      expect(desc.iconName).toBe("IconCertificate");
      expect(desc.IconComponent).toBeDefined();
      expect(desc.badgeTextColor).toBe("#fde047");
      expect(desc.markerId).toBe("edge-arrowhead-critic");
    });
  });

  describe("Neutral by default", () => {
    it("defaults to sequence when kind is undefined", () => {
      expect(DEFAULT_EDGE_KIND).toBe("sequence");
      expect(resolveEdgeKind({})).toBe("sequence");
      expect(resolveEdgeKind(undefined)).toBe("sequence");
      expect(resolveEdgeKind(null)).toBe("sequence");
      expect(resolveEdgeKind("unknown-kind" as never)).toBe("sequence");
    });
  });

  describe("Aliases and cycle resolution", () => {
    it("resolves dispatch alias to spawn", () => {
      expect(resolveEdgeKind("dispatch")).toBe("spawn");
      expect(resolveEdgeKind({ kind: "dispatch" })).toBe("spawn");
    });

    it("resolves handoff alias to data", () => {
      expect(resolveEdgeKind("handoff")).toBe("data");
      expect(resolveEdgeKind({ kind: "handoff" })).toBe("data");
    });

    it("resolves pushback alias to loop", () => {
      expect(resolveEdgeKind("pushback")).toBe("loop");
      expect(resolveEdgeKind({ kind: "pushback" })).toBe("loop");
    });

    it("resolves validation alias to gate", () => {
      expect(resolveEdgeKind("validation")).toBe("gate");
      expect(resolveEdgeKind({ kind: "validation" })).toBe("gate");
    });

    it("resolves signoff alias to critic", () => {
      expect(resolveEdgeKind("signoff")).toBe("critic");
      expect(resolveEdgeKind({ kind: "signoff" })).toBe("critic");
    });

    it("resolves isCycle: true to loop", () => {
      expect(resolveEdgeKind({ isCycle: true })).toBe("loop");
      expect(resolveEdgeKind({ kind: "sequence", isCycle: true })).toBe("loop");
    });
  });

  describe("All 7 semantic types registered in EDGE_KIND_DESCRIPTORS", () => {
    const canonicalKinds: SemanticEdgeKind[] = [
      "spawn",
      "sequence",
      "data",
      "dependency",
      "loop",
      "gate",
      "critic",
    ];

    it("contains all 7 canonical kinds", () => {
      for (const kind of canonicalKinds) {
        expect(EDGE_KIND_DESCRIPTORS[kind]).toBeDefined();
        expect(EDGE_KIND_DESCRIPTORS[kind].kind).toBe(kind);
      }
    });

    it("provides getEdgeIconComponent", () => {
      expect(getEdgeIconComponent("IconRocket")).toBeDefined();
      expect(getEdgeIconComponent("IconFileText")).toBeDefined();
      expect(getEdgeIconComponent("IconLink")).toBeDefined();
      expect(getEdgeIconComponent("IconAlertTriangle")).toBeDefined();
      expect(getEdgeIconComponent("IconShieldCheck")).toBeDefined();
      expect(getEdgeIconComponent("IconCertificate")).toBeDefined();
      expect(getEdgeIconComponent("NonExistent")).toBe(undefined);
      expect(getEdgeIconComponent(undefined)).toBe(undefined);
    });
  });
});
