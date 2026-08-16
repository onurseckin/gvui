import { beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  useCollaborationStore,
  inferAgentRole,
  inferEventSeverity,
  filterCollaborationEvents,
} from "../../store/useCollaborationStore";
import {
  CollaborationFeed,
  FeedItem,
  LiveLockIndicator,
  ThroughputGauge,
  formatTokenNumber,
  formatLatency,
  formatDuration,
  formatEventTime,
  getSeverityIcon,
} from "./index";
import type { AgentLock, CollaborationEvent, ThroughputMetrics } from "./types";

function resetStoreState() {
  act(() => {
    useCollaborationStore.getState().clearEvents();
    useCollaborationStore.getState().clearAllLocks();
    useCollaborationStore.getState().setSeverityFilter("all");
    useCollaborationStore.getState().setRoleFilter("all");
    useCollaborationStore.getState().setSearchQuery("");
    useCollaborationStore.getState().setIsStreamingPaused(false);
    useCollaborationStore.getState().setDocked(false);
    useCollaborationStore.getState().setCollapsed(false);
    useCollaborationStore.getState().setMaxStoredEvents(2000);
    useCollaborationStore.getState().updateThroughput({
      tokensPerSec: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      peakTokensPerSec: 0,
      sampleCount: 0,
      history: [],
    });
  });
}

beforeEach(() => {
  resetStoreState();
});

describe("Collaboration Feed Store & Engine", () => {
  describe("Store state management & Event streaming", () => {
    it("initializes with default values", () => {
      const state = useCollaborationStore.getState();
      expect(state.events).toEqual([]);
      expect(state.activeLocks).toEqual({});
      expect(state.handoffs).toEqual([]);
      expect(state.agents).toEqual({});
      expect(state.severityFilter).toBe("all");
      expect(state.roleFilter).toBe("all");
      expect(state.searchQuery).toBe("");
      expect(state.isStreamingPaused).toBe(false);
      expect(state.isDocked).toBe(false);
      expect(state.isCollapsed).toBe(false);
    });

    it("adds standard events and prepends to history with normalization", () => {
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-impl-01",
          type: "start",
          summary: "Started implementation of feature A",
          taskId: "task-01",
          taskLabel: "Feature A",
        });
      });

      const events = useCollaborationStore.getState().events;
      expect(events.length).toBe(1);
      expect(events[0].agentId).toBe("agent-impl-01");
      expect(events[0].role).toBe("implementer");
      expect(events[0].severity).toBe("info");
      expect(events[0].summary).toBe("Started implementation of feature A");
      expect(typeof events[0].id).toBe("string");
      expect(typeof events[0].timestamp).toBe("number");
    });

    it("tracks agent registry updates across events", () => {
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-val-01",
          agentName: "Validator Alpha",
          type: "validation_started",
          summary: "Running gate checks",
          metrics: { promptTokens: 500, completionTokens: 100 },
        });
      });

      const agents = useCollaborationStore.getState().agents;
      expect(agents["agent-val-01"]).toBeDefined();
      expect(agents["agent-val-01"].name).toBe("Validator Alpha");
      expect(agents["agent-val-01"].role).toBe("validator");
      expect(agents["agent-val-01"].status).toBe("busy");
      expect(agents["agent-val-01"].totalTokens).toBe(600);

      // Finish event transitions agent to idle
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-val-01",
          type: "validation_approved",
          summary: "All checks passed",
        });
      });

      const updatedAgent = useCollaborationStore.getState().agents["agent-val-01"];
      expect(updatedAgent.completedTasks).toBe(1);
    });

    it("acquires and releases task locks based on event types", () => {
      // Claim task acquires lock
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-impl-02",
          type: "lease_acquired",
          taskId: "task-02-auth",
          taskLabel: "User Auth",
          payload: {
            writeScope: ["src/auth/jwt.ts", "src/auth/session.ts"],
            tokenDigest: "digest-12345",
          },
          lockInfo: {
            durationSeconds: 1800,
          },
          summary: "Lease acquired for task-02-auth",
        });
      });

      let locks = useCollaborationStore.getState().getActiveLocks();
      expect(locks.length).toBe(1);
      expect(locks[0].taskId).toBe("task-02-auth");
      expect(locks[0].agentId).toBe("agent-impl-02");
      expect(locks[0].writeScope).toEqual(["src/auth/jwt.ts", "src/auth/session.ts"]);
      expect(locks[0].tokenDigest).toBe("digest-12345");
      expect(locks[0].durationSeconds).toBe(1800);

      // Finish task releases lock
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-impl-02",
          type: "finish",
          taskId: "task-02-auth",
          summary: "Completed task-02-auth",
        });
      });

      locks = useCollaborationStore.getState().getActiveLocks();
      expect(locks.length).toBe(0);
    });

    it("supports manual lock updates and releases", () => {
      const lock: AgentLock = {
        taskId: "task-99",
        taskLabel: "Manual Task",
        agentId: "agent-custom",
        role: "implementer",
        acquiredAt: Date.now(),
        writeScope: ["src/test.ts"],
      };

      act(() => {
        useCollaborationStore.getState().updateAgentLock(lock);
      });

      const savedLock = useCollaborationStore.getState().activeLocks["task-99"];
      expect(savedLock).toBeDefined();
      expect(savedLock?.taskId).toBe("task-99");
      expect(savedLock?.taskLabel).toBe("Manual Task");
      expect(savedLock?.agentId).toBe("agent-custom");
      expect(savedLock?.role).toBe("implementer");
      expect(savedLock?.writeScope).toEqual(["src/test.ts"]);

      act(() => {
        useCollaborationStore.getState().releaseAgentLock("task-99");
      });

      expect(useCollaborationStore.getState().activeLocks["task-99"]).toBeUndefined();
    });

    it("records handoff events between agents", () => {
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-orchestrator-root",
          targetAgentId: "agent-impl-01",
          targetAgentName: "Worker One",
          type: "handoff",
          taskId: "task-01",
          taskLabel: "Task One",
          summary: "Handoff task-01 to Worker One",
          payload: { reason: "Initial dispatch" },
        });
      });

      const handoffs = useCollaborationStore.getState().getHandoffHistory();
      expect(handoffs.length).toBe(1);
      expect(handoffs[0].fromAgentId).toBe("agent-orchestrator-root");
      expect(handoffs[0].toAgentId).toBe("agent-impl-01");
      expect(handoffs[0].toAgentName).toBe("Worker One");
      expect(handoffs[0].reason).toBe("Initial dispatch");
      expect(handoffs[0].status).toBe("completed");
    });

    it("accumulates throughput metrics and tracks peak rates", () => {
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-impl-01",
          type: "token_metric",
          summary: "Chunk processed",
          metrics: {
            promptTokens: 1000,
            completionTokens: 200,
            tokensPerSec: 120.5,
            latencyMs: 350,
          },
        });
      });

      let stats = useCollaborationStore.getState().getThroughputStats();
      expect(stats.tokensPerSec).toBe(120.5);
      expect(stats.promptTokens).toBe(1000);
      expect(stats.completionTokens).toBe(200);
      expect(stats.totalTokens).toBe(1200);
      expect(stats.peakTokensPerSec).toBe(120.5);
      expect(stats.latencyMs).toBe(350);
      expect(stats.sampleCount).toBe(1);
      expect(stats.history?.length).toBe(1);

      // Higher rate updates peak
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-impl-01",
          type: "token_metric",
          summary: "Fast chunk processed",
          metrics: {
            promptTokens: 2000,
            completionTokens: 500,
            tokensPerSec: 250.0,
            latencyMs: 200,
          },
        });
      });

      stats = useCollaborationStore.getState().getThroughputStats();
      expect(stats.tokensPerSec).toBe(250.0);
      expect(stats.promptTokens).toBe(3000);
      expect(stats.completionTokens).toBe(700);
      expect(stats.totalTokens).toBe(3700);
      expect(stats.peakTokensPerSec).toBe(250.0);
      expect(stats.sampleCount).toBe(2);
      expect(stats.history?.length).toBe(2);
    });

    it("caps maxStoredEvents properly", () => {
      act(() => {
        useCollaborationStore.getState().setMaxStoredEvents(5);
        for (let i = 0; i < 10; i++) {
          useCollaborationStore.getState().addEvent({
            agentId: "agent-loop",
            type: "tool_call",
            summary: `Event ${i}`,
          });
        }
      });

      const events = useCollaborationStore.getState().events;
      expect(events.length).toBe(5);
      expect(events[0].summary).toBe("Event 9");
      expect(events[4].summary).toBe("Event 5");
    });

    it("supports setEvents and clearEvents", () => {
      const mockEvents: CollaborationEvent[] = [
        {
          id: "e1",
          timestamp: 1000,
          agentId: "a1",
          role: "orchestrator",
          type: "start",
          severity: "info",
          summary: "Event 1",
        },
      ];

      act(() => {
        useCollaborationStore.getState().setEvents(mockEvents);
      });
      expect(useCollaborationStore.getState().events).toHaveLength(1);

      act(() => {
        useCollaborationStore.getState().clearEvents();
      });
      expect(useCollaborationStore.getState().events).toHaveLength(0);
    });

    it("exports valid feed JSON snapshot", () => {
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-impl-01",
          type: "start",
          summary: "Test export event",
        });
      });

      const jsonStr = useCollaborationStore.getState().exportFeedJson();
      const parsed: {
        exportedAt: string;
        eventsCount: number;
        events: CollaborationEvent[];
        activeLocks: AgentLock[];
      } = JSON.parse(jsonStr);

      expect(parsed.eventsCount).toBe(1);
      expect(parsed.events[0].summary).toBe("Test export event");
      expect(Array.isArray(parsed.activeLocks)).toBe(true);
    });
  });

  describe("Role & Severity Inference", () => {
    it("infers role from agentId correctly", () => {
      expect(inferAgentRole("agent-meta-orchestrator")).toBe("orchestrator");
      expect(inferAgentRole("agent-coord-01")).toBe("orchestrator");
      expect(inferAgentRole("agent-val-gate")).toBe("validator");
      expect(inferAgentRole("agent-validator-01")).toBe("validator");
      expect(inferAgentRole("agent-critic-review")).toBe("critic");
      expect(inferAgentRole("agent-eval-01")).toBe("critic");
      expect(inferAgentRole("agent-impl-feed")).toBe("implementer");
      expect(inferAgentRole("agent-worker-2")).toBe("implementer");
      expect(inferAgentRole("agent-coder-x")).toBe("implementer");
      expect(inferAgentRole("system-harness")).toBe("system");
      expect(inferAgentRole("user-input")).toBe("user");
      expect(inferAgentRole("unknown-id")).toBe("implementer");
      expect(inferAgentRole("custom-id", "validator")).toBe("validator");
    });

    it("infers severity from event types", () => {
      expect(inferEventSeverity("validation_rejected")).toBe("reject");
      expect(inferEventSeverity("error")).toBe("reject");
      expect(inferEventSeverity("validation_approved")).toBe("approve");
      expect(inferEventSeverity("critic_approved")).toBe("approve");
      expect(inferEventSeverity("warn")).toBe("warn");
      expect(inferEventSeverity("claim")).toBe("info");
      expect(inferEventSeverity("tool_call")).toBe("info");
      expect(inferEventSeverity("start", "warn")).toBe("warn");
    });
  });

  describe("Filtering logic", () => {
    const sampleEvents: CollaborationEvent[] = [
      {
        id: "evt-1",
        timestamp: 1000,
        agentId: "agent-coord",
        agentName: "Coordinator",
        role: "orchestrator",
        type: "claim",
        severity: "info",
        summary: "Claimed task 1",
        taskId: "task-01",
      },
      {
        id: "evt-2",
        timestamp: 2000,
        agentId: "agent-impl-1",
        agentName: "Implementer One",
        role: "implementer",
        type: "tool_call",
        severity: "info",
        summary: "Ran command bun test",
        taskId: "task-01",
        payload: { command: "bun test" },
      },
      {
        id: "evt-3",
        timestamp: 3000,
        agentId: "agent-val-1",
        agentName: "Validator Alpha",
        role: "validator",
        type: "validation_rejected",
        severity: "reject",
        summary: "Validation failed with 2 errors",
        taskId: "task-01",
        details: "LCP metric threshold exceeded",
      },
      {
        id: "evt-4",
        timestamp: 4000,
        agentId: "agent-critic-1",
        agentName: "Critic Reviewer",
        role: "critic",
        type: "critic_approved",
        severity: "approve",
        summary: "Design review approved",
        taskId: "task-02",
      },
      {
        id: "evt-5",
        timestamp: 5000,
        agentId: "agent-impl-2",
        agentName: "Implementer Two",
        role: "implementer",
        type: "warn",
        severity: "warn",
        summary: "High memory usage detected",
      },
    ];

    it("filters by severity", () => {
      const all = filterCollaborationEvents(sampleEvents, {
        severity: "all",
        role: "all",
        searchQuery: "",
      });
      expect(all.length).toBe(5);

      const rejects = filterCollaborationEvents(sampleEvents, {
        severity: "reject",
        role: "all",
        searchQuery: "",
      });
      expect(rejects.length).toBe(1);
      expect(rejects[0].id).toBe("evt-3");

      const approves = filterCollaborationEvents(sampleEvents, {
        severity: "approve",
        role: "all",
        searchQuery: "",
      });
      expect(approves.length).toBe(1);
      expect(approves[0].id).toBe("evt-4");

      const warns = filterCollaborationEvents(sampleEvents, {
        severity: "warn",
        role: "all",
        searchQuery: "",
      });
      expect(warns.length).toBe(1);
      expect(warns[0].id).toBe("evt-5");
    });

    it("filters by role", () => {
      const validators = filterCollaborationEvents(sampleEvents, {
        severity: "all",
        role: "validator",
        searchQuery: "",
      });
      expect(validators.length).toBe(1);
      expect(validators[0].agentId).toBe("agent-val-1");

      const implementers = filterCollaborationEvents(sampleEvents, {
        severity: "all",
        role: "implementer",
        searchQuery: "",
      });
      expect(implementers.length).toBe(2);
    });

    it("filters by search query across multiple fields", () => {
      // Search by summary
      const matchSummary = filterCollaborationEvents(sampleEvents, {
        severity: "all",
        role: "all",
        searchQuery: "command",
      });
      expect(matchSummary.length).toBe(1);
      expect(matchSummary[0].id).toBe("evt-2");

      // Search by agent name
      const matchAgent = filterCollaborationEvents(sampleEvents, {
        severity: "all",
        role: "all",
        searchQuery: "Coordinator",
      });
      expect(matchAgent.length).toBe(1);
      expect(matchAgent[0].id).toBe("evt-1");

      // Search by payload content
      const matchPayload = filterCollaborationEvents(sampleEvents, {
        severity: "all",
        role: "all",
        searchQuery: "bun test",
      });
      expect(matchPayload.length).toBe(1);
      expect(matchPayload[0].id).toBe("evt-2");

      // Search by details
      const matchDetails = filterCollaborationEvents(sampleEvents, {
        severity: "all",
        role: "all",
        searchQuery: "LCP metric",
      });
      expect(matchDetails.length).toBe(1);
      expect(matchDetails[0].id).toBe("evt-3");

      // Non-matching query
      const nonMatch = filterCollaborationEvents(sampleEvents, {
        severity: "all",
        role: "all",
        searchQuery: "xyz-non-existent",
      });
      expect(nonMatch.length).toBe(0);
    });

    it("handles special regex characters safely in search queries", () => {
      const specialQuery = "[.*+?^${}()|]";
      expect(() => {
        filterCollaborationEvents(sampleEvents, {
          severity: "all",
          role: "all",
          searchQuery: specialQuery,
        });
      }).not.toThrow();
    });
  });
});

describe("Collaboration Feed React Components", () => {
  describe("ThroughputGauge", () => {
    it("renders formatted tokens/sec, totals, and latency", () => {
      const metrics: ThroughputMetrics = {
        tokensPerSec: 145.2,
        promptTokens: 120000,
        completionTokens: 35000,
        totalTokens: 155000,
        latencyMs: 420,
        peakTokensPerSec: 250,
        sampleCount: 15,
      };

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<ThroughputGauge metrics={metrics} />);
      });

      expect(renderer).not.toBeNull();
      const root = renderer!.root;

      const tpsNode = root.findByProps({ "data-testid": "metric-tps" });
      expect(tpsNode).toBeDefined();

      const totalTokensNode = root.findByProps({ "data-testid": "metric-total-tokens" });
      expect(totalTokensNode).toBeDefined();

      const latencyNode = root.findByProps({ "data-testid": "metric-latency" });
      expect(latencyNode).toBeDefined();
    });

    it("formats token numbers accurately", () => {
      expect(formatTokenNumber(500)).toBe("500");
      expect(formatTokenNumber(1500)).toBe("1.5k");
      expect(formatTokenNumber(2500000)).toBe("2.50M");
    });

    it("formats latency accurately", () => {
      expect(formatLatency(0)).toBe("0 ms");
      expect(formatLatency(350)).toBe("350 ms");
      expect(formatLatency(2500)).toBe("2.50 s");
    });
  });

  describe("LiveLockIndicator", () => {
    it("renders empty state when there are no active locks", () => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<LiveLockIndicator locks={[]} />);
      });

      expect(renderer).not.toBeNull();
      const root = renderer!.root;
      const emptyMsg = root.findByProps({ "data-testid": "no-locks-msg" });
      expect(emptyMsg).toBeDefined();
    });

    it("renders lock cards with write scope and trigger release callback", () => {
      let releasedTaskId: string | null = null;
      const onRelease = (id: string) => {
        releasedTaskId = id;
      };
      const locks: AgentLock[] = [
        {
          taskId: "task-01",
          taskLabel: "Feed Implementation",
          agentId: "agent-impl-01",
          agentName: "Implementer 1",
          role: "implementer",
          acquiredAt: Date.now(),
          durationSeconds: 3600,
          writeScope: ["src/components/Feed.tsx"],
        },
      ];

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<LiveLockIndicator locks={locks} onReleaseLock={onRelease} />);
      });

      const root = renderer!.root;
      const lockCard = root.findByProps({ "data-testid": "lock-card-task-01" });
      expect(lockCard).toBeDefined();

      const releaseBtn = root.findByProps({ "data-testid": "release-lock-task-01" });
      act(() => {
        releaseBtn.props.onClick();
      });

      expect(releasedTaskId).toBe("task-01");
    });

    it("formats duration correctly", () => {
      expect(formatDuration(undefined)).toBe("");
      expect(formatDuration(0)).toBe("");
      expect(formatDuration(45)).toBe("45s");
      expect(formatDuration(60)).toBe("1m");
      expect(formatDuration(125)).toBe("2m 5s");
    });
  });

  describe("FeedItem", () => {
    const event: CollaborationEvent = {
      id: "evt-test-1",
      timestamp: 1723720000000,
      agentId: "agent-impl-01",
      agentName: "Implementer",
      role: "implementer",
      type: "tool_call",
      severity: "info",
      summary: "Executing tool grep_search",
      taskId: "task-01",
      taskLabel: "Feed Task",
      details: "Pattern: @tabler/icons",
      payload: { query: "@tabler/icons", maxResults: 50 },
      metrics: { totalTokens: 1250 },
    };

    it("renders event details and expands/collapses payload on click", () => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<FeedItem event={event} />);
      });

      const root = renderer!.root;
      const toggleBtn = root.findByProps({ "data-testid": "toggle-details-evt-test-1" });
      expect(toggleBtn).toBeDefined();

      // Click to expand
      act(() => {
        toggleBtn.props.onClick();
      });

      const detailsPanel = root.findByProps({ "data-testid": "details-panel-evt-test-1" });
      expect(detailsPanel).toBeDefined();
    });

    it("formats event timestamp", () => {
      const formatted = formatEventTime(1723720000000);
      expect(typeof formatted).toBe("string");
      expect(formatted.includes(":")).toBe(true);

      const fallback = formatEventTime("invalid-date-string");
      expect(fallback).toBe("invalid-date-string");
    });

    it("returns correct severity icons", () => {
      expect(getSeverityIcon("approve")).toBeDefined();
      expect(getSeverityIcon("reject")).toBeDefined();
      expect(getSeverityIcon("warn")).toBeDefined();
      expect(getSeverityIcon("info")).toBeDefined();
      expect(getSeverityIcon("error")).toBeDefined();
    });
  });

  describe("CollaborationFeed HUD", () => {
    it("renders main HUD and handles interactions (pause, search, filters, clear)", () => {
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-val-1",
          type: "validation_rejected",
          summary: "Test gate failure",
          taskId: "task-01",
        });
        useCollaborationStore.getState().addEvent({
          agentId: "agent-impl-1",
          type: "claim",
          summary: "Claimed task-01",
          taskId: "task-01",
        });
      });

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaborationFeed />);
      });

      const root = renderer!.root;

      // 1. Pause / Resume Toggle
      const pauseBtn = root.findByProps({ "data-testid": "toggle-stream-pause-btn" });
      act(() => {
        pauseBtn.props.onClick();
      });
      expect(useCollaborationStore.getState().isStreamingPaused).toBe(true);

      // Verify paused banner appears
      const pausedBanner = root.findByProps({ "data-testid": "stream-paused-banner" });
      expect(pausedBanner).toBeDefined();

      // 2. Search Box
      const searchInput = root.findByProps({ "data-testid": "feed-search-input" });
      act(() => {
        searchInput.props.onChange({ target: { value: "gate failure" } });
      });
      expect(useCollaborationStore.getState().searchQuery).toBe("gate failure");

      // 3. Severity Filter
      const rejectFilterBtn = root.findByProps({ "data-testid": "filter-severity-reject" });
      act(() => {
        rejectFilterBtn.props.onClick();
      });
      expect(useCollaborationStore.getState().severityFilter).toBe("reject");

      // 4. Role Filter
      const valRoleBtn = root.findByProps({ "data-testid": "filter-role-validator" });
      act(() => {
        valRoleBtn.props.onClick();
      });
      expect(useCollaborationStore.getState().roleFilter).toBe("validator");

      // 5. Dock Toggle
      const dockBtn = root.findByProps({ "data-testid": "toggle-dock-btn" });
      act(() => {
        dockBtn.props.onClick();
      });
      expect(useCollaborationStore.getState().isDocked).toBe(true);

      // 6. Clear Events
      const clearBtn = root.findByProps({ "data-testid": "clear-feed-btn" });
      act(() => {
        clearBtn.props.onClick();
      });
      expect(useCollaborationStore.getState().events.length).toBe(0);
    });

    it("collapses and expands the HUD view", () => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaborationFeed />);
      });

      const root = renderer!.root;
      const collapseBtn = root.findByProps({ "data-testid": "toggle-collapse-btn" });

      act(() => {
        collapseBtn.props.onClick();
      });
      expect(useCollaborationStore.getState().isCollapsed).toBe(true);

      // When collapsed, toolbar and feed items are unmounted
      expect(root.findAllByProps({ "data-testid": "feed-toolbar" }).length).toBe(0);

      // Expand back
      act(() => {
        collapseBtn.props.onClick();
      });
      expect(useCollaborationStore.getState().isCollapsed).toBe(false);
      expect(root.findAllByProps({ "data-testid": "feed-toolbar" }).length).toBe(1);
    });
  });

  describe("Stress & High-Frequency Streaming", () => {
    it("handles rapid burst of 500 events without errors", () => {
      act(() => {
        for (let i = 0; i < 500; i++) {
          const type = i % 4 === 0 ? "tool_call" : i % 4 === 1 ? "validation_rejected" : "claim";
          useCollaborationStore.getState().addEvent({
            agentId: `agent-worker-${i % 5}`,
            type,
            summary: `High frequency event #${i}`,
            taskId: `task-0${(i % 3) + 1}`,
            metrics: {
              promptTokens: 100,
              completionTokens: 20,
              tokensPerSec: 150 + (i % 50),
            },
          });
        }
      });

      const store = useCollaborationStore.getState();
      expect(store.events.length).toBe(500);
      expect(store.throughput.sampleCount).toBe(500);
      expect(store.throughput.totalTokens).toBe(500 * 120);
      expect(store.throughput.peakTokensPerSec).toBeGreaterThanOrEqual(150);

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaborationFeed />);
      });
      expect(renderer).not.toBeNull();
    });
  });

  describe("Adversarial Hardening: Burst Rate Clamping & Calculations", () => {
    it("sanitizes extreme, non-finite, and negative throughput values", () => {
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-burst",
          type: "token_metric",
          summary: "Burst with malformed metrics",
          metrics: {
            promptTokens: -500, // should clamp to 0
            completionTokens: Number.NaN, // should fallback to 0
            totalTokens: -100, // should fallback
            tokensPerSec: Number.POSITIVE_INFINITY, // should clamp/fallback to 0
            latencyMs: Number.NaN,
          },
        });
      });

      const stats = useCollaborationStore.getState().getThroughputStats();
      expect(stats.promptTokens).toBe(0);
      expect(stats.completionTokens).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.tokensPerSec).toBe(0);
      expect(Number.isFinite(stats.tokensPerSec)).toBe(true);
      expect(Number.isFinite(stats.totalTokens)).toBe(true);
    });

    it("clamps massive burst rates up to 100,000,000 tok/s safely", () => {
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "agent-super-burst",
          type: "token_metric",
          summary: "Massive rate",
          metrics: {
            tokensPerSec: 50_000_000,
            promptTokens: 10_000_000,
            completionTokens: 2_000_000,
          },
        });
      });

      const stats = useCollaborationStore.getState().getThroughputStats();
      expect(stats.tokensPerSec).toBe(50_000_000);
      expect(stats.peakTokensPerSec).toBe(50_000_000);
      expect(stats.totalTokens).toBe(12_000_000);
    });
  });

  describe("Adversarial Hardening: Empty & Malformed Event Inputs", () => {
    it("handles empty agentId and missing fields gracefully", () => {
      act(() => {
        useCollaborationStore.getState().addEvent({
          agentId: "",
          type: "tool_call",
          summary: "",
        });
      });

      const events = useCollaborationStore.getState().events;
      expect(events.length).toBe(1);
      expect(events[0].agentId).toBe("anonymous-agent");
      expect(events[0].summary).toBe("");
      expect(events[0].role).toBe("implementer");
      expect(events[0].severity).toBe("info");

      // Verify rendering FeedItem does not crash on empty fields
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<FeedItem event={events[0]} />);
      });
      expect(renderer).not.toBeNull();
    });

    it("handles null/undefined payloads and malformed details safely", () => {
      const weirdEvent: CollaborationEvent = {
        id: "weird-1",
        timestamp: "invalid-timestamp",
        agentId: "agent-anon",
        role: "implementer",
        type: "unknown_custom_type",
        severity: "info",
        summary: "Weird event",
        details: { deep: { nested: null } },
        payload: undefined,
      };

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<FeedItem event={weirdEvent} isExpandedDefault={true} />);
      });
      expect(renderer).not.toBeNull();
    });
  });

  describe("Adversarial Hardening: Lock Timeout Expiration & Pruning", () => {
    it("calculates lock expiration timestamps and prunes expired locks", () => {
      const baseTime = 1700000000000;
      act(() => {
        // Lock 1: 10 second duration (expires at baseTime + 10,000)
        useCollaborationStore.getState().addEvent({
          agentId: "agent-impl-1",
          type: "lease_acquired",
          taskId: "task-short",
          timestamp: baseTime,
          lockInfo: { durationSeconds: 10 },
          summary: "Short lease",
        });

        // Lock 2: 3600 second duration (expires at baseTime + 3,600,000)
        useCollaborationStore.getState().addEvent({
          agentId: "agent-impl-2",
          type: "lease_acquired",
          taskId: "task-long",
          timestamp: baseTime,
          lockInfo: { durationSeconds: 3600 },
          summary: "Long lease",
        });
      });

      // At baseTime + 5s: both locks active
      expect(useCollaborationStore.getState().getActiveLocks(baseTime + 5000).length).toBe(2);

      // At baseTime + 15s: short lock expired
      const activeAt15s = useCollaborationStore.getState().getActiveLocks(baseTime + 15000);
      expect(activeAt15s.length).toBe(1);
      expect(activeAt15s[0].taskId).toBe("task-long");

      // Prune expired locks at baseTime + 15s
      act(() => {
        useCollaborationStore.getState().pruneExpiredLocks(baseTime + 15000);
      });

      expect(Object.keys(useCollaborationStore.getState().activeLocks)).toEqual(["task-long"]);
    });
  });

  describe("Adversarial Hardening: Formatting Functions Resilience", () => {
    it("safely formats non-finite, negative, and extreme numbers", () => {
      expect(formatTokenNumber(undefined)).toBe("0");
      expect(formatTokenNumber(Number.NaN)).toBe("0");
      expect(formatTokenNumber(Number.POSITIVE_INFINITY)).toBe("0");
      expect(formatTokenNumber(0)).toBe("0");
      expect(formatTokenNumber(-500)).toBe("-500");
      expect(formatTokenNumber(10_500_000)).toBe("10.50M");

      expect(formatLatency(undefined)).toBe("0 ms");
      expect(formatLatency(Number.NaN)).toBe("0 ms");
      expect(formatLatency(-100)).toBe("0 ms");
      expect(formatLatency(0)).toBe("0 ms");
      expect(formatLatency(850)).toBe("850 ms");
      expect(formatLatency(4500)).toBe("4.50 s");
    });
  });
});
