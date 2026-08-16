import { beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  CommandAstViewer,
  CommandSandbox,
  createFailedExecutionTrace,
  DiffInspector,
  MockSandboxPanel,
  PlaybackControls,
  ReplayTimeline,
  TerminalDisplay,
  TimingBreakdownView,
  useCommandSandboxStore,
} from "./index";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceRendererWarnings<T>(fn: () => T): T {
  const origError = console.error;
  const origWarn = console.warn;
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
  console.warn = (msg?: unknown, ...args: unknown[]) => {
    if (typeof msg === "string" && msg.includes("react-test-renderer")) {
      return;
    }
    origWarn(msg, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = origError;
    console.warn = origWarn;
  }
}

describe("CommandSandbox React UI Components & Integration Tests", () => {
  beforeEach(() => {
    act(() => {
      useCommandSandboxStore.getState().reset();
    });
  });

  describe("CommandSandbox Root Component", () => {
    it("renders initial workbench with navigation tabs and header", () => {
      let renderer: ReactTestRenderer | undefined;
      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(<CommandSandbox />);
        });
      });

      expect(renderer).toBeDefined();
      const tree = renderer!.toJSON();
      expect(tree).toBeDefined();

      const root = renderer!.root;
      const title = root.findByProps({ className: "workbench-title" });
      expect(title.children).toContain("Command Replay & Sandbox Debugger");

      // Verify all 5 navigation tabs exist
      const tabs = root.findAllByProps({ role: "tab" });
      expect(tabs.length).toBe(5);
    });

    it("switches tabs smoothly when clicked", () => {
      let renderer: ReactTestRenderer | undefined;
      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(<CommandSandbox />);
        });
      });

      const root = renderer!.root;
      const tabs = root.findAllByProps({ role: "tab" });

      // Click on Output Diff tab (index 1)
      silenceRendererWarnings(() => {
        act(() => {
          tabs[1]?.props.onClick();
        });
      });
      expect(useCommandSandboxStore.getState().activeTab).toBe("diff");

      // Click on Mock Sandbox tab (index 2)
      silenceRendererWarnings(() => {
        act(() => {
          tabs[2]?.props.onClick();
        });
      });
      expect(useCommandSandboxStore.getState().activeTab).toBe("sandbox");

      // Click on Timing Breakdown tab (index 3)
      silenceRendererWarnings(() => {
        act(() => {
          tabs[3]?.props.onClick();
        });
      });
      expect(useCommandSandboxStore.getState().activeTab).toBe("timing");

      // Click on Command AST tab (index 4)
      silenceRendererWarnings(() => {
        act(() => {
          tabs[4]?.props.onClick();
        });
      });
      expect(useCommandSandboxStore.getState().activeTab).toBe("ast");
    });

    it("loads sample trace presets from header buttons", () => {
      let renderer: ReactTestRenderer | undefined;
      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(<CommandSandbox />);
        });
      });

      const root = renderer!.root;
      const presetBtns = root.findAllByProps({ className: "preset-btn" });
      expect(presetBtns.length).toBe(2);

      // Load failed run preset
      silenceRendererWarnings(() => {
        act(() => {
          presetBtns[1]?.props.onClick();
        });
      });

      const state = useCommandSandboxStore.getState();
      expect(state.recordedTrace?.id).toBe("trace-failed-02");
      expect(state.recordedTrace?.exitCode).toBe(1);
    });
  });

  describe("TerminalDisplay Component", () => {
    it("renders ANSI formatted lines with stream indicators and line numbers", () => {
      const sampleLines = [
        {
          lineNumber: 1,
          spans: [{ text: "Success output", style: { color: "#10b981", bold: true } }],
          rawText: "\x1b[1;32mSuccess output\x1b[0m",
          plainText: "Success output",
          stream: "stdout" as const,
        },
        {
          lineNumber: 2,
          spans: [{ text: "Error log", style: { color: "#ef4444" } }],
          rawText: "\x1b[31mError log\x1b[0m",
          plainText: "Error log",
          stream: "stderr" as const,
        },
      ];

      let renderer: ReactTestRenderer | undefined;
      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(<TerminalDisplay lines={sampleLines} searchQuery="" />);
        });
      });

      const root = renderer!.root;
      const lines = root.findAllByProps({ className: "terminal-line stream-stdout" });
      expect(lines.length).toBe(1);

      const errLines = root.findAllByProps({ className: "terminal-line stream-stderr" });
      expect(errLines.length).toBe(1);
    });

    it("highlights matching search query in spans", () => {
      const sampleLines = [
        {
          lineNumber: 1,
          spans: [{ text: "Hello Search Query World", style: {} }],
          rawText: "Hello Search Query World",
          plainText: "Hello Search Query World",
          stream: "stdout" as const,
        },
      ];

      let renderer: ReactTestRenderer | undefined;
      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(<TerminalDisplay lines={sampleLines} searchQuery="Search" />);
        });
      });

      const root = renderer!.root;
      const highlight = root.findByProps({ className: "terminal-search-highlight" });
      expect(highlight.children).toContain("Search");
    });
  });

  describe("ReplayTimeline & PlaybackControls Components", () => {
    it("renders timeline track, markers, and updates time on seek", () => {
      let seekedTime = -1;
      let renderer: ReactTestRenderer | undefined;

      const events = [
        { id: "e1", timestampMs: 0, type: "spawn" as const, data: "spawn" },
        { id: "e2", timestampMs: 150, type: "stdout_chunk" as const, data: "out\n" },
        { id: "e3", timestampMs: 300, type: "exit" as const, data: "exit" },
      ];

      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(
            <ReplayTimeline
              currentTimeMs={150}
              totalDurationMs={300}
              events={events}
              onSeek={(t) => {
                seekedTime = t;
              }}
            />,
          );
        });
      });

      const root = renderer!.root;
      const slider = root.findByProps({ className: "replay-timeline-slider" });
      silenceRendererWarnings(() => {
        act(() => {
          slider.props.onChange({ target: { value: "220" } });
        });
      });

      expect(seekedTime).toBe(220);
    });

    it("executes playback actions (play, pause, step forward/backward, speed change)", () => {
      let playTriggered = false;
      let stepFwdTriggered = false;
      let speedChangedTo = 0;

      let renderer: ReactTestRenderer | undefined;
      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(
            <PlaybackControls
              isPlaying={false}
              playbackSpeed={1}
              completedEventsCount={3}
              totalEventsCount={10}
              isFinished={false}
              onPlay={() => {
                playTriggered = true;
              }}
              onPause={() => {}}
              onStepForward={() => {
                stepFwdTriggered = true;
              }}
              onStepBackward={() => {}}
              onJumpToStart={() => {}}
              onJumpToEnd={() => {}}
              onSpeedChange={(s) => {
                speedChangedTo = s;
              }}
            />,
          );
        });
      });

      const root = renderer!.root;
      const playBtn = root.findByProps({ className: "control-btn play-pause-btn " });
      silenceRendererWarnings(() => {
        act(() => {
          playBtn.props.onClick();
        });
      });
      expect(playTriggered).toBe(true);

      const fwdBtn = root.findByProps({ "aria-label": "Step forward" });
      silenceRendererWarnings(() => {
        act(() => {
          fwdBtn.props.onClick();
        });
      });
      expect(stepFwdTriggered).toBe(true);

      const speedBtn = root.findByProps({ "aria-label": "Set speed to 2x" });
      silenceRendererWarnings(() => {
        act(() => {
          speedBtn.props.onClick();
        });
      });
      expect(speedChangedTo).toBe(2);
    });
  });

  describe("DiffInspector Component", () => {
    it("renders side-by-side split diff and unified diff modes", () => {
      act(() => {
        useCommandSandboxStore.getState().loadTrace(createFailedExecutionTrace());
        useCommandSandboxStore.getState().setTab("diff");
      });

      let renderer: ReactTestRenderer | undefined;
      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(<DiffInspector />);
        });
      });

      const root = renderer!.root;
      expect(root.findByProps({ "data-testid": "split-diff-view" })).toBeDefined();

      // Switch to unified view
      silenceRendererWarnings(() => {
        act(() => {
          useCommandSandboxStore.getState().setDiffViewMode("unified");
        });
      });

      expect(root.findByProps({ "data-testid": "unified-diff-view" })).toBeDefined();
    });
  });

  describe("MockSandboxPanel Component", () => {
    it("allows editing commands, adding env overrides, and running simulated reruns", () => {
      act(() => {
        useCommandSandboxStore.getState().setTab("sandbox");
      });

      let renderer: ReactTestRenderer | undefined;
      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(<MockSandboxPanel />);
        });
      });

      const root = renderer!.root;
      const cmdInput = root.findByProps({ "aria-label": "Sandbox shell command" });
      silenceRendererWarnings(() => {
        act(() => {
          cmdInput.props.onChange({ target: { value: "echo 'custom sandbox test'" } });
        });
      });

      expect(useCommandSandboxStore.getState().sandboxCommand).toBe("echo 'custom sandbox test'");

      // Add environment override
      silenceRendererWarnings(() => {
        act(() => {
          useCommandSandboxStore.getState().setSandboxEnvOverride("TEST_MODE", "enabled");
        });
      });
      expect(useCommandSandboxStore.getState().sandboxEnvOverrides.TEST_MODE).toBe("enabled");

      // Click Rerun button
      const rerunBtn = root.findByProps({ className: "rerun-btn" });
      silenceRendererWarnings(() => {
        act(() => {
          rerunBtn.props.onClick();
        });
      });

      const runResult = useCommandSandboxStore.getState().sandboxRunResult;
      expect(runResult).toBeDefined();
      expect(runResult?.stdout).toContain("custom sandbox test");
      expect(runResult?.exitCode).toBe(0);
    });
  });

  describe("TimingBreakdownView Component", () => {
    it("renders timing metric cards and waterfall events", () => {
      act(() => {
        useCommandSandboxStore.getState().setTab("timing");
      });

      let renderer: ReactTestRenderer | undefined;
      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(<TimingBreakdownView />);
        });
      });

      const root = renderer!.root;
      const metricsGrid = root.findByProps({ className: "timing-metrics-grid" });
      expect(metricsGrid).toBeDefined();

      const waterfall = root.findByProps({ className: "waterfall-bars" });
      expect(waterfall).toBeDefined();
    });
  });

  describe("CommandAstViewer Component", () => {
    it("renders AST stages and visual breakdown", () => {
      act(() => {
        useCommandSandboxStore.getState().setTab("ast");
      });

      let renderer: ReactTestRenderer | undefined;
      silenceRendererWarnings(() => {
        act(() => {
          renderer = create(<CommandAstViewer />);
        });
      });

      const root = renderer!.root;
      const stagesList = root.findByProps({ className: "ast-stages-list" });
      expect(stagesList).toBeDefined();

      // Toggle to JSON view
      const rawJsonBtn = root.findByProps({ className: "ast-toggle-btn " });
      silenceRendererWarnings(() => {
        act(() => {
          rawJsonBtn.props.onClick();
        });
      });

      const rawJsonPre = root.findByProps({ className: "ast-raw-json" });
      expect(rawJsonPre).toBeDefined();
    });
  });

  describe("useCommandSandboxStore State Actions", () => {
    it("steps forward and backward through recorded events", () => {
      const store = useCommandSandboxStore.getState();
      act(() => {
        store.jumpToStart();
      });
      expect(useCommandSandboxStore.getState().replayState.currentTimeMs).toBe(0);

      act(() => {
        store.stepForward();
      });
      expect(useCommandSandboxStore.getState().replayState.currentTimeMs).toBeGreaterThan(0);

      const advancedTime = useCommandSandboxStore.getState().replayState.currentTimeMs;
      act(() => {
        store.stepBackward();
      });
      expect(useCommandSandboxStore.getState().replayState.currentTimeMs).toBeLessThanOrEqual(
        advancedTime,
      );

      act(() => {
        store.jumpToEnd();
      });
      expect(useCommandSandboxStore.getState().replayState.isFinished).toBe(true);
    });

    it("updates and deletes virtual files in mock config", () => {
      const store = useCommandSandboxStore.getState();
      act(() => {
        store.updateVirtualFile("/workspace/config.json", '{"key": "value"}');
      });
      expect(
        useCommandSandboxStore.getState().mockConfig.vfs["/workspace/config.json"],
      ).toBeDefined();
      expect(
        useCommandSandboxStore.getState().mockConfig.vfs["/workspace/config.json"]?.content,
      ).toBe('{"key": "value"}');

      act(() => {
        store.deleteVirtualFile("/workspace/config.json");
      });
      expect(
        useCommandSandboxStore.getState().mockConfig.vfs["/workspace/config.json"],
      ).toBeUndefined();
    });
  });
});
