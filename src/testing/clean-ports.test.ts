import { describe, expect, test } from "bun:test";
import { cleanPorts, findPidsOnPorts, killPids, parsePortArgs } from "../../scripts/clean-ports";

describe("Port Cleaning Harness (scripts/clean-ports.ts)", () => {
  describe("parsePortArgs", () => {
    test("returns default port range (4444..4447, 5173, 5555) when no arguments provided", () => {
      const ports = parsePortArgs([]);
      expect(ports).toEqual([4444, 4445, 4446, 4447, 5173, 5555]);
    });

    test("parses single port arguments", () => {
      const ports = parsePortArgs(["4444"]);
      expect(ports).toEqual([4444]);
    });

    test("parses multiple port arguments and sorts/deduplicates them", () => {
      const ports = parsePortArgs(["4446", "4444", "4445", "4444"]);
      expect(ports).toEqual([4444, 4445, 4446]);
    });

    test("parses range syntax like 4444-4447", () => {
      const ports = parsePortArgs(["4444-4447"]);
      expect(ports).toEqual([4444, 4445, 4446, 4447]);
    });

    test("combines ranges and discrete ports", () => {
      const ports = parsePortArgs(["4444-4446", "5173", "5555"]);
      expect(ports).toEqual([4444, 4445, 4446, 5173, 5555]);
    });

    test("gracefully filters out non-numeric, negative, and out-of-range ports", () => {
      const ports = parsePortArgs(["invalid", "-1", "0", "70000", "4444", "999999"]);
      expect(ports).toEqual([4444]);
    });

    test("handles inverted or malformed range strings safely", () => {
      const ports = parsePortArgs(["4447-4444", "abc-def", "4444-", "-4447"]);
      expect(ports).toEqual([]);
    });
  });

  describe("findPidsOnPorts & killPids & cleanPorts", () => {
    test("returns empty array when querying empty port array", () => {
      const found = findPidsOnPorts([]);
      expect(found).toEqual([]);
    });

    test("cleanPorts executes cleanly without throwing when ports are clear", () => {
      const result = cleanPorts([59998, 59999]);
      expect(result.ports).toEqual([59998, 59999]);
      expect(result.found).toEqual([]);
      expect(result.killed).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    test("killPids handles non-existent PIDs gracefully without throwing", () => {
      const result = killPids([{ port: 59999, pid: 99999999 }]);
      expect(result.killed.includes(99999999) || result.failed.includes(99999999)).toBe(true);
    });
  });
});
