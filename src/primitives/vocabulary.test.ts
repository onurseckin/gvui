import { describe, expect, it } from "bun:test";
import {
  NEUTRAL_ACCENT,
  hasPreset,
  readVocabularyMember,
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
