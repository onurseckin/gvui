import type {
  AriaAnnouncement,
  AriaPoliteness,
  AriaVerbosity,
  GraphEdgeAudioContext,
  GraphNodeAudioContext,
} from "./types";

export interface AriaAnnouncerConfig {
  enabled: boolean;
  verbosity: AriaVerbosity;
  debounceMs: number;
}

const DEFAULT_CONFIG: AriaAnnouncerConfig = {
  enabled: true,
  verbosity: "standard",
  debounceMs: 50,
};

export class AriaAnnouncer {
  private config: AriaAnnouncerConfig;
  private politeElement: HTMLElement | null = null;
  private assertiveElement: HTMLElement | null = null;
  private announcements: AriaAnnouncement[] = [];
  private maxHistory = 100;
  private counter = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPoliteMessages: string[] = [];
  private onAnnouncementCallback?: (announcement: AriaAnnouncement) => void;

  constructor(config?: Partial<AriaAnnouncerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initLiveRegions();
  }

  public getConfig(): AriaAnnouncerConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<AriaAnnouncerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public setVerbosity(verbosity: AriaVerbosity): void {
    this.updateConfig({ verbosity });
  }

  public setEnabled(enabled: boolean): void {
    this.updateConfig({ enabled });
  }

  public onAnnouncement(callback: (announcement: AriaAnnouncement) => void): void {
    this.onAnnouncementCallback = callback;
  }

  private initLiveRegions(): void {
    if (typeof document === "undefined") return;

    // Check existing live region container
    let container = document.getElementById("gvui-aria-live-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "gvui-aria-live-container";
      container.style.position = "absolute";
      container.style.width = "1px";
      container.style.height = "1px";
      container.style.padding = "0";
      container.style.margin = "-1px";
      container.style.overflow = "hidden";
      container.style.clip = "rect(0, 0, 0, 0)";
      container.style.whiteSpace = "nowrap";
      container.style.border = "0";
      document.body.appendChild(container);
    }

    let politeEl = document.getElementById("gvui-aria-polite");
    if (!politeEl) {
      politeEl = document.createElement("div");
      politeEl.id = "gvui-aria-polite";
      politeEl.setAttribute("aria-live", "polite");
      politeEl.setAttribute("aria-atomic", "true");
      politeEl.setAttribute("role", "status");
      container.appendChild(politeEl);
    }
    this.politeElement = politeEl;

    let assertiveEl = document.getElementById("gvui-aria-assertive");
    if (!assertiveEl) {
      assertiveEl = document.createElement("div");
      assertiveEl.id = "gvui-aria-assertive";
      assertiveEl.setAttribute("aria-live", "assertive");
      assertiveEl.setAttribute("aria-atomic", "true");
      assertiveEl.setAttribute("role", "alert");
      container.appendChild(assertiveEl);
    }
    this.assertiveElement = assertiveEl;
  }

  public announce(message: string, politeness: AriaPoliteness = "polite", category?: string): void {
    if (!this.config.enabled || politeness === "off" || !message.trim()) return;

    const announcement: AriaAnnouncement = {
      id: `announcement_${++this.counter}`,
      message: message.trim(),
      politeness,
      timestamp: Date.now(),
      category,
    };

    this.announcements.unshift(announcement);
    if (this.announcements.length > this.maxHistory) {
      this.announcements.pop();
    }

    if (this.onAnnouncementCallback) {
      try {
        this.onAnnouncementCallback(announcement);
      } catch {
        // Callback safety
      }
    }

    if (politeness === "assertive") {
      // Immediate assertive announcement
      if (this.assertiveElement) {
        this.assertiveElement.textContent = "";
        // Force DOM update reflow
        void this.assertiveElement.offsetWidth;
        this.assertiveElement.textContent = message;
      }
    } else {
      // Debounce polite messages
      this.pendingPoliteMessages.push(message);
      if (this.config.debounceMs <= 0) {
        this.flushPoliteAnnouncements();
      } else {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          this.flushPoliteAnnouncements();
        }, this.config.debounceMs);
      }
    }
  }

  public flush(): void {
    this.flushPoliteAnnouncements();
  }

  private flushPoliteAnnouncements(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pendingPoliteMessages.length === 0) return;
    const messages = [...this.pendingPoliteMessages];
    this.pendingPoliteMessages = [];
    const combinedMessage = messages.join(". ");

    if (this.politeElement) {
      this.politeElement.textContent = "";
      void this.politeElement.offsetWidth;
      this.politeElement.textContent = combinedMessage;
    }
  }

  public announceNode(
    node: GraphNodeAudioContext,
    action = "Selected",
    customVerbosity?: AriaVerbosity,
  ): void {
    const verbosity = customVerbosity || this.config.verbosity;
    const label = node.label || node.id;
    const kind = node.kind ? `(${node.kind})` : "";
    const status = node.status ? `Status: ${node.status}` : "";

    if (verbosity === "minimal") {
      this.announce(`${action} ${label}. ${node.status || ""}`, "polite", "node");
      return;
    }

    if (verbosity === "standard") {
      const parts = [`${action} node: ${label} ${kind}`];
      if (status) parts.push(status);
      if (node.depth !== undefined) parts.push(`Depth level ${node.depth}`);
      this.announce(parts.join(", "), "polite", "node");
      return;
    }

    // Verbose
    const parts = [
      `${action} node: ${label}`,
      kind,
      status,
      node.depth !== undefined ? `Depth: ${node.depth}` : "",
      node.inputCount !== undefined ? `${node.inputCount} inputs` : "",
      node.outputCount !== undefined ? `${node.outputCount} outputs` : "",
      node.tokens !== undefined ? `${node.tokens.toLocaleString()} tokens` : "",
      node.durationMs !== undefined ? `${node.durationMs}ms runtime` : "",
      node.x !== undefined && node.y !== undefined
        ? `Position (${Math.round(node.x)}, ${Math.round(node.y)})`
        : "",
      node.errorMsg ? `Error details: ${node.errorMsg}` : "",
    ].filter(Boolean);

    this.announce(parts.join(". "), "polite", "node");
  }

  public announceEdge(edge: GraphEdgeAudioContext, action = "Traversing"): void {
    const verbosity = this.config.verbosity;
    if (verbosity === "minimal") {
      this.announce(`${action} edge to ${edge.target}`, "polite", "edge");
      return;
    }
    const kindText = edge.kind ? `(${edge.kind} link)` : "link";
    this.announce(
      `${action} connection from node ${edge.source} to node ${edge.target} via ${kindText}`,
      "polite",
      "edge",
    );
  }

  public announceGraphOverview(
    nodeCount: number,
    edgeCount: number,
    depth: number,
    statusCounts?: Record<string, number>,
  ): void {
    const parts = [
      `Graph loaded with ${nodeCount} nodes and ${edgeCount} connections across ${depth} depth levels.`,
    ];

    if (statusCounts) {
      const statusEntries = Object.entries(statusCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${count} ${status}`);
      if (statusEntries.length > 0) {
        parts.push(`Node statuses: ${statusEntries.join(", ")}.`);
      }
    }

    this.announce(parts.join(" "), "polite", "overview");
  }

  public announceNavigation(
    direction: string,
    currentNode: GraphNodeAudioContext,
    previousNode?: GraphNodeAudioContext,
  ): void {
    const prev = previousNode ? `from ${previousNode.label || previousNode.id} ` : "";
    const label = currentNode.label || currentNode.id;
    const kind = currentNode.kind ? `(${currentNode.kind})` : "";
    const depth = currentNode.depth !== undefined ? `at depth ${currentNode.depth}` : "";

    this.announce(`Moved ${direction} ${prev}to ${label} ${kind} ${depth}`, "polite", "navigation");
  }

  public announceExecution(
    nodeLabel: string,
    status: string,
    durationMs?: number,
    errorMsg?: string,
  ): void {
    const politeness: AriaPoliteness = status === "error" ? "assertive" : "polite";
    const durationText = durationMs !== undefined ? ` in ${durationMs}ms` : "";
    const errorText = errorMsg ? `. Error: ${errorMsg}` : "";

    this.announce(
      `Node ${nodeLabel} execution ${status}${durationText}${errorText}`,
      politeness,
      "execution",
    );
  }

  public announceZoom(zoomLevel: number): void {
    this.announce(`Canvas zoom level: ${Math.round(zoomLevel * 100)}%`, "polite", "canvas");
  }

  public announceAnomaly(anomalyDescription: string, severity: string): void {
    const politeness: AriaPoliteness =
      severity === "critical" || severity === "high" ? "assertive" : "polite";
    this.announce(
      `Accessibility Alert: ${severity.toUpperCase()} anomaly detected. ${anomalyDescription}`,
      politeness,
      "anomaly",
    );
  }

  public getRecentAnnouncements(): AriaAnnouncement[] {
    return [...this.announcements];
  }

  public clearAnnouncements(): void {
    this.announcements = [];
    if (this.politeElement) this.politeElement.textContent = "";
    if (this.assertiveElement) this.assertiveElement.textContent = "";
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.clearAnnouncements();
    if (typeof document !== "undefined") {
      const container = document.getElementById("gvui-aria-live-container");
      container?.parentNode?.removeChild(container);
    }
    this.politeElement = null;
    this.assertiveElement = null;
  }
}

let defaultAnnouncerInstance: AriaAnnouncer | null = null;

export function getAriaAnnouncer(): AriaAnnouncer {
  if (!defaultAnnouncerInstance) {
    defaultAnnouncerInstance = new AriaAnnouncer();
  }
  return defaultAnnouncerInstance;
}
