import { describe, expect, it } from "bun:test";
import {
  calculateDistance,
  calculateFrustumIntersection,
  canAcquireLock,
  checkFrustumOverlap,
  detectProximityConflicts,
  detectSpatialConflicts,
  findAgentsNearPosition,
  findAgentsViewingNode,
  graphToScreenFrustum,
  isNodeInFrustum,
  isPointInFrustum,
  resolveLockConflict,
  resolveSimultaneousLockRequests,
  scaleFrustumForZoom,
  screenToGraphFrustum,
} from "./conflictManager";
import type { AgentPresence, NodeBoundingBox, SelectionLock, ViewportFrustum } from "./types";

describe("conflictManager", () => {
  const now = 1700000000000;

  describe("canAcquireLock", () => {
    it("allows lock acquisition when no existing lock exists", () => {
      const result = canAcquireLock(
        "node-1",
        { id: "agent-1", name: "Agent 1", role: "implementer" },
        {},
        "priority",
        now,
      );
      expect(result.allowed).toBe(true);
    });

    it("allows lock acquisition when existing lock is expired", () => {
      const currentLocks: Record<string, SelectionLock> = {
        "node-1": {
          id: "node-1",
          targetType: "node",
          targetId: "node-1",
          agentId: "agent-2",
          agentName: "Agent 2",
          role: "implementer",
          color: "#38bdf8",
          acquiredAt: now - 20000,
          expiresAt: now - 5000, // Expired
        },
      };

      const result = canAcquireLock(
        "node-1",
        { id: "agent-1", name: "Agent 1", role: "implementer" },
        currentLocks,
        "priority",
        now,
      );
      expect(result.allowed).toBe(true);
    });

    it("allows renewal when already locked by same agent", () => {
      const currentLocks: Record<string, SelectionLock> = {
        "node-1": {
          id: "node-1",
          targetType: "node",
          targetId: "node-1",
          agentId: "agent-1",
          agentName: "Agent 1",
          role: "implementer",
          color: "#38bdf8",
          acquiredAt: now - 5000,
          expiresAt: now + 10000,
        },
      };

      const result = canAcquireLock(
        "node-1",
        { id: "agent-1", name: "Agent 1", role: "implementer" },
        currentLocks,
        "priority",
        now,
      );
      expect(result.allowed).toBe(true);
      expect(result.existingLock?.agentId).toBe("agent-1");
    });

    it("denies lock when locked by another agent with equal or higher priority", () => {
      const currentLocks: Record<string, SelectionLock> = {
        "node-1": {
          id: "node-1",
          targetType: "node",
          targetId: "node-1",
          agentId: "agent-2",
          agentName: "Agent 2",
          role: "validator",
          color: "#f59e0b",
          acquiredAt: now - 5000,
          expiresAt: now + 10000,
        },
      };

      const result = canAcquireLock(
        "node-1",
        { id: "agent-1", name: "Agent 1", role: "implementer" },
        currentLocks,
        "priority",
        now,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("locked by Agent 2");
    });

    it("allows priority override when requesting agent has higher role priority", () => {
      const currentLocks: Record<string, SelectionLock> = {
        "node-1": {
          id: "node-1",
          targetType: "node",
          targetId: "node-1",
          agentId: "agent-2",
          agentName: "Agent 2",
          role: "implementer",
          color: "#38bdf8",
          acquiredAt: now - 5000,
          expiresAt: now + 10000,
        },
      };

      const result = canAcquireLock(
        "node-1",
        { id: "agent-orch", name: "Orchestrator", role: "orchestrator" },
        currentLocks,
        "priority",
        now,
      );
      expect(result.allowed).toBe(true);
      expect(result.override).toBe(true);
    });

    it("allows optimistic lock acquisition with warning reason", () => {
      const currentLocks: Record<string, SelectionLock> = {
        "node-1": {
          id: "node-1",
          targetType: "node",
          targetId: "node-1",
          agentId: "agent-2",
          agentName: "Agent 2",
          role: "validator",
          color: "#f59e0b",
          acquiredAt: now - 5000,
          expiresAt: now + 10000,
        },
      };

      const result = canAcquireLock(
        "node-1",
        { id: "agent-1", name: "Agent 1", role: "implementer" },
        currentLocks,
        "optimistic",
        now,
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("Optimistic lock allowed");
    });
  });

  describe("resolveLockConflict", () => {
    const lockOrch: SelectionLock = {
      id: "node-1",
      targetType: "node",
      targetId: "node-1",
      agentId: "orch-1",
      agentName: "Orchestrator",
      role: "orchestrator",
      color: "#a855f7",
      acquiredAt: now + 1000,
      expiresAt: now + 15000,
    };

    const lockImpl: SelectionLock = {
      id: "node-1",
      targetType: "node",
      targetId: "node-1",
      agentId: "impl-1",
      agentName: "Implementer",
      role: "implementer",
      color: "#38bdf8",
      acquiredAt: now,
      expiresAt: now + 15000,
    };

    it("resolves by priority strategy", () => {
      const res = resolveLockConflict(lockImpl, lockOrch, "priority");
      expect(res.winner.agentId).toBe("orch-1");
      expect(res.loser.agentId).toBe("impl-1");

      const resReverse = resolveLockConflict(lockOrch, lockImpl, "priority");
      expect(resReverse.winner.agentId).toBe("orch-1");
      expect(resReverse.loser.agentId).toBe("impl-1");
    });

    it("resolves by timestamp strategy (latest wins)", () => {
      const res = resolveLockConflict(lockImpl, lockOrch, "timestamp");
      expect(res.winner.agentId).toBe("orch-1");
      expect(res.reason).toContain("acquired more recently");

      const resReverse = resolveLockConflict(lockOrch, lockImpl, "timestamp");
      expect(resReverse.winner.agentId).toBe("orch-1");
    });

    it("resolves by first-write-wins strategy (earliest wins)", () => {
      const res = resolveLockConflict(lockImpl, lockOrch, "first-write-wins");
      expect(res.winner.agentId).toBe("impl-1");
      expect(res.reason).toContain("acquired earlier");

      const resReverse = resolveLockConflict(lockOrch, lockImpl, "first-write-wins");
      expect(resReverse.winner.agentId).toBe("impl-1");
    });

    it("resolves simultaneous race condition with identical timestamp and equal priority deterministically", () => {
      const lockA: SelectionLock = {
        id: "target-1-a",
        targetType: "node",
        targetId: "target-1",
        agentId: "agent-alpha",
        agentName: "Alpha",
        role: "implementer",
        color: "#38bdf8",
        acquiredAt: now,
        expiresAt: now + 10000,
      };

      const lockB: SelectionLock = {
        id: "target-1-b",
        targetType: "node",
        targetId: "target-1",
        agentId: "agent-beta",
        agentName: "Beta",
        role: "implementer",
        color: "#38bdf8",
        acquiredAt: now,
        expiresAt: now + 10000,
      };

      const res1 = resolveLockConflict(lockA, lockB, "priority");
      const res2 = resolveLockConflict(lockB, lockA, "priority");

      // Both must pick the exact same winner (deterministic symmetric resolution)
      expect(res1.winner.agentId).toBe(res2.winner.agentId);
      expect(res1.winner.agentId).toBe("agent-alpha");
    });

    it("resolves multi-agent simultaneous lock contention via tournament sorting", () => {
      const lock1: SelectionLock = {
        id: "t1",
        targetType: "node",
        targetId: "t1",
        agentId: "worker-3",
        agentName: "Worker 3",
        role: "implementer",
        color: "#38bdf8",
        acquiredAt: now,
        expiresAt: now + 10000,
      };
      const lock2: SelectionLock = {
        id: "t1",
        targetType: "node",
        targetId: "t1",
        agentId: "val-1",
        agentName: "Validator 1",
        role: "validator",
        color: "#f59e0b",
        acquiredAt: now,
        expiresAt: now + 10000,
      };
      const lock3: SelectionLock = {
        id: "t1",
        targetType: "node",
        targetId: "t1",
        agentId: "orch-1",
        agentName: "Orchestrator 1",
        role: "orchestrator",
        color: "#a855f7",
        acquiredAt: now,
        expiresAt: now + 10000,
      };

      const result = resolveSimultaneousLockRequests([lock1, lock2, lock3], "priority");
      expect(result.winner?.agentId).toBe("orch-1");
      expect(result.rejected.length).toBe(2);
      expect(result.rejected.map((r) => r.agentId)).toContain("worker-3");
      expect(result.rejected.map((r) => r.agentId)).toContain("val-1");
    });
  });

  describe("extreme canvas zoom frustum coordinate scaling", () => {
    it("safely scales frustum under extreme zoom-out (0.001) and zoom-in (1000.0)", () => {
      const baseFrustum: ViewportFrustum = {
        x: 100,
        y: 200,
        width: 1920,
        height: 1080,
        zoom: 1.0,
      };

      // Extreme zoom out (0.01)
      const zoomedOut = scaleFrustumForZoom(baseFrustum, 0.01);
      expect(zoomedOut.zoom).toBe(0.01);
      expect(zoomedOut.width).toBe(192000);
      expect(zoomedOut.height).toBe(108000);

      // Extreme zoom in (100.0)
      const zoomedIn = scaleFrustumForZoom(baseFrustum, 100.0);
      expect(zoomedIn.zoom).toBe(100.0);
      expect(zoomedIn.width).toBeCloseTo(19.2);
      expect(zoomedIn.height).toBeCloseTo(10.8);

      // Pathological values: 0, negative, NaN, Infinity
      const safeZero = scaleFrustumForZoom(baseFrustum, 0);
      expect(Number.isFinite(safeZero.width)).toBe(true);
      expect(safeZero.width).toBeGreaterThan(0);

      const safeNaN = scaleFrustumForZoom(baseFrustum, NaN);
      expect(Number.isFinite(safeNaN.width)).toBe(true);

      const safeInf = scaleFrustumForZoom(baseFrustum, Infinity);
      expect(Number.isFinite(safeInf.width)).toBe(true);
    });

    it("converts screen to graph frustum and back under extreme zoom levels accurately", () => {
      const screenRect = { width: 1200, height: 800, x: 0, y: 0 };
      const pan = { x: 50, y: 100 };
      const extremeZoom = 0.05;

      const graphFrustum = screenToGraphFrustum(screenRect, pan, extremeZoom);
      expect(graphFrustum.x).toBeCloseTo(-1000);
      expect(graphFrustum.y).toBeCloseTo(-2000);
      expect(graphFrustum.width).toBeCloseTo(24000);
      expect(graphFrustum.height).toBeCloseTo(16000);

      const reconstructedScreen = graphToScreenFrustum(graphFrustum, pan, extremeZoom);
      expect(reconstructedScreen.x).toBeCloseTo(screenRect.x, 1);
      expect(reconstructedScreen.y).toBeCloseTo(screenRect.y, 1);
      expect(reconstructedScreen.width).toBeCloseTo(screenRect.width, 1);
      expect(reconstructedScreen.height).toBeCloseTo(screenRect.height, 1);
    });
  });

  describe("spatial calculations", () => {
    const frustum: ViewportFrustum = {
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      zoom: 1,
    };

    it("checks isPointInFrustum", () => {
      expect(isPointInFrustum({ x: 200, y: 200 }, frustum)).toBe(true);
      expect(isPointInFrustum({ x: 100, y: 100 }, frustum)).toBe(true);
      expect(isPointInFrustum({ x: 500, y: 400 }, frustum)).toBe(true);
      expect(isPointInFrustum({ x: 50, y: 200 }, frustum)).toBe(false);
      expect(isPointInFrustum({ x: 200, y: 450 }, frustum)).toBe(false);
      expect(isPointInFrustum({ x: 200, y: 200 }, { ...frustum, width: 0 })).toBe(false);
    });

    it("checks isNodeInFrustum", () => {
      const insideNode: NodeBoundingBox = { id: "n1", x: 150, y: 150, width: 100, height: 60 };
      const overlappingNode: NodeBoundingBox = {
        id: "n2",
        x: 450,
        y: 350,
        width: 100,
        height: 100,
      };
      const outsideNode: NodeBoundingBox = { id: "n3", x: 600, y: 600, width: 50, height: 50 };

      expect(isNodeInFrustum(insideNode, frustum)).toBe(true);
      expect(isNodeInFrustum(overlappingNode, frustum)).toBe(true);
      expect(isNodeInFrustum(outsideNode, frustum)).toBe(false);
      expect(isNodeInFrustum({ ...insideNode, width: 0 }, frustum)).toBe(false);
    });

    it("checks checkFrustumOverlap and calculateFrustumIntersection", () => {
      const frustumA: ViewportFrustum = { x: 0, y: 0, width: 200, height: 200, zoom: 1 };
      const frustumB: ViewportFrustum = { x: 100, y: 100, width: 200, height: 200, zoom: 1 };
      const frustumDisjoint: ViewportFrustum = { x: 500, y: 500, width: 200, height: 200, zoom: 1 };

      expect(checkFrustumOverlap(frustumA, frustumB)).toBe(true);
      expect(checkFrustumOverlap(frustumA, frustumDisjoint)).toBe(false);
      expect(checkFrustumOverlap({ ...frustumA, width: 0 }, frustumB)).toBe(false);

      const intersection = calculateFrustumIntersection(frustumA, frustumB);
      expect(intersection).not.toBeNull();
      expect(intersection).toEqual({ x: 100, y: 100, width: 100, height: 100 });

      expect(calculateFrustumIntersection(frustumA, frustumDisjoint)).toBeNull();
    });

    it("calculates Euclidean distance", () => {
      expect(calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });
  });

  describe("conflict detection", () => {
    const p1: AgentPresence = {
      id: "agent-1",
      name: "Alice",
      role: "implementer",
      color: "#38bdf8",
      cursor: { x: 100, y: 100, lastUpdated: now, isPointerDown: true, targetNodeId: "node-A" },
      viewport: { x: 0, y: 0, width: 500, height: 500, zoom: 1 },
      selection: ["node-A"],
      activityState: "active",
      lastHeartbeat: now,
    };

    const p2: AgentPresence = {
      id: "agent-2",
      name: "Bob",
      role: "validator",
      color: "#f59e0b",
      cursor: { x: 130, y: 120, lastUpdated: now, isPointerDown: true, targetNodeId: "node-A" },
      viewport: { x: 0, y: 0, width: 500, height: 500, zoom: 1 },
      selection: ["node-A"],
      activityState: "active",
      lastHeartbeat: now,
    };

    it("detects proximity conflicts with critical severity for same node interaction", () => {
      const conflicts = detectProximityConflicts([p1, p2], 100, now);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].severity).toBe("critical");
      expect(conflicts[0].targetId).toBe("node-A");
    });

    it("detects comprehensive spatial conflicts including selection collision and lock collision", () => {
      const locks: Record<string, SelectionLock> = {
        "node-A": {
          id: "node-A",
          targetType: "node",
          targetId: "node-A",
          agentId: "agent-3",
          agentName: "Charlie",
          role: "orchestrator",
          color: "#a855f7",
          acquiredAt: now - 1000,
          expiresAt: now + 10000,
        },
      };

      const conflicts = detectSpatialConflicts([p1, p2], locks, 100, now);
      expect(conflicts.some((c) => c.type === "proximity_warning")).toBe(true);
      expect(conflicts.some((c) => c.type === "selection_collision")).toBe(true);
      expect(conflicts.some((c) => c.type === "lock_collision")).toBe(true);
    });

    it("finds agents viewing a node", () => {
      const node: NodeBoundingBox = { id: "node-A", x: 50, y: 50, width: 80, height: 40 };
      const viewing = findAgentsViewingNode(node, [p1, p2]);
      expect(viewing.length).toBe(2);

      const farNode: NodeBoundingBox = { id: "node-Far", x: 1000, y: 1000, width: 80, height: 40 };
      expect(findAgentsViewingNode(farNode, [p1, p2]).length).toBe(0);
    });

    it("finds agents near position", () => {
      const near = findAgentsNearPosition({ x: 110, y: 110 }, [p1, p2], 50);
      expect(near.length).toBe(2);

      const far = findAgentsNearPosition({ x: 900, y: 900 }, [p1, p2], 50);
      expect(far.length).toBe(0);
    });
  });
});
