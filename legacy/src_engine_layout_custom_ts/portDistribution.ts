import type { CustomLayoutConfig } from "./config";
import { projectRemoteToSideOffset } from "./portProjection";
import type { NormalizedEdge, NormalizedNode, Point, PortRef, Side } from "./types";

export interface EdgePorts {
  sourcePort: PortRef;
  targetPort: PortRef;
}

export interface PortDistributionResult {
  portsByEdge: Map<string, EdgePorts>;
}

interface SideAttachment {
  edgeId: string;
  isSource: boolean;
  remoteNodeId: string;
  remoteCenter: Point;
  projectedOffset: number;
}

export function distributePorts(
  edges: NormalizedEdge[],
  sideAssignments: Map<string, { srcSide: Side; tgtSide: Side }>,
  nodeMap: Map<string, NormalizedNode & Point>,
  config: CustomLayoutConfig,
  explicitPortOrders?: Record<string, string[]>,
): PortDistributionResult {
  const sideAttachmentsMap = new Map<string, SideAttachment[]>();

  function key(nodeId: string, side: Side): string {
    return `${nodeId}:${side}`;
  }

  // 1. Group attachments per node side
  for (const edge of edges) {
    const assignment = sideAssignments.get(edge.id);
    if (!assignment) continue;

    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);
    if (!srcNode || !tgtNode) continue;

    const srcCenter = { x: srcNode.x + srcNode.width / 2, y: srcNode.y + srcNode.height / 2 };
    const tgtCenter = { x: tgtNode.x + tgtNode.width / 2, y: tgtNode.y + tgtNode.height / 2 };

    const srcKey = key(edge.source, assignment.srcSide);
    if (!sideAttachmentsMap.has(srcKey)) sideAttachmentsMap.set(srcKey, []);
    sideAttachmentsMap.get(srcKey)?.push({
      edgeId: edge.id,
      isSource: true,
      remoteNodeId: edge.target,
      remoteCenter: tgtCenter,
      projectedOffset: projectRemoteToSideOffset(
        srcNode,
        assignment.srcSide,
        tgtCenter,
        config.epsilon,
      ),
    });

    const tgtKey = key(edge.target, assignment.tgtSide);
    if (!sideAttachmentsMap.has(tgtKey)) sideAttachmentsMap.set(tgtKey, []);
    sideAttachmentsMap.get(tgtKey)?.push({
      edgeId: edge.id,
      isSource: false,
      remoteNodeId: edge.source,
      remoteCenter: srcCenter,
      projectedOffset: projectRemoteToSideOffset(
        tgtNode,
        assignment.tgtSide,
        srcCenter,
        config.epsilon,
      ),
    });
  }

  const portRefsMap = new Map<string, PortRef>();

  // 2. Sort and calculate equal spacing offsets on each side
  for (const [sKey, attachments] of sideAttachmentsMap.entries()) {
    const [nodeId, sideStr] = sKey.split(":");
    const side = sideStr as Side;
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const isHorizontalSide = side === "top" || side === "bottom";
    const explicitOrder = explicitPortOrders?.[sKey];

    if (explicitOrder && explicitOrder.length > 0) {
      const orderMap = new Map<string, number>();
      explicitOrder.forEach((k, idx) => orderMap.set(k, idx));
      attachments.sort((a, b) => {
        const keyA = `${a.edgeId}:${a.isSource ? "src" : "tgt"}`;
        const keyB = `${b.edgeId}:${b.isSource ? "src" : "tgt"}`;
        const idxA = orderMap.has(keyA) ? orderMap.get(keyA)! : 999999;
        const idxB = orderMap.has(keyB) ? orderMap.get(keyB)! : 999999;
        if (idxA !== idxB) return idxA - idxB;

        if (Math.abs(a.projectedOffset - b.projectedOffset) > config.epsilon) {
          return a.projectedOffset - b.projectedOffset;
        }
        return keyA.localeCompare(keyB);
      });
    } else {
      // Sort attachments by projected offset, tie-break by remoteNodeId, edgeId, and isSource
      attachments.sort((a, b) => {
        if (Math.abs(a.projectedOffset - b.projectedOffset) > config.epsilon) {
          return a.projectedOffset - b.projectedOffset;
        }
        const remoteComp = a.remoteNodeId.localeCompare(b.remoteNodeId);
        if (remoteComp !== 0) return remoteComp;

        const edgeComp = a.edgeId.localeCompare(b.edgeId);
        if (edgeComp !== 0) return edgeComp;

        if (a.isSource !== b.isSource) {
          return a.isSource ? -1 : 1;
        }
        return 0;
      });
    }

    const m = attachments.length;
    const sideLength = isHorizontalSide ? node.width : node.height;
    const p = config.portEndpointPadding;
    const usable = Math.max(0, sideLength - 2 * p);

    attachments.forEach((att, idx) => {
      const offset = p + usable * ((idx + 0.5) / m);

      let point: Point;
      let stub: Point;

      switch (side) {
        case "top":
          point = { x: node.x + offset, y: node.y };
          stub = { x: point.x, y: point.y - config.portStubLength };
          break;
        case "bottom":
          point = { x: node.x + offset, y: node.y + node.height };
          stub = { x: point.x, y: point.y + config.portStubLength };
          break;
        case "left":
          point = { x: node.x, y: node.y + offset };
          stub = { x: point.x - config.portStubLength, y: point.y };
          break;
        case "right":
          point = { x: node.x + node.width, y: node.y + offset };
          stub = { x: point.x + config.portStubLength, y: point.y };
          break;
      }

      const portRef: PortRef = {
        nodeId,
        side,
        index: idx,
        point,
        stub,
      };

      const portKey = `${att.edgeId}:${att.isSource ? "src" : "tgt"}`;
      portRefsMap.set(portKey, portRef);
    });
  }

  // 3. Assemble EdgePorts map
  const portsByEdge = new Map<string, EdgePorts>();

  for (const edge of edges) {
    const sourcePort = portRefsMap.get(`${edge.id}:src`);
    const targetPort = portRefsMap.get(`${edge.id}:tgt`);

    if (sourcePort && targetPort) {
      portsByEdge.set(edge.id, { sourcePort, targetPort });
    }
  }

  return { portsByEdge };
}
