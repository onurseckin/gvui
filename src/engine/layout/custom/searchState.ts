import type { LayoutSearchState, PortSideAssignment } from "./types";

export function createInitialSearchState(
  sideAssignments?: Map<string, PortSideAssignment>,
): LayoutSearchState {
  const sideMap = new Map<string, PortSideAssignment>();
  if (sideAssignments) {
    for (const [k, v] of sideAssignments.entries()) {
      sideMap.set(k, { srcSide: v.srcSide, tgtSide: v.tgtSide });
    }
  }

  return {
    sideAssignments: sideMap,
    portOrders: {},
    exactDemands: [],
    layerOrders: new Map(),
    layerShifts: new Map(),
    visitedSignatures: new Set(),
  };
}

export function cloneSearchState(state: LayoutSearchState): LayoutSearchState {
  const sideAssignments = new Map<string, PortSideAssignment>();
  for (const [k, v] of state.sideAssignments.entries()) {
    sideAssignments.set(k, { srcSide: v.srcSide, tgtSide: v.tgtSide });
  }

  const portOrders: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(state.portOrders)) {
    portOrders[k] = [...v];
  }

  const layerOrders = new Map<number, string[]>();
  for (const [k, v] of state.layerOrders.entries()) {
    layerOrders.set(k, [...v]);
  }

  const layerShifts = new Map<string, number>();
  for (const [k, v] of state.layerShifts.entries()) {
    layerShifts.set(k, v);
  }

  return {
    sideAssignments,
    portOrders,
    exactDemands: [...state.exactDemands],
    layerOrders,
    layerShifts,
    visitedSignatures: new Set(state.visitedSignatures),
  };
}

export function computeStateHash(state: LayoutSearchState): string {
  const sidesStr = Array.from(state.sideAssignments.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, s]) => `${id}:${s.srcSide}->${s.tgtSide}`)
    .join(";");

  const ordersStr = Object.entries(state.portOrders)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=[${v.join(",")}]`)
    .join(";");

  const demandsStr = state.exactDemands
    .map((d) => `${d.kind}:${d.minimum}:${d.reason}`)
    .sort()
    .join(";");

  const layersStr = Array.from(state.layerOrders.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([r, o]) => `r${r}:[${o.join(",")}]`)
    .join(";");

  const shiftsStr = Array.from(state.layerShifts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

  return `${sidesStr}|${ordersStr}|${demandsStr}|${layersStr}|${shiftsStr}`;
}
