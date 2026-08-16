import { beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { INITIAL_PRESENCE_STATE, usePresenceStore } from "../../../store/usePresenceStore";
import { CollaborationOverlay } from "./CollaborationOverlay";
import type { NodeBoundingBox } from "./types";

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

describe("CollaborationOverlay Component", () => {
  const mockNodes: NodeBoundingBox[] = [
    { id: "node-1", x: 100, y: 100, width: 160, height: 80 },
    { id: "node-2", x: 400, y: 100, width: 160, height: 80 },
  ];

  beforeEach(() => {
    usePresenceStore.setState({
      ...INITIAL_PRESENCE_STATE,
      selfAgentId: "self-agent",
      presences: {
        "agent-remote": {
          id: "agent-remote",
          name: "Remote Worker",
          role: "implementer",
          color: "#38bdf8",
          cursor: {
            x: 120,
            y: 130,
            lastUpdated: Date.now(),
            targetNodeId: "node-1",
          },
          viewport: {
            x: 50,
            y: 50,
            width: 600,
            height: 400,
            zoom: 1,
          },
          selection: ["node-1"],
          activityState: "active",
          lastHeartbeat: Date.now(),
        },
      },
      selectionLocks: {
        "node-2": {
          id: "node-2",
          targetType: "node",
          targetId: "node-2",
          agentId: "agent-remote",
          agentName: "Remote Worker",
          role: "implementer",
          color: "#38bdf8",
          acquiredAt: Date.now(),
          expiresAt: Date.now() + 10000,
        },
      },
    });
  });

  it("renders overlay containing frustums, selection rings, lock badges, cursors, and HUD", () => {
    silenceWarnings(() => {
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaborationOverlay nodes={mockNodes} />);
      });

      const root = renderer!.root;

      // 1. Frustums Layer
      const frustum = root.findByProps({ "data-testid": "frustum-agent-remote" });
      expect(frustum).toBeDefined();
      expect(frustum.props.style.width).toBe("600px");

      // 2. Selection Rings Layer
      const ring = root.findByProps({
        "data-testid": "selection-ring-agent-remote-node-1",
      });
      expect(ring).toBeDefined();

      // 3. Lock Badges Layer
      const lockBadge = root.findByProps({ "data-testid": "node-lock-badge-node-2" });
      expect(lockBadge).toBeDefined();

      // 4. Cursors Layer
      const cursor = root.findByProps({ "data-testid": "cursor-agent-remote" });
      expect(cursor).toBeDefined();

      // 5. Collaborator HUD
      const hud = root.findByProps({ "data-testid": "collaborator-hud" });
      expect(hud).toBeDefined();
    });
  });

  it("triggers onNodeFocus when a cursor targeting a node is clicked", () => {
    silenceWarnings(() => {
      let focusedNodeId: string | null = null;
      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          <CollaborationOverlay
            nodes={mockNodes}
            onNodeFocus={(id) => {
              focusedNodeId = id;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const cursor = root.findByProps({ "data-testid": "cursor-agent-remote" });
      act(() => {
        cursor.props.onClick({ stopPropagation: () => {} });
      });

      expect(focusedNodeId).toBe("node-1");
    });
  });

  it("triggers onFollowChange when followedAgentId changes", () => {
    silenceWarnings(() => {
      let followedId: string | null = null;
      act(() => {
        create(
          <CollaborationOverlay
            nodes={mockNodes}
            onFollowChange={(id) => {
              followedId = id;
            }}
          />,
        );
      });

      act(() => {
        usePresenceStore.getState().setFollowedAgentId("agent-remote");
      });

      expect(followedId).toBe("agent-remote");
    });
  });

  it("hides layers when store toggle flags are disabled", () => {
    silenceWarnings(() => {
      usePresenceStore.setState({
        showCursors: false,
        showFrustums: false,
        showSelectionRings: false,
        showLockBadges: false,
      });

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(<CollaborationOverlay nodes={mockNodes} />);
      });

      const root = renderer!.root;
      expect(root.findAllByProps({ "data-testid": "frustums-layer" }).length).toBe(0);
      expect(root.findAllByProps({ "data-testid": "selection-rings-layer" }).length).toBe(0);
      expect(root.findAllByProps({ "data-testid": "lock-badges-layer" }).length).toBe(0);
      expect(root.findAllByProps({ "data-testid": "cursors-layer" }).length).toBe(0);
    });
  });

  it("scales frustums and badges properly under extreme canvas zoom levels (0.05 and 5.0)", () => {
    silenceWarnings(() => {
      let rendererZoomOut: ReactTestRenderer | null = null;
      act(() => {
        rendererZoomOut = create(
          <CollaborationOverlay
            nodes={mockNodes}
            zoomLevel={0.05}
            panOffset={{ x: 100, y: 200 }}
          />,
        );
      });

      const rootOut = rendererZoomOut!.root;
      const overlayOut = rootOut.findByProps({ "data-testid": "collaboration-overlay" });
      expect(overlayOut.props["data-zoom-level"]).toBe(0.05);

      const frustumOut = rootOut.findByProps({ "data-testid": "frustum-agent-remote" });
      expect(frustumOut).toBeDefined();
      expect(frustumOut.props.style.width).toBe("600px");

      let rendererZoomIn: ReactTestRenderer | null = null;
      act(() => {
        rendererZoomIn = create(
          <CollaborationOverlay
            nodes={mockNodes}
            zoomLevel={5.0}
            panOffset={{ x: -50, y: -100 }}
          />,
        );
      });

      const rootIn = rendererZoomIn!.root;
      const overlayIn = rootIn.findByProps({ "data-testid": "collaboration-overlay" });
      expect(overlayIn.props["data-zoom-level"]).toBe(5.0);
    });
  });
});
