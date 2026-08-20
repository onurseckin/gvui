import { describe, expect, it } from "bun:test";
import { parseCliArgs } from "./visual-capture";
import { STANDARD_VIEWPORTS } from "../src/testing/visual/browserVisualHarness";

describe("visual-capture CLI defaults", () => {
  it("defaults baseUrl to this project's Vite dev port, not Vite's stock 5173", () => {
    // vite.config.ts pins `server.port` to 4444 with `strictPort: true`; 5173 is unreachable here.
    const options = parseCliArgs([]);
    expect(options.baseUrl).toBe("http://localhost:4444");
  });

  it("--url overrides the default baseUrl", () => {
    const options = parseCliArgs(["--url", "http://localhost:5555"]);
    expect(options.baseUrl).toBe("http://localhost:5555");
  });

  it("captures every viewport the harness defines, by reference rather than a copied name list", () => {
    // Regression guard for the bug where a hardcoded `["desktop","tablet","mobile"]` filter
    // silently dropped `wide-desktop` whenever the harness grew a new viewport: this asserts
    // identity with the harness's own export, not a second hand-maintained list that can drift
    // from it the same way.
    const options = parseCliArgs([]);
    expect(options.viewports).toBe(STANDARD_VIEWPORTS);
  });

  it("still includes wide-desktop specifically, the viewport the old filter silently dropped", () => {
    const options = parseCliArgs([]);
    const names = options.viewports.map((v) => v.name);
    expect(names).toContain("wide-desktop");
  });
});
