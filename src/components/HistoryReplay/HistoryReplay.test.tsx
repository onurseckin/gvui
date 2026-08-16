import { beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  BookmarkList,
  diffStates,
  extractAutomaticBookmarks,
  getStateAtEvent,
  HistoryReplay,
  parseEventsJsonl,
  PlaybackControls,
  StateDiffModal,
  TimelineScrubber,
  useHistoryReplayStore,
} from "./index";
import type {
  ParseEventsResult,
  ReplayBookmark,
  ReplayEvent,
  ReplayStateSnapshot,
  StateDiffResult,
} from "./types";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceWarnings<T>(fn: () => T): T {
  const origError = console.error;
  console.error = (msg?: unknown, ...args: unknown[]) => {
    if (typeof msg === "string") {
      if (
        msg.includes("react-test-renderer is deprecated") ||
        msg.includes("not wrapped in act") ||
        msg.includes("inside a test was not wrapped in act") ||
        msg.includes("When testing, code that causes React state updates")
      ) {
        return;
      }
    }
    origError(msg, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = origError;
  }
}

// Sample JSONL data for comprehensive tests
const sampleJsonl = `
{"sequence": 1, "kind": "plan-task-added", "actor": "coordinator", "payload": {"task_id": "task-01", "label": "Feature Alpha"}, "timestamp": "2026-08-15T12:00:00Z"}
{"sequence": 2, "kind": "plan-task-added", "actor": "coordinator", "payload": {"task_id": "task-02", "label": "Feature Beta"}, "timestamp": "2026-08-15T12:01:00Z"}
{"sequence": 3, "kind": "plan-compiled", "actor": "coordinator", "payload": {"tasks_count": 2}, "projection": {"tasks": {"task-01": {"id": "task-01", "label": "Feature Alpha", "status": "pending", "write_scope": ["src/alpha.ts"]}, "task-02": {"id": "task-02", "label": "Feature Beta", "status": "pending", "write_scope": ["src/beta.ts"]}}, "graph": {"nodes": [{"id": "node-alpha", "label": "Node Alpha", "type": "agent"}, {"id": "node-beta", "label": "Node Beta", "type": "agent"}], "edges": [{"source": "node-alpha", "target": "node-beta", "type": "dependency"}]}}, "timestamp": "2026-08-15T12:02:00Z"}
{"sequence": 4, "kind": "task-claimed", "actor": "agent-impl-01", "payload": {"task_id": "task-01", "role": "implementer"}, "timestamp": "2026-08-15T12:03:00Z"}
{"sequence": 5, "kind": "task-submitted", "actor": "agent-impl-01", "payload": {"task_id": "task-01"}, "timestamp": "2026-08-15T12:04:00Z"}
{"sequence": 6, "kind": "critic-assigned", "actor": "coordinator", "payload": {"task_id": "task-01", "critic_id": "critic-01"}, "timestamp": "2026-08-15T12:05:00Z"}
{"sequence": 7, "kind": "task-rejected", "actor": "critic-01", "payload": {"task_id": "task-01", "reason": "Missing edge case handling"}, "timestamp": "2026-08-15T12:06:00Z"}
{"sequence": 8, "kind": "task-claimed", "actor": "agent-impl-01", "payload": {"task_id": "task-01", "role": "implementer"}, "timestamp": "2026-08-15T12:07:00Z"}
{"sequence": 9, "kind": "task-finished", "actor": "agent-impl-01", "payload": {"task_id": "task-01"}, "timestamp": "2026-08-15T12:08:00Z"}
{"sequence": 10, "kind": "all-tasks-finished", "actor": "coordinator", "payload": {"status": "success"}, "timestamp": "2026-08-15T12:09:00Z"}
`.trim();

describe("HistoryReplay Store & Engines Unit Tests", () => {
  beforeEach(() => {
    useHistoryReplayStore.setState({
      rawJsonl: "",
      events: [],
      parseIssues: [],
      currentEventIndex: 0,
      isPlaying: false,
      playbackSpeed: 1,
      isLooping: false,
      bookmarks: [],
      filterBookmarkCategory: "all",
      searchQuery: "",
      selectedDiffIndices: null,
      isDiffModalOpen: false,
    });
  });

  describe("JSONL Parsing Engine (parseEventsJsonl)", () => {
    it("parses valid JSONL into structured ReplayEvents", () => {
      const result: ParseEventsResult = parseEventsJsonl(sampleJsonl);
      expect(result.totalParsed).toBe(10);
      expect(result.totalErrors).toBe(0);
      expect(result.events.length).toBe(10);

      expect(result.events[0]!.sequence).toBe(1);
      expect(result.events[0]!.kind).toBe("plan-task-added");
      expect(result.events[0]!.actor).toBe("coordinator");
      expect(result.events[0]!.payload.task_id).toBe("task-01");
    });

    it("handles multiline JSON objects gracefully", () => {
      const multilineText = `
{
  "sequence": 1,
  "kind": "task-claimed",
  "actor": "agent-alpha",
  "payload": {
    "task_id": "task-99",
    "details": "Multiline payload test"
  },
  "timestamp": "2026-08-15T12:00:00Z"
}
{"sequence": 2, "kind": "run-completed", "actor": "system", "payload": {}, "timestamp": "2026-08-15T12:05:00Z"}
      `.trim();

      const result = parseEventsJsonl(multilineText);
      expect(result.totalParsed).toBe(2);
      expect(result.totalErrors).toBe(0);
      expect(result.events[0]!.kind).toBe("task-claimed");
      expect(result.events[0]!.actor).toBe("agent-alpha");
      expect(result.events[1]!.kind).toBe("run-completed");
    });

    it("handles empty lines and whitespace lines without error", () => {
      const textWithSpaces = `
        
{"sequence": 1, "kind": "init", "actor": "system"}

   
{"sequence": 2, "kind": "done", "actor": "system"}
        
      `;
      const result = parseEventsJsonl(textWithSpaces);
      expect(result.totalParsed).toBe(2);
      expect(result.totalErrors).toBe(0);
    });

    it("skips corrupt lines and logs parse issues without crashing", () => {
      const corruptText = `
{"sequence": 1, "kind": "step-1", "actor": "system"}
{INVALID_JSON_LINE...
{"sequence": 2, "kind": "step-2", "actor": "system"}
{"non_object_json": 123
{"sequence": 3, "kind": "step-3", "actor": "system"}
      `.trim();

      const result = parseEventsJsonl(corruptText);
      expect(result.totalParsed).toBe(3);
      expect(result.totalErrors).toBeGreaterThan(0);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.events[0]!.sequence).toBe(1);
      expect(result.events[1]!.sequence).toBe(2);
      expect(result.events[2]!.sequence).toBe(3);
    });

    it("returns empty result on empty or non-string input", () => {
      expect(parseEventsJsonl("").totalParsed).toBe(0);
      expect(parseEventsJsonl("   ").totalParsed).toBe(0);
    });

    it("handles huge streams of events efficiently", () => {
      const lines: string[] = [];
      for (let i = 1; i <= 300; i++) {
        lines.push(
          JSON.stringify({
            sequence: i,
            kind:
              i % 10 === 0 ? "task-rejected" : i % 5 === 0 ? "critic-assigned" : "step-progress",
            actor: `agent-${i % 4}`,
            payload: { step: i, progress: i / 300 },
            timestamp: new Date(Date.now() + i * 1000).toISOString(),
          }),
        );
      }
      const hugeJsonl = lines.join("\n");
      const result = parseEventsJsonl(hugeJsonl);
      expect(result.totalParsed).toBe(300);
      expect(result.totalErrors).toBe(0);
      expect(result.events[299]!.sequence).toBe(300);
    });
  });

  describe("State Snapshot Reconstruction (getStateAtEvent)", () => {
    it("returns empty snapshot structure when events list is empty", () => {
      const snapshot: ReplayStateSnapshot = getStateAtEvent(0, []);
      expect(snapshot.eventIndex).toBe(0);
      expect(snapshot.summary.totalNodes).toBe(0);
      expect(snapshot.summary.totalEdges).toBe(0);
      expect(snapshot.summary.activeLeases).toBe(0);
    });

    it("reconstructs incremental task addition, claim, rejection, and completion", () => {
      const { events } = parseEventsJsonl(sampleJsonl);

      // Event 0: task-01 added
      const snap0 = getStateAtEvent(0, events);
      expect(snap0.tasks["task-01"]).toBeDefined();
      expect(snap0.tasks["task-01"]!.status).toBe("pending");
      expect(snap0.summary.pendingTasks).toBe(1);
      expect(snap0.summary.activeLeases).toBe(0);

      // Event 2: Projection compiled with 2 tasks and graph nodes
      const snap2 = getStateAtEvent(2, events);
      expect(snap2.tasks["task-01"]).toBeDefined();
      expect(snap2.tasks["task-02"]).toBeDefined();
      expect(snap2.dataset.nodes.length).toBeGreaterThanOrEqual(2);
      expect(snap2.dataset.edges.length).toBeGreaterThanOrEqual(1);

      // Event 3: task-01 claimed by agent-impl-01
      const snap3 = getStateAtEvent(3, events);
      expect(snap3.leases["task-01"]).toBeDefined();
      expect(snap3.leases["task-01"]!.agentId).toBe("agent-impl-01");
      expect(snap3.summary.activeLeases).toBe(1);
      expect(snap3.summary.runningTasks).toBe(1);

      // Event 6: task-01 rejected by critic-01
      const snap6 = getStateAtEvent(6, events);
      expect(snap6.tasks["task-01"]!.status).toBe("error");
      expect(snap6.failedEntities).toContain("task-01");
      expect(snap6.summary.failedTasks).toBe(1);

      // Event 8: task-01 finished
      const snap8 = getStateAtEvent(8, events);
      expect(snap8.tasks["task-01"]!.status).toBe("success");
      expect(snap8.summary.completedTasks).toBe(1);
      expect(snap8.leases["task-01"]).toBeUndefined();
      expect(snap8.failedEntities).not.toContain("task-01");
    });

    it("clamps out-of-bound indices correctly", () => {
      const { events } = parseEventsJsonl(sampleJsonl);
      const snapNegative = getStateAtEvent(-10, events);
      expect(snapNegative.eventIndex).toBe(0);

      const snapExcess = getStateAtEvent(999, events);
      expect(snapExcess.eventIndex).toBe(events.length - 1);
    });
  });

  describe("Automatic & Custom Bookmarking Engine", () => {
    it("extracts automatic failure, critic, and milestone bookmarks", () => {
      const { events } = parseEventsJsonl(sampleJsonl);
      const bookmarks: ReplayBookmark[] = extractAutomaticBookmarks(events);

      const failureBookmarks = bookmarks.filter((b) => b.category === "failure");
      const criticBookmarks = bookmarks.filter((b) => b.category === "critic");
      const milestoneBookmarks = bookmarks.filter((b) => b.category === "milestone");

      expect(failureBookmarks.length).toBeGreaterThanOrEqual(1);
      expect(criticBookmarks.length).toBeGreaterThanOrEqual(1);
      expect(milestoneBookmarks.length).toBeGreaterThanOrEqual(2);

      expect(failureBookmarks.some((f) => f.kind === "task-rejected")).toBe(true);
      expect(criticBookmarks.some((c) => c.kind === "critic-assigned")).toBe(true);
      expect(milestoneBookmarks.some((m) => m.kind === "plan-compiled")).toBe(true);
    });

    it("supports adding, updating, and removing custom bookmarks in store", () => {
      const store = useHistoryReplayStore.getState();
      store.loadEventsJsonl(sampleJsonl);

      // Add custom bookmark
      const bm = useHistoryReplayStore
        .getState()
        .addBookmark(4, "Critical Checkpoint", "Investigate payload throughput");

      expect(bm.eventIndex).toBe(4);
      expect(bm.label).toBe("Critical Checkpoint");
      expect(bm.isCustom).toBe(true);
      expect(bm.category).toBe("custom");

      let currentBookmarks = useHistoryReplayStore.getState().bookmarks;
      expect(currentBookmarks.some((b) => b.id === bm.id)).toBe(true);

      // Update bookmark
      useHistoryReplayStore.getState().updateBookmark(bm.id, { label: "Updated Label" });
      currentBookmarks = useHistoryReplayStore.getState().bookmarks;
      const updated = currentBookmarks.find((b) => b.id === bm.id);
      expect(updated?.label).toBe("Updated Label");

      // Remove bookmark
      useHistoryReplayStore.getState().removeBookmark(bm.id);
      currentBookmarks = useHistoryReplayStore.getState().bookmarks;
      expect(currentBookmarks.some((b) => b.id === bm.id)).toBe(false);
    });

    it("navigates forward and backward between bookmarks", () => {
      const store = useHistoryReplayStore.getState();
      store.loadEventsJsonl(sampleJsonl);

      // Current index is 0
      useHistoryReplayStore.getState().seekToIndex(0);
      useHistoryReplayStore.getState().jumpToNextBookmark();
      expect(useHistoryReplayStore.getState().currentEventIndex).toBeGreaterThan(0);

      // Jump to next failure
      useHistoryReplayStore.getState().jumpToNextFailure();
      const failIndex = useHistoryReplayStore.getState().currentEventIndex;
      expect(failIndex).toBe(6); // Sequence 7 is index 6 (task-rejected)

      // Jump to prev bookmark
      useHistoryReplayStore.getState().jumpToPrevBookmark();
      expect(useHistoryReplayStore.getState().currentEventIndex).toBeLessThan(failIndex);
    });
  });

  describe("State Diff Engine (diffStates)", () => {
    it("returns zero diff when comparing the same index with itself", () => {
      const { events } = parseEventsJsonl(sampleJsonl);
      const diff: StateDiffResult = diffStates(2, 2, events);

      expect(diff.summary.nodesAdded).toBe(0);
      expect(diff.summary.nodesRemoved).toBe(0);
      expect(diff.summary.nodesModified).toBe(0);
      expect(diff.summary.edgesAdded).toBe(0);
      expect(diff.summary.edgesRemoved).toBe(0);
      expect(diff.summary.leasesGranted).toBe(0);
      expect(diff.summary.leasesReleased).toBe(0);
      expect(diff.summary.totalChanges).toBe(0);
    });

    it("calculates added nodes, leases, and status changes between step 0 and step 8", () => {
      const { events } = parseEventsJsonl(sampleJsonl);
      const diff: StateDiffResult = diffStates(0, 8, events);

      expect(diff.summary.totalChanges).toBeGreaterThan(0);
      expect(diff.addedNodes.length + diff.modifiedNodes.length).toBeGreaterThan(0);
      expect(diff.propertyChanges.length).toBeGreaterThan(0);

      const statusChanges = diff.propertyChanges.filter((p) => p.field === "status");
      expect(statusChanges.length).toBeGreaterThan(0);
    });
  });

  describe("Playback Controller Navigation & Controls", () => {
    it("handles play, pause, togglePlay, stepForward, and stepBackward", () => {
      const store = useHistoryReplayStore.getState();
      store.loadEventsJsonl(sampleJsonl);

      expect(useHistoryReplayStore.getState().isPlaying).toBe(false);
      useHistoryReplayStore.getState().play();
      expect(useHistoryReplayStore.getState().isPlaying).toBe(true);

      useHistoryReplayStore.getState().pause();
      expect(useHistoryReplayStore.getState().isPlaying).toBe(false);

      useHistoryReplayStore.getState().togglePlay();
      expect(useHistoryReplayStore.getState().isPlaying).toBe(true);

      useHistoryReplayStore.getState().pause();

      // Step navigation
      useHistoryReplayStore.getState().seekToIndex(0);
      useHistoryReplayStore.getState().stepForward();
      expect(useHistoryReplayStore.getState().currentEventIndex).toBe(1);

      useHistoryReplayStore.getState().stepBackward();
      expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);

      // Jump to start / end
      useHistoryReplayStore.getState().jumpToEnd();
      expect(useHistoryReplayStore.getState().currentEventIndex).toBe(9);

      useHistoryReplayStore.getState().jumpToStart();
      expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);
    });

    it("adjusts playback speed and looping", () => {
      useHistoryReplayStore.getState().setSpeed(2);
      expect(useHistoryReplayStore.getState().playbackSpeed).toBe(2);

      useHistoryReplayStore.getState().setSpeed(5);
      expect(useHistoryReplayStore.getState().playbackSpeed).toBe(5);

      expect(useHistoryReplayStore.getState().isLooping).toBe(false);
      useHistoryReplayStore.getState().toggleLoop();
      expect(useHistoryReplayStore.getState().isLooping).toBe(true);
    });

    it("handles looping behavior when stepping forward at end of stream", () => {
      const store = useHistoryReplayStore.getState();
      store.loadEventsJsonl(sampleJsonl);
      useHistoryReplayStore.getState().jumpToEnd();
      useHistoryReplayStore.setState({ isLooping: true });

      useHistoryReplayStore.getState().stepForward();
      expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);
    });
  });
});

describe("HistoryReplay React UI Components", () => {
  let events: ReplayEvent[] = [];

  beforeEach(() => {
    events = parseEventsJsonl(sampleJsonl).events;
    useHistoryReplayStore.setState({
      rawJsonl: sampleJsonl,
      events,
      parseIssues: [],
      currentEventIndex: 0,
      isPlaying: false,
      playbackSpeed: 1,
      isLooping: false,
      bookmarks: extractAutomaticBookmarks(events),
      filterBookmarkCategory: "all",
      searchQuery: "",
      selectedDiffIndices: null,
      isDiffModalOpen: false,
    });
  });

  it("renders TimelineScrubber with track and bookmarks pins", () => {
    silenceWarnings(() => {
      let seekTarget: number | null = null;
      let renderer: ReactTestRenderer | null = null;

      act(() => {
        renderer = create(
          <TimelineScrubber
            events={events}
            currentEventIndex={2}
            bookmarks={extractAutomaticBookmarks(events)}
            onSeek={(idx) => {
              seekTarget = idx;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const track = root.findByProps({ "data-testid": "timeline-scrubber" });
      expect(track).toBeDefined();

      const failurePins = root.findAllByProps({ "data-testid": "timeline-pin-failure" });
      expect(failurePins.length).toBeGreaterThanOrEqual(1);

      // Click pin to seek
      act(() => {
        failurePins[0]!.props.onClick({ stopPropagation: () => {} });
      });
      expect(seekTarget).toBe(6);
    });
  });

  it("renders PlaybackControls and triggers actions on button clicks", () => {
    silenceWarnings(() => {
      let playToggled = false;
      let steppedFwd = false;
      let speedSelected = 1;
      let renderer: ReactTestRenderer | null = null;

      act(() => {
        renderer = create(
          <PlaybackControls
            isPlaying={false}
            playbackSpeed={1}
            isLooping={false}
            currentEventIndex={0}
            totalEvents={events.length}
            onPlayToggle={() => {
              playToggled = true;
            }}
            onStepForward={() => {
              steppedFwd = true;
            }}
            onStepBackward={() => {}}
            onJumpToStart={() => {}}
            onJumpToEnd={() => {}}
            onSpeedChange={(s) => {
              speedSelected = s;
            }}
            onLoopToggle={() => {}}
          />,
        );
      });

      const root = renderer!.root;
      const playBtn = root.findByProps({ "data-testid": "btn-play-toggle" });
      act(() => {
        playBtn.props.onClick();
      });
      expect(playToggled).toBe(true);

      const stepFwdBtn = root.findByProps({ "data-testid": "btn-step-forward" });
      act(() => {
        stepFwdBtn.props.onClick();
      });
      expect(steppedFwd).toBe(true);

      const speedSelect = root.findByProps({ "data-testid": "select-speed" });
      act(() => {
        speedSelect.props.onChange({ target: { value: "2" } });
      });
      expect(speedSelected).toBe(2);
    });
  });

  it("renders BookmarkList with categories, filtering, and custom bookmark creation", () => {
    silenceWarnings(() => {
      let jumpedIndex: number | null = null;
      let addedBookmark = false;
      let renderer: ReactTestRenderer | null = null;

      const bookmarks = extractAutomaticBookmarks(events);

      act(() => {
        renderer = create(
          <BookmarkList
            bookmarks={bookmarks}
            currentEventIndex={0}
            activeFilter="all"
            onJumpToBookmark={(idx) => {
              jumpedIndex = idx;
            }}
            onAddBookmark={(_idx, _label, _note) => {
              addedBookmark = true;
            }}
            onRemoveBookmark={() => {}}
          />,
        );
      });

      const root = renderer!.root;
      const container = root.findByProps({ "data-testid": "bookmark-list" });
      expect(container).toBeDefined();

      // Click on a bookmark item to jump
      const firstBookmarkItem = root.findByProps({
        "data-testid": `bookmark-item-${bookmarks[0]!.id}`,
      });
      act(() => {
        firstBookmarkItem.props.onClick();
      });
      expect(jumpedIndex).toBe(bookmarks[0]!.eventIndex);

      // Open add bookmark form
      const toggleAddBtn = root.findByProps({ "data-testid": "btn-toggle-add-bookmark" });
      act(() => {
        toggleAddBtn.props.onClick();
      });

      const labelInput = root.findByProps({ "data-testid": "input-bookmark-label" });
      act(() => {
        labelInput.props.onChange({ target: { value: "My Checkpoint" } });
      });

      const saveForm = root.findByProps({ "data-testid": "add-bookmark-form" });
      act(() => {
        saveForm.props.onSubmit({ preventDefault: () => {} });
      });
      expect(addedBookmark).toBe(true);
    });
  });

  it("renders StateDiffModal and displays comparison between states", () => {
    silenceWarnings(() => {
      let closed = false;
      let jumpedIdx: number | null = null;
      let renderer: ReactTestRenderer | null = null;

      act(() => {
        renderer = create(
          <StateDiffModal
            isOpen={true}
            events={events}
            initialIndexA={0}
            initialIndexB={8}
            onClose={() => {
              closed = true;
            }}
            onJumpToEvent={(idx) => {
              jumpedIdx = idx;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const modal = root.findByProps({ "data-testid": "state-diff-modal" });
      expect(modal).toBeDefined();

      const nodesAddedBadge = root.findByProps({ "data-testid": "diff-badge-nodes-added" });
      expect(nodesAddedBadge).toBeDefined();

      // Switch to edges tab
      const edgesTab = root.findByProps({ "data-testid": "diff-tab-edges" });
      act(() => {
        edgesTab.props.onClick();
      });

      // Switch to leases tab
      const leasesTab = root.findByProps({ "data-testid": "diff-tab-leases" });
      act(() => {
        leasesTab.props.onClick();
      });

      // Switch to properties tab
      const propsTab = root.findByProps({ "data-testid": "diff-tab-properties" });
      act(() => {
        propsTab.props.onClick();
      });

      // Change selector A
      const selectA = root.findByProps({ "data-testid": "select-diff-a" });
      act(() => {
        selectA.props.onChange({ target: { value: "1" } });
      });

      // Change selector B
      const selectB = root.findByProps({ "data-testid": "select-diff-b" });
      act(() => {
        selectB.props.onChange({ target: { value: "5" } });
      });

      // Click compare with previous
      const comparePrevBtn = root.findByProps({ "data-testid": "btn-compare-prev" });
      act(() => {
        comparePrevBtn.props.onClick();
      });

      // Jump to target state
      const jumpTargetBtn = root.findByProps({ "data-testid": "btn-jump-to-target-state" });
      act(() => {
        jumpTargetBtn.props.onClick();
      });
      expect(jumpedIdx).toBe(5);

      // Close modal
      const closeBtn = root.findByProps({ "data-testid": "btn-close-diff-modal" });
      act(() => {
        closeBtn.props.onClick();
      });
      expect(closed).toBe(true);
    });
  });

  it("renders full HistoryReplay HUD integration and reacts to seek & state changes", () => {
    silenceWarnings(() => {
      let lastSnapshot: ReplayStateSnapshot | null = null;
      let lastSeekEvent: ReplayEvent | null = null;
      let renderer: ReactTestRenderer | null = null;

      act(() => {
        renderer = create(
          <HistoryReplay
            initialEventsJsonl={sampleJsonl}
            onStateSnapshotChange={(snap) => {
              lastSnapshot = snap;
            }}
            onEventSeek={(_idx, ev) => {
              lastSeekEvent = ev;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const hud = root.findByProps({ "data-testid": "history-replay-hud" });
      expect(hud).toBeDefined();

      const totalNodesStat = root.findByProps({ "data-testid": "stat-total-nodes" });
      expect(totalNodesStat).toBeDefined();

      expect(lastSnapshot).toBeDefined();
      expect(lastSnapshot!.eventIndex).toBe(0);
      expect(lastSeekEvent).toBeDefined();

      // Open diff modal via header button
      const headerDiffBtn = root.findByProps({ "data-testid": "btn-header-diff" });
      act(() => {
        headerDiffBtn.props.onClick();
      });
      expect(useHistoryReplayStore.getState().isDiffModalOpen).toBe(true);

      // Close diff modal
      act(() => {
        useHistoryReplayStore.getState().closeDiffModal();
      });
      expect(useHistoryReplayStore.getState().isDiffModalOpen).toBe(false);

      act(() => {
        renderer!.unmount();
      });
    });
  });

  it("handles store helper methods getCurrentSnapshot and getDiff", () => {
    silenceWarnings(() => {
      const store = useHistoryReplayStore.getState();
      act(() => {
        store.loadEventsJsonl(sampleJsonl);
      });

      const snap = store.getCurrentSnapshot();
      expect(snap.eventIndex).toBe(0);
      expect(snap.event.sequence).toBe(1);

      const diff = store.getDiff(0, 5);
      expect(diff.indexA).toBe(0);
      expect(diff.indexB).toBe(5);
      expect(diff.summary.totalChanges).toBeGreaterThan(0);
    });
  });
});

describe("Adversarial Stress Tests & Edge Cases", () => {
  it("recovers from severe JSONL corruption (unterminated strings, unclosed braces, primitives, binary garbage)", () => {
    const chaoticJsonl = `
{"sequence": 1, "kind": "init", "actor": "system", "payload": {}}
{INVALID_BINARY_GARBAGE_\x00\x01\x02
42
"just a string literal"
true
null
{"sequence": 2, "kind": "plan-task-added", "actor": "coord", "payload": {"task_id": "t1", "label": "T1"}}
{"unclosed_object": {"nested": "data"
{"sequence": 3, "kind": "task-claimed", "actor": "agent-1", "payload": {"task_id": "t1"}}
[1, 2, 3]
{"sequence": 4, "kind": "done", "actor": "system", "payload": {}}
    `.trim();

    const result = parseEventsJsonl(chaoticJsonl);
    expect(result.totalParsed).toBe(4);
    expect(result.totalErrors).toBeGreaterThanOrEqual(3);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
    expect(result.events[0]!.sequence).toBe(1);
    expect(result.events[1]!.sequence).toBe(2);
    expect(result.events[2]!.sequence).toBe(3);
    expect(result.events[3]!.sequence).toBe(4);
  });

  it("handles deleted nodes and removed edges in state snapshots and state diffs", () => {
    const lifecycleJsonl = `
{"sequence": 1, "kind": "plan-task-added", "actor": "coord", "payload": {"task_id": "node-to-delete", "label": "Temporary Node"}}
{"sequence": 2, "kind": "plan-task-added", "actor": "coord", "payload": {"task_id": "permanent-node", "label": "Permanent Node"}}
{"sequence": 3, "kind": "plan-compiled", "actor": "coord", "projection": {"graph": {"nodes": [{"id": "node-to-delete", "label": "Temporary Node"}, {"id": "permanent-node", "label": "Permanent Node"}], "edges": [{"source": "node-to-delete", "target": "permanent-node", "type": "dependency"}]}}}
{"sequence": 4, "kind": "node-removed", "actor": "coord", "payload": {"task_id": "node-to-delete"}}
{"sequence": 5, "kind": "task-finished", "actor": "agent-1", "payload": {"task_id": "permanent-node"}}
    `.trim();

    const { events } = parseEventsJsonl(lifecycleJsonl);
    expect(events.length).toBe(5);

    // Snapshot at step 2 (both nodes and edge present)
    const snap2 = getStateAtEvent(2, events);
    expect(snap2.dataset.nodes.some((n) => n.id === "node-to-delete")).toBe(true);
    expect(snap2.dataset.nodes.some((n) => n.id === "permanent-node")).toBe(true);
    expect(snap2.dataset.edges.length).toBe(1);

    // Snapshot at step 3 (node-to-delete removed)
    const snap3 = getStateAtEvent(3, events);
    expect(snap3.dataset.nodes.some((n) => n.id === "node-to-delete")).toBe(false);
    expect(snap3.dataset.nodes.some((n) => n.id === "permanent-node")).toBe(true);
    expect(snap3.dataset.edges.length).toBe(0); // Connected edges automatically pruned

    // State diff between step 2 and step 3
    const diff = diffStates(2, 3, events);
    expect(diff.removedNodes.some((n) => n.id === "node-to-delete")).toBe(true);
    expect(diff.removedEdges.length).toBe(1);
    expect(diff.summary.nodesRemoved).toBe(1);
    expect(diff.summary.edgesRemoved).toBe(1);
  });

  it("handles extreme seeking boundaries and empty event streams robustly", () => {
    const store = useHistoryReplayStore.getState();

    // 1. Empty stream behavior
    store.loadEventsJsonl("");
    expect(useHistoryReplayStore.getState().events.length).toBe(0);
    expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);

    useHistoryReplayStore.getState().seekToIndex(50);
    expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);

    useHistoryReplayStore.getState().seekToIndex(-50);
    expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);

    useHistoryReplayStore.getState().stepForward();
    expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);

    useHistoryReplayStore.getState().stepBackward();
    expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);

    useHistoryReplayStore.getState().jumpToNextFailure();
    expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);

    useHistoryReplayStore.getState().jumpToNextCritic();
    expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);

    // 2. Clamping on loaded events
    store.loadEventsJsonl(sampleJsonl);
    const total = useHistoryReplayStore.getState().events.length;

    useHistoryReplayStore.getState().seekToIndex(-100);
    expect(useHistoryReplayStore.getState().currentEventIndex).toBe(0);

    useHistoryReplayStore.getState().seekToIndex(999999);
    expect(useHistoryReplayStore.getState().currentEventIndex).toBe(total - 1);
  });
});
