import { describe, expect, it } from "bun:test";
import { preflightEndpointLeg, RouteOccupancyLedger } from "./routeOccupancy";
import type { PortRef, Rect, Segment } from "./types";

describe("routeOccupancy", () => {
  it("supports commit, conflict query, release, and deterministic ordering", () => {
    const ledger = new RouteOccupancyLedger();

    const pointsA = [
      { x: 100, y: 50 },
      { x: 300, y: 50 },
    ];
    ledger.commitRoute("edge-A", pointsA);

    // Query candidate B that overlaps with edge-A
    const candB = {
      edgeId: "edge-B",
      segment: { a: { x: 200, y: 50 }, b: { x: 400, y: 50 } },
    };
    const candC = {
      edgeId: "edge-C",
      segment: { a: { x: 50, y: 50 }, b: { x: 150, y: 50 } },
    };

    const conflicts = ledger.queryConflicts([candC, candB]);
    expect(conflicts.length).toBe(2);
    // Deterministic ordering: edge-B comes before edge-C
    expect(conflicts[0].edgeIdA).toBe("edge-B");
    expect(conflicts[1].edgeIdA).toBe("edge-C");
    expect(conflicts[0].reason).toBe("collinear_overlap");

    // Release edge-A
    ledger.release("edge-A");

    const conflictsAfterRelease = ledger.queryConflicts([candB, candC]);
    expect(conflictsAfterRelease).toEqual([]);
  });

  it("reproduces a 20 px endpoint-stub conflict from scenario #20", () => {
    const ledger = new RouteOccupancyLedger();

    // Scenario #20: GW -> USER edge port stub leg on USER (top port at (500, 220), stub at (500, 200))
    const userPort: PortRef = {
      nodeId: "USER",
      side: "top",
      index: 0,
      point: { x: 500, y: 220 },
      stub: { x: 500, y: 200 },
    };

    const gwPort: PortRef = {
      nodeId: "GW",
      side: "bottom",
      index: 0,
      point: { x: 500, y: 110 },
      stub: { x: 500, y: 130 },
    };

    // GW-USER route points from GW port to USER port including 20px endpoint stub legs
    const routePointsGWUSER = [gwPort.point, gwPort.stub, { x: 500, y: 200 }, userPort.point];

    ledger.commitRoute("e-GW-USER", routePointsGWUSER, gwPort, userPort);

    // Another edge (e.g. USER-DB or OTHER) trying to occupy a segment collinear-overlapping with USER 20px stub leg
    const overlappingSegment: Segment = {
      a: { x: 500, y: 190 },
      b: { x: 500, y: 210 },
    };

    const conflicts = ledger.queryConflicts([
      {
        edgeId: "e-USER-DB",
        segment: overlappingSegment,
      },
    ]);

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].reason).toBe("endpoint_stub_conflict");
    expect(conflicts[0].edgeIdB).toBe("e-GW-USER");
  });

  it("allows endpoint contact and perpendicular crossing without conflict", () => {
    const ledger = new RouteOccupancyLedger();

    ledger.commitRoute("edge-1", [
      { x: 100, y: 50 },
      { x: 200, y: 50 },
    ]);

    // Endpoint contact (touches at (200, 50))
    const endpointContactCand = {
      edgeId: "edge-2",
      segment: { a: { x: 200, y: 50 }, b: { x: 300, y: 50 } },
    };

    // Perpendicular crossing at (150, 50)
    const perpendicularCand = {
      edgeId: "edge-3",
      segment: { a: { x: 150, y: 0 }, b: { x: 150, y: 100 } },
    };

    const conflicts = ledger.queryConflicts([endpointContactCand, perpendicularCand]);
    expect(conflicts).toEqual([]);
  });

  it("splits committed segments at grid coordinates, endpoints, and intersections", () => {
    const ledger = new RouteOccupancyLedger({
      gridXCoords: [0, 100, 200],
      gridYCoords: [50],
    });

    ledger.commitRoute("edge-1", [
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ]);

    const reservations = ledger.getReservations();
    expect(reservations.length).toBe(2);
    expect(reservations[0].segment).toEqual({
      a: { x: 0, y: 50 },
      b: { x: 100, y: 50 },
    });
    expect(reservations[1].segment).toEqual({
      a: { x: 100, y: 50 },
      b: { x: 200, y: 50 },
    });
  });

  it("preflights endpoint legs against node obstacles and current reservations", () => {
    const ledger = new RouteOccupancyLedger();

    ledger.commitRoute("edge-1", [
      { x: 100, y: 50 },
      { x: 100, y: 200 },
    ]);

    const obstacles: { nodeId: string; rect: Rect }[] = [
      {
        nodeId: "NODE-B",
        rect: { x: 180, y: 40, width: 40, height: 40 }, // x: 180..220, y: 40..80
      },
    ];

    // Leg penetrating NODE-B obstacle
    const penetratingLeg: Segment = { a: { x: 150, y: 60 }, b: { x: 250, y: 60 } };
    const obstacleConflicts = preflightEndpointLeg(
      "edge-2",
      "NODE-A",
      penetratingLeg,
      obstacles,
      ledger.getReservations(),
    );
    expect(obstacleConflicts.length).toBe(1);
    expect(obstacleConflicts[0].reason).toBe("node_penetration");
    expect(obstacleConflicts[0].edgeIdB).toBe("NODE-B");

    // Leg overlapping existing reservation for edge-1
    const overlappingLeg: Segment = { a: { x: 100, y: 150 }, b: { x: 100, y: 250 } };
    const resConflicts = preflightEndpointLeg(
      "edge-2",
      "NODE-A",
      overlappingLeg,
      obstacles,
      ledger.getReservations(),
    );
    expect(resConflicts.length).toBe(1);
    expect(resConflicts[0].reason).toBe("collinear_overlap");
  });
});
