import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGraphDataset, type JsonGraphDataset } from "../src/state/graphSchema";
import { findContractViolations } from "./capsule-contract";

export interface ImportOptions {
  capsulePath: string;
  outputDir?: string;
}

export interface ImportResult {
  graphId: string;
  outputPath: string;
  dataset: JsonGraphDataset;
  warnings: string[];
}

/**
 * Thrown only when there is no graph to draw at all: the bytes are not a JSON object, or they carry
 * no `nodes` and `edges` arrays. Every lesser departure is a warning, because a document the
 * renderer only half understands still shows the half it does.
 */
export class CapsuleValidationError extends Error {
  readonly issues: string[];

  constructor(source: string, issues: string[]) {
    super(
      `${source} cannot be read as a graph:\n` +
        issues.map((issue) => `  - ${issue}`).join("\n") +
        `\nA graph document must be a JSON object carrying nodes and edges arrays; everything ` +
        `beyond those is optional and anything unrecognised is ignored.`,
    );
    this.name = "CapsuleValidationError";
    this.issues = issues;
  }
}

/**
 * The run's task vocabulary projected onto the graph's node vocabulary. `branched` is not terminal:
 * the parent's lease is suspended while its sub-agents work, so the node is still running.
 */
const TASK_STATUS_TO_NODE_STATUS: Readonly<Record<string, string>> = {
  proposed: "pending",
  ready: "pending",
  blocked: "warning",
  leased: "running",
  running: "running",
  branched: "running",
  submitted: "running",
  validating: "running",
  gating: "running",
  validated: "success",
  done: "success",
  changes_requested: "warning",
  retry_ready: "warning",
  stale: "warning",
  escalated: "error",
  cancelled: "skipped",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    const text = readText(entry);
    if (text !== undefined) items.push(text);
  }
  return items;
}

interface StateTaskView {
  id: string;
  label: string;
  /** Absent when the ledger entry carried none. It is never filled in with a plausible status. */
  status?: string;
  /** Only the role the lease actually recorded; an unclaimed task has no recorded role. */
  role?: string;
  dependencies: string[];
}

function readStateTasks(state: Record<string, unknown>): StateTaskView[] {
  const tasks = asRecord(state.tasks);
  if (tasks === undefined) return [];

  const views: StateTaskView[] = [];
  for (const [key, value] of Object.entries(tasks)) {
    const record = asRecord(value);
    if (record === undefined) continue;
    const id = readText(record.id) ?? key;
    const status = readText(record.status);
    const role = readText(asRecord(record.lease)?.role);
    views.push({
      id,
      label: readText(record.label) ?? id,
      ...(status === undefined ? {} : { status }),
      ...(role === undefined ? {} : { role }),
      dependencies: readStringArray(record.dependencies),
    });
  }
  return views;
}

interface StateBranchView {
  id: string;
  parentTaskId: string;
  reason: string;
  status?: string;
  subTasks: Array<{ id: string; label: string; status?: string }>;
}

function readStateBranches(state: Record<string, unknown>): StateBranchView[] {
  // The ledger writes `branches` as an array and only as an array; there is no second shape to
  // tolerate here, and inventing one would be the dual-mode reading this importer exists to end.
  const entries = Array.isArray(state.branches) ? state.branches : [];

  const views: StateBranchView[] = [];
  for (const entry of entries) {
    const record = asRecord(entry);
    const id = readText(record?.id);
    const parentTaskId = readText(record?.parent_task_id);
    if (record === undefined || id === undefined || parentTaskId === undefined) continue;

    const subTasks: StateBranchView["subTasks"] = [];
    for (const subEntry of Array.isArray(record.sub_tasks) ? record.sub_tasks : []) {
      const sub = asRecord(subEntry);
      const subId = readText(sub?.id);
      if (sub === undefined || subId === undefined) continue;
      const subStatus = readText(sub.status);
      subTasks.push({
        id: subId,
        label: readText(sub.label) ?? subId,
        ...(subStatus === undefined ? {} : { status: subStatus }),
      });
    }

    const branchStatus = readText(record.status);
    views.push({
      id,
      parentTaskId,
      reason: readText(record.reason) ?? "",
      ...(branchStatus === undefined ? {} : { status: branchStatus }),
      subTasks,
    });
  }
  return views;
}

const SUB_TASK_STATUS_TO_NODE_STATUS: Readonly<Record<string, string>> = {
  open: "pending",
  claimed: "running",
  branched: "running",
  submitted: "success",
  abandoned: "skipped",
};

/**
 * The fallback used when a capsule has no generated summary. It is a projection of the recorded
 * state and nothing more.
 *
 * Nothing here is filled in: a status the map does not recognise leaves `node.status` absent (the
 * raw ledger value stays in `metadata` so it is still inspectable) rather than being rounded to
 * "pending", and the role is taken only from the lease that actually recorded one. The graph never
 * asserts that a task was worked by an implementer just because most tasks are.
 */
function datasetFromState(state: Record<string, unknown>, runId: string): JsonGraphDataset {
  const tasks = readStateTasks(state);
  const branches = readStateBranches(state);
  const taskNodeId = (taskId: string) => `node-${taskId}`;

  const nodes: Record<string, unknown>[] = tasks.map((task) => {
    const status = task.status === undefined ? undefined : TASK_STATUS_TO_NODE_STATUS[task.status];
    const metadata: Record<string, unknown> = {};
    if (task.status !== undefined) metadata.taskStatus = task.status;
    if (task.role !== undefined) metadata.role = task.role;
    return {
      id: taskNodeId(task.id),
      name: task.label,
      kind: "agent",
      ...(status === undefined ? {} : { status }),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
  });

  const nodeIds = new Set(nodes.map((node) => String(node.id)));
  const edges: Record<string, unknown>[] = [];

  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!nodeIds.has(taskNodeId(dependency))) continue;
      edges.push({
        id: `edge-dep-${dependency}-${task.id}`,
        source: taskNodeId(dependency),
        target: taskNodeId(task.id),
        kind: "dependency",
      });
    }
  }

  const sections: Record<string, unknown>[] = [];
  for (const branch of branches) {
    const parentNodeId = taskNodeId(branch.parentTaskId);
    const regionNodeIds: string[] = [];

    for (const subTask of branch.subTasks) {
      const subNodeId = `node-${branch.id}-${subTask.id}`;
      const subStatus =
        subTask.status === undefined ? undefined : SUB_TASK_STATUS_TO_NODE_STATUS[subTask.status];
      // The ledger records that this was a branch sub-task; it does NOT record which sub-role the
      // sub-agent held. The branch region and the branch/collect edges carry the real relationship,
      // so no role is asserted here.
      const metadata: Record<string, unknown> = { branchId: branch.id };
      if (subTask.status !== undefined) metadata.subTaskStatus = subTask.status;
      nodes.push({
        id: subNodeId,
        name: subTask.label,
        kind: "agent",
        ...(subStatus === undefined ? {} : { status: subStatus }),
        metadata,
      });
      nodeIds.add(subNodeId);
      regionNodeIds.push(subNodeId);

      if (nodeIds.has(parentNodeId)) {
        edges.push({
          id: `edge-branch-${branch.id}-${subTask.id}`,
          source: parentNodeId,
          target: subNodeId,
          kind: "branch",
        });
        edges.push({
          id: `edge-collect-${branch.id}-${subTask.id}`,
          source: subNodeId,
          target: parentNodeId,
          kind: "collect",
        });
      }
    }

    sections.push({
      id: `section-${branch.id}`,
      title: `Branch ${branch.id}`,
      nodeIds: regionNodeIds,
      ...(branch.status === undefined ? {} : { status: branch.status }),
      ...(nodeIds.has(parentNodeId) ? { parentNodeId } : {}),
      ...(branch.reason.length > 0 ? { reason: branch.reason } : {}),
    });
  }

  return {
    id: runId,
    title: `Execution Trajectory: ${runId}`,
    directed: true,
    nodes,
    edges,
    ...(sections.length > 0 ? { sections } : {}),
  };
}

function parseJsonFile(path: string): unknown {
  const raw = readFileSync(path, "utf-8");
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    throw new Error(
      `${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function importCapsule(options: ImportOptions): ImportResult {
  const resolvedCapsule = isAbsolute(options.capsulePath)
    ? options.capsulePath
    : resolve(process.cwd(), options.capsulePath);

  if (!existsSync(resolvedCapsule)) {
    throw new Error(`Capsule directory does not exist: ${resolvedCapsule}`);
  }

  const graphJsonPath = join(resolvedCapsule, "summary", "graph.json");
  const stateJsonPath = join(resolvedCapsule, "state.json");

  let candidate: unknown;
  let source: string;

  if (existsSync(graphJsonPath)) {
    candidate = parseJsonFile(graphJsonPath);
    source = graphJsonPath;
  } else if (existsSync(stateJsonPath)) {
    const state = asRecord(parseJsonFile(stateJsonPath));
    if (state === undefined) {
      throw new Error(`${stateJsonPath} must contain a JSON object with a "tasks" map`);
    }
    candidate = datasetFromState(state, basename(resolvedCapsule));
    source = stateJsonPath;
  } else {
    throw new Error(`Neither summary/graph.json nor state.json found under: ${resolvedCapsule}`);
  }

  const validation = validateGraphDataset(candidate, { sourceId: basename(resolvedCapsule) });
  if (validation.dataset === undefined) {
    throw new CapsuleValidationError(source, validation.errors);
  }

  // A field the current contract no longer reads is reported and then left alone. Refusing the
  // whole capsule over one superseded key would mean a producer could not add or retire a field
  // without every reader being updated first; the graph draws from the fields it does understand.
  const dataset = validation.dataset;
  const warnings = [...validation.warnings, ...findContractViolations(dataset)];

  const graphsDir = options.outputDir
    ? isAbsolute(options.outputDir)
      ? options.outputDir
      : resolve(process.cwd(), options.outputDir)
    : fileURLToPath(new URL("../public/data/graphs", import.meta.url));

  if (!existsSync(graphsDir)) {
    mkdirSync(graphsDir, { recursive: true });
  }

  const slug = dataset.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const outputPath = join(graphsDir, `${slug}.json`);
  writeFileSync(outputPath, JSON.stringify(dataset, null, 2) + "\n", "utf-8");

  const manifestPath = join(graphsDir, "manifest.json");
  let manifest: string[] = [];
  if (existsSync(manifestPath)) {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf-8")) as unknown;
    manifest = readStringArray(parsed);
  }
  if (!manifest.includes(slug)) {
    manifest.push(slug);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  }

  return { graphId: slug, outputPath, dataset, warnings };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  let capsulePath = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--capsule" && i + 1 < args.length) {
      capsulePath = args[i + 1]!;
      i++;
    } else if (!args[i]!.startsWith("--") && !capsulePath) {
      capsulePath = args[i]!;
    }
  }

  if (!capsulePath) {
    console.error("Usage: bun scripts/import-capsule.ts --capsule <capsule_path>");
    process.exit(1);
  }

  try {
    const result = importCapsule({ capsulePath });
    for (const warning of result.warnings) {
      console.warn(`⚠️  ${warning}`);
    }
    console.log(`✨ Successfully imported execution graph into GVUI!`);
    console.log(`- Graph ID: ${result.graphId}`);
    console.log(`- Nodes: ${result.dataset.nodes.length} | Edges: ${result.dataset.edges.length}`);
    console.log(`- Output File: ${result.outputPath}`);
    console.log(`- Preview URL: http://localhost:4444/?graph=${result.graphId}`);
  } catch (err: unknown) {
    console.error(`❌ Import failed:`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
