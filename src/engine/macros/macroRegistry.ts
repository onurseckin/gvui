import type { MacroScript } from "./types";

export const PREDEFINED_MACRO_TEMPLATES: MacroScript[] = [
  {
    id: "template_critic_pipeline",
    name: "Create Critic Pipeline",
    description:
      "Spawns an implementer agent and an adversarial critic node connected in a review/repair feedback loop.",
    version: "1.0.0",
    category: "Pipelines",
    tags: ["pipeline", "critic", "review", "agent"],
    parameters: [
      {
        name: "agentName",
        label: "Implementer Name",
        description: "Name of the implementer agent node",
        type: "string",
        defaultValue: "Implementer Agent",
        required: true,
      },
      {
        name: "criticName",
        label: "Critic Name",
        description: "Name of the adversarial critic node",
        type: "string",
        defaultValue: "Adversarial Critic",
        required: true,
      },
      {
        name: "startX",
        label: "Start X Position",
        description: "X coordinate of the implementer node",
        type: "number",
        defaultValue: 100,
      },
      {
        name: "startY",
        label: "Start Y Position",
        description: "Y coordinate of the implementer node",
        type: "number",
        defaultValue: 150,
      },
    ],
    steps: [
      {
        id: "step_cp_1",
        type: "create_node",
        label: "Create Implementer Node",
        description: "Add implementer node {{agentName}}",
        enabled: true,
        payload: {
          node: {
            id: "{{agentName | lowercase | trim}}-node",
            name: "{{agentName}}",
            kind: "agent",
            status: "running",
            x: "{{startX}}",
            y: "{{startY}}",
            width: 190,
            height: 85,
            tier: "m",
            badge: { text: "Implementer", variant: "info" },
          },
        },
      },
      {
        id: "step_cp_2",
        type: "create_node",
        label: "Create Critic Node",
        description: "Add critic node {{criticName}}",
        enabled: true,
        payload: {
          node: {
            id: "{{criticName | lowercase | trim}}-node",
            name: "{{criticName}}",
            kind: "critic",
            status: "pending",
            x: 420,
            y: "{{startY}}",
            width: 190,
            height: 85,
            tier: "l",
            badge: { text: "Review Gate", variant: "warning" },
          },
        },
      },
      {
        id: "step_cp_3",
        type: "create_edge",
        label: "Connect Submission Edge",
        description: "Submission flow from Implementer to Critic",
        enabled: true,
        payload: {
          edge: {
            id: "edge-submit-{{agentName | lowercase | trim}}",
            source: "{{agentName | lowercase | trim}}-node",
            target: "{{criticName | lowercase | trim}}-node",
            kind: "validation",
            label: "submit verification",
          },
        },
      },
      {
        id: "step_cp_4",
        type: "create_edge",
        label: "Connect Feedback Loop Edge",
        description: "Pushback repair feedback edge from Critic to Implementer",
        enabled: true,
        payload: {
          edge: {
            id: "edge-feedback-{{agentName | lowercase | trim}}",
            source: "{{criticName | lowercase | trim}}-node",
            target: "{{agentName | lowercase | trim}}-node",
            kind: "pushback",
            label: "adversarial rejection feedback",
            isCycle: true,
          },
        },
      },
      {
        id: "step_cp_5",
        type: "trigger_layout",
        label: "Auto-Layout Pipeline",
        description: "Align and arrange newly created pipeline elements",
        enabled: true,
        payload: {
          layoutMode: "layered",
          layoutConfig: { nodeSpacingX: 60, nodeSpacingY: 60 },
        },
      },
    ],
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  },
  {
    id: "template_fork_join",
    name: "Fork-Join Parallel Dispatch Pattern",
    description:
      "Creates a dispatcher router node that forks into 3 parallel workers and joins into a synthesizer node.",
    version: "1.0.0",
    category: "Pipelines",
    tags: ["fork", "join", "parallel", "pattern"],
    parameters: [
      {
        name: "prefix",
        label: "Prefix Identifier",
        description: "Prefix for node IDs",
        type: "string",
        defaultValue: "task",
        required: true,
      },
      {
        name: "workerCount",
        label: "Number of Workers",
        description: "Number of parallel workers (1 to 3 supported in template)",
        type: "number",
        defaultValue: 3,
      },
    ],
    steps: [
      {
        id: "step_fj_1",
        type: "create_node",
        label: "Create Dispatcher Node",
        enabled: true,
        payload: {
          node: {
            id: "{{prefix}}-dispatcher",
            name: "Dispatcher Router",
            kind: "router",
            status: "running",
            x: 80,
            y: 200,
            width: 170,
            height: 80,
          },
        },
      },
      {
        id: "step_fj_2",
        type: "create_node",
        label: "Create Worker 1",
        enabled: true,
        payload: {
          node: {
            id: "{{prefix}}-worker-1",
            name: "Worker 1 (Unit)",
            kind: "agent",
            status: "pending",
            x: 320,
            y: 80,
            width: 160,
            height: 75,
          },
        },
      },
      {
        id: "step_fj_3",
        type: "create_node",
        label: "Create Worker 2",
        enabled: true,
        payload: {
          node: {
            id: "{{prefix}}-worker-2",
            name: "Worker 2 (Integration)",
            kind: "agent",
            status: "pending",
            x: 320,
            y: 200,
            width: 160,
            height: 75,
          },
        },
      },
      {
        id: "step_fj_4",
        type: "create_node",
        label: "Create Worker 3",
        enabled: true,
        payload: {
          node: {
            id: "{{prefix}}-worker-3",
            name: "Worker 3 (End-to-End)",
            kind: "agent",
            status: "pending",
            x: 320,
            y: 320,
            width: 160,
            height: 75,
          },
        },
      },
      {
        id: "step_fj_5",
        type: "create_node",
        label: "Create Synthesizer Join Node",
        enabled: true,
        payload: {
          node: {
            id: "{{prefix}}-join",
            name: "Synthesizer Join",
            kind: "join",
            status: "pending",
            x: 560,
            y: 200,
            width: 170,
            height: 80,
          },
        },
      },
      {
        id: "step_fj_6",
        type: "create_edge",
        label: "Dispatch -> Worker 1",
        enabled: true,
        payload: {
          edge: {
            id: "edge-{{prefix}}-d-w1",
            source: "{{prefix}}-dispatcher",
            target: "{{prefix}}-worker-1",
            kind: "dispatch",
          },
        },
      },
      {
        id: "step_fj_7",
        type: "create_edge",
        label: "Dispatch -> Worker 2",
        enabled: true,
        payload: {
          edge: {
            id: "edge-{{prefix}}-d-w2",
            source: "{{prefix}}-dispatcher",
            target: "{{prefix}}-worker-2",
            kind: "dispatch",
          },
        },
      },
      {
        id: "step_fj_8",
        type: "create_edge",
        label: "Dispatch -> Worker 3",
        enabled: true,
        payload: {
          edge: {
            id: "edge-{{prefix}}-d-w3",
            source: "{{prefix}}-dispatcher",
            target: "{{prefix}}-worker-3",
            kind: "dispatch",
          },
        },
      },
      {
        id: "step_fj_9",
        type: "create_edge",
        label: "Worker 1 -> Join",
        enabled: true,
        payload: {
          edge: {
            id: "edge-{{prefix}}-w1-j",
            source: "{{prefix}}-worker-1",
            target: "{{prefix}}-join",
            kind: "join",
          },
        },
      },
      {
        id: "step_fj_10",
        type: "create_edge",
        label: "Worker 2 -> Join",
        enabled: true,
        payload: {
          edge: {
            id: "edge-{{prefix}}-w2-j",
            source: "{{prefix}}-worker-2",
            target: "{{prefix}}-join",
            kind: "join",
          },
        },
      },
      {
        id: "step_fj_11",
        type: "create_edge",
        label: "Worker 3 -> Join",
        enabled: true,
        payload: {
          edge: {
            id: "edge-{{prefix}}-w3-j",
            source: "{{prefix}}-worker-3",
            target: "{{prefix}}-join",
            kind: "join",
          },
        },
      },
    ],
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  },
  {
    id: "template_standardize_properties",
    name: "Standardize Node Properties",
    description: "Batch update node dimension, model tier, and status badge properties.",
    version: "1.0.0",
    category: "Batch Actions",
    tags: ["batch", "properties", "standardize", "format"],
    parameters: [
      {
        name: "targetNodeId",
        label: "Target Node ID",
        description: "Node ID to update (or {{nodeId}} in batch mode)",
        type: "nodeId",
        defaultValue: "{{nodeId}}",
        required: true,
      },
      {
        name: "modelTier",
        label: "Model Tier",
        description: "Standard model compute tier",
        type: "select",
        defaultValue: "m",
        options: [
          { label: "XS - Ultra Fast", value: "xs" },
          { label: "S - Standard", value: "s" },
          { label: "M - Balanced Heavy", value: "m" },
          { label: "L - Maximum Reasoning", value: "l" },
        ],
      },
      {
        name: "statusLabel",
        label: "Status Badge Label",
        description: "Badge text label",
        type: "string",
        defaultValue: "Verified v1.0",
      },
    ],
    steps: [
      {
        id: "step_std_1",
        type: "update_node",
        label: "Apply Standard Properties",
        description: "Set model tier and badges on {{targetNodeId}}",
        enabled: true,
        payload: {
          nodeId: "{{targetNodeId}}",
          patch: {
            tier: "{{modelTier}}",
            badge: { text: "{{statusLabel}}", variant: "success" },
            width: 180,
            height: 80,
          },
        },
      },
    ],
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  },
  {
    id: "template_reset_layout",
    name: "Reset Viewport & Auto-Layout",
    description:
      "Applies layered hierarchical layout with standard spacing and centers viewport camera.",
    version: "1.0.0",
    category: "Canvas & Layout",
    tags: ["layout", "viewport", "reset", "organize"],
    parameters: [
      {
        name: "layoutDirection",
        label: "Layout Direction",
        type: "select",
        defaultValue: "left-right",
        options: [
          { label: "Left to Right", value: "left-right" },
          { label: "Top to Bottom", value: "top-down" },
          { label: "Right to Left", value: "right-left" },
          { label: "Bottom to Top", value: "bottom-up" },
        ],
      },
      {
        name: "nodeSpacing",
        label: "Node Spacing",
        type: "number",
        defaultValue: 50,
      },
    ],
    steps: [
      {
        id: "step_rl_1",
        type: "trigger_layout",
        label: "Apply Layout Mode",
        description: "Trigger layout with direction {{layoutDirection}}",
        enabled: true,
        payload: {
          layoutMode: "layered",
          layoutConfig: {
            direction: "{{layoutDirection}}",
            nodeSpacingX: "{{nodeSpacing}}",
            nodeSpacingY: "{{nodeSpacing}}",
          },
        },
      },
      {
        id: "step_rl_2",
        type: "set_viewport",
        label: "Reset Camera Viewport",
        description: "Set zoom to 1.0 and center pan offset",
        enabled: true,
        payload: {
          zoomLevel: 1.0,
          panOffset: { x: 0, y: 0 },
        },
      },
    ],
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  },
  {
    id: "template_insert_anomaly_gate",
    name: "Insert Anomaly Validation Gate",
    description: "Inserts a validation gate node between a source node and target node.",
    version: "1.0.0",
    category: "Pipelines",
    tags: ["anomaly", "gate", "validation", "security"],
    parameters: [
      {
        name: "sourceNodeId",
        label: "Source Node ID",
        type: "nodeId",
        defaultValue: "source-node",
        required: true,
      },
      {
        name: "targetNodeId",
        label: "Target Node ID",
        type: "nodeId",
        defaultValue: "target-node",
        required: true,
      },
      {
        name: "gateName",
        label: "Gatekeeper Name",
        type: "string",
        defaultValue: "Security Gatekeeper",
      },
    ],
    steps: [
      {
        id: "step_ag_1",
        type: "create_node",
        label: "Create Validation Gate",
        enabled: true,
        payload: {
          node: {
            id: "{{sourceNodeId}}-gate",
            name: "{{gateName}}",
            kind: "gate",
            status: "running",
            width: 160,
            height: 75,
            badge: { text: "Enforce Check", variant: "error" },
          },
        },
      },
      {
        id: "step_ag_2",
        type: "delete_edge",
        label: "Remove Direct Edge",
        description: "Remove direct connection between {{sourceNodeId}} and {{targetNodeId}}",
        enabled: true,
        payload: {
          source: "{{sourceNodeId}}",
          target: "{{targetNodeId}}",
        },
      },
      {
        id: "step_ag_3",
        type: "create_edge",
        label: "Connect Source to Gate",
        enabled: true,
        payload: {
          edge: {
            id: "edge-{{sourceNodeId}}-to-gate",
            source: "{{sourceNodeId}}",
            target: "{{sourceNodeId}}-gate",
            kind: "validation",
          },
        },
      },
      {
        id: "step_ag_4",
        type: "create_edge",
        label: "Connect Gate to Target",
        enabled: true,
        payload: {
          edge: {
            id: "edge-gate-to-{{targetNodeId}}",
            source: "{{sourceNodeId}}-gate",
            target: "{{targetNodeId}}",
            kind: "signoff",
          },
        },
      },
    ],
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  },
];

const LOCAL_STORAGE_KEY = "gvui_macro_registry_v1";

export class MacroRegistry {
  private templates: Map<string, MacroScript> = new Map();
  private userMacros: Map<string, MacroScript> = new Map();

  public constructor() {
    this.resetToDefaults();
  }

  public resetToDefaults(): void {
    this.templates.clear();
    for (const tpl of PREDEFINED_MACRO_TEMPLATES) {
      this.templates.set(tpl.id, { ...tpl });
    }
  }

  public register(script: MacroScript): void {
    this.userMacros.set(script.id, { ...script, updatedAt: new Date().toISOString() });
  }

  public unregister(scriptId: string): boolean {
    if (this.templates.has(scriptId)) {
      // Don't delete built-in templates, but allow hiding or do nothing
      return false;
    }
    return this.userMacros.delete(scriptId);
  }

  public get(scriptId: string): MacroScript | undefined {
    const user = this.userMacros.get(scriptId);
    if (user) return { ...user };
    const tpl = this.templates.get(scriptId);
    if (tpl) return { ...tpl };
    return undefined;
  }

  public list(): MacroScript[] {
    return [...this.listTemplates(), ...this.listUserMacros()];
  }

  public listTemplates(): MacroScript[] {
    return Array.from(this.templates.values()).map((s) => ({ ...s }));
  }

  public listUserMacros(): MacroScript[] {
    return Array.from(this.userMacros.values()).map((s) => ({ ...s }));
  }

  public search(query: string, options?: { category?: string; tag?: string }): MacroScript[] {
    const q = query.toLowerCase().trim();
    return this.list().filter((script) => {
      if (options?.category && options.category !== "all" && script.category !== options.category) {
        return false;
      }
      if (options?.tag && (!script.tags || !script.tags.includes(options.tag))) {
        return false;
      }
      if (!q) return true;
      const matchName = script.name.toLowerCase().includes(q);
      const matchDesc = script.description?.toLowerCase().includes(q) ?? false;
      const matchTags = script.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
      return matchName || matchDesc || matchTags;
    });
  }

  public duplicate(scriptId: string, newName?: string): MacroScript | null {
    const orig = this.get(scriptId);
    if (!orig) return null;

    const dupId = `macro_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();
    const duplicated: MacroScript = {
      ...orig,
      id: dupId,
      name: newName ?? `${orig.name} (Copy)`,
      createdAt: nowIso,
      updatedAt: nowIso,
      steps: orig.steps.map((s) => ({
        ...s,
        id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      })),
    };

    this.register(duplicated);
    return duplicated;
  }

  public saveToStorage(storageKey: string = LOCAL_STORAGE_KEY): void {
    if (typeof localStorage === "undefined") return;
    try {
      const serialized = JSON.stringify(Array.from(this.userMacros.values()));
      localStorage.setItem(storageKey, serialized);
    } catch {
      // Ignore storage write errors in restricted contexts
    }
  }

  public loadFromStorage(storageKey: string = LOCAL_STORAGE_KEY): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          this.userMacros.clear();
          for (const item of parsed) {
            if (
              item &&
              typeof item === "object" &&
              "id" in item &&
              "name" in item &&
              "steps" in item
            ) {
              this.userMacros.set(String((item as { id: unknown }).id), item as MacroScript);
            }
          }
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }
}

export const globalMacroRegistry = new MacroRegistry();
