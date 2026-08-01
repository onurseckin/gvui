import type { CustomLayoutConfig } from "./config";
import type { ExpandedLayerGraph } from "./layerGraph";
import type { LayerNode, NormalizedGraph, Point, Rect, SpacingOverrides } from "./types";

export interface RankBand {
  topY: number;
  height: number;
  centerY: number;
}

export interface CoordinateAssignmentResult {
  nodePositions: Map<string, Point>;
  rankBandMap: Map<number, RankBand>;
  boundingBox: Rect;
}

export type EffectiveSpacingOverrides = SpacingOverrides & {
  nodeGapByRank?: Map<number, number> | Record<number, number>;
  rankGapAfterRank?: Map<number, number> | Record<number, number>;
  nodeGapAfterNodeId?: Map<string, number> | Record<string, number>;
  globalNodeGap?: number;
  globalRankGap?: number;
};

function getEffectiveRankGap(
  rank: number,
  spacingOverrides: EffectiveSpacingOverrides | undefined,
  config: CustomLayoutConfig,
): number {
  if (!spacingOverrides) return config.rankGap;

  let override1: number | undefined;
  if (spacingOverrides.rankGapAfterRank) {
    if (spacingOverrides.rankGapAfterRank instanceof Map) {
      override1 = spacingOverrides.rankGapAfterRank.get(rank);
    } else {
      override1 = (spacingOverrides.rankGapAfterRank as Record<number, number>)[rank];
    }
  }

  let override2: number | undefined;
  if (spacingOverrides.rankGaps) {
    override2 = spacingOverrides.rankGaps[rank];
  }

  return Math.max(
    config.rankGap,
    spacingOverrides.globalRankGap ?? 0,
    override1 ?? 0,
    override2 ?? 0,
  );
}

function getEffectiveNodeGap(
  rank: number,
  node: LayerNode,
  spacingOverrides: EffectiveSpacingOverrides | undefined,
  config: CustomLayoutConfig,
): number {
  if (!spacingOverrides) return config.nodeGap;

  const targetIds = [node.id];
  if (node.originalNodeId && node.originalNodeId !== node.id) {
    targetIds.push(node.originalNodeId);
  }

  let overrideNodeId: number | undefined;
  if (spacingOverrides.nodeGapAfterNodeId) {
    if (spacingOverrides.nodeGapAfterNodeId instanceof Map) {
      for (const id of targetIds) {
        const val = spacingOverrides.nodeGapAfterNodeId.get(id);
        if (val !== undefined) {
          overrideNodeId = Math.max(overrideNodeId ?? 0, val);
        }
      }
    } else {
      const rec = spacingOverrides.nodeGapAfterNodeId as Record<string, number>;
      for (const id of targetIds) {
        const val = rec[id];
        if (val !== undefined) {
          overrideNodeId = Math.max(overrideNodeId ?? 0, val);
        }
      }
    }
  }

  let overrideNodeGaps: number | undefined;
  if (spacingOverrides.nodeGaps) {
    for (const id of targetIds) {
      const val = spacingOverrides.nodeGaps[id];
      if (val !== undefined) {
        overrideNodeGaps = Math.max(overrideNodeGaps ?? 0, val);
      }
    }
  }

  let overrideRank: number | undefined;
  if (spacingOverrides.nodeGapByRank) {
    if (spacingOverrides.nodeGapByRank instanceof Map) {
      overrideRank = spacingOverrides.nodeGapByRank.get(rank);
    } else {
      overrideRank = (spacingOverrides.nodeGapByRank as Record<number, number>)[rank];
    }
  }

  return Math.max(
    config.nodeGap,
    spacingOverrides.globalNodeGap ?? 0,
    overrideNodeId ?? 0,
    overrideNodeGaps ?? 0,
    overrideRank ?? 0,
  );
}

function projectLayerCenters(
  layer: LayerNode[],
  desiredXMap: Map<string, number>,
  weightsMap: Map<string, number>,
  rank: number,
  config: CustomLayoutConfig,
  spacingOverrides?: EffectiveSpacingOverrides,
): Map<string, number> {
  const result = new Map<string, number>();
  const k = layer.length;
  if (k === 0) return result;
  if (k === 1) {
    const item = layer[0];
    result.set(item.id, desiredXMap.get(item.id)!);
    return result;
  }

  // 1. Compute cumulative separation offsets s_i
  const s = new Array<number>(k);
  s[0] = 0;
  for (let i = 0; i < k - 1; i++) {
    const curr = layer[i];
    const next = layer[i + 1];
    const currW = curr.width;
    const nextW = next.width;
    const gap = Math.max(
      getEffectiveNodeGap(rank, curr, spacingOverrides, config),
      getEffectiveNodeGap(rank, next, spacingOverrides, config),
    );
    const d = (currW + nextW) / 2 + gap;
    s[i + 1] = s[i] + d;
  }

  // 2. Prepare a_i = desiredX_i - s_i and w_i = weight_i
  const a = new Array<number>(k);
  const w = new Array<number>(k);
  for (let i = 0; i < k; i++) {
    const item = layer[i];
    const desX = desiredXMap.get(item.id)!;
    a[i] = desX - s[i];
    w[i] = weightsMap.get(item.id) ?? 1;
  }

  // 3. Pool Adjacent Violators Algorithm (PAVA)
  interface Block {
    weight: number;
    sumWA: number;
    value: number;
    size: number;
  }
  const stack: Block[] = [];

  for (let i = 0; i < k; i++) {
    let b: Block = {
      weight: w[i],
      sumWA: w[i] * a[i],
      value: a[i],
      size: 1,
    };

    while (stack.length > 0 && stack[stack.length - 1].value > b.value) {
      const top = stack.pop()!;
      b = {
        weight: top.weight + b.weight,
        sumWA: top.sumWA + b.sumWA,
        value: (top.sumWA + b.sumWA) / (top.weight + b.weight),
        size: top.size + b.size,
      };
    }

    stack.push(b);
  }

  // 4. Unpack stack to get z_i and compute final X_i = z_i + s_i
  let index = 0;
  for (const block of stack) {
    for (let j = 0; j < block.size; j++) {
      const z = block.value;
      const finalX = z + s[index];
      result.set(layer[index].id, finalX);
      index++;
    }
  }

  return result;
}

export type EffectiveLayerShifts = Map<string, number> | Record<string, number>;

export function assignCoordinates(
  _graph: NormalizedGraph,
  layerGraph: ExpandedLayerGraph,
  orderedLayers: LayerNode[][],
  config: CustomLayoutConfig,
  spacingOverrides?: EffectiveSpacingOverrides,
  layerShifts?: EffectiveLayerShifts,
): CoordinateAssignmentResult {
  const nodePositions = new Map<string, Point>();
  const rankBandMap = new Map<number, RankBand>();

  const getShift = (key: string): number => {
    if (!layerShifts) return 0;
    if (layerShifts instanceof Map) return layerShifts.get(key) ?? 0;
    return layerShifts[key] ?? 0;
  };

  // 1. Calculate Y positions and rank bands
  let currentY = config.graphPadding;

  for (let r = 0; r < orderedLayers.length; r++) {
    const layer = orderedLayers[r];
    const realNodesInRank = layer.filter((n) => !n.isVirtual);

    const rankHeight =
      realNodesInRank.length > 0 ? Math.max(...realNodesInRank.map((n) => n.height)) : 40;

    const rankYShift = getShift(`rank:${r}:y`);
    const centerY = currentY + rankHeight / 2 + rankYShift;
    rankBandMap.set(r, { topY: currentY + rankYShift, height: rankHeight, centerY });

    const effectiveRankGap = getEffectiveRankGap(r, spacingOverrides, config);
    currentY += rankHeight + effectiveRankGap;
  }

  // 2. Initial X assignment per rank
  const initialCenterXMap = new Map<string, number>();

  for (let r = 0; r < orderedLayers.length; r++) {
    const layer = orderedLayers[r];
    let currentX = config.graphPadding;

    for (let i = 0; i < layer.length; i++) {
      const item = layer[i];
      const width = item.isVirtual ? 0 : item.width;

      initialCenterXMap.set(item.id, currentX + width / 2);
      const nextItem = i < layer.length - 1 ? layer[i + 1] : undefined;
      const effectiveNodeGap = nextItem
        ? Math.max(
            getEffectiveNodeGap(r, item, spacingOverrides, config),
            getEffectiveNodeGap(r, nextItem, spacingOverrides, config),
          )
        : getEffectiveNodeGap(r, item, spacingOverrides, config);
      currentX += width + effectiveNodeGap;
    }
  }

  // 3. Coordinate sweeps with synchronous isotonic projection
  let centerXs = new Map<string, number>(initialCenterXMap);

  for (let sweep = 0; sweep < config.coordinateSweepLimit; sweep++) {
    const prevCenterXMap = new Map(centerXs);
    const desiredXMap = new Map<string, number>();
    const weightsMap = new Map<string, number>();

    // Step 1 & 2: Calculate desired positions & weights for all nodes from prevCenterXMap
    for (const layer of orderedLayers) {
      for (const item of layer) {
        const preds = layerGraph.predecessorsMap.get(item.id) ?? [];
        const succs = layerGraph.successorsMap.get(item.id) ?? [];

        const neighbors: string[] = [];
        for (const p of preds) if (prevCenterXMap.has(p)) neighbors.push(p);
        for (const s of succs) if (prevCenterXMap.has(s)) neighbors.push(s);

        let desiredX: number;
        if (neighbors.length > 0) {
          const sortedNeighborX = neighbors
            .map((id) => prevCenterXMap.get(id)!)
            .sort((a, b) => a - b);
          const mid = Math.floor(sortedNeighborX.length / 2);
          const medianNeighborX =
            sortedNeighborX.length % 2 !== 0
              ? sortedNeighborX[mid]
              : (sortedNeighborX[mid - 1] + sortedNeighborX[mid]) / 2;
          const prevX = prevCenterXMap.get(item.id)!;
          desiredX = 0.5 * prevX + 0.5 * medianNeighborX;
        } else {
          desiredX = prevCenterXMap.get(item.id)!;
        }

        desiredXMap.set(item.id, desiredX);
        weightsMap.set(item.id, Math.max(1, preds.length + succs.length));
      }
    }

    // Step 4: Project layer centers for each layer
    const nextCenterXMap = new Map<string, number>();
    for (let r = 0; r < orderedLayers.length; r++) {
      const layer = orderedLayers[r];
      const projected = projectLayerCenters(
        layer,
        desiredXMap,
        weightsMap,
        r,
        config,
        spacingOverrides,
      );
      for (const [id, x] of projected.entries()) {
        nextCenterXMap.set(id, x);
      }
    }

    // Step 5 & 6: Compute max movement and replace layer centers after all layers are projected
    let maxMovement = 0;
    for (const [id, newX] of nextCenterXMap.entries()) {
      const oldX = prevCenterXMap.get(id)!;
      const movement = Math.abs(newX - oldX);
      if (movement > maxMovement) {
        maxMovement = movement;
      }
    }

    centerXs = nextCenterXMap;

    if (maxMovement <= config.epsilon) {
      break;
    }
  }

  // 4. Set final top-left {x, y} coordinates for each node
  for (let r = 0; r < orderedLayers.length; r++) {
    const layer = orderedLayers[r];
    const band = rankBandMap.get(r)!;

    for (const item of layer) {
      const cx = centerXs.get(item.id)!;
      const width = item.isVirtual ? 0 : item.width;
      const height = item.isVirtual ? 0 : item.height;

      const x = cx - width / 2;
      const y = item.isVirtual ? band.centerY : band.topY + (band.height - height) / 2;
      const shiftX = getShift(`node:${item.id}:x`);
      const shiftY = getShift(`node:${item.id}:y`);

      nodePositions.set(item.id, { x: x + shiftX, y: y + shiftY });
    }
  }

  // 5. Translate final coordinates so minimum real node X and Y equal graph padding
  let minNodeX = Infinity;
  let minNodeY = Infinity;

  for (const [id, pos] of nodePositions.entries()) {
    const item = layerGraph.itemMap.get(id);
    if (item && !item.isVirtual) {
      minNodeX = Math.min(minNodeX, pos.x);
      minNodeY = Math.min(minNodeY, pos.y);
    }
  }

  if (minNodeX !== Infinity && minNodeY !== Infinity) {
    const shiftX = config.graphPadding - minNodeX;
    const shiftY = config.graphPadding - minNodeY;

    if (shiftX !== 0 || shiftY !== 0) {
      for (const [id, pos] of nodePositions.entries()) {
        nodePositions.set(id, { x: pos.x + shiftX, y: pos.y + shiftY });
      }
      for (const [r, band] of rankBandMap.entries()) {
        rankBandMap.set(r, {
          topY: band.topY + shiftY,
          height: band.height,
          centerY: band.centerY + shiftY,
        });
      }
    }
  }

  // 6. Calculate overall bounding box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [id, pos] of nodePositions.entries()) {
    const item = layerGraph.itemMap.get(id);
    const w = item?.isVirtual ? 0 : (item?.width ?? 0);
    const h = item?.isVirtual ? 0 : (item?.height ?? 0);

    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + w);
    maxY = Math.max(maxY, pos.y + h);
  }

  const boundingBox: Rect = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  return {
    nodePositions,
    rankBandMap,
    boundingBox,
  };
}
