import { describe, expect, it } from "bun:test";
import {
  AUDIT_CASES,
  STRICT_CONSTRAINT_FIELDS,
  MAX_GLOBAL_LEADER_COUNT,
  TIME_BUDGET_MS,
  constraintFieldsFor,
  validateAuditCases,
  assertGlobalLeaderBudget,
  buildEngineInputs,
  loadScenarioFixtures,
  loadPublicGraphFixtures,
  formatMetrics,
  type AuditCase,
  type AuditLayoutMetrics,
} from "./runLayoutAudit";
import { resolve } from "path";
import { resolveCustomLayoutConfig } from "../src/engine/layout/custom/config";

describe("runLayoutAudit architectural invariants & matrix verification", () => {
  it("defines the exact 8-case engine and direction labels in canonical order", () => {
    expect(AUDIT_CASES).toHaveLength(8);

    const expectedLabels: readonly string[] = [
      "layered/top-down",
      "layered/bottom-top",
      "layered/left-right",
      "layered/right-left",
      "radial/top-down",
      "radial/bottom-top",
      "radial/left-right",
      "radial/right-left",
    ];

    const actualLabels = AUDIT_CASES.map((c) => c.label);
    expect(actualLabels).toEqual(expectedLabels);

    // Verify engine modes and directions
    expect(AUDIT_CASES[0]).toEqual({
      mode: "layered",
      direction: "top-down",
      label: "layered/top-down",
    });
    expect(AUDIT_CASES[1]).toEqual({
      mode: "layered",
      direction: "bottom-up",
      label: "layered/bottom-top",
    });
    expect(AUDIT_CASES[2]).toEqual({
      mode: "layered",
      direction: "left-right",
      label: "layered/left-right",
    });
    expect(AUDIT_CASES[3]).toEqual({
      mode: "layered",
      direction: "right-left",
      label: "layered/right-left",
    });
    expect(AUDIT_CASES[4]).toEqual({
      mode: "radial",
      direction: "top-down",
      label: "radial/top-down",
    });
    expect(AUDIT_CASES[5]).toEqual({
      mode: "radial",
      direction: "bottom-up",
      label: "radial/bottom-top",
    });
    expect(AUDIT_CASES[6]).toEqual({
      mode: "radial",
      direction: "left-right",
      label: "radial/left-right",
    });
    expect(AUDIT_CASES[7]).toEqual({
      mode: "radial",
      direction: "right-left",
      label: "radial/right-left",
    });
  });

  it("validates audit case array and rejects incomplete case sets", () => {
    expect(() => validateAuditCases(AUDIT_CASES)).not.toThrow();

    const incompleteCases: AuditCase[] = [
      { mode: "layered", direction: "top-down", label: "layered/top-down" },
    ];
    expect(() => validateAuditCases(incompleteCases)).toThrow("Expected exactly 8 audit cases");

    const missingCases: AuditCase[] = [
      { mode: "layered", direction: "top-down", label: "layered/top-down" },
      { mode: "layered", direction: "bottom-up", label: "layered/bottom-top" },
      { mode: "layered", direction: "left-right", label: "layered/left-right" },
      { mode: "layered", direction: "right-left", label: "layered/right-left" },
      { mode: "radial", direction: "top-down", label: "radial/top-down" },
      { mode: "radial", direction: "bottom-up", label: "radial/bottom-top" },
      { mode: "radial", direction: "left-right", label: "radial/left-right" },
      { mode: "radial", direction: "top-down", label: "radial/duplicate" },
    ];
    expect(() => validateAuditCases(missingCases)).toThrow(
      "Missing expected audit case: 'radial/right-left'",
    );
  });

  it("enforces all 8 zero-tolerance constraint fields across all modes", () => {
    expect(STRICT_CONSTRAINT_FIELDS).toEqual([
      "nodeNodeOverlaps",
      "edgeNodePenetrations",
      "badgeNodeOverlaps",
      "badgeBadgeOverlaps",
      "badgeEdgePenetrations",
      "unresolvedRouteCount",
      "unresolvedBadgeCount",
      "collinearEdgeOverlaps",
    ]);

    for (const auditCase of AUDIT_CASES) {
      const fields = constraintFieldsFor(auditCase);
      expect(fields).toEqual(STRICT_CONSTRAINT_FIELDS);
      expect(fields).toContain("collinearEdgeOverlaps");
      expect(fields).toContain("edgeNodePenetrations");
      expect(fields).toContain("badgeNodeOverlaps");
      expect(fields).toContain("badgeBadgeOverlaps");
      expect(fields).toContain("badgeEdgePenetrations");
      expect(fields).toContain("unresolvedRouteCount");
      expect(fields).toContain("unresolvedBadgeCount");
      expect(fields).toContain("nodeNodeOverlaps");
    }
  });

  it("enforces global leader line budget threshold <= 2 and per-run time budget <= 250ms", () => {
    expect(MAX_GLOBAL_LEADER_COUNT).toBe(2);
    expect(TIME_BUDGET_MS).toBe(250);

    expect(() => assertGlobalLeaderBudget(0)).not.toThrow();
    expect(() => assertGlobalLeaderBudget(1)).not.toThrow();
    expect(() => assertGlobalLeaderBudget(2)).not.toThrow();

    expect(() => assertGlobalLeaderBudget(3)).toThrow(
      "Global leader line budget exceeded: total leaderCount = 3 (max allowed 2)",
    );
    expect(() => assertGlobalLeaderBudget(10, 2)).toThrow(
      "Global leader line budget exceeded: total leaderCount = 10 (max allowed 2)",
    );
  });

  it("strictly types and populates all 22 LayoutMetrics fields", () => {
    const fullMetrics: AuditLayoutMetrics = {
      crossings: 1,
      geometricCrossings: 2,
      bendCount: 3,
      totalLength: 100.5,
      straightChainRatio: 0.95,
      area: 25000,
      aspectRatio: 1.6,
      laneDepthMax: 4,
      portSideBalance: 0.8,
      leaderCount: 0,
      labelsTruncated: 0,
      nodeCount: 10,
      edgeCount: 15,
      rankCount: 5,
      dummyCount: 6,
      nodeNodeOverlaps: 0,
      edgeNodePenetrations: 0,
      badgeNodeOverlaps: 0,
      badgeBadgeOverlaps: 0,
      badgeEdgePenetrations: 0,
      unresolvedRouteCount: 0,
      unresolvedBadgeCount: 0,
      collinearEdgeOverlaps: 0,
    };

    expect(typeof fullMetrics.crossings).toBe("number");
    expect(typeof fullMetrics.totalLength).toBe("number");
    expect(typeof fullMetrics.area).toBe("number");
    expect(typeof fullMetrics.aspectRatio).toBe("number");
    expect(typeof fullMetrics.laneDepthMax).toBe("number");
    expect(typeof fullMetrics.portSideBalance).toBe("number");
    expect(typeof fullMetrics.nodeCount).toBe("number");
    expect(typeof fullMetrics.edgeCount).toBe("number");
    expect(typeof fullMetrics.rankCount).toBe("number");
    expect(typeof fullMetrics.dummyCount).toBe("number");
    expect(typeof fullMetrics.collinearEdgeOverlaps).toBe("number");
  });

  it("formats metrics accurately including collinear overlaps and leaderCount", () => {
    const sampleMetrics: AuditLayoutMetrics = {
      crossings: 0,
      geometricCrossings: 0,
      bendCount: 4,
      totalLength: 150.0,
      straightChainRatio: 1.0,
      area: 12000,
      aspectRatio: 1.33,
      laneDepthMax: 2,
      portSideBalance: 1.0,
      leaderCount: 0,
      labelsTruncated: 0,
      nodeCount: 4,
      edgeCount: 3,
      rankCount: 3,
      dummyCount: 1,
      nodeNodeOverlaps: 0,
      edgeNodePenetrations: 0,
      badgeNodeOverlaps: 0,
      badgeBadgeOverlaps: 0,
      badgeEdgePenetrations: 0,
      unresolvedRouteCount: 0,
      unresolvedBadgeCount: 0,
      collinearEdgeOverlaps: 0,
    };

    const formatted = formatMetrics(sampleMetrics);
    expect(formatted).toContain("crossings=0");
    expect(formatted).toContain("bendCount=4");
    expect(formatted).toContain("straightChainRatio=1.00");
    expect(formatted).toContain("leaderCount=0");
    expect(formatted).toContain("collinearOverlaps=0");
  });

  it("builds engine inputs with measured bounds and handles empty or minimal fixtures", () => {
    const config = resolveCustomLayoutConfig();
    const result = buildEngineInputs(
      [
        { id: "n1", name: "Node 1" },
        { id: "n2", name: "Node 2" },
      ],
      [{ id: "e1", source: "n1", target: "n2", label: "Handoff" }],
      config,
    );

    expect(result.normalizedNodes).toHaveLength(2);
    expect(result.normalizedNodes[0].id).toBe("n1");
    expect(result.normalizedNodes[0].width).toBeGreaterThanOrEqual(config.minNodeWidth);
    expect(result.normalizedEdges).toHaveLength(1);
    expect(result.normalizedEdges[0].labelWidth).toBeGreaterThan(0);
    expect(result.normalizedEdges[0].labelHeight).toBe(26);
  });

  it("loads scenario and public graph fixtures cleanly", () => {
    const projectRoot = resolve(import.meta.dirname, "..");
    const scenarios = loadScenarioFixtures();
    expect(scenarios.length).toBeGreaterThanOrEqual(20);

    const publicGraphs = loadPublicGraphFixtures(projectRoot);
    expect(publicGraphs.length).toBeGreaterThan(0);

    for (const fixture of [...scenarios, ...publicGraphs]) {
      expect(fixture.name).toBeTruthy();
      expect(Array.isArray(fixture.nodes)).toBe(true);
      expect(Array.isArray(fixture.edges)).toBe(true);
    }
  });
});
