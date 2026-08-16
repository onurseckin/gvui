import type { CommandAction } from "./CommandPalette.types";
import { useGraphStore } from "../../state/useGraphStore";
import { useLayoutStore } from "../../store/useLayoutStore";
import type { CommandPaletteStore } from "../../store/useCommandPaletteStore";

export interface ActionContext {
  onNavigateNode?: (fileId: string, nodeId: string) => void;
  onClose?: () => void;
  currentFile?: string;
  onExport?: (format: "png" | "svg" | "json") => void;
  onToggleMinimap?: () => void;
  onTriggerSelfHealing?: () => void;
  onOpenAnalytics?: () => void;
  onOpenAnomalyInspector?: () => void;
  onOpenCollaboration?: () => void;
  onOpenHistoryReplay?: () => void;
  onOpenGraphDiff?: () => void;
  onClearAnnotations?: () => void;
}

export function createDefaultActions(context: ActionContext = {}): CommandAction[] {
  return [
    // --- Navigation Category ---
    {
      id: "nav-reset-view",
      title: "Reset Viewport",
      description: "Reset canvas pan offset and zoom level to default",
      category: "navigation",
      shortcut: "⌘0",
      keywords: ["reset", "view", "viewport", "pan", "center", "zoom"],
      handler: () => {
        const store = useGraphStore.getState();
        store.resetViewport();
        store.setPanOffset({ x: 0, y: 0 });
        store.setZoomLevel(1);
      },
    },
    {
      id: "nav-zoom-in",
      title: "Zoom In",
      description: "Increase canvas magnification scale",
      category: "navigation",
      shortcut: "⌘+",
      keywords: ["zoom", "in", "magnify", "scale", "enlarge"],
      handler: () => {
        useGraphStore.getState().setZoomLevel((z) => Math.min(4, z * 1.25));
      },
    },
    {
      id: "nav-zoom-out",
      title: "Zoom Out",
      description: "Decrease canvas magnification scale",
      category: "navigation",
      shortcut: "⌘-",
      keywords: ["zoom", "out", "shrink", "scale", "reduce"],
      handler: () => {
        useGraphStore.getState().setZoomLevel((z) => Math.max(0.1, z * 0.8));
      },
    },
    {
      id: "nav-fit-view",
      title: "Fit to Screen",
      description: "Auto-fit graph nodes and edges to screen dimensions",
      category: "navigation",
      shortcut: "⇧⌘F",
      keywords: ["fit", "screen", "autofit", "bounds", "frame"],
      handler: () => {
        useGraphStore.getState().setShouldAutoFit(true);
      },
    },

    // --- Layout Category ---
    {
      id: "layout-layered",
      title: "Layered Hierarchical Layout",
      description: "Sugiyama-style topological hierarchy layout with rank alignment",
      category: "layout",
      shortcut: "⌘1",
      keywords: ["layout", "layered", "sugiyama", "dag", "hierarchy", "topological"],
      handler: () => {
        useGraphStore.getState().setLayoutMode("layered");
        useLayoutStore.getState().setAlgorithm("layered");
      },
    },
    {
      id: "layout-force",
      title: "Force-Directed Physics Layout",
      description: "Physics simulation layout with charge repulsion and link attraction",
      category: "layout",
      shortcut: "⌘2",
      keywords: ["layout", "force", "physics", "simulation", "organic", "spring"],
      handler: () => {
        useGraphStore.getState().setLayoutMode("force");
        useLayoutStore.getState().setAlgorithm("force");
      },
    },
    {
      id: "layout-radial",
      title: "Radial Concentric Layout",
      description: "Concentric circular rings radiating from root coordinators",
      category: "layout",
      shortcut: "⌘3",
      keywords: ["layout", "radial", "circular", "concentric", "rings", "polar"],
      handler: () => {
        useGraphStore.getState().setLayoutMode("radial");
        useLayoutStore.getState().setAlgorithm("radial");
      },
    },
    {
      id: "layout-geometric",
      title: "Geometric Grid Layout",
      description: "Uniform geometric and orthogonal grid positioning",
      category: "layout",
      shortcut: "⌘4",
      keywords: ["layout", "geometric", "grid", "orthogonal", "matrix"],
      handler: () => {
        useLayoutStore.getState().setAlgorithm("geometric");
      },
    },
    {
      id: "layout-wasm",
      title: "WASM Custom Layout Engine",
      description: "Ultra-fast WebAssembly optimized layout calculation",
      category: "layout",
      shortcut: "⌘5",
      keywords: ["layout", "wasm", "webassembly", "rust", "native", "high-performance"],
      handler: () => {
        useLayoutStore.getState().setAlgorithm("wasm-custom");
      },
    },

    // --- Actions Category ---
    {
      id: "action-toggle-minimap",
      title: "Toggle Minimap Navigator",
      description: "Show or hide the canvas overview thumbnail radar",
      category: "actions",
      shortcut: "⌘M",
      keywords: ["minimap", "toggle", "radar", "thumbnail", "map", "preview"],
      handler: () => {
        if (context.onToggleMinimap) {
          context.onToggleMinimap();
        }
      },
    },
    {
      id: "action-trigger-self-healing",
      title: "Trigger Self-Healing Graph Repair",
      description: "Execute autonomous graph diagnostic checks and reconcile orphaned subagents",
      category: "actions",
      shortcut: "⌘H",
      keywords: ["self-healing", "heal", "repair", "reconcile", "fix", "diagnose", "autonomous"],
      handler: () => {
        if (context.onTriggerSelfHealing) {
          context.onTriggerSelfHealing();
        }
      },
    },
    {
      id: "action-open-analytics",
      title: "Open Analytics Dashboard",
      description: "Inspect execution metrics, latency percentiles, and token throughput",
      category: "actions",
      shortcut: "⇧⌘A",
      keywords: ["analytics", "metrics", "dashboard", "telemetry", "tokens", "latency", "stats"],
      handler: () => {
        if (context.onOpenAnalytics) {
          context.onOpenAnalytics();
        }
      },
    },
    {
      id: "action-open-anomaly-inspector",
      title: "Open Anomaly Inspector",
      description: "Inspect graph execution bottlenecks, circular loops, and error anomalies",
      category: "actions",
      shortcut: "⇧⌘I",
      keywords: ["anomaly", "bottleneck", "inspector", "errors", "issues", "loops"],
      handler: () => {
        if (context.onOpenAnomalyInspector) {
          context.onOpenAnomalyInspector();
        }
      },
    },
    {
      id: "action-open-collaboration",
      title: "Open Collaboration Feed",
      description: "View active collaborators, remote cursors, and editing locks",
      category: "actions",
      shortcut: "⇧⌘C",
      keywords: ["collaboration", "presence", "collaborators", "cursors", "feed", "sync"],
      handler: () => {
        if (context.onOpenCollaboration) {
          context.onOpenCollaboration();
        }
      },
    },
    {
      id: "action-open-history-replay",
      title: "Open History Replay",
      description: "Time-travel through historical step snapshots and replay execution flow",
      category: "actions",
      shortcut: "⇧⌘R",
      keywords: ["history", "replay", "timeline", "playback", "scrubber", "time-travel"],
      handler: () => {
        if (context.onOpenHistoryReplay) {
          context.onOpenHistoryReplay();
        }
      },
    },
    {
      id: "action-open-graph-diff",
      title: "Open Graph Diff",
      description: "Compare structural differences, added nodes, and modified edges between runs",
      category: "actions",
      shortcut: "⇧⌘D",
      keywords: ["diff", "compare", "changes", "version", "structural", "modified"],
      handler: () => {
        if (context.onOpenGraphDiff) {
          context.onOpenGraphDiff();
        }
      },
    },
    {
      id: "action-clear-annotations",
      title: "Clear Canvas Annotations",
      description: "Remove all canvas drawing pins, text notes, and visual markers",
      category: "actions",
      shortcut: "⌥⇧C",
      keywords: ["clear", "annotations", "notes", "pins", "markers", "remove"],
      handler: () => {
        if (context.onClearAnnotations) {
          context.onClearAnnotations();
        }
      },
    },

    // --- Export Category ---
    {
      id: "export-png",
      title: "Export Canvas as PNG",
      description: "Generate high-resolution PNG image artifact of the current graph",
      category: "export",
      shortcut: "⇧⌘E",
      keywords: ["export", "png", "image", "screenshot", "save", "download"],
      handler: () => {
        if (context.onExport) {
          context.onExport("png");
        }
      },
    },
    {
      id: "export-svg",
      title: "Export Canvas as SVG",
      description: "Generate scalable vector graphic SVG file of the graph layout",
      category: "export",
      shortcut: "⇧⌘S",
      keywords: ["export", "svg", "vector", "scalable", "save", "download"],
      handler: () => {
        if (context.onExport) {
          context.onExport("svg");
        }
      },
    },
    {
      id: "export-json",
      title: "Export Dataset as JSON",
      description: "Download serialized graph dataset including all node and edge metadata",
      category: "export",
      shortcut: "⇧⌘J",
      keywords: ["export", "json", "data", "schema", "dataset", "save", "download"],
      handler: () => {
        if (context.onExport) {
          context.onExport("json");
        }
      },
    },
  ];
}

export function registerDefaultActions(store: CommandPaletteStore, context?: ActionContext): void {
  const actions = createDefaultActions(context);
  store.registerActions(actions);
}
