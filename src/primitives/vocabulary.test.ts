import { describe, expect, it } from "bun:test";
import {
  NEUTRAL_ACCENT,
  hasPreset,
  readDeclaredRole,
  readVocabularyMember,
  roleIdentities,
  stableAccent,
  vocabularyLabel,
} from "./vocabulary";

describe("Accents generated for members with no preset", () => {
  it("gives the same name the same colour every time it is asked", () => {
    expect(stableAccent("archivist")).toBe(stableAccent("archivist"));
    expect(stableAccent("")).toBe(stableAccent(""));
  });

  it("gives different names different colours", () => {
    const accents = new Set(
      ["archivist", "smelter", "beacon", "ledger", "quorum", "supersedes"].map(stableAccent),
    );
    expect(accents.size).toBe(6);
  });

  it("stays inside the legible band, so no generated accent disappears into the canvas", () => {
    for (const name of ["archivist", "smelter", "beacon", "x", "", "  spaced  "]) {
      const match = /^hsl\((\d+), (\d+)%, (\d+)%\)$/.exec(stableAccent(name));
      expect(match).not.toBeNull();
      expect(Number(match?.[1])).toBeLessThan(360);
      expect(Number(match?.[2])).toBeGreaterThanOrEqual(52);
      expect(Number(match?.[2])).toBeLessThanOrEqual(77);
      expect(Number(match?.[3])).toBeGreaterThanOrEqual(50);
      expect(Number(match?.[3])).toBeLessThanOrEqual(67);
    }
  });

  it("separates names that happen to share a hue", () => {
    // Hue alone collides for this pair, which is exactly the case the other two channels exist for.
    expect(stableAccent("supports")).not.toBe(stableAccent("refines"));
  });

  it("is never the neutral accent absence uses, so unknown and unrecorded stay distinguishable", () => {
    for (const name of ["archivist", "smelter", "beacon"]) {
      expect(stableAccent(name)).not.toBe(NEUTRAL_ACCENT);
    }
  });
});

describe("Labels derived from a member's own name", () => {
  it("reads snake, kebab and camel spellings the same way", () => {
    expect(vocabularyLabel("sub_investigator")).toBe("SUB INVESTIGATOR");
    expect(vocabularyLabel("sub-investigator")).toBe("SUB INVESTIGATOR");
    expect(vocabularyLabel("subInvestigator")).toBe("SUB INVESTIGATOR");
  });

  it("returns the raw name when there is nothing to split", () => {
    expect(vocabularyLabel("ledger")).toBe("LEDGER");
    expect(vocabularyLabel("---")).toBe("---");
  });
});

describe("Reading a declared vocabulary member", () => {
  it("takes a name the dataset actually spelled and nothing else", () => {
    expect(readVocabularyMember("branch")).toBe("branch");
    expect(readVocabularyMember("  branch  ")).toBe("branch");
    expect(readVocabularyMember("   ")).toBe(undefined);
    expect(readVocabularyMember(undefined)).toBe(undefined);
    expect(readVocabularyMember(7)).toBe(undefined);
  });
});

describe("Preset lookup", () => {
  it("only matches keys the table itself owns", () => {
    const table = { branch: 1 };
    expect(hasPreset(table, "branch")).toBe(true);
    expect(hasPreset(table, "toString")).toBe(false);
    expect(hasPreset(table, "constructor")).toBe(false);
  });
});

describe("A role recorded beside the domain it was recorded against", () => {
  it("fuses the two halves into the single member the vocabulary names", () => {
    expect(readDeclaredRole("validator", { validatorDomain: "security" })).toBe(
      "validator-security",
    );
    expect(readDeclaredRole("validator", { validator_domain: "ui-design" })).toBe(
      "validator-ui-design",
    );
    expect(readDeclaredRole("validator", { domain: "product" })).toBe("validator-product");
  });

  it("keeps the bare role reachable behind the fused one", () => {
    expect(roleIdentities("validator", { validatorDomain: "security" })).toEqual([
      "validator-security",
      "validator",
    ]);
  });

  it("keeps the bare role when the run recorded no domain to fuse", () => {
    expect(roleIdentities("validator", { validatorId: "val-1" })).toEqual(["validator"]);
    expect(roleIdentities("validator", undefined)).toEqual(["validator"]);
  });

  it("refuses a domain that declares its own absence, rather than naming a role after it", () => {
    for (const absent of ["unknown", "UNKNOWN", "none", "n/a", "unrecorded", "unavailable", "  "]) {
      expect(readDeclaredRole("validator", { validatorDomain: absent })).toBe("validator");
    }
  });

  it("does not fuse a role that already carries the domain", () => {
    expect(readDeclaredRole("validator-security", { validatorDomain: "security" })).toBe(
      "validator-security",
    );
  });

  it("leaves a non-validator's own subject out of its role", () => {
    expect(readDeclaredRole("implementer", { domain: "billing" })).toBe("implementer");
  });

  it("carries a domain this renderer has never seen under its own name instead of dropping it", () => {
    expect(readDeclaredRole("validator", { validatorDomain: "chaos-engineering" })).toBe(
      "validator-chaos-engineering",
    );
  });

  it("states nothing when the node declared no role, whatever the metadata holds", () => {
    expect(readDeclaredRole(undefined, { validatorDomain: "security" })).toBeUndefined();
    expect(roleIdentities(42, { validatorDomain: "security" })).toEqual([]);
  });

  it("never throws on metadata that is not a record", () => {
    for (const metadata of [null, "text", 7, ["security"], undefined]) {
      expect(() => readDeclaredRole("validator", metadata)).not.toThrow();
      expect(readDeclaredRole("validator", metadata)).toBe("validator");
    }
  });
});
