use crate::edge_routing::route_occupancy::{preflight_endpoint_leg, RouteOccupancyLedger, RouteReservation};
use crate::types::{Point, PortRef, Rect, Segment, Side};

#[test]
fn test_route_occupancy_commit_conflict_release() {
    let mut ledger = RouteOccupancyLedger::new(0.001);

    let points_a = vec![Point { x: 100.0, y: 50.0 }, Point { x: 300.0, y: 50.0 }];
    ledger.commit_route("edge-A", &points_a, None, None);

    let cand_b = RouteReservation {
        edge_id: "edge-B".to_string(),
        segment: Segment {
            a: Point { x: 200.0, y: 50.0 },
            b: Point { x: 400.0, y: 50.0 },
        },
        is_endpoint_leg: false,
    };
    let cand_c = RouteReservation {
        edge_id: "edge-C".to_string(),
        segment: Segment {
            a: Point { x: 50.0, y: 50.0 },
            b: Point { x: 150.0, y: 50.0 },
        },
        is_endpoint_leg: false,
    };

    let conflicts = ledger.query_conflicts(&[cand_c.clone(), cand_b.clone()]);
    assert_eq!(conflicts.len(), 2);
    assert_eq!(conflicts[0].edge_id_a, "edge-B");
    assert_eq!(conflicts[1].edge_id_a, "edge-C");
    assert_eq!(conflicts[0].reason, "collinear_overlap");

    ledger.release("edge-A");

    let conflicts_after_release = ledger.query_conflicts(&[cand_b, cand_c]);
    assert!(conflicts_after_release.is_empty());
}

#[test]
fn test_route_occupancy_endpoint_stub_conflict() {
    let mut ledger = RouteOccupancyLedger::new(0.001);

    let user_port = PortRef {
        node_id: "USER".to_string(),
        side: Side::Top,
        index: 0,
        point: Point { x: 500.0, y: 220.0 },
        stub: Point { x: 500.0, y: 200.0 },
    };

    let gw_port = PortRef {
        node_id: "GW".to_string(),
        side: Side::Bottom,
        index: 0,
        point: Point { x: 500.0, y: 110.0 },
        stub: Point { x: 500.0, y: 130.0 },
    };

    let route_points_gw_user = vec![
        gw_port.point,
        gw_port.stub,
        Point { x: 500.0, y: 200.0 },
        user_port.point,
    ];

    ledger.commit_route("e-GW-USER", &route_points_gw_user, Some(&gw_port), Some(&user_port));

    let overlapping_segment = Segment {
        a: Point { x: 500.0, y: 190.0 },
        b: Point { x: 500.0, y: 210.0 },
    };

    let conflicts = ledger.query_conflicts(&[RouteReservation {
        edge_id: "e-USER-DB".to_string(),
        segment: overlapping_segment,
        is_endpoint_leg: false,
    }]);

    assert!(!conflicts.is_empty());
    assert_eq!(conflicts[0].reason, "endpoint_stub_conflict");
    assert_eq!(conflicts[0].edge_id_b, "e-GW-USER");
}

#[test]
fn test_route_occupancy_perpendicular_crossing_no_conflict() {
    let mut ledger = RouteOccupancyLedger::new(0.001);

    ledger.commit_route(
        "edge-1",
        &[Point { x: 100.0, y: 50.0 }, Point { x: 200.0, y: 50.0 }],
        None,
        None,
    );

    let endpoint_contact_cand = RouteReservation {
        edge_id: "edge-2".to_string(),
        segment: Segment {
            a: Point { x: 200.0, y: 50.0 },
            b: Point { x: 300.0, y: 50.0 },
        },
        is_endpoint_leg: false,
    };

    let perpendicular_cand = RouteReservation {
        edge_id: "edge-3".to_string(),
        segment: Segment {
            a: Point { x: 150.0, y: 0.0 },
            b: Point { x: 150.0, y: 100.0 },
        },
        is_endpoint_leg: false,
    };

    let conflicts = ledger.query_conflicts(&[endpoint_contact_cand, perpendicular_cand]);
    assert!(conflicts.is_empty());
}

#[test]
fn test_preflight_endpoint_leg() {
    let mut ledger = RouteOccupancyLedger::new(0.001);

    ledger.commit_route(
        "edge-1",
        &[Point { x: 100.0, y: 50.0 }, Point { x: 100.0, y: 200.0 }],
        None,
        None,
    );

    let obstacles = vec![(
        "NODE-B".to_string(),
        Rect {
            x: 180.0,
            y: 40.0,
            width: 40.0,
            height: 40.0,
        },
    )];

    let penetrating_leg = Segment {
        a: Point { x: 150.0, y: 60.0 },
        b: Point { x: 250.0, y: 60.0 },
    };

    let obstacle_conflicts = preflight_endpoint_leg(
        "edge-2",
        "NODE-A",
        &penetrating_leg,
        &obstacles,
        &ledger.get_reservations(),
        0.001,
    );

    assert_eq!(obstacle_conflicts.len(), 1);
    assert_eq!(obstacle_conflicts[0].reason, "node_penetration");
    assert_eq!(obstacle_conflicts[0].edge_id_b, "NODE-B");
}
