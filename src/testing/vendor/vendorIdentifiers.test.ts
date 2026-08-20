import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scanTreeForVendorIdentifiers,
  staleExemptions,
  type VendorIdentifierFinding,
} from "./vendorIdentifiers";
import { VENDOR_NAMES } from "./vendorNames";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const scriptsRoot = join(repoRoot, "src");
const testsRoot = join(repoRoot, "scripts");

/**
 * Nothing is exempt here. A product's own exported binding is reached as a value on its package
 * rather than imported under its name, so this renderer's tree needs no permission at all. Every
 * entry added later is a deliberate decision, and one pointing at a file that no longer exists
 * fails the suite.
 */
const SOURCE_EXEMPTIONS: readonly string[] = [];

const SCRIPT_EXEMPTIONS: readonly string[] = [];

function describeFindings(findings: readonly VendorIdentifierFinding[]): string[] {
  return findings.map(
    (finding) =>
      `${finding.file}:${finding.line} ${finding.identifier} names "${finding.vendor}" (${finding.position})`,
  );
}

/**
 * `PlaywrightMetadata` was the shape of the mistake: a type named after one runner, holding fields
 * true of every runner in its category. This is the check that keeps it from coming back — under
 * any product's name, in a type, a field, a constant or a module name.
 */
describe("vendor names never name a concept", () => {
  test("the source tree names nothing after a product", () => {
    const findings = scanTreeForVendorIdentifiers(scriptsRoot, { exempt: SOURCE_EXEMPTIONS });
    expect(describeFindings(findings)).toEqual([]);
  });

  test("the build and capture scripts name nothing after a product", () => {
    const findings = scanTreeForVendorIdentifiers(testsRoot, { exempt: SCRIPT_EXEMPTIONS });
    expect(describeFindings(findings)).toEqual([]);
  });

  test("every exemption still covers a file that exists", () => {
    expect(staleExemptions(scriptsRoot, SOURCE_EXEMPTIONS)).toEqual([]);
    expect(staleExemptions(testsRoot, SCRIPT_EXEMPTIONS)).toEqual([]);
  });

  test("the vendor list is lowercase, unique and sorted so a name cannot hide in it twice", () => {
    expect(VENDOR_NAMES.map((name) => name.toLowerCase())).toEqual([...VENDOR_NAMES]);
    expect(new Set(VENDOR_NAMES).size).toBe(VENDOR_NAMES.length);
    expect([...VENDOR_NAMES].sort()).toEqual([...VENDOR_NAMES]);
  });

  test("names excluded on purpose stay excluded, so the check reports no noise", () => {
    // Each of these is an ordinary word of this domain first; matching them would bury the real
    // findings under identifiers nobody would ever call a vendor concept.
    for (const excluded of ["bun", "git", "node", "edge", "chrome", "cursor", "webkit", "rollup"]) {
      expect(VENDOR_NAMES).not.toContain(excluded);
    }
  });
});
