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

export function assignCoordinates(
  _graph: NormalizedGraph,
  layerGraph: ExpandedLayerGraph,
  orderedLayers: LayerNode[][],
  config: CustomLayoutConfig,
  spacingOverrides?: SpacingOverrides
): CoordinateAssignmentResult {
  const nodePositions = new Map<string, Point>();
  const rankBandMap = new Map<number, RankBand>();

  // 1. Calculate Y positions and rank bands
  let currentY = config.graphPadding;

  for (let r = 0; r < orderedLayers.length; r++) {
    const layer = orderedLayers[r];
    const realNodesInRank = layer.filter((n) => !n.isVirtual);

    const rankHeight = realNodesInRank.length > 0
      ? Math.max(...realNodesInRank.map((n) => n.height))
      : 40;

    const centerY = currentY + rankHeight / 2;
    rankBandMap.set(r, { topY: currentY, height: rankHeight, centerY });

    const effectiveRankGap = spacingOverrides?.rankGaps?.[r] ?? config.rankGap;
    currentY += rankHeight + effectiveRankGap;
  }

  // 2. Initial X assignment per rank
  const centerXs = new Map<string, number>();

  for (let r = 0; r < orderedLayers.length; r++) {
    const layer = orderedLayers[r];
    let currentX = config.graphPadding;

    for (let i = 0; i < layer.length; i++) {
      const item = layer[i];
      const width = item.isVirtual ? 0 : item.width;

      centerXs.set(item.id, currentX + width / 2);
      const effectiveNodeGap = spacingOverrides?.nodeGaps?.[item.id] ?? config.nodeGap;
      currentX += width + effectiveNodeGap;
    }
  }

  // 3. Alignment sweeps (median alignment with gap enforcement)
  const maxSweeps = 8;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    const isDownward = sweep % 2 === 0;

    const rankOrder = isDownward
      ? Array.from({ length: orderedLayers.length }, (_, i) => i)
      : Array.from({ length: orderedLayers.length }, (_, i) => orderedLayers.length - 1 - i);

    for (const r of rankOrder) {
      const layer = orderedLayers[r];
      if (layer.length === 0) continue;

      // Calculate median targets
      for (const item of layer) {
        const neighbors: string[] = [];
        const preds = layerGraph.predecessorsMap.get(item.id) ?? [];
        const succs = layerGraph.successorsMap.get(item.id) ?? [];

        for (const p of preds) if (centerXs.has(p)) neighbors.push(p);
        for (const s of succs) if (centerXs.has(s)) neighbors.push(s);

        if (neighbors.length > 0) {
          const sortedNeighborX = neighbors.map((id) => centerXs.get(id)!).sort((a, b) => a - b);
          const mid = Math.floor(sortedNeighborX.length / 2);
          const medianX = sortedNeighborX.length % 2 !== 0
            ? sortedNeighborX[mid]
            : (sortedNeighborX[mid - 1] + sortedNeighborX[mid]) / 2;

          centerXs.set(item.id, medianX);
        }
      }

      // Enforce left-to-right minimum gaps
      for (let i = 1; i < layer.length; i++) {
        const prev = layer[i - 1];
        const curr = layer[i];

        const prevW = prev.isVirtual ? 0 : prev.width;
        const currW = curr.isVirtual ? 0 : curr.width;

        const effectiveGap = spacingOverrides?.nodeGaps?.[prev.id] ?? config.nodeGap;
        const minCenterX = centerXs.get(prev.id)! + prevW / 2 + effectiveGap + currW / 2;
        if (centerXs.get(curr.id)! < minCenterX) {
          centerXs.set(curr.id, minCenterX);
        }
      }

      // Enforce right-to-left minimum gaps
      for (let i = layer.length - 2; i >= 0; i--) {
        const curr = layer[i];
        const next = layer[i + 1];

        const currW = curr.isVirtual ? 0 : curr.width;
        const nextW = next.isVirtual ? 0 : next.width;

        const effectiveGap = spacingOverrides?.nodeGaps?.[curr.id] ?? config.nodeGap;
        const maxCenterX = centerXs.get(next.id)! - nextW / 2 - effectiveGap - currW / 2;
        if (centerXs.get(curr.id)! > maxCenterX) {
          centerXs.set(curr.id, maxCenterX);
        }
      }
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

      nodePositions.set(item.id, { x, y });
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
    const w = item?.isVirtual ? 0 : item?.width ?? 0;
    const h = item?.isVirtual ? 0 : item?.height ?? 0;

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
