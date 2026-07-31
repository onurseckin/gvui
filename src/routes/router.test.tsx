import { describe, expect, it } from "bun:test";
import { router } from "./router";

describe("TanStack Router Setup", () => {
  it("exports a valid Router instance with route tree", () => {
    expect(router).toBeDefined();
    expect(typeof router.navigate).toBe("function");
  });
});
