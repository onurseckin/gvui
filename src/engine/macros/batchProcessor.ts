import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import { MacroExecutor } from "./macroExecutor";
import { UNKNOWN_LABEL } from "../../state/graphSchema";
import type {
  BatchElementTarget,
  BatchErrorPolicy,
  BatchExecutionResult,
  BatchItemResult,
  BatchProcessorOptions,
  GraphTargetAdapter,
  MacroScript,
  VariableContext,
} from "./types";

export class BatchProcessor {
  private target: GraphTargetAdapter;
  private isRunning: boolean = false;
  private abortController: AbortController | null = null;

  public constructor(target: GraphTargetAdapter) {
    this.target = target;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Executes a MacroScript across a collection of target elements.
   */
  public async executeBatch(
    script: MacroScript,
    elements: BatchElementTarget[],
    baseVariables: VariableContext = {},
    options?: BatchProcessorOptions,
  ): Promise<BatchExecutionResult> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startTime = Date.now();
    this.isRunning = true;
    this.abortController = new AbortController();

    const errorPolicy: BatchErrorPolicy = options?.errorPolicy ?? "continue-on-error";
    const speedMultiplier = options?.speedMultiplier ?? 0; // Instant execution by default for batch
    const totalElements = elements.length;
    const results: BatchItemResult[] = [];
    const errors: Array<{ elementId: string; error: string }> = [];

    // Capture initial graph snapshot for rollback-on-error policy
    const initialNodes: PositionedNode[] = this.target.getPositionedNodes().map((n) => ({ ...n }));
    const initialEdges: PositionedEdge[] = this.target.getPositionedEdges().map((e) => ({ ...e }));

    let succeededCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let finalStatus: BatchExecutionResult["status"] = "completed";

    try {
      for (let i = 0; i < elements.length; i++) {
        if (this.abortController.signal.aborted) {
          finalStatus = "aborted";
          break;
        }

        const element = elements[i];
        if (!element) {
          skippedCount++;
          continue;
        }

        options?.onProgress?.({
          completed: i,
          total: totalElements,
          currentItem: element.name ?? element.id,
        });

        // Construct element-specific context variables
        const elementVars: VariableContext = {
          ...baseVariables,
          elementId: element.id,
          elementName: element.name ?? element.id,
          elementKind: element.kind ?? UNKNOWN_LABEL,
          elementStatus: element.status ?? UNKNOWN_LABEL,
          targetId: element.id,
          nodeId: element.id,
          nodeName: element.name ?? element.id,
          $itemIndex: i,
          $totalItems: totalElements,
          ...(element.data ?? {}),
        };

        const itemStartTime = Date.now();
        const executor = new MacroExecutor(this.target, {
          speedMultiplier,
          initialVariables: elementVars,
        });

        const execState = await executor.execute(script, elementVars);
        const itemDuration = Date.now() - itemStartTime;
        const isSuccess = execState.status === "completed";

        const itemResult: BatchItemResult = {
          elementId: element.id,
          elementName: element.name,
          success: isSuccess,
          error:
            execState.errors.length > 0
              ? execState.errors.map((e) => e.error).join("; ")
              : undefined,
          durationMs: itemDuration,
          logs: execState.logs,
          executedSteps: execState.currentStepIndex,
        };

        results.push(itemResult);
        options?.onItemComplete?.(itemResult);

        if (isSuccess) {
          succeededCount++;
        } else {
          failedCount++;
          const errorMsg = itemResult.error ?? "Step execution failed";
          errors.push({ elementId: element.id, error: errorMsg });

          if (errorPolicy === "stop-on-error") {
            finalStatus = "failed";
            break;
          } else if (errorPolicy === "rollback-on-error") {
            finalStatus = "rolled-back";
            // Roll back to initial graph snapshot
            this.target.setPositionedGraph(initialNodes, initialEdges);
            break;
          }
        }
      }

      options?.onProgress?.({
        completed: totalElements,
        total: totalElements,
      });

      if (finalStatus !== "failed" && finalStatus !== "rolled-back" && finalStatus !== "aborted") {
        finalStatus = failedCount > 0 ? (succeededCount > 0 ? "completed" : "failed") : "completed";
      }
    } finally {
      this.isRunning = false;
    }

    const durationMs = Date.now() - startTime;

    return {
      batchId,
      scriptId: script.id,
      totalElements,
      succeededCount,
      failedCount,
      skippedCount,
      status: finalStatus,
      durationMs,
      results,
      errors,
    };
  }

  /**
   * Helper to filter graph nodes into batch element targets.
   */
  public static filterTargets(
    nodes: PositionedNode[],
    criteria: {
      selectedNodeIds?: Set<string> | string[];
      kinds?: string[];
      statuses?: string[];
      nameContains?: string;
      customFilter?: (node: PositionedNode) => boolean;
    },
  ): BatchElementTarget[] {
    const selectedSet = criteria.selectedNodeIds
      ? new Set(
          Array.isArray(criteria.selectedNodeIds)
            ? criteria.selectedNodeIds
            : Array.from(criteria.selectedNodeIds),
        )
      : null;

    return nodes
      .filter((node) => {
        if (selectedSet && !selectedSet.has(node.id)) return false;
        if (
          criteria.kinds &&
          criteria.kinds.length > 0 &&
          (!node.kind || !criteria.kinds.includes(node.kind))
        ) {
          return false;
        }
        if (
          criteria.statuses &&
          criteria.statuses.length > 0 &&
          (!node.status || !criteria.statuses.includes(node.status))
        ) {
          return false;
        }
        if (
          criteria.nameContains &&
          !node.name.toLowerCase().includes(criteria.nameContains.toLowerCase())
        ) {
          return false;
        }
        if (criteria.customFilter && !criteria.customFilter(node)) {
          return false;
        }
        return true;
      })
      .map((node) => ({
        id: node.id,
        name: node.name,
        kind: node.kind,
        status: node.status,
        data: {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          type: node.type,
          step: node.step,
        },
      }));
  }
}
