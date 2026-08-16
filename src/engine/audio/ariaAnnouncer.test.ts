import { beforeEach, describe, expect, it } from "bun:test";
import { AriaAnnouncer } from "./ariaAnnouncer";
import type { AriaAnnouncement } from "./types";

describe("AriaAnnouncer Screen Reader Engine", () => {
  let announcer: AriaAnnouncer;
  let lastAnnouncement: AriaAnnouncement | null = null;

  beforeEach(() => {
    announcer = new AriaAnnouncer({ debounceMs: 10 });
    lastAnnouncement = null;
    announcer.onAnnouncement((a) => {
      lastAnnouncement = a;
    });
  });

  it("announces messages with default polite and assertive settings", () => {
    announcer.announce("Hello screen reader", "polite", "test");
    expect(lastAnnouncement?.message).toBe("Hello screen reader");
    expect(lastAnnouncement?.politeness).toBe("polite");
    expect(lastAnnouncement?.category).toBe("test");

    announcer.announce("Urgent alert", "assertive", "alert");
    expect(lastAnnouncement?.message).toBe("Urgent alert");
    expect(lastAnnouncement?.politeness).toBe("assertive");
  });

  it("respects enabled configuration toggle and off politeness", () => {
    lastAnnouncement = null;
    announcer.announce("Should not broadcast", "off");
    expect(lastAnnouncement).toBeNull();

    announcer.setEnabled(false);
    announcer.announce("Disabled test", "polite");
    expect(lastAnnouncement).toBeNull();
  });

  it("announces node with minimal, standard, and verbose verbosity", () => {
    const node = {
      id: "agent-1",
      label: "Code Reviewer",
      kind: "agent",
      status: "running",
      depth: 2,
      inputCount: 2,
      outputCount: 1,
      tokens: 4500,
      durationMs: 320,
      x: 100,
      y: 200,
    };

    announcer.announceNode(node, "Selected", "minimal");
    expect(lastAnnouncement?.message).toContain("Selected Code Reviewer");

    announcer.announceNode(node, "Inspected", "standard");
    expect(lastAnnouncement?.message).toContain("Inspected node: Code Reviewer (agent)");
    expect(lastAnnouncement?.message).toContain("Depth level 2");

    announcer.announceNode(node, "Focused", "verbose");
    expect(lastAnnouncement?.message).toContain("4,500 tokens");
    expect(lastAnnouncement?.message).toContain("320ms runtime");
    expect(lastAnnouncement?.message).toContain("Position (100, 200)");
  });

  it("announces edge relationships", () => {
    announcer.announceEdge({ source: "Router", target: "Worker", kind: "dispatch" });
    expect(lastAnnouncement?.message).toContain("Router");
    expect(lastAnnouncement?.message).toContain("Worker");
    expect(lastAnnouncement?.message).toContain("dispatch link");
  });

  it("announces graph overview with metrics and status breakdown", () => {
    announcer.announceGraphOverview(24, 30, 5, { running: 2, success: 20, error: 2 });
    expect(lastAnnouncement?.message).toContain("24 nodes");
    expect(lastAnnouncement?.message).toContain("30 connections");
    expect(lastAnnouncement?.message).toContain("5 depth levels");
    expect(lastAnnouncement?.message).toContain("2 running, 20 success, 2 error");
  });

  it("announces navigation steps", () => {
    announcer.announceNavigation(
      "left",
      { id: "node-2", label: "Worker B", depth: 1 },
      { id: "node-1", label: "Worker A" },
    );
    expect(lastAnnouncement?.message).toContain("Moved left from Worker A to Worker B");
  });

  it("announces execution lifecycle and errors assertively", () => {
    announcer.announceExecution("Validator", "success", 150);
    expect(lastAnnouncement?.politeness).toBe("polite");
    expect(lastAnnouncement?.message).toContain("in 150ms");

    announcer.announceExecution("Worker", "error", 200, "Syntax error at line 4");
    expect(lastAnnouncement?.politeness).toBe("assertive");
    expect(lastAnnouncement?.message).toContain("Error: Syntax error at line 4");
  });

  it("announces canvas zoom changes and anomaly alerts", () => {
    announcer.announceZoom(1.25);
    expect(lastAnnouncement?.message).toContain("125%");

    announcer.announceAnomaly("Cyclic dependency detected", "critical");
    expect(lastAnnouncement?.politeness).toBe("assertive");
    expect(lastAnnouncement?.message).toContain("CRITICAL");
  });

  it("manages announcement history and clears feed", () => {
    for (let i = 0; i < 150; i++) {
      announcer.announce(`Message ${i}`);
    }
    const history = announcer.getRecentAnnouncements();
    expect(history.length).toBeLessThanOrEqual(100);

    announcer.clearAnnouncements();
    expect(announcer.getRecentAnnouncements().length).toBe(0);
  });

  it("disposes announcer cleanly", () => {
    announcer.dispose();
    expect(announcer.getRecentAnnouncements().length).toBe(0);
  });
});
