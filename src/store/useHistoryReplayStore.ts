import { create } from "zustand";
import type {
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  NodeKind,
  NodeStatus,
} from "../types/graphData";
import type {
  BookmarkCategory,
  EdgeDelta,
  JsonlParseIssue,
  NodeDelta,
  ParseEventsResult,
  PropertyDelta,
  ReplayBookmark,
  ReplayEvent,
  ReplayLeaseInfo,
  ReplaySpeed,
  ReplayStateSnapshot,
  ReplayTaskInfo,
  StateDiffResult,
} from "../components/HistoryReplay/types";

// ============================================================================
// JSONL Parsing Engine
// ============================================================================

/**
 * Robust line-by-line JSONL parser handling multiline payloads, corrupt lines, and whitespace.
 */
export function parseEventsJsonl(rawText: string): ParseEventsResult {
  const events: ReplayEvent[] = [];
  const issues: JsonlParseIssue[] = [];

  if (!rawText || typeof rawText !== "string") {
    return {
      events: [],
      issues: [],
      totalParsed: 0,
      totalErrors: 0,
    };
  }

  const rawLines = rawText.split(/\r?\n/);
  let buffer = "";
  let bufferStartLine = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i] ?? "";
    const trimmed = rawLine.trim();

    // Skip empty lines if not buffering
    if (!trimmed && !buffer) {
      continue;
    }

    // If we have an existing buffer, check if the new line looks like a fresh standalone JSON object
    // If it does, and the buffer is unparseable, flush the buffer as an issue first
    if (buffer) {
      const isCandidateNewObject = trimmed.startsWith("{") && trimmed.includes('"');
      if (isCandidateNewObject) {
        try {
          const testParsed = JSON.parse(trimmed) as unknown;
          if (typeof testParsed === "object" && testParsed !== null && !Array.isArray(testParsed)) {
            // The new line is valid JSON on its own! The previous buffer was corrupt/unclosed.
            issues.push({
              lineIndex: bufferStartLine,
              rawText: buffer,
              error: "Unterminated or malformed JSON buffer",
            });
            buffer = "";
          }
        } catch {}
      }
    }

    if (!buffer) {
      bufferStartLine = i + 1;
    }

    buffer = buffer ? `${buffer}\n${rawLine}` : rawLine;

    // Check if buffer can be parsed as valid JSON
    try {
      const parsed = JSON.parse(buffer) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const parsedRecord = parsed as Record<string, unknown>;
        const normalized = normalizeEventRecord(parsedRecord, buffer, events.length);
        events.push(normalized);
        buffer = "";
      } else {
        issues.push({
          lineIndex: bufferStartLine,
          rawText: buffer,
          error: "JSON is not an object",
        });
        buffer = "";
      }
    } catch (err: unknown) {
      // If we are at the last line, or if this single line cannot be continued, record issue
      const openBraces = (buffer.match(/\{/g) || []).length;
      const closeBraces = (buffer.match(/\}/g) || []).length;

      if (openBraces > closeBraces && i < rawLines.length - 1) {
        // Likely multiline payload, continue accumulating lines
        continue;
      }

      // Malformed single line or unresolvable buffer
      issues.push({
        lineIndex: bufferStartLine,
        rawText: buffer,
        error: err instanceof Error ? err.message : String(err),
      });
      buffer = "";
    }
  }

  // Flush remaining buffer if any
  if (buffer) {
    try {
      const parsed = JSON.parse(buffer) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const parsedRecord = parsed as Record<string, unknown>;
        const normalized = normalizeEventRecord(parsedRecord, buffer, events.length);
        events.push(normalized);
      } else {
        issues.push({
          lineIndex: bufferStartLine,
          rawText: buffer,
          error: "JSON is not an object",
        });
      }
    } catch (err: unknown) {
      issues.push({
        lineIndex: bufferStartLine,
        rawText: buffer,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    events,
    issues,
    totalParsed: events.length,
    totalErrors: issues.length,
  };
}

/**
 * Normalizes an arbitrary parsed JSON object into a typed ReplayEvent.
 */
function normalizeEventRecord(
  rec: Record<string, unknown>,
  raw: string,
  eventIndex: number,
): ReplayEvent {
  const sequence =
    typeof rec.sequence === "number"
      ? rec.sequence
      : typeof rec.event_sequence === "number"
        ? rec.event_sequence
        : eventIndex + 1;

  const id =
    typeof rec.hash === "string"
      ? rec.hash
      : typeof rec.id === "string"
        ? rec.id
        : `event-seq-${sequence}-${eventIndex}`;

  const timestamp =
    typeof rec.timestamp === "string"
      ? rec.timestamp
      : typeof rec.at === "string"
        ? rec.at
        : new Date().toISOString();

  const kind =
    typeof rec.kind === "string" ? rec.kind : typeof rec.type === "string" ? rec.type : "event";

  const actor =
    typeof rec.actor === "string"
      ? rec.actor
      : typeof rec.agent_id === "string"
        ? rec.agent_id
        : typeof rec.author === "string"
          ? rec.author
          : "system";

  const payload =
    typeof rec.payload === "object" && rec.payload !== null
      ? (rec.payload as Record<string, unknown>)
      : {};

  const projection =
    typeof rec.projection === "object" && rec.projection !== null
      ? (rec.projection as Record<string, unknown>)
      : undefined;

  // Failure heuristics
  const isFailure =
    kind.includes("reject") ||
    kind.includes("fail") ||
    kind.includes("error") ||
    kind === "task:reject" ||
    kind === "gate:fail" ||
    payload.status === "error" ||
    payload.status === "rejected" ||
    payload.status === "failed" ||
    (typeof payload.exitCode === "number" && payload.exitCode !== 0) ||
    (typeof payload.exit_code === "number" && payload.exit_code !== 0);

  // Critic review heuristics
  const isCritic =
    kind.startsWith("critic") ||
    kind.includes("review") ||
    kind === "critic:start" ||
    kind === "critic:review" ||
    kind === "review-recorded" ||
    kind === "critic-assigned" ||
    kind === "completion-reviewed";

  // Milestone heuristics
  const isMilestone =
    kind === "plan-compiled" ||
    kind === "run-completed" ||
    kind === "all-tasks-finished" ||
    kind === "tasks-completed" ||
    kind.includes("milestone") ||
    kind === "phase-complete" ||
    sequence === 1;

  // Summary generation
  let summary = "";
  if (typeof payload.summary === "string") {
    summary = payload.summary;
  } else if (typeof rec.summary === "string") {
    summary = rec.summary;
  } else if (typeof payload.goal === "string") {
    summary = payload.goal;
  } else if (typeof payload.task_id === "string") {
    summary = `${kind}: ${payload.task_id}`;
  } else {
    summary = `${kind} by ${actor}`;
  }

  const tags: string[] = [];
  if (isFailure) tags.push("failure");
  if (isCritic) tags.push("critic");
  if (isMilestone) tags.push("milestone");

  return {
    id,
    sequence,
    timestamp,
    kind,
    actor,
    payload,
    projection,
    raw,
    isFailure,
    isCritic,
    isMilestone,
    summary,
    tags,
  };
}

// ============================================================================
// State Snapshot Generator Engine
// ============================================================================

/**
 * Reconstructs complete dataset, task, and lease state at historical point eventIndex.
 */
export function getStateAtEvent(
  eventIndex: number,
  events: readonly ReplayEvent[],
): ReplayStateSnapshot {
  if (!events || events.length === 0) {
    const emptyDataset: GraphDataset = {
      id: "empty-trajectory",
      title: "No Events Loaded",
      nodes: [],
      edges: [],
    };
    const dummyEvent: ReplayEvent = {
      id: "event-none",
      sequence: 0,
      timestamp: new Date().toISOString(),
      kind: "none",
      actor: "system",
      payload: {},
      isFailure: false,
      isCritic: false,
      isMilestone: false,
    };
    return {
      eventIndex: 0,
      event: dummyEvent,
      dataset: emptyDataset,
      tasks: {},
      leases: {},
      activeAgents: [],
      failedEntities: [],
      summary: {
        totalNodes: 0,
        totalEdges: 0,
        activeLeases: 0,
        completedTasks: 0,
        failedTasks: 0,
        runningTasks: 0,
        pendingTasks: 0,
      },
    };
  }

  const targetIndex = Math.max(0, Math.min(eventIndex, events.length - 1));
  const currentEvent = events[targetIndex]!;

  const taskMap = new Map<string, ReplayTaskInfo>();
  const leaseMap = new Map<string, ReplayLeaseInfo>();
  const nodeMap = new Map<string, GraphNodeData>();
  const edgeMap = new Map<string, GraphEdgeData>();
  const failedSet = new Set<string>();

  // Progressively fold events from 0 up to targetIndex
  for (let i = 0; i <= targetIndex; i++) {
    const ev = events[i]!;
    const { kind, actor, payload, projection, timestamp } = ev;

    // 1. Process Projection if provided by harness
    if (projection) {
      if (projection.tasks && typeof projection.tasks === "object") {
        const projTasks = projection.tasks as Record<string, Record<string, unknown>>;
        for (const [taskId, taskData] of Object.entries(projTasks)) {
          const status = normalizeStatus(taskData.status);
          const label =
            typeof taskData.label === "string"
              ? taskData.label
              : typeof taskData.id === "string"
                ? taskData.id
                : taskId;

          let leaseInfo: ReplayLeaseInfo | null = null;
          if (taskData.lease && typeof taskData.lease === "object") {
            const l = taskData.lease as Record<string, unknown>;
            leaseInfo = {
              taskId,
              agentId: typeof l.agent_id === "string" ? l.agent_id : actor,
              role: typeof l.role === "string" ? l.role : undefined,
              issuedAt: typeof l.issued_at === "string" ? l.issued_at : timestamp,
              expiresAt: typeof l.expires_at === "string" ? l.expires_at : undefined,
              tokenDigest: typeof l.token_digest === "string" ? l.token_digest : undefined,
              writeScope: Array.isArray(l.write_scope)
                ? (l.write_scope as unknown[]).filter((s): s is string => typeof s === "string")
                : undefined,
              status: typeof l.status === "string" ? l.status : "active",
            };
            leaseMap.set(taskId, leaseInfo);
          } else if (status === "success" || status === "cached") {
            leaseMap.delete(taskId);
          }

          const taskInfo: ReplayTaskInfo = {
            id: taskId,
            label,
            status,
            priority: typeof taskData.priority === "number" ? taskData.priority : 50,
            effort: typeof taskData.effort === "number" ? taskData.effort : 3,
            actor:
              typeof taskData.original_implementer === "string"
                ? taskData.original_implementer
                : actor,
            writeScope: Array.isArray(taskData.write_scope)
              ? (taskData.write_scope as unknown[]).filter(
                  (s): s is string => typeof s === "string",
                )
              : undefined,
            lease: leaseInfo,
            requirementIds: Array.isArray(taskData.requirement_ids)
              ? (taskData.requirement_ids as unknown[]).filter(
                  (r): r is string => typeof r === "string",
                )
              : undefined,
            artifactIds: Array.isArray(taskData.artifact_ids)
              ? (taskData.artifact_ids as unknown[]).filter(
                  (a): a is string => typeof a === "string",
                )
              : undefined,
          };
          taskMap.set(taskId, taskInfo);

          // Update corresponding node in graph
          const existingNode = nodeMap.get(taskId);
          const nodeKind: NodeKind = mapTaskKind(taskId, taskData);
          nodeMap.set(taskId, {
            id: taskId,
            name: label,
            kind: nodeKind,
            status: status as NodeStatus,
            step: i + 1,
            stepLabel: `Step ${i + 1}`,
            badges: [
              {
                label: status.toUpperCase(),
                variant: status === "success" ? "success" : status === "error" ? "error" : "info",
              },
            ],
            metadata: {
              ...(existingNode?.metadata ?? {}),
              writeScope: taskInfo.writeScope,
              leaseAgent: leaseInfo?.agentId,
            },
          });

          if (status === "error") {
            failedSet.add(taskId);
          } else if (status === "success") {
            failedSet.delete(taskId);
          }
        }
      }

      // Graph nodes in projection
      if (
        projection.graph &&
        typeof projection.graph === "object" &&
        (projection.graph as Record<string, unknown>).nodes &&
        Array.isArray((projection.graph as Record<string, unknown>).nodes)
      ) {
        const rawGraphNodes = (projection.graph as Record<string, unknown>).nodes as Array<
          Record<string, unknown>
        >;
        for (const gn of rawGraphNodes) {
          if (typeof gn.id === "string") {
            const nodeId = gn.id;
            const nodeLabel = typeof gn.label === "string" ? gn.label : nodeId;
            const nodeType = typeof gn.type === "string" ? gn.type : "node";
            const nodeKind: NodeKind = mapKindString(nodeType);
            const nodeStatus = normalizeStatus(gn.status);
            if (!nodeMap.has(nodeId)) {
              nodeMap.set(nodeId, {
                id: nodeId,
                name: nodeLabel,
                kind: nodeKind,
                status: nodeStatus as NodeStatus,
                step: i + 1,
              });
            }
          }
        }
      }

      // Graph edges in projection
      if (
        projection.graph &&
        typeof projection.graph === "object" &&
        (projection.graph as Record<string, unknown>).edges &&
        Array.isArray((projection.graph as Record<string, unknown>).edges)
      ) {
        const rawGraphEdges = (projection.graph as Record<string, unknown>).edges as Array<
          Record<string, unknown>
        >;
        for (const ge of rawGraphEdges) {
          if (typeof ge.source === "string" && typeof ge.target === "string") {
            const edgeId = `${ge.source}->${ge.target}`;
            edgeMap.set(edgeId, {
              id: edgeId,
              source: ge.source,
              target: ge.target,
              label: typeof ge.type === "string" ? ge.type : undefined,
              kind: mapEdgeKind(ge.type),
            });
          }
        }
      }
    }

    // 2. Incremental Event Actions
    const taskIdInPayload =
      typeof payload.task_id === "string"
        ? payload.task_id
        : typeof payload.id === "string"
          ? payload.id
          : null;

    if (kind === "plan-task-added" || kind === "task-added") {
      if (taskIdInPayload) {
        const label = typeof payload.label === "string" ? payload.label : taskIdInPayload;
        const taskInfo: ReplayTaskInfo = {
          id: taskIdInPayload,
          label,
          status: "pending",
        };
        taskMap.set(taskIdInPayload, taskInfo);
        nodeMap.set(taskIdInPayload, {
          id: taskIdInPayload,
          name: label,
          kind: "agent",
          status: "pending",
          step: i + 1,
        });
      }
    } else if (kind === "task-claimed" || kind === "task:claim") {
      if (taskIdInPayload) {
        const currentTask = taskMap.get(taskIdInPayload) ?? {
          id: taskIdInPayload,
          label: taskIdInPayload,
          status: "running",
        };
        const lease: ReplayLeaseInfo = {
          taskId: taskIdInPayload,
          agentId: actor,
          role: typeof payload.role === "string" ? payload.role : "implementer",
          issuedAt: timestamp,
        };
        currentTask.status = "running";
        currentTask.lease = lease;
        taskMap.set(taskIdInPayload, currentTask);
        leaseMap.set(taskIdInPayload, lease);

        const node = nodeMap.get(taskIdInPayload);
        if (node) {
          node.status = "running";
          node.badges = [{ label: "ACTIVE LEASE", variant: "info" }];
        }
      }
    } else if (
      kind === "task-submitted" ||
      kind === "validation-started" ||
      kind === "task:submit"
    ) {
      if (taskIdInPayload) {
        const currentTask = taskMap.get(taskIdInPayload);
        if (currentTask) {
          currentTask.status = "running";
        }
        const node = nodeMap.get(taskIdInPayload);
        if (node) {
          node.status = "running";
          node.badges = [{ label: "VALIDATING", variant: "amber" }];
        }
      }
    } else if (
      kind === "task-rejected" ||
      kind === "task:reject" ||
      kind === "validation-failed" ||
      kind === "gate:fail"
    ) {
      if (taskIdInPayload) {
        const currentTask = taskMap.get(taskIdInPayload);
        if (currentTask) {
          currentTask.status = "error";
        }
        failedSet.add(taskIdInPayload);
        const node = nodeMap.get(taskIdInPayload);
        if (node) {
          node.status = "error";
          node.badges = [{ label: "REJECTED", variant: "error" }];
        }
      }
    } else if (
      kind === "task-finished" ||
      kind === "tasks-completed" ||
      kind === "task:success" ||
      (kind === "review-recorded" && payload.verdict === "passed")
    ) {
      if (taskIdInPayload) {
        const currentTask = taskMap.get(taskIdInPayload);
        if (currentTask) {
          currentTask.status = "success";
        }
        leaseMap.delete(taskIdInPayload);
        failedSet.delete(taskIdInPayload);
        const node = nodeMap.get(taskIdInPayload);
        if (node) {
          node.status = "success";
          node.badges = [{ label: "COMPLETED", variant: "success" }];
        }
      }
    } else if (
      kind === "task-removed" ||
      kind === "node-removed" ||
      kind === "task:delete" ||
      kind === "task-pruned"
    ) {
      if (taskIdInPayload) {
        taskMap.delete(taskIdInPayload);
        nodeMap.delete(taskIdInPayload);
        leaseMap.delete(taskIdInPayload);
        failedSet.delete(taskIdInPayload);
        // Remove connected edges
        for (const [edgeId, edge] of edgeMap.entries()) {
          if (edge.source === taskIdInPayload || edge.target === taskIdInPayload) {
            edgeMap.delete(edgeId);
          }
        }
      }
    } else if (kind === "edge-removed" || kind === "edge:delete") {
      const edgeId =
        typeof payload.edge_id === "string"
          ? payload.edge_id
          : typeof payload.id === "string"
            ? payload.id
            : null;
      if (edgeId) {
        edgeMap.delete(edgeId);
      }
    }
  }

  // Derive final datasets and summary
  const nodes = Array.from(nodeMap.values());
  const edges = Array.from(edgeMap.values());
  const tasksObj: Record<string, ReplayTaskInfo> = {};
  for (const [k, v] of taskMap.entries()) {
    tasksObj[k] = v;
  }

  const leasesObj: Record<string, ReplayLeaseInfo> = {};
  for (const [k, v] of leaseMap.entries()) {
    leasesObj[k] = v;
  }

  const activeAgents = Array.from(new Set(Array.from(leaseMap.values()).map((l) => l.agentId)));

  let completedTasks = 0;
  let failedTasks = 0;
  let runningTasks = 0;
  let pendingTasks = 0;

  for (const task of taskMap.values()) {
    if (task.status === "success" || task.status === "cached") {
      completedTasks++;
    } else if (task.status === "error" || task.status === "rejected" || task.status === "failed") {
      failedTasks++;
    } else if (task.status === "running" || task.status === "leased") {
      runningTasks++;
    } else {
      pendingTasks++;
    }
  }

  const dataset: GraphDataset = {
    id: `snapshot-event-${currentEvent.sequence}`,
    title: `Execution Trajectory at Step ${targetIndex + 1} (Seq ${currentEvent.sequence})`,
    nodes,
    edges,
  };

  return {
    eventIndex: targetIndex,
    event: currentEvent,
    dataset,
    tasks: tasksObj,
    leases: leasesObj,
    activeAgents,
    failedEntities: Array.from(failedSet),
    summary: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      activeLeases: leaseMap.size,
      completedTasks,
      failedTasks,
      runningTasks,
      pendingTasks,
    },
  };
}

// Helpers for state reconstruction
function normalizeStatus(statusRaw: unknown): NodeStatus {
  if (typeof statusRaw !== "string") return "pending";
  const s = statusRaw.toLowerCase();
  if (s === "success" || s === "done" || s === "passed" || s === "completed") return "success";
  if (s === "error" || s === "failed" || s === "rejected") return "error";
  if (s === "running" || s === "leased" || s === "validating") return "running";
  if (s === "warning") return "warning";
  if (s === "cached") return "cached";
  if (s === "skipped") return "skipped";
  return "pending";
}

function mapKindString(kindRaw: string): NodeKind {
  const k = kindRaw.toLowerCase();
  if (k === "orchestrator") return "orchestrator";
  if (k === "agent" || k === "task") return "agent";
  if (k === "critic" || k === "validator") return "critic";
  if (k === "gate") return "gate";
  if (k === "tool") return "tool";
  if (k === "join") return "join";
  if (k === "router") return "router";
  if (k === "terminal") return "terminal";
  return "agent";
}

function mapTaskKind(taskId: string, data: Record<string, unknown>): NodeKind {
  if (taskId.includes("orchestrat")) return "orchestrator";
  if (taskId.includes("critic") || taskId.includes("review")) return "critic";
  if (taskId.includes("gate")) return "gate";
  if (typeof data.type === "string") return mapKindString(data.type);
  return "agent";
}

function mapEdgeKind(edgeType: unknown) {
  if (typeof edgeType !== "string") return undefined;
  const t = edgeType.toLowerCase();
  if (t === "produces" || t === "spawn") return "spawn";
  if (t === "data") return "data";
  if (t === "dependency") return "dependency";
  if (t === "critic" || t === "feedback") return "critic";
  if (t === "gate") return "gate";
  if (t === "loop") return "loop";
  return "sequence";
}

// ============================================================================
// State Diff Engine
// ============================================================================

/**
 * Calculates differential additions, removals, and modifications between state at indexA and indexB.
 */
export function diffStates(
  indexA: number,
  indexB: number,
  events: readonly ReplayEvent[],
): StateDiffResult {
  const snapshotA = getStateAtEvent(indexA, events);
  const snapshotB = getStateAtEvent(indexB, events);

  const nodesA = new Map(snapshotA.dataset.nodes.map((n) => [n.id, n]));
  const nodesB = new Map(snapshotB.dataset.nodes.map((n) => [n.id, n]));

  const addedNodes: GraphNodeData[] = [];
  const removedNodes: GraphNodeData[] = [];
  const modifiedNodes: NodeDelta[] = [];
  const propertyChanges: PropertyDelta[] = [];

  // Check additions and modifications in B
  for (const [id, nodeB] of nodesB.entries()) {
    const nodeA = nodesA.get(id);
    if (!nodeA) {
      addedNodes.push(nodeB);
      propertyChanges.push({
        entityId: id,
        entityType: "node",
        field: "existence",
        from: null,
        to: "added",
      });
    } else {
      const changedFields: string[] = [];
      let statusChanged = false;

      if (nodeA.status !== nodeB.status) {
        changedFields.push("status");
        statusChanged = true;
        propertyChanges.push({
          entityId: id,
          entityType: "node",
          field: "status",
          from: nodeA.status,
          to: nodeB.status,
        });
      }

      if (nodeA.name !== nodeB.name) {
        changedFields.push("name");
        propertyChanges.push({
          entityId: id,
          entityType: "node",
          field: "name",
          from: nodeA.name,
          to: nodeB.name,
        });
      }

      if (nodeA.kind !== nodeB.kind) {
        changedFields.push("kind");
        propertyChanges.push({
          entityId: id,
          entityType: "node",
          field: "kind",
          from: nodeA.kind,
          to: nodeB.kind,
        });
      }

      if (changedFields.length > 0) {
        modifiedNodes.push({
          nodeId: id,
          before: nodeA,
          after: nodeB,
          statusChanged,
          fromStatus: nodeA.status,
          toStatus: nodeB.status,
          changedFields,
        });
      }
    }
  }

  // Check removals in A
  for (const [id, nodeA] of nodesA.entries()) {
    if (!nodesB.has(id)) {
      removedNodes.push(nodeA);
      propertyChanges.push({
        entityId: id,
        entityType: "node",
        field: "existence",
        from: "present",
        to: null,
      });
    }
  }

  // Edges diff
  const edgesA = new Map(snapshotA.dataset.edges.map((e) => [e.id, e]));
  const edgesB = new Map(snapshotB.dataset.edges.map((e) => [e.id, e]));

  const addedEdges: GraphEdgeData[] = [];
  const removedEdges: GraphEdgeData[] = [];
  const modifiedEdges: EdgeDelta[] = [];

  for (const [id, edgeB] of edgesB.entries()) {
    const edgeA = edgesA.get(id);
    if (!edgeA) {
      addedEdges.push(edgeB);
      propertyChanges.push({
        entityId: id,
        entityType: "edge",
        field: "existence",
        from: null,
        to: "added",
      });
    } else {
      const changedFields: string[] = [];
      if (edgeA.label !== edgeB.label) {
        changedFields.push("label");
        propertyChanges.push({
          entityId: id,
          entityType: "edge",
          field: "label",
          from: edgeA.label,
          to: edgeB.label,
        });
      }
      if (edgeA.kind !== edgeB.kind) {
        changedFields.push("kind");
        propertyChanges.push({
          entityId: id,
          entityType: "edge",
          field: "kind",
          from: edgeA.kind,
          to: edgeB.kind,
        });
      }
      if (changedFields.length > 0) {
        modifiedEdges.push({
          edgeId: id,
          before: edgeA,
          after: edgeB,
          changedFields,
        });
      }
    }
  }

  for (const [id, edgeA] of edgesA.entries()) {
    if (!edgesB.has(id)) {
      removedEdges.push(edgeA);
      propertyChanges.push({
        entityId: id,
        entityType: "edge",
        field: "existence",
        from: "present",
        to: null,
      });
    }
  }

  // Leases diff
  const leasesA = snapshotA.leases;
  const leasesB = snapshotB.leases;

  const addedLeases: ReplayLeaseInfo[] = [];
  const releasedLeases: ReplayLeaseInfo[] = [];

  for (const [taskId, leaseB] of Object.entries(leasesB)) {
    if (!leasesA[taskId]) {
      addedLeases.push(leaseB);
      propertyChanges.push({
        entityId: taskId,
        entityType: "lease",
        field: "leaseGrant",
        from: null,
        to: leaseB.agentId,
      });
    }
  }

  for (const [taskId, leaseA] of Object.entries(leasesA)) {
    if (!leasesB[taskId]) {
      releasedLeases.push(leaseA);
      propertyChanges.push({
        entityId: taskId,
        entityType: "lease",
        field: "leaseRelease",
        from: leaseA.agentId,
        to: null,
      });
    }
  }

  const totalChanges =
    addedNodes.length +
    removedNodes.length +
    modifiedNodes.length +
    addedEdges.length +
    removedEdges.length +
    modifiedEdges.length +
    addedLeases.length +
    releasedLeases.length;

  return {
    indexA,
    indexB,
    sequenceA: snapshotA.event.sequence,
    sequenceB: snapshotB.event.sequence,
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    modifiedEdges,
    addedLeases,
    releasedLeases,
    propertyChanges,
    summary: {
      nodesAdded: addedNodes.length,
      nodesRemoved: removedNodes.length,
      nodesModified: modifiedNodes.length,
      edgesAdded: addedEdges.length,
      edgesRemoved: removedEdges.length,
      edgesModified: modifiedEdges.length,
      leasesGranted: addedLeases.length,
      leasesReleased: releasedLeases.length,
      totalChanges,
    },
  };
}

// ============================================================================
// Automatic Bookmarking Engine
// ============================================================================

/**
 * Extracts automatic failure, critic, and milestone bookmarks from normalized events.
 */
export function extractAutomaticBookmarks(events: readonly ReplayEvent[]): ReplayBookmark[] {
  const bookmarks: ReplayBookmark[] = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;

    if (ev.isFailure) {
      bookmarks.push({
        id: `auto-fail-${ev.id}`,
        eventIndex: i,
        sequence: ev.sequence,
        category: "failure",
        label: `Failure: ${ev.kind}`,
        note: ev.summary || `Failed at event ${ev.sequence}`,
        timestamp: ev.timestamp,
        actor: ev.actor,
        kind: ev.kind,
        isCustom: false,
      });
    } else if (ev.isCritic) {
      bookmarks.push({
        id: `auto-critic-${ev.id}`,
        eventIndex: i,
        sequence: ev.sequence,
        category: "critic",
        label: `Critic Review: ${ev.kind}`,
        note: ev.summary || `Review by ${ev.actor}`,
        timestamp: ev.timestamp,
        actor: ev.actor,
        kind: ev.kind,
        isCustom: false,
      });
    } else if (ev.isMilestone) {
      bookmarks.push({
        id: `auto-milestone-${ev.id}`,
        eventIndex: i,
        sequence: ev.sequence,
        category: "milestone",
        label: `Milestone: ${ev.kind}`,
        note: ev.summary || `Milestone reached at event ${ev.sequence}`,
        timestamp: ev.timestamp,
        actor: ev.actor,
        kind: ev.kind,
        isCustom: false,
      });
    }
  }

  return bookmarks;
}

// ============================================================================
// Zustand Store Definition
// ============================================================================

export interface HistoryReplayState {
  // Event Data
  rawJsonl: string;
  events: ReplayEvent[];
  parseIssues: JsonlParseIssue[];
  currentEventIndex: number;

  // Playback Control
  isPlaying: boolean;
  playbackSpeed: ReplaySpeed;
  isLooping: boolean;

  // Bookmarking
  bookmarks: ReplayBookmark[];
  filterBookmarkCategory: BookmarkCategory | "all";
  searchQuery: string;

  // Differential State Inspection
  selectedDiffIndices: { indexA: number; indexB: number } | null;
  isDiffModalOpen: boolean;

  // Actions
  loadEventsJsonl: (rawText: string) => ParseEventsResult;
  setEvents: (events: ReplayEvent[]) => void;
  seekToIndex: (index: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  toggleLoop: () => void;

  // Bookmark actions
  addBookmark: (
    eventIndex: number,
    label: string,
    note?: string,
    category?: BookmarkCategory,
  ) => ReplayBookmark;
  removeBookmark: (bookmarkId: string) => void;
  updateBookmark: (bookmarkId: string, updates: Partial<ReplayBookmark>) => void;
  setBookmarkCategoryFilter: (category: BookmarkCategory | "all") => void;
  setSearchQuery: (query: string) => void;
  jumpToNextBookmark: () => void;
  jumpToPrevBookmark: () => void;
  jumpToNextFailure: () => void;
  jumpToNextCritic: () => void;

  // Diff inspection actions
  setDiffIndices: (indexA: number, indexB: number) => void;
  openDiffModal: (indexA?: number, indexB?: number) => void;
  closeDiffModal: () => void;

  // Selectors / Helpers
  getCurrentSnapshot: () => ReplayStateSnapshot;
  getDiff: (indexA: number, indexB: number) => StateDiffResult;
}

export const useHistoryReplayStore = create<HistoryReplayState>((set, get) => ({
  rawJsonl: "",
  events: [],
  parseIssues: [],
  currentEventIndex: 0,
  isPlaying: false,
  playbackSpeed: 1,
  isLooping: false,
  bookmarks: [],
  filterBookmarkCategory: "all",
  searchQuery: "",
  selectedDiffIndices: null,
  isDiffModalOpen: false,

  loadEventsJsonl: (rawText: string) => {
    const parseResult = parseEventsJsonl(rawText);
    const autoBookmarks = extractAutomaticBookmarks(parseResult.events);

    set({
      rawJsonl: rawText,
      events: parseResult.events,
      parseIssues: parseResult.issues,
      currentEventIndex: 0,
      isPlaying: false,
      bookmarks: autoBookmarks,
    });

    return parseResult;
  },

  setEvents: (events: ReplayEvent[]) => {
    const autoBookmarks = extractAutomaticBookmarks(events);
    set({
      events,
      currentEventIndex: 0,
      isPlaying: false,
      bookmarks: autoBookmarks,
    });
  },

  seekToIndex: (index: number) => {
    const { events } = get();
    if (events.length === 0) {
      set({ currentEventIndex: 0 });
      return;
    }
    const clamped = Math.max(0, Math.min(index, events.length - 1));
    set({ currentEventIndex: clamped });
  },

  play: () => {
    const { events, currentEventIndex } = get();
    if (events.length === 0) return;
    if (currentEventIndex >= events.length - 1) {
      set({ currentEventIndex: 0, isPlaying: true });
    } else {
      set({ isPlaying: true });
    }
  },

  pause: () => {
    set({ isPlaying: false });
  },

  togglePlay: () => {
    const { isPlaying } = get();
    if (isPlaying) {
      get().pause();
    } else {
      get().play();
    }
  },

  stepForward: () => {
    const { currentEventIndex, events, isLooping } = get();
    if (events.length === 0) return;
    if (currentEventIndex < events.length - 1) {
      set({ currentEventIndex: currentEventIndex + 1 });
    } else if (isLooping) {
      set({ currentEventIndex: 0 });
    } else {
      set({ isPlaying: false });
    }
  },

  stepBackward: () => {
    const { currentEventIndex, events } = get();
    if (events.length === 0) return;
    if (currentEventIndex > 0) {
      set({ currentEventIndex: currentEventIndex - 1 });
    }
  },

  jumpToStart: () => {
    set({ currentEventIndex: 0 });
  },

  jumpToEnd: () => {
    const { events } = get();
    if (events.length === 0) return;
    set({ currentEventIndex: events.length - 1 });
  },

  setSpeed: (speed: ReplaySpeed) => {
    set({ playbackSpeed: speed });
  },

  toggleLoop: () => {
    set((state) => ({ isLooping: !state.isLooping }));
  },

  addBookmark: (
    eventIndex: number,
    label: string,
    note?: string,
    category: BookmarkCategory = "custom",
  ) => {
    const { events, bookmarks } = get();
    const clampedIndex = Math.max(0, Math.min(eventIndex, Math.max(0, events.length - 1)));
    const ev = events[clampedIndex];

    const newBookmark: ReplayBookmark = {
      id: `custom-bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      eventIndex: clampedIndex,
      sequence: ev ? ev.sequence : clampedIndex + 1,
      category,
      label,
      note,
      timestamp: ev ? ev.timestamp : new Date().toISOString(),
      actor: ev ? ev.actor : "user",
      kind: ev ? ev.kind : "bookmark",
      isCustom: true,
    };

    set({ bookmarks: [...bookmarks, newBookmark] });
    return newBookmark;
  },

  removeBookmark: (bookmarkId: string) => {
    set((state) => ({
      bookmarks: state.bookmarks.filter((b) => b.id !== bookmarkId),
    }));
  },

  updateBookmark: (bookmarkId: string, updates: Partial<ReplayBookmark>) => {
    set((state) => ({
      bookmarks: state.bookmarks.map((b) => (b.id === bookmarkId ? { ...b, ...updates } : b)),
    }));
  },

  setBookmarkCategoryFilter: (category: BookmarkCategory | "all") => {
    set({ filterBookmarkCategory: category });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  jumpToNextBookmark: () => {
    const { bookmarks, currentEventIndex } = get();
    const sorted = [...bookmarks].sort((a, b) => a.eventIndex - b.eventIndex);
    const next = sorted.find((b) => b.eventIndex > currentEventIndex);
    if (next) {
      set({ currentEventIndex: next.eventIndex });
    } else if (sorted.length > 0) {
      set({ currentEventIndex: sorted[0]!.eventIndex });
    }
  },

  jumpToPrevBookmark: () => {
    const { bookmarks, currentEventIndex } = get();
    const sorted = [...bookmarks].sort((a, b) => b.eventIndex - a.eventIndex);
    const prev = sorted.find((b) => b.eventIndex < currentEventIndex);
    if (prev) {
      set({ currentEventIndex: prev.eventIndex });
    } else if (sorted.length > 0) {
      set({ currentEventIndex: sorted[0]!.eventIndex });
    }
  },

  jumpToNextFailure: () => {
    const { bookmarks, currentEventIndex } = get();
    const failures = bookmarks
      .filter((b) => b.category === "failure")
      .sort((a, b) => a.eventIndex - b.eventIndex);
    const next = failures.find((b) => b.eventIndex > currentEventIndex);
    if (next) {
      set({ currentEventIndex: next.eventIndex });
    } else if (failures.length > 0) {
      set({ currentEventIndex: failures[0]!.eventIndex });
    }
  },

  jumpToNextCritic: () => {
    const { bookmarks, currentEventIndex } = get();
    const critics = bookmarks
      .filter((b) => b.category === "critic")
      .sort((a, b) => a.eventIndex - b.eventIndex);
    const next = critics.find((b) => b.eventIndex > currentEventIndex);
    if (next) {
      set({ currentEventIndex: next.eventIndex });
    } else if (critics.length > 0) {
      set({ currentEventIndex: critics[0]!.eventIndex });
    }
  },

  setDiffIndices: (indexA: number, indexB: number) => {
    set({ selectedDiffIndices: { indexA, indexB } });
  },

  openDiffModal: (indexA?: number, indexB?: number) => {
    const { currentEventIndex } = get();
    const idxB = indexB !== undefined ? indexB : currentEventIndex;
    const idxA = indexA !== undefined ? indexA : Math.max(0, idxB - 1);
    set({
      selectedDiffIndices: { indexA: idxA, indexB: idxB },
      isDiffModalOpen: true,
    });
  },

  closeDiffModal: () => {
    set({ isDiffModalOpen: false });
  },

  getCurrentSnapshot: () => {
    const { currentEventIndex, events } = get();
    return getStateAtEvent(currentEventIndex, events);
  },

  getDiff: (indexA: number, indexB: number) => {
    const { events } = get();
    return diffStates(indexA, indexB, events);
  },
}));
