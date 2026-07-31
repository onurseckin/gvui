import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { CircularProgressLoader } from "./CircularProgressLoader";

describe("CircularProgressLoader Component", () => {
  it("renders SVG radial ring without center percentage text", () => {
    const html = renderToString(<CircularProgressLoader percent={45} size={72} strokeWidth={3.5} />);
    expect(html.includes("svg")).toBe(true);
    expect(html.includes("circular-loader-bg")).toBe(true);
    expect(html.includes("circular-loader-fg")).toBe(true);
    expect(html.includes("circular-loader-percent")).toBe(false);
  });
});

