import { describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { CursorItem } from "./CursorItem";
import type { AgentPresence, CursorTrailPoint } from "./types";

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

describe("CursorItem Component", () => {
  const basePresence: AgentPresence = {
    id: "agent-1",
    name: "Agent Alice",
    role: "implementer",
    color: "#38bdf8",
    cursor: {
      x: 150,
      y: 250,
      lastUpdated: Date.now(),
      isPointerDown: false,
      targetNodeId: "node-101",
    },
    viewport: null,
    selection: [],
    activityState: "active",
    lastHeartbeat: Date.now(),
  };

  it("renders cursor with position, name tag, and target indicator", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CursorItem presence={basePresence} />);
      });

      const root = renderer!.root;
      const wrapper = root.findByProps({ "data-testid": "cursor-agent-1" });
      expect(wrapper).toBeDefined();
      expect(wrapper.props.style.transform).toBe("translate3d(150px, 250px, 0)");

      const nameEl = root.findByProps({ className: "gvui-cursor-name" });
      expect(nameEl.props.children).toBe("Agent Alice");

      const roleEl = root.findByProps({ className: "gvui-cursor-role" });
      expect(roleEl.props.children).toEqual(["[", "implementer", "]"]);

      const targetEl = root.findByProps({ className: "gvui-cursor-target" });
      expect(targetEl.props.children).toEqual(["🎯 ", "node-101"]);
    });
  });

  it("renders click ripple effect when isPointerDown is true", () => {
    silenceWarnings(() => {
      const clickingPresence: AgentPresence = {
        ...basePresence,
        cursor: {
          ...basePresence.cursor!,
          isPointerDown: true,
        },
      };

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CursorItem presence={clickingPresence} />);
      });

      const root = renderer!.root;
      const ripple = root.findByProps({ "data-testid": "cursor-click-ripple" });
      expect(ripple).toBeDefined();
      expect(ripple.props.style.borderColor).toBe("#38bdf8");
    });
  });

  it("renders motion trail polyline when showTrail is true and trailPoints are provided", () => {
    silenceWarnings(() => {
      const trails: CursorTrailPoint[] = [
        { x: 100, y: 200, timestamp: Date.now() - 50 },
        { x: 150, y: 250, timestamp: Date.now() },
      ];

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <CursorItem presence={basePresence} trailPoints={trails} showTrail={true} />,
        );
      });

      const root = renderer!.root;
      const polyline = root.findByType("polyline");
      expect(polyline).toBeDefined();
      expect(polyline.props.points).toBe("100,200 150,250");
    });
  });

  it("triggers onClick callback with agentId", () => {
    silenceWarnings(() => {
      let clickedId: string | null = null;
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <CursorItem
            presence={basePresence}
            onClick={(id) => {
              clickedId = id;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const wrapper = root.findByProps({ "data-testid": "cursor-agent-1" });
      act(() => {
        wrapper.props.onClick({ stopPropagation: () => {} });
      });

      expect(clickedId).toBe("agent-1");
    });
  });

  it("returns null when cursor is null or disconnected", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <CursorItem
            presence={{
              ...basePresence,
              cursor: null,
            }}
          />,
        );
      });
      expect(renderer!.toJSON()).toBeNull();

      act(() => {
        renderer = create(
          <CursorItem
            presence={{
              ...basePresence,
              activityState: "disconnected",
            }}
          />,
        );
      });
      expect(renderer!.toJSON()).toBeNull();
    });
  });
});
