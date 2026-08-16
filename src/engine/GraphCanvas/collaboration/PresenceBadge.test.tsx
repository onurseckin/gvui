import { describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PresenceBadge } from "./PresenceBadge";
import type { AgentPresence } from "./types";

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

describe("PresenceBadge Component", () => {
  const mockPresence: AgentPresence = {
    id: "orch-01",
    name: "Orchestrator Agent",
    role: "orchestrator",
    color: "#a855f7",
    cursor: null,
    viewport: null,
    selection: [],
    activeTaskId: "task-01",
    activityState: "active",
    lastHeartbeat: Date.now(),
  };

  it("renders badge with initials, role pill, and active task", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<PresenceBadge presence={mockPresence} />);
      });

      const root = renderer!.root;
      const badge = root.findByProps({ "data-testid": "presence-badge-orch-01" });
      expect(badge).toBeDefined();

      const initials = root.findByProps({ className: "gvui-presence-initials" });
      expect(initials.props.children).toBe("OA");

      const rolePill = root.findByProps({ className: "gvui-presence-role-pill" });
      expect(rolePill.props.children).toBe("orchestrator");

      const taskText = root.findByProps({ className: "gvui-presence-task-subtext" });
      expect(taskText.props.children).toEqual(["Task: ", "task-01"]);
    });
  });

  it("renders status dot corresponding to activity state", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <PresenceBadge
            presence={{
              ...mockPresence,
              activityState: "idle",
            }}
          />,
        );
      });

      const root = renderer!.root;
      const dot = root.findByProps({ "data-testid": "presence-status-dot" });
      expect(dot.props.className).toContain("gvui-presence-status-dot--idle");
    });
  });

  it("renders avatar image when avatarUrl is provided", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <PresenceBadge
            presence={{
              ...mockPresence,
              avatarUrl: "https://example.com/avatar.png",
            }}
          />,
        );
      });

      const root = renderer!.root;
      const img = root.findByProps({ className: "gvui-presence-avatar-img" });
      expect(img.props.src).toBe("https://example.com/avatar.png");
    });
  });

  it("handles follow toggle button clicks", () => {
    silenceWarnings(() => {
      let followedAgentId: string | null = null;
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <PresenceBadge
            presence={mockPresence}
            onFollowToggle={(id) => {
              followedAgentId = id;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const followBtn = root.findByProps({ "data-testid": "follow-btn-orch-01" });
      expect(followBtn.props.children).toBe("👁️ Follow");

      act(() => {
        followBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(followedAgentId).toBe("orch-01");
    });
  });

  it("handles overall badge click", () => {
    silenceWarnings(() => {
      let clickedPresence: AgentPresence | null = null;
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <PresenceBadge
            presence={mockPresence}
            onClick={(p) => {
              clickedPresence = p;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const badge = root.findByProps({ "data-testid": "presence-badge-orch-01" });
      act(() => {
        badge.props.onClick({ stopPropagation: () => {} });
      });
      expect(clickedPresence).toBe(mockPresence);
    });
  });
});
