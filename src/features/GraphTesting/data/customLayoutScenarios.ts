import type { TestScenario } from "../types";

/**
 * Structural fixtures for the graph-testing surface, one scenario per layout hazard.
 *
 * The `x`/`y`/`w`/`h` on every node are *seed* boxes for the standalone port-picker playground in
 * `GraphTesting`; the real engine ignores them and measures from `name`/`desc`. They are kept
 * plausible so the playground still renders something meaningful, but nothing here should be read
 * as an expected layout.
 *
 * v3 dropped the former #1 (empty graph) and #2 (single node): neither exercises a single decision
 * in the pipeline — no ranking, no ordering, no routing — so they only ever cost a run. Everything
 * that survived was renumbered so the ids stay contiguous, which matters because the scenario
 * pickers index this record by number.
 *
 * Every edge carries a label on purpose: an unlabelled edge reserves no badge area, so a fixture
 * without labels silently stops exercising the reserve-then-place half of the pipeline. #23 keeps
 * deliberately long ones to drive wrapping.
 *
 * Every scenario here is part of the `bun scripts/runLayoutAudit.ts` gate and must produce zero
 * constraint violations (no node-node overlap, no edge-node penetration, no badge overlap, every
 * edge routed) under the layered engine in both `top-down` and `left-right`.
 */
export const CUSTOM_LAYOUT_SCENARIOS: Record<number, TestScenario> = {
  1: {
    id: 1,
    title: "1. Two-Node Pipeline",
    nodes: [
      { id: "A", name: "Source Node A", desc: "Producer", x: 100, y: 180, w: 160, h: 65 },
      { id: "B", name: "Target Node B", desc: "Consumer", x: 500, y: 180, w: 160, h: 65 },
    ],
    edges: [{ source: "A", target: "B", label: "direct flow" }],
  },
  2: {
    id: 2,
    title: "2. Three-Node Linear Chain",
    nodes: [
      { id: "A", name: "Ingress", desc: "Entry point", x: 300, y: 40, w: 150, h: 60 },
      { id: "B", name: "Processor", desc: "Business logic", x: 300, y: 200, w: 150, h: 60 },
      { id: "C", name: "Database", desc: "Persistence", x: 300, y: 360, w: 150, h: 60 },
    ],
    edges: [
      { source: "A", target: "B", label: "request" },
      { source: "B", target: "C", label: "query" },
    ],
  },
  3: {
    id: 3,
    title: "3. Fan-Out 8-Node Broadcaster",
    nodes: [
      { id: "SRC", name: "Dispatcher", desc: "Event Source", x: 400, y: 40, w: 160, h: 65 },
      { id: "W1", name: "Worker 1", desc: "Queue 1", x: 40, y: 220, w: 120, h: 55 },
      { id: "W2", name: "Worker 2", desc: "Queue 2", x: 180, y: 220, w: 120, h: 55 },
      { id: "W3", name: "Worker 3", desc: "Queue 3", x: 320, y: 220, w: 120, h: 55 },
      { id: "W4", name: "Worker 4", desc: "Queue 4", x: 460, y: 220, w: 120, h: 55 },
      { id: "W5", name: "Worker 5", desc: "Queue 5", x: 600, y: 220, w: 120, h: 55 },
      { id: "W6", name: "Worker 6", desc: "Queue 6", x: 740, y: 220, w: 120, h: 55 },
      { id: "W7", name: "Worker 7", desc: "Queue 7", x: 880, y: 220, w: 120, h: 55 },
    ],
    edges: [
      { source: "SRC", target: "W1", label: "msg 1" },
      { source: "SRC", target: "W2", label: "msg 2" },
      { source: "SRC", target: "W3", label: "msg 3" },
      { source: "SRC", target: "W4", label: "msg 4" },
      { source: "SRC", target: "W5", label: "msg 5" },
      { source: "SRC", target: "W6", label: "msg 6" },
      { source: "SRC", target: "W7", label: "msg 7" },
    ],
  },
  4: {
    id: 4,
    title: "4. Fan-In 8-Node Collector",
    nodes: [
      { id: "I1", name: "Sensor 1", desc: "Telemetry 1", x: 40, y: 40, w: 120, h: 55 },
      { id: "I2", name: "Sensor 2", desc: "Telemetry 2", x: 180, y: 40, w: 120, h: 55 },
      { id: "I3", name: "Sensor 3", desc: "Telemetry 3", x: 320, y: 40, w: 120, h: 55 },
      { id: "I4", name: "Sensor 4", desc: "Telemetry 4", x: 460, y: 40, w: 120, h: 55 },
      { id: "I5", name: "Sensor 5", desc: "Telemetry 5", x: 600, y: 40, w: 120, h: 55 },
      { id: "I6", name: "Sensor 6", desc: "Telemetry 6", x: 740, y: 40, w: 120, h: 55 },
      { id: "I7", name: "Sensor 7", desc: "Telemetry 7", x: 880, y: 40, w: 120, h: 55 },
      { id: "COL", name: "Aggregator", desc: "Central Sink", x: 400, y: 240, w: 160, h: 65 },
    ],
    edges: [
      { source: "I1", target: "COL", label: "push 1" },
      { source: "I2", target: "COL", label: "push 2" },
      { source: "I3", target: "COL", label: "push 3" },
      { source: "I4", target: "COL", label: "push 4" },
      { source: "I5", target: "COL", label: "push 5" },
      { source: "I6", target: "COL", label: "push 6" },
      { source: "I7", target: "COL", label: "push 7" },
    ],
  },
  5: {
    id: 5,
    title: "5. Classic Diamond Topology",
    nodes: [
      { id: "SRC", name: "Data Ingestion", desc: "Source Feed", x: 360, y: 40, w: 160, h: 65 },
      {
        id: "PROC1",
        name: "Processor Alpha",
        desc: "Filter & Clean",
        x: 120,
        y: 220,
        w: 160,
        h: 65,
      },
      {
        id: "PROC2",
        name: "Processor Beta",
        desc: "Enrich & Transform",
        x: 600,
        y: 220,
        w: 160,
        h: 65,
      },
      { id: "SINK", name: "Analytics Sink", desc: "Warehouse", x: 360, y: 400, w: 160, h: 65 },
    ],
    edges: [
      { source: "SRC", target: "PROC1", label: "stream 1" },
      { source: "SRC", target: "PROC2", label: "stream 2" },
      { source: "PROC1", target: "SINK", label: "output 1" },
      { source: "PROC2", target: "SINK", label: "output 2" },
    ],
  },
  6: {
    id: 6,
    title: "6. Same-Rank Cross-Link",
    nodes: [
      { id: "SRC", name: "Root Node", desc: "Top Rank", x: 360, y: 40, w: 160, h: 65 },
      { id: "MID1", name: "Peer Node 1", desc: "Middle Rank", x: 160, y: 220, w: 160, h: 65 },
      { id: "MID2", name: "Peer Node 2", desc: "Middle Rank", x: 560, y: 220, w: 160, h: 65 },
      { id: "SINK", name: "Bottom Node", desc: "Bottom Rank", x: 360, y: 400, w: 160, h: 65 },
    ],
    edges: [
      { source: "SRC", target: "MID1", label: "branch a" },
      { source: "SRC", target: "MID2", label: "branch b" },
      { source: "MID1", target: "MID2", label: "horizontal sync", layoutRole: "cross" },
      { source: "MID1", target: "SINK", label: "collect a" },
      { source: "MID2", target: "SINK", label: "collect b" },
    ],
  },
  7: {
    id: 7,
    title: "7. Reciprocal Pair (Bidirectional)",
    nodes: [
      { id: "CLIENT", name: "Client App", desc: "Frontend", x: 260, y: 60, w: 160, h: 65 },
      { id: "WORKER", name: "Async Worker", desc: "Task Runner", x: 260, y: 300, w: 160, h: 65 },
    ],
    edges: [
      { source: "CLIENT", target: "WORKER", label: "dispatch task" },
      { source: "WORKER", target: "CLIENT", label: "↺ status callback", isCycle: true },
    ],
  },
  8: {
    id: 8,
    title: "8. Self-Loop Stack",
    nodes: [
      {
        id: "RETRY",
        name: "State Machine",
        desc: "Retry Loop Node",
        x: 260,
        y: 150,
        w: 180,
        h: 80,
      },
    ],
    edges: [{ source: "RETRY", target: "RETRY", label: "↺ self retry", isCycle: true }],
  },
  9: {
    id: 9,
    title: "9. Three-Node Cyclic Ring",
    nodes: [
      { id: "A", name: "Node A", desc: "Ring Stage 1", x: 100, y: 80, w: 150, h: 60 },
      { id: "B", name: "Node B", desc: "Ring Stage 2", x: 350, y: 80, w: 150, h: 60 },
      { id: "C", name: "Node C", desc: "Ring Stage 3", x: 225, y: 260, w: 150, h: 60 },
    ],
    edges: [
      { source: "A", target: "B", label: "step 1" },
      { source: "B", target: "C", label: "step 2" },
      { source: "C", target: "A", label: "↺ loopback", isCycle: true },
    ],
  },
  10: {
    id: 10,
    title: "10. Multiple Disjoint SCCs",
    nodes: [
      { id: "A1", name: "SCC 1 Node A", desc: "Group 1", x: 80, y: 60, w: 140, h: 55 },
      { id: "A2", name: "SCC 1 Node B", desc: "Group 1", x: 80, y: 220, w: 140, h: 55 },
      { id: "B1", name: "SCC 2 Node A", desc: "Group 2", x: 440, y: 60, w: 140, h: 55 },
      { id: "B2", name: "SCC 2 Node B", desc: "Group 2", x: 440, y: 220, w: 140, h: 55 },
    ],
    edges: [
      { source: "A1", target: "A2", label: "fwd 1" },
      { source: "A2", target: "A1", label: "↺ rev 1", isCycle: true },
      { source: "B1", target: "B2", label: "fwd 2" },
      { source: "B2", target: "B1", label: "↺ rev 2", isCycle: true },
    ],
  },
  11: {
    id: 11,
    title: "11. Long Multi-Rank Feedback Edge",
    nodes: [
      { id: "N1", name: "Stage 1", desc: "Ingress", x: 260, y: 40, w: 150, h: 60 },
      { id: "N2", name: "Stage 2", desc: "Process", x: 260, y: 180, w: 150, h: 60 },
      { id: "N3", name: "Stage 3", desc: "Transform", x: 260, y: 320, w: 150, h: 60 },
      { id: "N4", name: "Stage 4", desc: "Egress", x: 260, y: 460, w: 150, h: 60 },
    ],
    edges: [
      { source: "N1", target: "N2", label: "accept" },
      { source: "N2", target: "N3", label: "process" },
      { source: "N3", target: "N4", label: "emit" },
      { source: "N4", target: "N1", label: "↺ global feedback", isCycle: true },
    ],
  },
  12: {
    id: 12,
    title: "12. Parallel Multi-Edges",
    nodes: [
      { id: "SRC", name: "Source App", desc: "Producer", x: 100, y: 150, w: 160, h: 65 },
      { id: "TGT", name: "Target App", desc: "Consumer", x: 500, y: 150, w: 160, h: 65 },
    ],
    edges: [
      { source: "SRC", target: "TGT", label: "HTTP Channel" },
      { source: "SRC", target: "TGT", label: "gRPC Channel" },
      { source: "SRC", target: "TGT", label: "WebSocket Stream" },
    ],
  },
  13: {
    id: 13,
    title: "13. Central Obstacle Detour",
    nodes: [
      { id: "TOP", name: "Top Source", desc: "Sender", x: 250, y: 40, w: 150, h: 60 },
      {
        id: "BLOCK",
        name: "Central Obstacle",
        desc: "Large Block",
        x: 220,
        y: 180,
        w: 210,
        h: 100,
      },
      { id: "BOT", name: "Bottom Target", desc: "Receiver", x: 250, y: 360, w: 150, h: 60 },
    ],
    edges: [{ source: "TOP", target: "BOT", label: "detour around block" }],
  },
  14: {
    id: 14,
    title: "14. Dense Edge Badges",
    nodes: [
      { id: "A", name: "Node A", desc: "Source", x: 80, y: 100, w: 140, h: 60 },
      { id: "B", name: "Node B", desc: "Middle", x: 300, y: 100, w: 140, h: 60 },
      { id: "C", name: "Node C", desc: "Target", x: 520, y: 100, w: 140, h: 60 },
    ],
    edges: [
      { source: "A", target: "B", label: "High Volume API Request [v1.2]" },
      { source: "B", target: "C", label: "Encrypted Payload Transmission" },
      { source: "A", target: "C", label: "Bypass Fast Path Route" },
    ],
  },
  15: {
    id: 15,
    title: "15. Variable Node Sizes",
    nodes: [
      { id: "TINY", name: "Micro", desc: "Small", x: 50, y: 100, w: 90, h: 45 },
      {
        id: "MEDIUM",
        name: "Standard Worker",
        desc: "Normal Size Card",
        x: 200,
        y: 100,
        w: 180,
        h: 70,
      },
      {
        id: "HUGE",
        name: "Enterprise Database Cluster",
        desc: "Multi-Region Distributed Database Instance",
        x: 450,
        y: 80,
        w: 280,
        h: 130,
      },
    ],
    edges: [
      { source: "TINY", target: "MEDIUM", label: "ingest" },
      { source: "MEDIUM", target: "HUGE", label: "batch write" },
    ],
  },
  16: {
    id: 16,
    title: "16. Disconnected Graph Components",
    nodes: [
      { id: "C1_A", name: "Cluster 1 Alpha", desc: "Component 1", x: 60, y: 60, w: 150, h: 60 },
      { id: "C1_B", name: "Cluster 1 Beta", desc: "Component 1", x: 60, y: 220, w: 150, h: 60 },
      { id: "C2_A", name: "Cluster 2 Alpha", desc: "Component 2", x: 380, y: 60, w: 150, h: 60 },
      { id: "C2_B", name: "Cluster 2 Beta", desc: "Component 2", x: 380, y: 220, w: 150, h: 60 },
    ],
    edges: [
      { source: "C1_A", target: "C1_B", label: "comp 1 link" },
      { source: "C2_A", target: "C2_B", label: "comp 2 link" },
    ],
  },
  17: {
    id: 17,
    title: "17. Cyclic Agent Execution Trace",
    nodes: [
      { id: "PLAN", name: "Planner Agent", desc: "Decomposes Task", x: 250, y: 40, w: 170, h: 65 },
      { id: "EXEC1", name: "Coder Agent 1", desc: "Writes Feature", x: 80, y: 220, w: 160, h: 65 },
      { id: "EXEC2", name: "Coder Agent 2", desc: "Writes Tests", x: 420, y: 220, w: 160, h: 65 },
      { id: "AUDIT", name: "Verifier Agent", desc: "Audits Code", x: 250, y: 400, w: 170, h: 65 },
    ],
    edges: [
      { source: "PLAN", target: "EXEC1", label: "assign task 1" },
      { source: "PLAN", target: "EXEC2", label: "assign task 2" },
      { source: "EXEC1", target: "AUDIT", label: "submit code" },
      { source: "EXEC2", target: "AUDIT", label: "submit tests" },
      { source: "AUDIT", target: "PLAN", label: "↺ request revision", isCycle: true },
    ],
  },
  18: {
    id: 18,
    title: "18. Full DevOps Microservice Mesh",
    nodes: [
      { id: "GW", name: "API Gateway", desc: "Ingress & Routing", x: 420, y: 40, w: 170, h: 70 },
      { id: "AUTH", name: "Auth Service", desc: "JWT & OAuth2", x: 60, y: 220, w: 160, h: 70 },
      {
        id: "USER",
        name: "User Service",
        desc: "Accounts & Profiles",
        x: 420,
        y: 220,
        w: 160,
        h: 70,
      },
      { id: "ORDER", name: "Order Engine", desc: "Orders & Cart", x: 780, y: 220, w: 160, h: 70 },
      {
        id: "PAY",
        name: "Payment Gateway",
        desc: "Stripe / Paypal",
        x: 160,
        y: 440,
        w: 160,
        h: 70,
      },
      {
        id: "NOTIF",
        name: "Notification Svc",
        desc: "Email & Webpush",
        x: 920,
        y: 440,
        w: 160,
        h: 70,
      },
      {
        id: "DB",
        name: "PostgreSQL DB",
        desc: "Primary Data Store",
        x: 420,
        y: 440,
        w: 160,
        h: 70,
      },
      {
        id: "CACHE",
        name: "Redis Cache",
        desc: "Session & Rate Limit",
        x: 680,
        y: 440,
        w: 160,
        h: 70,
      },
    ],
    edges: [
      { source: "GW", target: "AUTH", label: "auth check" },
      { source: "GW", target: "USER", label: "user req" },
      { source: "GW", target: "ORDER", label: "checkout" },
      { source: "AUTH", target: "CACHE", label: "session lookup" },
      { source: "USER", target: "DB", label: "profile read/write" },
      { source: "USER", target: "PAY", label: "saved cards" },
      { source: "ORDER", target: "PAY", label: "charge payment" },
      { source: "PAY", target: "ORDER", label: "↺ settlement ack", isCycle: true },
      { source: "ORDER", target: "DB", label: "persist order" },
      { source: "ORDER", target: "CACHE", label: "invalidate cache" },
      { source: "ORDER", target: "NOTIF", label: "order event" },
      { source: "NOTIF", target: "AUTH", label: "↺ alert trigger", isCycle: true },
    ],
  },

  // --- v3 additions: one scenario per hazard the sample graphs cover ---------------------------

  /**
   * Depth stress. Twelve ranks on a single path is the worst case for the rank-band accumulator and
   * for `straightChainRatio`: a chain this long should stay one straight line, so any port jitter
   * shows up immediately as a bend.
   */
  19: {
    id: 19,
    title: "19. Deep 12-Rank Single Path",
    nodes: [
      { id: "S01", name: "Checkout", desc: "Fetch commit", x: 300, y: 20, w: 150, h: 55 },
      { id: "S02", name: "Install", desc: "Resolve lockfile", x: 300, y: 100, w: 150, h: 55 },
      { id: "S03", name: "Codegen", desc: "Schema bindings", x: 300, y: 180, w: 150, h: 55 },
      { id: "S04", name: "Lint", desc: "Static analysis", x: 300, y: 260, w: 150, h: 55 },
      { id: "S05", name: "Type Check", desc: "Project refs", x: 300, y: 340, w: 150, h: 55 },
      { id: "S06", name: "Unit Tests", desc: "Hermetic tier", x: 300, y: 420, w: 150, h: 55 },
      { id: "S07", name: "Build", desc: "Bundle + wasm", x: 300, y: 500, w: 150, h: 55 },
      { id: "S08", name: "Integration", desc: "Ephemeral deps", x: 300, y: 580, w: 150, h: 55 },
      { id: "S09", name: "Image", desc: "Distroless layer", x: 300, y: 660, w: 150, h: 55 },
      { id: "S10", name: "Scan", desc: "Advisory match", x: 300, y: 740, w: 150, h: 55 },
      { id: "S11", name: "Sign", desc: "Provenance", x: 300, y: 820, w: 150, h: 55 },
      { id: "S12", name: "Deploy", desc: "Traffic shift", x: 300, y: 900, w: 150, h: 55 },
    ],
    edges: [
      { source: "S01", target: "S02", label: "workspace" },
      { source: "S02", target: "S03", label: "deps" },
      { source: "S03", target: "S04", label: "generated" },
      { source: "S04", target: "S05", label: "clean" },
      { source: "S05", target: "S06", label: "typed" },
      { source: "S06", target: "S07", label: "green" },
      { source: "S07", target: "S08", label: "artifact" },
      { source: "S08", target: "S09", label: "verified" },
      { source: "S09", target: "S10", label: "image" },
      { source: "S10", target: "S11", label: "scanned" },
      { source: "S11", target: "S12", label: "signed" },
    ],
  },

  /**
   * Width stress. Fifteen siblings on one rank forces the widest possible rank band and the densest
   * possible port distribution on both the coordinator and the reducer — the case where naive port
   * spreading produces a dog-leg on every single edge.
   */
  20: {
    id: 20,
    title: "20. Wide Scatter–Gather (15 Shards)",
    nodes: [
      { id: "CO", name: "Coordinator", desc: "Splits by shard key", x: 700, y: 20, w: 180, h: 65 },
      ...Array.from({ length: 15 }, (_, i) => ({
        id: `SH${i + 1}`,
        name: `Shard ${String(i + 1).padStart(2, "0")}`,
        desc: `Partition p${String(i + 1).padStart(2, "0")}`,
        x: i * 130,
        y: 220,
        w: 120,
        h: 55,
      })),
      { id: "RD", name: "Reducer", desc: "Merges partials", x: 700, y: 420, w: 180, h: 65 },
    ],
    edges: [
      ...Array.from({ length: 15 }, (_, i) => ({
        source: "CO",
        target: `SH${i + 1}`,
        label: `q${i + 1}`,
      })),
      ...Array.from({ length: 15 }, (_, i) => ({
        source: `SH${i + 1}`,
        target: "RD",
        label: `p${i + 1}`,
      })),
    ],
  },

  /**
   * Peer-edge stress. Every `SVC*` shares `REG` as its only predecessor and has no directed path to
   * any other, which is precisely the condition `sameRankPeerEdges` looks for — so ten of these
   * edges are candidates for `min_len = 0` and flat horizontal routing on a single rank.
   */
  21: {
    id: 21,
    title: "21. Dense Same-Rank Peer Mesh",
    nodes: [
      { id: "REG", name: "Service Registry", desc: "Discovery root", x: 400, y: 30, w: 180, h: 65 },
      { id: "SVC1", name: "Catalog", desc: "Product records", x: 40, y: 220, w: 140, h: 60 },
      { id: "SVC2", name: "Pricing", desc: "Price engine", x: 200, y: 220, w: 140, h: 60 },
      { id: "SVC3", name: "Inventory", desc: "Stock ledger", x: 360, y: 220, w: 140, h: 60 },
      { id: "SVC4", name: "Cart", desc: "Basket state", x: 520, y: 220, w: 140, h: 60 },
      { id: "SVC5", name: "Loyalty", desc: "Points & tiers", x: 680, y: 220, w: 140, h: 60 },
      { id: "SVC6", name: "Fulfilment", desc: "Shipment booking", x: 840, y: 220, w: 140, h: 60 },
      { id: "LEDGER", name: "Order Ledger", desc: "Append-only log", x: 400, y: 420, w: 180, h: 65 },
    ],
    edges: [
      { source: "REG", target: "SVC1", label: "register" },
      { source: "REG", target: "SVC2", label: "register" },
      { source: "REG", target: "SVC3", label: "register" },
      { source: "REG", target: "SVC4", label: "register" },
      { source: "REG", target: "SVC5", label: "register" },
      { source: "REG", target: "SVC6", label: "register" },
      { source: "SVC1", target: "SVC2", label: "price lookup", layoutRole: "cross" },
      { source: "SVC2", target: "SVC3", label: "stock check", layoutRole: "cross" },
      { source: "SVC3", target: "SVC4", label: "reserve", layoutRole: "cross" },
      { source: "SVC4", target: "SVC5", label: "accrue", layoutRole: "cross" },
      { source: "SVC5", target: "SVC6", label: "tier SLA", layoutRole: "cross" },
      { source: "SVC1", target: "SVC3", label: "sku sync", layoutRole: "cross" },
      { source: "SVC2", target: "SVC4", label: "quote", layoutRole: "cross" },
      { source: "SVC3", target: "SVC6", label: "allocate", layoutRole: "cross" },
      { source: "SVC1", target: "LEDGER", label: "commit" },
      { source: "SVC4", target: "LEDGER", label: "commit" },
      { source: "SVC6", target: "LEDGER", label: "commit" },
    ],
  },

  /**
   * Long-span stress. Five edges skip between five and nine ranks while the short hops run beside
   * them, so the lane demand of a single channel has to hold both the local traffic and every
   * passing virtual node at once.
   */
  22: {
    id: 22,
    title: "22. Long-Span Edges Beside Short Hops",
    nodes: [
      { id: "R0", name: "Edge PoP", desc: "Nearest presence", x: 300, y: 20, w: 160, h: 55 },
      { id: "R1", name: "WAF", desc: "Ruleset match", x: 300, y: 110, w: 160, h: 55 },
      { id: "R2", name: "Router", desc: "Backend pool", x: 300, y: 200, w: 160, h: 55 },
      { id: "R3", name: "Authorizer", desc: "Scope resolve", x: 300, y: 290, w: 160, h: 55 },
      { id: "R4", name: "Quota Meter", desc: "Plan allowance", x: 300, y: 380, w: 160, h: 55 },
      { id: "R5", name: "Handler", desc: "Route logic", x: 300, y: 470, w: 160, h: 55 },
      { id: "R6", name: "Enrichment", desc: "Reference join", x: 300, y: 560, w: 160, h: 55 },
      { id: "R7", name: "Serializer", desc: "Format render", x: 300, y: 650, w: 160, h: 55 },
      { id: "R8", name: "Egress Filter", desc: "Field strip", x: 300, y: 740, w: 160, h: 55 },
      { id: "R9", name: "Client", desc: "Response sink", x: 300, y: 830, w: 160, h: 55 },
    ],
    edges: [
      { source: "R0", target: "R1", label: "next" },
      { source: "R1", target: "R2", label: "next" },
      { source: "R2", target: "R3", label: "next" },
      { source: "R3", target: "R4", label: "next" },
      { source: "R4", target: "R5", label: "next" },
      { source: "R5", target: "R6", label: "next" },
      { source: "R6", target: "R7", label: "next" },
      { source: "R7", target: "R8", label: "next" },
      { source: "R8", target: "R9", label: "next" },
      { source: "R0", target: "R9", label: "cache hit bypass" },
      { source: "R1", target: "R7", label: "blocked response" },
      { source: "R2", target: "R8", label: "static asset" },
      { source: "R3", target: "R9", label: "401 short circuit" },
      { source: "R4", target: "R8", label: "429 short circuit" },
    ],
  },

  /**
   * Label stress. Every label is long enough to wrap to the configured `maxLabelLines`, so each one
   * reserves a wide, tall item in the layered graph. If badge area is not reserved before
   * coordinates exist, this is the fixture that produces overlapping badges.
   */
  23: {
    id: 23,
    title: "23. Heavy Wrapping Edge Labels",
    nodes: [
      { id: "SRC", name: "POS Feed", desc: "4,100 retail tills", x: 300, y: 20, w: 160, h: 60 },
      { id: "LAND", name: "Landing Zone", desc: "Immutable raw store", x: 300, y: 180, w: 170, h: 60 },
      { id: "VAL", name: "Contract Validator", desc: "Producer contract", x: 300, y: 340, w: 190, h: 60 },
      { id: "QUAR", name: "Quarantine", desc: "Rejected records", x: 60, y: 500, w: 160, h: 60 },
      { id: "NORM", name: "Normalizer", desc: "Canonical units", x: 540, y: 500, w: 160, h: 60 },
      { id: "WH", name: "Warehouse", desc: "Columnar analytics", x: 300, y: 660, w: 170, h: 60 },
    ],
    edges: [
      {
        source: "SRC",
        target: "LAND",
        label: "at-least-once delivery of every till transaction, keyed by store and terminal id",
      },
      {
        source: "LAND",
        target: "VAL",
        label: "hourly micro-batch replay of the landing prefix, ordered by ingestion timestamp",
      },
      {
        source: "VAL",
        target: "QUAR",
        label: "schema, referential and range failures annotated with the failing rule identifier",
      },
      {
        source: "VAL",
        target: "NORM",
        label: "contract-clean records only; every required field is guaranteed present downstream",
      },
      {
        source: "NORM",
        target: "WH",
        label: "idempotent upsert into the daily partition, deduplicated on the natural business key",
      },
      {
        source: "QUAR",
        target: "NORM",
        label: "↺ operator-approved replay once the producer ships a corrected schema version",
        isCycle: true,
      },
    ],
  },

  /**
   * Cycle stress. Four back edges close over spans of one, two, three and six ranks, including one
   * from the terminal state to the entry state. Feedback leaders and forward lanes have to share the
   * same channels without colliding.
   */
  24: {
    id: 24,
    title: "24. Feedback-Heavy Saga With Compensation",
    nodes: [
      { id: "SUB", name: "Submit Order", desc: "Idempotency key", x: 300, y: 20, w: 160, h: 60 },
      { id: "RES", name: "Reserve Stock", desc: "15m soft hold", x: 300, y: 150, w: 160, h: 60 },
      { id: "AUTH", name: "Authorize", desc: "Acquirer hold", x: 300, y: 280, w: 160, h: 60 },
      { id: "RISK", name: "Risk Review", desc: "Fraud score", x: 300, y: 410, w: 160, h: 60 },
      { id: "CAP", name: "Capture", desc: "Settle charge", x: 300, y: 540, w: 160, h: 60 },
      { id: "PICK", name: "Pick & Pack", desc: "Warehouse wave", x: 300, y: 670, w: 160, h: 60 },
      { id: "SHIP", name: "Ship", desc: "Carrier handoff", x: 300, y: 800, w: 160, h: 60 },
      { id: "DEL", name: "Deliver", desc: "Terminal success", x: 300, y: 930, w: 160, h: 60 },
      { id: "BACK", name: "Backoff", desc: "Exponential retry", x: 560, y: 540, w: 160, h: 60 },
      { id: "COMP", name: "Compensate", desc: "Unwind applied", x: 40, y: 540, w: 160, h: 60 },
    ],
    edges: [
      { source: "SUB", target: "RES", label: "line items" },
      { source: "RES", target: "AUTH", label: "held" },
      { source: "AUTH", target: "RISK", label: "auth code" },
      { source: "RISK", target: "CAP", label: "cleared" },
      { source: "CAP", target: "PICK", label: "paid" },
      { source: "PICK", target: "SHIP", label: "parcel" },
      { source: "SHIP", target: "DEL", label: "in transit" },
      { source: "AUTH", target: "BACK", label: "gateway timeout" },
      { source: "PICK", target: "BACK", label: "stock short" },
      { source: "SHIP", target: "BACK", label: "label rejected" },
      { source: "BACK", target: "AUTH", label: "↺ retry authorize", isCycle: true },
      { source: "BACK", target: "PICK", label: "↺ retry pick", isCycle: true },
      { source: "RISK", target: "COMP", label: "declined" },
      { source: "BACK", target: "COMP", label: "retries exhausted" },
      { source: "COMP", target: "RES", label: "↺ release hold", isCycle: true },
      { source: "DEL", target: "SUB", label: "↺ return initiated", isCycle: true },
    ],
  },

  /**
   * Bundle stress. Four channels between the same ordered pair collapse onto one corridor unless
   * parallel edges are separated into distinct lanes, and each carries its own badge.
   */
  25: {
    id: 25,
    title: "25. Parallel Bundles Between Every Pair",
    nodes: [
      { id: "APP", name: "Trading Client", desc: "Four live transports", x: 300, y: 20, w: 180, h: 65 },
      { id: "GWY", name: "Session Gateway", desc: "Transport multiplexer", x: 300, y: 200, w: 180, h: 65 },
      { id: "MATCH", name: "Matching Engine", desc: "Single-threaded book", x: 120, y: 400, w: 180, h: 65 },
      { id: "MD", name: "Market Data Fan", desc: "Feed replicator", x: 480, y: 400, w: 180, h: 65 },
      { id: "ARCH", name: "Tick Archive", desc: "Write-once log", x: 300, y: 600, w: 180, h: 65 },
    ],
    edges: [
      { source: "APP", target: "GWY", label: "FIX 4.4 orders" },
      { source: "APP", target: "GWY", label: "WebSocket quotes" },
      { source: "APP", target: "GWY", label: "gRPC admin" },
      { source: "APP", target: "GWY", label: "UDP heartbeat" },
      { source: "GWY", target: "MATCH", label: "new order single" },
      { source: "GWY", target: "MATCH", label: "cancel/replace" },
      { source: "GWY", target: "MD", label: "subscribe" },
      { source: "GWY", target: "MD", label: "unsubscribe" },
      { source: "MATCH", target: "MD", label: "book delta", layoutRole: "cross" },
      { source: "MATCH", target: "MD", label: "trade print", layoutRole: "cross" },
      { source: "MD", target: "ARCH", label: "public feed" },
      { source: "MATCH", target: "ARCH", label: "private feed" },
      { source: "MATCH", target: "GWY", label: "↺ execution report", isCycle: true },
      { source: "MATCH", target: "GWY", label: "↺ reject", isCycle: true },
    ],
  },

  /**
   * Component stress beyond #16: three components of unequal size and depth, so component packing
   * has to interleave differently sized bounding boxes rather than two identical ones.
   */
  26: {
    id: 26,
    title: "26. Three Unequal Disconnected Stacks",
    nodes: [
      { id: "A_IN", name: "Acme Ingress", desc: "eu-west-1", x: 40, y: 40, w: 150, h: 60 },
      { id: "A_API", name: "Acme API", desc: "3 replicas", x: 40, y: 180, w: 150, h: 60 },
      { id: "A_WRK", name: "Acme Worker", desc: "Queue drain", x: 40, y: 320, w: 150, h: 60 },
      { id: "A_DB", name: "Acme Store", desc: "Tenant isolated", x: 40, y: 460, w: 150, h: 60 },
      { id: "G_IN", name: "Globex Ingress", desc: "us-east-1", x: 320, y: 40, w: 160, h: 60 },
      { id: "G_API", name: "Globex API", desc: "6 replicas", x: 320, y: 180, w: 160, h: 60 },
      { id: "G_DB", name: "Globex Store", desc: "Tenant isolated", x: 320, y: 320, w: 160, h: 60 },
      { id: "I_IN", name: "Initech Ingress", desc: "ap-south-1", x: 620, y: 40, w: 160, h: 60 },
      { id: "I_API", name: "Initech API", desc: "2 replicas", x: 620, y: 180, w: 160, h: 60 },
    ],
    edges: [
      { source: "A_IN", target: "A_API", label: "http" },
      { source: "A_API", target: "A_WRK", label: "enqueue" },
      { source: "A_API", target: "A_DB", label: "read/write" },
      { source: "A_WRK", target: "A_DB", label: "bulk write" },
      { source: "G_IN", target: "G_API", label: "http" },
      { source: "G_API", target: "G_DB", label: "read/write" },
      { source: "I_IN", target: "I_API", label: "http" },
    ],
  },
};
