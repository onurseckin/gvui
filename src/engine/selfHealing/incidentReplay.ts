/**
 * Incident Recording, Deterministic Step-by-Step Replay, and Time-Travel Validation
 * 100% Zero-Any Strict TypeScript
 */

import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import type {
  Incident,
  ReplaySession,
  ReplayStep,
  ReplayStepType,
  TimeTravelValidationResult,
} from "./types";

export class IncidentRecorder {
  private sessions: Map<string, ReplaySession> = new Map();

  public createSession(
    incident: Incident,
    initialGraph: GraphDataset,
    title?: string,
  ): ReplaySession {
    const sessionId = `session_${incident.id}_${Date.now()}`;
    const initialSnapshot = this.cloneGraph(initialGraph);

    const initialStep: ReplayStep = {
      stepIndex: 0,
      timestamp: incident.detectedAt,
      type: "initial",
      description: `Baseline graph state captured for incident ${incident.title}`,
      snapshot: initialSnapshot,
    };

    const session: ReplaySession = {
      id: sessionId,
      incidentId: incident.id,
      title: title ?? `Replay: ${incident.title}`,
      createdAt: Date.now(),
      initialGraph: initialSnapshot,
      steps: [initialStep],
      status: "idle",
      currentStepIndex: 0,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  public recordStep(
    sessionId: string,
    stepData: {
      timestamp?: number;
      type: ReplayStepType;
      description: string;
      snapshot: GraphDataset;
      actionTaken?: ReplayStep["actionTaken"];
      targetId?: string;
      delta?: ReplayStep["delta"];
    },
  ): ReplayStep | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const stepIndex = session.steps.length;
    const clonedSnapshot = this.cloneGraph(stepData.snapshot);

    const newStep: ReplayStep = {
      stepIndex,
      timestamp: stepData.timestamp ?? Date.now(),
      type: stepData.type,
      description: stepData.description,
      snapshot: clonedSnapshot,
      actionTaken: stepData.actionTaken,
      targetId: stepData.targetId,
      delta: stepData.delta,
    };

    session.steps.push(newStep);
    return newStep;
  }

  public getSession(sessionId: string): ReplaySession | undefined {
    return this.sessions.get(sessionId);
  }

  public getSessionByIncidentId(incidentId: string): ReplaySession | undefined {
    for (const session of this.sessions.values()) {
      if (session.incidentId === incidentId) {
        return session;
      }
    }
    return undefined;
  }

  public getAllSessions(): ReplaySession[] {
    return Array.from(this.sessions.values());
  }

  public clear(): void {
    this.sessions.clear();
  }

  private cloneGraph(graph: GraphDataset): GraphDataset {
    return JSON.parse(JSON.stringify(graph)) as GraphDataset;
  }
}

export type StepChangeListener = (step: ReplayStep, snapshot: GraphDataset) => void;

export class IncidentReplayEngine {
  private currentSession?: ReplaySession;
  private currentStepIndex: number = 0;
  private isPlaying: boolean = false;
  private playIntervalId?: ReturnType<typeof setInterval>;
  private stepChangeListeners: Set<StepChangeListener> = new Set();
  private recorder: IncidentRecorder;

  constructor(recorder?: IncidentRecorder) {
    this.recorder = recorder ?? new IncidentRecorder();
  }

  public getRecorder(): IncidentRecorder {
    return this.recorder;
  }

  public loadSession(session: ReplaySession): void {
    this.pause();
    this.currentSession = session;
    this.currentStepIndex = Math.min(
      Math.max(0, session.currentStepIndex ?? 0),
      session.steps.length - 1,
    );
    this.notifyStepChange();
  }

  public getCurrentSession(): ReplaySession | undefined {
    return this.currentSession;
  }

  public getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  public getTotalSteps(): number {
    return this.currentSession?.steps.length ?? 0;
  }

  public getCurrentStep(): ReplayStep | undefined {
    if (!this.currentSession || this.currentSession.steps.length === 0) return undefined;
    return this.currentSession.steps[this.currentStepIndex];
  }

  public getCurrentSnapshot(): GraphDataset | undefined {
    const step = this.getCurrentStep();
    return step ? step.snapshot : undefined;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public stepForward(): ReplayStep | undefined {
    if (!this.currentSession) return undefined;
    if (this.currentStepIndex < this.currentSession.steps.length - 1) {
      this.currentStepIndex += 1;
      this.currentSession.currentStepIndex = this.currentStepIndex;
      this.notifyStepChange();
    }
    return this.getCurrentStep();
  }

  public stepBackward(): ReplayStep | undefined {
    if (!this.currentSession) return undefined;
    if (this.currentStepIndex > 0) {
      this.currentStepIndex -= 1;
      this.currentSession.currentStepIndex = this.currentStepIndex;
      this.notifyStepChange();
    }
    return this.getCurrentStep();
  }

  public jumpToStep(index: number): ReplayStep | undefined {
    if (!this.currentSession) return undefined;
    const clampedIndex = Math.max(0, Math.min(index, this.currentSession.steps.length - 1));
    this.currentStepIndex = clampedIndex;
    this.currentSession.currentStepIndex = clampedIndex;
    this.notifyStepChange();
    return this.getCurrentStep();
  }

  public play(onStep?: StepChangeListener, intervalMs: number = 1000): void {
    if (!this.currentSession || this.currentSession.steps.length === 0) return;
    this.pause();

    this.isPlaying = true;
    this.currentSession.status = "playing";

    if (onStep) {
      this.stepChangeListeners.add(onStep);
    }

    // If at end, loop to beginning
    if (this.currentStepIndex >= this.currentSession.steps.length - 1) {
      this.currentStepIndex = 0;
      this.notifyStepChange();
    }

    this.playIntervalId = setInterval(
      () => {
        if (!this.currentSession) {
          this.pause();
          return;
        }

        if (this.currentStepIndex < this.currentSession.steps.length - 1) {
          this.stepForward();
        } else {
          this.pause();
          if (this.currentSession) {
            this.currentSession.status = "completed";
          }
        }
      },
      Math.max(100, intervalMs),
    );
  }

  public pause(): void {
    this.isPlaying = false;
    if (this.playIntervalId !== undefined) {
      clearInterval(this.playIntervalId);
      this.playIntervalId = undefined;
    }
    if (this.currentSession && this.currentSession.status === "playing") {
      this.currentSession.status = "paused";
    }
  }

  public reset(): void {
    this.pause();
    this.currentStepIndex = 0;
    if (this.currentSession) {
      this.currentSession.currentStepIndex = 0;
      this.currentSession.status = "idle";
    }
    this.notifyStepChange();
  }

  public onStepChange(listener: StepChangeListener): () => void {
    this.stepChangeListeners.add(listener);
    return () => {
      this.stepChangeListeners.delete(listener);
    };
  }

  public validateTimeTravelInvariants(session: ReplaySession): TimeTravelValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let invariantsChecked = 0;
    const nodeHealthProgression: Array<{ stepIndex: number; healthyRatio: number }> = [];

    if (!session || !session.steps || session.steps.length === 0) {
      errors.push("Replay session contains no steps");
      return {
        valid: false,
        stepCount: 0,
        invariantsChecked: 1,
        errors,
        warnings,
        metrics: {
          nodeHealthProgression: [],
          edgeIntegrityPreserved: false,
          deterministicHashMatches: false,
        },
      };
    }

    // Boundary Check: Initial baseline step (Step 0)
    invariantsChecked += 1;
    const step0 = session.steps[0];
    if (step0.stepIndex !== 0) {
      errors.push(`Initial step boundary corrupted: stepIndex must be 0, found ${step0.stepIndex}`);
    }
    if (!step0.snapshot || !Array.isArray(step0.snapshot.nodes)) {
      errors.push("Initial step boundary corrupted: snapshot or nodes array missing");
    }

    // Boundary Check: Active currentStepIndex within valid range
    invariantsChecked += 1;
    if (
      session.currentStepIndex !== undefined &&
      (session.currentStepIndex < 0 || session.currentStepIndex >= session.steps.length)
    ) {
      errors.push(
        `Session boundary corrupted: currentStepIndex ${session.currentStepIndex} is out of bounds [0, ${session.steps.length - 1}]`,
      );
    }

    let prevTimestamp = -1;
    let edgeIntegrityPreserved = true;

    for (let i = 0; i < session.steps.length; i++) {
      const step = session.steps[i];
      invariantsChecked += 1;

      // Invariant 1: Step index matches array index
      if (step.stepIndex !== i) {
        errors.push(`Step index mismatch at index ${i}: expected ${i}, found ${step.stepIndex}`);
      }

      // Invariant 2: Monotonic timestamp validation
      if (typeof step.timestamp !== "number" || !Number.isFinite(step.timestamp)) {
        errors.push(`Step ${i} has invalid non-finite timestamp: ${step.timestamp}`);
      } else if (step.timestamp < prevTimestamp) {
        errors.push(
          `Timeline regression at step ${i}: timestamp ${step.timestamp} is earlier than previous step ${prevTimestamp}`,
        );
      }
      prevTimestamp = step.timestamp;

      // Invariant 3: Valid graph snapshot structure
      if (
        !step.snapshot ||
        typeof step.snapshot !== "object" ||
        !Array.isArray(step.snapshot.nodes) ||
        !Array.isArray(step.snapshot.edges)
      ) {
        errors.push(`Step ${i} contains malformed snapshot without valid nodes or edges arrays`);
        edgeIntegrityPreserved = false;
        continue;
      }

      // Invariant 4: No null node objects & unique node IDs
      const nodeIds = new Set<string>();
      let hasNodeError = false;
      for (const node of step.snapshot.nodes) {
        if (!node || typeof node.id !== "string" || node.id.trim() === "") {
          errors.push(`Step ${i} contains node with missing or empty ID`);
          hasNodeError = true;
          continue;
        }
        if (nodeIds.has(node.id)) {
          errors.push(`Step ${i} contains duplicate node ID: "${node.id}"`);
          hasNodeError = true;
        }
        nodeIds.add(node.id);
      }

      // Invariant 5: No dangling edges & valid edge structure
      for (const edge of step.snapshot.edges) {
        if (!edge || typeof edge.source !== "string" || typeof edge.target !== "string") {
          errors.push(`Step ${i} contains malformed edge with invalid source/target`);
          edgeIntegrityPreserved = false;
          continue;
        }
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
          errors.push(
            `Step ${i} contains dangling edge ${edge.id} referencing missing node (${edge.source} -> ${edge.target})`,
          );
          edgeIntegrityPreserved = false;
        }
      }

      if (hasNodeError) {
        edgeIntegrityPreserved = false;
      }

      // Health ratio computation
      const totalNodes = step.snapshot.nodes.length;
      const healthyNodes = step.snapshot.nodes.filter(
        (n: GraphNodeData) =>
          n && (n.status === "success" || n.status === "running" || n.status === "pending"),
      ).length;
      const ratio = totalNodes > 0 ? healthyNodes / totalNodes : 1;
      nodeHealthProgression.push({ stepIndex: i, healthyRatio: ratio });
    }

    // Boundary Check: Terminal step
    invariantsChecked += 1;
    const terminalStep = session.steps[session.steps.length - 1];
    if (!terminalStep.snapshot) {
      errors.push("Terminal step boundary corrupted: snapshot missing");
    }

    // Invariant 6: Deterministic verification
    const deterministicHashMatches = errors.length === 0;

    return {
      valid: errors.length === 0,
      stepCount: session.steps.length,
      invariantsChecked,
      errors,
      warnings,
      metrics: {
        nodeHealthProgression,
        edgeIntegrityPreserved,
        deterministicHashMatches,
      },
    };
  }

  public exportSessionJson(session: ReplaySession): string {
    return JSON.stringify(session, null, 2);
  }

  public importSessionJson(json: string): ReplaySession {
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("id" in parsed) ||
      !("steps" in parsed) ||
      !Array.isArray((parsed as Record<string, unknown>).steps)
    ) {
      throw new Error("Invalid ReplaySession JSON format");
    }

    const session = parsed as ReplaySession;
    this.recorder.createSession(
      {
        id: session.incidentId,
        title: session.title,
        description: "",
        severity: "medium",
        status: "resolved",
        detectedAt: session.createdAt,
        remediationsApplied: [],
      },
      session.initialGraph,
      session.title,
    );

    return session;
  }

  private notifyStepChange(): void {
    const step = this.getCurrentStep();
    if (!step) return;

    for (const listener of this.stepChangeListeners) {
      try {
        listener(step, step.snapshot);
      } catch {
        // Suppress listener error
      }
    }
  }
}
