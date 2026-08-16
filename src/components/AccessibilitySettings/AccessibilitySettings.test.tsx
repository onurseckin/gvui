import { beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useAudioStore } from "../../engine/audio";
import { AccessibilitySettingsPanel } from "./AccessibilitySettingsPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AccessibilitySettingsPanel Component", () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    useAudioStore.getState().resetToDefaults();
  });

  it("renders panel with initial Audio tab active", () => {
    act(() => {
      renderer = create(<AccessibilitySettingsPanel isOpen={true} />);
    });

    const root = renderer.root;
    const header = root.findByProps({ className: "gvui-accessibility-header" });
    expect(header).toBeDefined();

    const title = root.findByType("h2");
    expect(title.children).toContain("Accessibility & Sonification");

    const tabs = root.findAllByProps({ role: "tab" });
    expect(tabs.length).toBe(4);
    expect(tabs[0].props["aria-selected"]).toBe(true);
  });

  it("switches tabs between Audio, Soundboard, ARIA, and Activity", () => {
    act(() => {
      renderer = create(<AccessibilitySettingsPanel isOpen={true} />);
    });

    const root = renderer.root;
    const tabs = root.findAllByProps({ role: "tab" });

    // Switch to Soundboard
    act(() => {
      tabs[1].props.onClick();
    });
    expect(tabs[1].props["aria-selected"]).toBe(true);
    const soundboardButtons = root.findAllByProps({ className: "gvui-accessibility-cue-btn" });
    expect(soundboardButtons.length).toBeGreaterThan(0);

    // Switch to ARIA
    act(() => {
      tabs[2].props.onClick();
    });
    expect(tabs[2].props["aria-selected"]).toBe(true);

    // Switch to Activity
    act(() => {
      tabs[3].props.onClick();
    });
    expect(tabs[3].props["aria-selected"]).toBe(true);
  });

  it("handles volume slider and mute toggle interactions", () => {
    act(() => {
      renderer = create(<AccessibilitySettingsPanel isOpen={true} />);
    });

    const root = renderer.root;
    const volumeSlider = root.findByProps({ "aria-label": "Master volume" });

    act(() => {
      volumeSlider.props.onChange({ target: { value: "0.45" } });
    });
    expect(useAudioStore.getState().masterVolume).toBe(0.45);
  });

  it("triggers soundboard audio cues upon button click", () => {
    act(() => {
      renderer = create(<AccessibilitySettingsPanel isOpen={true} />);
    });

    const root = renderer.root;
    const tabs = root.findAllByProps({ role: "tab" });

    act(() => {
      tabs[1].props.onClick(); // Go to soundboard
    });

    const cueButtons = root.findAllByProps({ className: "gvui-accessibility-cue-btn" });
    expect(cueButtons.length).toBeGreaterThan(0);

    act(() => {
      cueButtons[0].props.onClick();
    });

    expect(useAudioStore.getState().audioEventLog.length).toBeGreaterThan(0);
  });

  it("supports manual ARIA announcement triggers", () => {
    act(() => {
      renderer = create(<AccessibilitySettingsPanel isOpen={true} />);
    });

    const root = renderer.root;
    const tabs = root.findAllByProps({ role: "tab" });

    act(() => {
      tabs[2].props.onClick(); // Go to ARIA
    });

    const announceBtn = root
      .findAllByProps({ className: "gvui-accessibility-toggle-btn active" })
      .find((b) => b.children.includes("Announce"));

    expect(announceBtn).toBeDefined();

    act(() => {
      announceBtn?.props.onClick();
    });

    expect(useAudioStore.getState().recentAnnouncements.length).toBeGreaterThan(0);
  });

  it("resets settings to default values", () => {
    act(() => {
      useAudioStore.getState().setMasterVolume(0.2);
      useAudioStore.getState().setMuted(true);
    });

    act(() => {
      renderer = create(<AccessibilitySettingsPanel isOpen={true} />);
    });

    const root = renderer.root;
    const resetBtn = root.findByProps({ className: "gvui-accessibility-reset-btn" });

    act(() => {
      resetBtn.props.onClick();
    });

    expect(useAudioStore.getState().masterVolume).toBe(0.7);
    expect(useAudioStore.getState().isMuted).toBe(false);
  });

  it("returns null when isOpen is false", () => {
    act(() => {
      renderer = create(<AccessibilitySettingsPanel isOpen={false} />);
    });

    expect(renderer.toJSON()).toBeNull();
  });
});
