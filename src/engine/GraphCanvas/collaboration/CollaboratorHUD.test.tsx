import { beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { INITIAL_PRESENCE_STATE, usePresenceStore } from "../../../store/usePresenceStore";
import { CollaboratorHUD } from "./CollaboratorHUD";

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

describe("CollaboratorHUD Component", () => {
  beforeEach(() => {
    usePresenceStore.setState({
      ...INITIAL_PRESENCE_STATE,
      presences: {
        "orch-1": {
          id: "orch-1",
          name: "Orchestrator One",
          role: "orchestrator",
          color: "#a855f7",
          cursor: null,
          viewport: null,
          selection: [],
          activityState: "active",
          lastHeartbeat: Date.now(),
        },
        "impl-1": {
          id: "impl-1",
          name: "Implementer One",
          role: "implementer",
          color: "#38bdf8",
          cursor: null,
          viewport: null,
          selection: [],
          activityState: "active",
          lastHeartbeat: Date.now(),
        },
      },
      selectionLocks: {
        "node-1": {
          id: "node-1",
          targetType: "node",
          targetId: "node-1",
          agentId: "orch-1",
          agentName: "Orchestrator One",
          role: "orchestrator",
          color: "#a855f7",
          acquiredAt: Date.now(),
          expiresAt: Date.now() + 15000,
        },
      },
      conflicts: [
        {
          id: "c-1",
          type: "lock_collision",
          involvedAgentIds: ["orch-1", "impl-1"],
          severity: "high",
          message: "Conflict warning",
          timestamp: Date.now(),
        },
      ],
    });
  });

  it("renders header, collaborator count, and conflict pill", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaboratorHUD />);
      });

      const root = renderer!.root;
      const countBadge = root.findByProps({ "data-testid": "collaborator-count" });
      expect(countBadge.props.children).toBe(2);

      const conflictPill = root.findByProps({ "data-testid": "conflict-pill" });
      expect(conflictPill.props.children).toEqual(["⚠️ ", 1]);
    });
  });

  it("toggles collapse and expand state", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaboratorHUD />);
      });

      const root = renderer!.root;
      const collapseBtn = root.findByProps({ "data-testid": "hud-collapse-btn" });
      expect(collapseBtn.props.children).toBe("▼");

      act(() => {
        collapseBtn.props.onClick();
      });

      const hudWrapper = root.findByProps({ "data-testid": "collaborator-hud" });
      expect(hudWrapper.props.className).toContain("is-collapsed");

      act(() => {
        collapseBtn.props.onClick();
      });
      expect(hudWrapper.props.className).not.toContain("is-collapsed");
    });
  });

  it("filters agent list by search input", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaboratorHUD />);
      });

      const root = renderer!.root;
      const searchInput = root.findByProps({ "data-testid": "collab-search-input" });

      act(() => {
        searchInput.props.onChange({ target: { value: "Implementer" } });
      });

      const agentList = root.findByProps({ "data-testid": "agent-list" });
      expect(agentList.props.children.length).toBe(1);
      expect(agentList.props.children[0].props.presence.name).toBe("Implementer One");
    });
  });

  it("filters agent list by role chips", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaboratorHUD />);
      });

      const root = renderer!.root;
      const roleChip = root.findByProps({ "data-testid": "role-filter-orchestrator" });

      act(() => {
        roleChip.props.onClick();
      });

      const agentList = root.findByProps({ "data-testid": "agent-list" });
      expect(agentList.props.children.length).toBe(1);
      expect(agentList.props.children[0].props.presence.role).toBe("orchestrator");
    });
  });

  it("switches tabs and displays locks list with release button", () => {
    silenceWarnings(() => {
      usePresenceStore.setState({ selfAgentId: "orch-1" });

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaboratorHUD />);
      });

      const root = renderer!.root;
      const locksTabBtn = root.findByProps({ "data-testid": "tab-locks" });

      act(() => {
        locksTabBtn.props.onClick();
      });

      const lockCard = root.findByProps({ "data-testid": "lock-card-node-1" });
      expect(lockCard).toBeDefined();

      const releaseBtn = root.findByProps({ "data-testid": "release-lock-node-1" });
      act(() => {
        releaseBtn.props.onClick();
      });

      expect(usePresenceStore.getState().selectionLocks["node-1"]).toBeUndefined();
    });
  });

  it("switches to settings tab and toggles layer checkboxes", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaboratorHUD />);
      });

      const root = renderer!.root;
      const settingsTabBtn = root.findByProps({ "data-testid": "tab-settings" });

      act(() => {
        settingsTabBtn.props.onClick();
      });

      const toggleCursors = root.findByProps({ "data-testid": "toggle-cursors" });
      expect(toggleCursors.props.checked).toBe(true);

      act(() => {
        toggleCursors.props.onChange();
      });
      expect(usePresenceStore.getState().showCursors).toBe(false);
    });
  });

  it("renders following banner and unfollow button when following an agent", () => {
    silenceWarnings(() => {
      usePresenceStore.setState({ followedAgentId: "orch-1" });

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaboratorHUD />);
      });

      const root = renderer!.root;
      const banner = root.findByProps({ "data-testid": "following-banner" });
      expect(banner).toBeDefined();

      const unfollowBtn = root.findByProps({ "data-testid": "unfollow-btn" });
      act(() => {
        unfollowBtn.props.onClick();
      });

      expect(usePresenceStore.getState().followedAgentId).toBeNull();
    });
  });
});
