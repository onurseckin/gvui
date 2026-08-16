import { beforeEach, describe, expect, it } from "bun:test";
import {
  getRoleColor,
  getRolePriority,
  inferPresenceRole,
  INITIAL_PRESENCE_STATE,
  usePresenceStore,
} from "../../../store/usePresenceStore";
import type { PresenceHeartbeat, ViewportFrustum } from "./types";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePresenceStore", () => {
  beforeEach(() => {
    usePresenceStore.setState({
      ...INITIAL_PRESENCE_STATE,
      presences: {},
      selectionLocks: {},
      cursorTrails: {},
      conflicts: [],
    });
  });

  describe("role inference and helpers", () => {
    it("infers role correctly from agentId and explicit role", () => {
      expect(inferPresenceRole("custom", "validator")).toBe("validator");
      expect(inferPresenceRole("agent-meta-orchestrator")).toBe("orchestrator");
      expect(inferPresenceRole("critic-agent-01")).toBe("critic");
      expect(inferPresenceRole("val-node-test")).toBe("validator");
      expect(inferPresenceRole("system-daemon")).toBe("system");
      expect(inferPresenceRole("user-bob")).toBe("user");
      expect(inferPresenceRole("worker-task-4")).toBe("implementer");
      expect(inferPresenceRole(undefined)).toBe("implementer");
    });

    it("returns correct role colors and fallback", () => {
      expect(getRoleColor("orchestrator")).toBe("#a855f7");
      expect(getRoleColor("implementer")).toBe("#38bdf8");
      expect(getRoleColor("validator")).toBe("#f59e0b");
      expect(getRoleColor("unknown_role" as unknown as "implementer")).toBe("#6366f1");
      expect(getRoleColor(undefined)).toBe("#6366f1");
    });

    it("returns role priorities correctly", () => {
      expect(getRolePriority("orchestrator")).toBe(5);
      expect(getRolePriority("validator")).toBe(4);
      expect(getRolePriority("critic")).toBe(3);
      expect(getRolePriority("implementer")).toBe(2);
      expect(getRolePriority("user")).toBe(1);
      expect(getRolePriority(undefined)).toBe(0);
    });
  });

  describe("presence lifecycle and updates", () => {
    it("registers and updates a new presence", () => {
      const store = usePresenceStore.getState();
      store.registerPresence({
        id: "agent-1",
        name: "Agent One",
        role: "implementer",
      });

      let presence = usePresenceStore.getState().presences["agent-1"];
      expect(presence).toBeDefined();
      expect(presence.name).toBe("Agent One");
      expect(presence.role).toBe("implementer");
      expect(presence.activityState).toBe("active");

      // Update
      store.updatePresence("agent-1", {
        activeTaskId: "task-04",
        activityState: "busy",
      });

      presence = usePresenceStore.getState().presences["agent-1"];
      expect(presence.activeTaskId).toBe("task-04");
      expect(presence.activityState).toBe("busy");
    });

    it("removes a presence and cleans up associated locks and trails", () => {
      const store = usePresenceStore.getState();
      store.registerPresence({ id: "agent-1", name: "Agent One" });
      store.acquireLock({
        targetType: "node",
        targetId: "node-1",
        agentId: "agent-1",
        agentName: "Agent One",
        role: "implementer",
        color: "#38bdf8",
      });
      store.updateCursor("agent-1", { x: 50, y: 50 });
      store.setFollowedAgentId("agent-1");

      expect(usePresenceStore.getState().presences["agent-1"]).toBeDefined();
      expect(usePresenceStore.getState().selectionLocks["node-1"]).toBeDefined();
      expect(usePresenceStore.getState().followedAgentId).toBe("agent-1");

      store.removePresence("agent-1");

      expect(usePresenceStore.getState().presences["agent-1"]).toBeUndefined();
      expect(usePresenceStore.getState().selectionLocks["node-1"]).toBeUndefined();
      expect(usePresenceStore.getState().cursorTrails["agent-1"]).toBeUndefined();
      expect(usePresenceStore.getState().followedAgentId).toBeNull();
    });

    it("clears all presences", () => {
      const store = usePresenceStore.getState();
      store.registerPresence({ id: "agent-1", name: "Agent 1" });
      store.registerPresence({ id: "agent-2", name: "Agent 2" });
      store.clearAllPresences();

      expect(Object.keys(usePresenceStore.getState().presences).length).toBe(0);
    });

    it("receives heartbeat and updates fields", () => {
      const store = usePresenceStore.getState();
      const heartbeat: PresenceHeartbeat = {
        agentId: "agent-hb",
        timestamp: 1700000000000,
        name: "Heartbeat Agent",
        role: "validator",
        cursor: { x: 120, y: 80, lastUpdated: 1700000000000 },
        selection: ["n-1", "n-2"],
        activityState: "busy",
      };

      store.receiveHeartbeat(heartbeat);
      const p = usePresenceStore.getState().presences["agent-hb"];
      expect(p).toBeDefined();
      expect(p.name).toBe("Heartbeat Agent");
      expect(p.role).toBe("validator");
      expect(p.cursor?.x).toBe(120);
      expect(p.selection).toEqual(["n-1", "n-2"]);
      expect(p.activityState).toBe("busy");
    });
  });

  describe("cursor, viewport, and selection tracking", () => {
    it("tracks cursor movement, calculates velocity and updates motion trails", () => {
      const store = usePresenceStore.getState();
      store.registerPresence({ id: "agent-1", name: "Agent 1" });

      // First cursor move
      store.updateCursor("agent-1", { x: 100, y: 100 });
      let p = usePresenceStore.getState().presences["agent-1"];
      expect(p.cursor?.x).toBe(100);
      expect(p.cursor?.y).toBe(100);

      // Second cursor move
      store.updateCursor("agent-1", {
        x: 200,
        y: 100,
        isPointerDown: true,
        targetNodeId: "node-x",
      });
      p = usePresenceStore.getState().presences["agent-1"];
      expect(p.cursor?.x).toBe(200);
      expect(p.cursor?.isPointerDown).toBe(true);
      expect(p.cursor?.targetNodeId).toBe("node-x");
      expect(p.hoveredNodeId).toBe("node-x");

      const trails = usePresenceStore.getState().cursorTrails["agent-1"];
      expect(trails.length).toBe(2);
      expect(trails[1].opacity).toBeGreaterThan(0);
    });

    it("updates viewport frustum and selection", () => {
      const store = usePresenceStore.getState();
      store.registerPresence({ id: "agent-1", name: "Agent 1" });

      const viewport: ViewportFrustum = { x: 10, y: 20, width: 800, height: 600, zoom: 1.5 };
      store.updateViewport("agent-1", viewport);
      store.updateSelection("agent-1", ["node-A", "node-B"]);
      store.setHoveredNode("agent-1", "node-A");

      const p = usePresenceStore.getState().presences["agent-1"];
      expect(p.viewport).toEqual(viewport);
      expect(p.selection).toEqual(["node-A", "node-B"]);
      expect(p.hoveredNodeId).toBe("node-A");
    });
  });

  describe("locks and conflict management", () => {
    it("acquires, renews, and releases locks", () => {
      const store = usePresenceStore.getState();
      const res = store.acquireLock({
        targetType: "node",
        targetId: "node-10",
        agentId: "agent-1",
        agentName: "Agent 1",
        role: "implementer",
        color: "#38bdf8",
        durationMs: 5000,
      });

      expect(res.success).toBe(true);
      expect(store.getLocksForNode("node-10")).not.toBeNull();
      expect(store.isNodeLockedByOther("node-10", "agent-2")).toBe(true);
      expect(store.isNodeLockedByOther("node-10", "agent-1")).toBe(false);

      // Renew lock
      const renewed = store.renewLock("node-10", "agent-1", 10000);
      expect(renewed).toBe(true);

      // Release lock
      const released = store.releaseLock("node-10", "agent-1");
      expect(released).toBe(true);
      expect(store.getLocksForNode("node-10")).toBeNull();
    });

    it("resolves simultaneous lock contention with higher priority overriding lower priority", () => {
      const store = usePresenceStore.getState();
      // Implementer locks node-A
      store.acquireLock({
        targetType: "node",
        targetId: "node-A",
        agentId: "impl-1",
        agentName: "Implementer",
        role: "implementer",
      });

      // Orchestrator attempts lock on same node-A -> should override and record conflict
      const orchResult = store.acquireLock({
        targetType: "node",
        targetId: "node-A",
        agentId: "orch-1",
        agentName: "Orchestrator",
        role: "orchestrator",
      });

      expect(orchResult.success).toBe(true);
      expect(orchResult.lock?.agentId).toBe("orch-1");
      expect(orchResult.conflict).toBeDefined();
      expect(store.getLocksForNode("node-A")?.agentId).toBe("orch-1");

      // Implementer tries to re-lock -> denied
      const retryResult = store.acquireLock({
        targetType: "node",
        targetId: "node-A",
        agentId: "impl-2",
        agentName: "Implementer 2",
        role: "implementer",
      });
      expect(retryResult.success).toBe(false);
      expect(retryResult.conflict).toBeDefined();
    });

    it("supports atomic batch lock acquisition with full rollback on contention", () => {
      const store = usePresenceStore.getState();
      // Pre-lock node-2 by orchestrator
      store.acquireLock({
        targetType: "node",
        targetId: "node-2",
        agentId: "orch-1",
        agentName: "Orchestrator",
        role: "orchestrator",
      });

      // Implementer tries atomic batch lock on node-1, node-2, node-3
      const batchResult = store.acquireLocks(
        [
          {
            targetType: "node",
            targetId: "node-1",
            agentId: "impl-1",
            agentName: "Worker",
            role: "implementer",
          },
          {
            targetType: "node",
            targetId: "node-2",
            agentId: "impl-1",
            agentName: "Worker",
            role: "implementer",
          },
          {
            targetType: "node",
            targetId: "node-3",
            agentId: "impl-1",
            agentName: "Worker",
            role: "implementer",
          },
        ],
        true, // atomic
      );

      expect(batchResult.allSucceeded).toBe(false);
      expect(batchResult.rejectedLocks.length).toBe(1);
      expect(batchResult.rejectedLocks[0].targetId).toBe("node-2");

      // Node-1 and Node-3 must have been rolled back
      expect(store.getLocksForNode("node-1")).toBeNull();
      expect(store.getLocksForNode("node-3")).toBeNull();
      // Node-2 remains owned by Orchestrator
      expect(store.getLocksForNode("node-2")?.agentId).toBe("orch-1");
    });

    it("clears expired locks", () => {
      const store = usePresenceStore.getState();
      const now = 1700000000000;
      usePresenceStore.setState({
        selectionLocks: {
          "node-active": {
            id: "node-active",
            targetType: "node",
            targetId: "node-active",
            agentId: "a1",
            agentName: "Agent 1",
            role: "implementer",
            color: "#38bdf8",
            acquiredAt: now,
            expiresAt: now + 5000,
          },
          "node-expired": {
            id: "node-expired",
            targetType: "node",
            targetId: "node-expired",
            agentId: "a2",
            agentName: "Agent 2",
            role: "implementer",
            color: "#38bdf8",
            acquiredAt: now - 10000,
            expiresAt: now - 1000,
          },
        },
      });

      const count = store.clearExpiredLocks(now);
      expect(count).toBe(1);
      expect(usePresenceStore.getState().selectionLocks["node-expired"]).toBeUndefined();
      expect(usePresenceStore.getState().selectionLocks["node-active"]).toBeDefined();
    });
  });

  describe("pruning and timeout management", () => {
    it("prunes inactive presences and auto-evicts dead agent locks and trails", () => {
      const store = usePresenceStore.getState();
      const now = 1700000000000;

      usePresenceStore.setState({
        idleTimeoutMs: 10000,
        disconnectTimeoutMs: 30000,
        heartbeatTimeoutMs: 30000,
        followedAgentId: "p-dead",
        presences: {
          "p-active": {
            id: "p-active",
            name: "Active",
            role: "implementer",
            color: "#38bdf8",
            cursor: null,
            viewport: null,
            selection: [],
            activityState: "active",
            lastHeartbeat: now - 2000, // 2s ago -> active
          },
          "p-idle": {
            id: "p-idle",
            name: "Idle",
            role: "implementer",
            color: "#38bdf8",
            cursor: null,
            viewport: null,
            selection: [],
            activityState: "active",
            lastHeartbeat: now - 15000, // 15s ago -> idle
          },
          "p-disconnected": {
            id: "p-disconnected",
            name: "Disconnected",
            role: "implementer",
            color: "#38bdf8",
            cursor: null,
            viewport: null,
            selection: [],
            activityState: "active",
            lastHeartbeat: now - 35000, // 35s ago -> disconnected
          },
          "p-dead": {
            id: "p-dead",
            name: "Dead",
            role: "implementer",
            color: "#38bdf8",
            cursor: null,
            viewport: null,
            selection: [],
            activityState: "disconnected",
            lastHeartbeat: now - 70000, // 70s ago ( > 2x 30s) -> auto-evicted
          },
        },
        selectionLocks: {
          "lock-dead": {
            id: "lock-dead",
            targetType: "node",
            targetId: "node-dead",
            agentId: "p-dead",
            agentName: "Dead",
            role: "implementer",
            color: "#38bdf8",
            acquiredAt: now - 70000,
            expiresAt: now + 50000,
          },
        },
        cursorTrails: {
          "p-dead": [{ x: 10, y: 10, timestamp: now - 70000 }],
        },
      });

      const stats = store.pruneInactivePresences(now);
      expect(stats.idleCount).toBe(1);
      expect(stats.disconnectedCount).toBe(1);
      expect(stats.removedCount).toBe(1);
      expect(stats.evictedAgentIds).toContain("p-dead");
      expect(stats.releasedLocksCount).toBe(1);

      const pState = usePresenceStore.getState().presences;
      expect(pState["p-active"].activityState).toBe("active");
      expect(pState["p-idle"].activityState).toBe("idle");
      expect(pState["p-disconnected"].activityState).toBe("disconnected");
      expect(pState["p-dead"]).toBeUndefined();

      // Dead agent's locks, trails, and follow state must be auto-evicted
      expect(usePresenceStore.getState().selectionLocks["node-dead"]).toBeUndefined();
      expect(usePresenceStore.getState().cursorTrails["p-dead"]).toBeUndefined();
      expect(usePresenceStore.getState().followedAgentId).toBeNull();
    });

    it("explicitly evicts stale presences via evictStalePresences", () => {
      const store = usePresenceStore.getState();
      const now = 1700000000000;

      usePresenceStore.setState({
        heartbeatTimeoutMs: 20000,
        presences: {
          p1: {
            id: "p1",
            name: "Agent 1",
            role: "implementer",
            color: "#38bdf8",
            cursor: null,
            viewport: null,
            selection: [],
            activityState: "active",
            lastHeartbeat: now - 5000,
          },
          p2: {
            id: "p2",
            name: "Agent 2",
            role: "implementer",
            color: "#38bdf8",
            cursor: null,
            viewport: null,
            selection: [],
            activityState: "active",
            lastHeartbeat: now - 25000, // Stale past 20s
          },
        },
        selectionLocks: {
          "node-p2": {
            id: "node-p2",
            targetType: "node",
            targetId: "node-p2",
            agentId: "p2",
            agentName: "Agent 2",
            role: "implementer",
            color: "#38bdf8",
            acquiredAt: now - 25000,
            expiresAt: now + 50000,
          },
        },
      });

      const result = store.evictStalePresences(20000, now);
      expect(result.evictedAgentIds).toEqual(["p2"]);
      expect(result.releasedLocksCount).toBe(1);
      expect(usePresenceStore.getState().presences["p2"]).toBeUndefined();
      expect(usePresenceStore.getState().selectionLocks["node-p2"]).toBeUndefined();
      expect(usePresenceStore.getState().presences["p1"]).toBeDefined();
    });
  });

  describe("selectors, filters, and interpolation", () => {
    it("filters visible presences by role and search query", () => {
      const store = usePresenceStore.getState();
      store.registerPresence({ id: "orch-1", name: "Alpha Orch", role: "orchestrator" });
      store.registerPresence({ id: "impl-1", name: "Beta Worker", role: "implementer" });
      store.registerPresence({ id: "val-1", name: "Gamma Audit", role: "validator" });

      expect(store.getVisiblePresences().length).toBe(3);

      store.setFilterRole("orchestrator");
      expect(store.getVisiblePresences().length).toBe(1);
      expect(store.getVisiblePresences()[0].id).toBe("orch-1");

      store.setFilterRole("all");
      store.setSearchQuery("Worker");
      expect(store.getVisiblePresences().length).toBe(1);
      expect(store.getVisiblePresences()[0].id).toBe("impl-1");
    });

    it("interpolates cursor position smoothly", () => {
      const store = usePresenceStore.getState();
      store.registerPresence({ id: "agent-1", name: "Agent 1" });

      usePresenceStore.setState({
        presences: {
          "agent-1": {
            id: "agent-1",
            name: "Agent 1",
            role: "implementer",
            color: "#38bdf8",
            cursor: { x: 100, y: 200, lastUpdated: Date.now() },
            viewport: null,
            selection: [],
            activityState: "active",
            lastHeartbeat: Date.now(),
          },
        },
        cursorTrails: {
          "agent-1": [
            { x: 0, y: 0, timestamp: Date.now() - 100 },
            { x: 100, y: 200, timestamp: Date.now() },
          ],
        },
      });

      const interp = store.getInterpolatedCursor("agent-1", 0.5);
      expect(interp).toEqual({ x: 50, y: 100 });
    });

    it("toggles overlay visibility flags", () => {
      const store = usePresenceStore.getState();
      store.toggleShowCursors();
      expect(usePresenceStore.getState().showCursors).toBe(false);
      store.toggleShowFrustums();
      expect(usePresenceStore.getState().showFrustums).toBe(false);
      store.toggleShowSelectionRings();
      expect(usePresenceStore.getState().showSelectionRings).toBe(false);
      store.toggleShowLockBadges();
      expect(usePresenceStore.getState().showLockBadges).toBe(false);
      store.toggleShowActivityTrails();
      expect(usePresenceStore.getState().showActivityTrails).toBe(false);
    });
  });
});
