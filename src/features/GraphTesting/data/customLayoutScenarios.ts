import type { TestScenario } from "../types";

export const CUSTOM_LAYOUT_SCENARIOS: Record<number, TestScenario> = {
  1: {
    id: 1,
    title: "1. Empty Graph",
    nodes: [],
    edges: [],
  },
  2: {
    id: 2,
    title: "2. Single Node",
    nodes: [
      { id: "A", name: "Isolated Node", desc: "Single standalone node", x: 200, y: 150, w: 160, h: 65 },
    ],
    edges: [],
  },
  3: {
    id: 3,
    title: "3. Two-Node Pipeline",
    nodes: [
      { id: "A", name: "Source Node A", desc: "Producer", x: 100, y: 180, w: 160, h: 65 },
      { id: "B", name: "Target Node B", desc: "Consumer", x: 500, y: 180, w: 160, h: 65 },
    ],
    edges: [{ source: "A", target: "B", label: "direct flow" }],
  },
  4: {
    id: 4,
    title: "4. Three-Node Linear Chain",
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
  5: {
    id: 5,
    title: "5. Fan-Out 8-Node Broadcaster",
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
  6: {
    id: 6,
    title: "6. Fan-In 8-Node Collector",
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
  7: {
    id: 7,
    title: "7. Classic Diamond Topology",
    nodes: [
      { id: "SRC", name: "Data Ingestion", desc: "Source Feed", x: 360, y: 40, w: 160, h: 65 },
      { id: "PROC1", name: "Processor Alpha", desc: "Filter & Clean", x: 120, y: 220, w: 160, h: 65 },
      { id: "PROC2", name: "Processor Beta", desc: "Enrich & Transform", x: 600, y: 220, w: 160, h: 65 },
      { id: "SINK", name: "Analytics Sink", desc: "Warehouse", x: 360, y: 400, w: 160, h: 65 },
    ],
    edges: [
      { source: "SRC", target: "PROC1", label: "stream 1" },
      { source: "SRC", target: "PROC2", label: "stream 2" },
      { source: "PROC1", target: "SINK", label: "output 1" },
      { source: "PROC2", target: "SINK", label: "output 2" },
    ],
  },
  8: {
    id: 8,
    title: "8. Same-Rank Cross-Link",
    nodes: [
      { id: "SRC", name: "Root Node", desc: "Top Rank", x: 360, y: 40, w: 160, h: 65 },
      { id: "MID1", name: "Peer Node 1", desc: "Middle Rank", x: 160, y: 220, w: 160, h: 65 },
      { id: "MID2", name: "Peer Node 2", desc: "Middle Rank", x: 560, y: 220, w: 160, h: 65 },
      { id: "SINK", name: "Bottom Node", desc: "Bottom Rank", x: 360, y: 400, w: 160, h: 65 },
    ],
    edges: [
      { source: "SRC", target: "MID1" },
      { source: "SRC", target: "MID2" },
      { source: "MID1", target: "MID2", label: "horizontal sync", layoutRole: "cross" },
      { source: "MID1", target: "SINK" },
      { source: "MID2", target: "SINK" },
    ],
  },
  9: {
    id: 9,
    title: "9. Reciprocal Pair (Bidirectional)",
    nodes: [
      { id: "CLIENT", name: "Client App", desc: "Frontend", x: 260, y: 60, w: 160, h: 65 },
      { id: "WORKER", name: "Async Worker", desc: "Task Runner", x: 260, y: 300, w: 160, h: 65 },
    ],
    edges: [
      { source: "CLIENT", target: "WORKER", label: "dispatch task" },
      { source: "WORKER", target: "CLIENT", label: "↺ status callback", isCycle: true },
    ],
  },
  10: {
    id: 10,
    title: "10. Self-Loop Stack",
    nodes: [
      { id: "RETRY", name: "State Machine", desc: "Retry Loop Node", x: 260, y: 150, w: 180, h: 80 },
    ],
    edges: [
      { source: "RETRY", target: "RETRY", label: "↺ self retry", isCycle: true },
    ],
  },
  11: {
    id: 11,
    title: "11. Three-Node Cyclic Ring",
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
  12: {
    id: 12,
    title: "12. Multiple Disjoint SCCs",
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
  13: {
    id: 13,
    title: "13. Long Multi-Rank Feedback Edge",
    nodes: [
      { id: "N1", name: "Stage 1", desc: "Ingress", x: 260, y: 40, w: 150, h: 60 },
      { id: "N2", name: "Stage 2", desc: "Process", x: 260, y: 180, w: 150, h: 60 },
      { id: "N3", name: "Stage 3", desc: "Transform", x: 260, y: 320, w: 150, h: 60 },
      { id: "N4", name: "Stage 4", desc: "Egress", x: 260, y: 460, w: 150, h: 60 },
    ],
    edges: [
      { source: "N1", target: "N2" },
      { source: "N2", target: "N3" },
      { source: "N3", target: "N4" },
      { source: "N4", target: "N1", label: "↺ global feedback", isCycle: true },
    ],
  },
  14: {
    id: 14,
    title: "14. Parallel Multi-Edges",
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
  15: {
    id: 15,
    title: "15. Central Obstacle Detour",
    nodes: [
      { id: "TOP", name: "Top Source", desc: "Sender", x: 250, y: 40, w: 150, h: 60 },
      { id: "BLOCK", name: "Central Obstacle", desc: "Large Block", x: 220, y: 180, w: 210, h: 100 },
      { id: "BOT", name: "Bottom Target", desc: "Receiver", x: 250, y: 360, w: 150, h: 60 },
    ],
    edges: [
      { source: "TOP", target: "BOT", label: "detour around block" },
    ],
  },
  16: {
    id: 16,
    title: "16. Dense Edge Badges",
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
  17: {
    id: 17,
    title: "17. Variable Node Sizes",
    nodes: [
      { id: "TINY", name: "Micro", desc: "Small", x: 50, y: 100, w: 90, h: 45 },
      { id: "MEDIUM", name: "Standard Worker", desc: "Normal Size Card", x: 200, y: 100, w: 180, h: 70 },
      { id: "HUGE", name: "Enterprise Database Cluster", desc: "Multi-Region Distributed Database Instance", x: 450, y: 80, w: 280, h: 130 },
    ],
    edges: [
      { source: "TINY", target: "MEDIUM", label: "ingest" },
      { source: "MEDIUM", target: "HUGE", label: "batch write" },
    ],
  },
  18: {
    id: 18,
    title: "18. Disconnected Graph Components",
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
  19: {
    id: 19,
    title: "19. Cyclic Agent Execution Trace",
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
  20: {
    id: 20,
    title: "20. Full DevOps Microservice Mesh (Most Complex)",
    nodes: [
      { id: "GW", name: "API Gateway", desc: "Ingress & Routing", x: 420, y: 40, w: 170, h: 70 },
      { id: "AUTH", name: "Auth Service", desc: "JWT & OAuth2", x: 60, y: 220, w: 160, h: 70 },
      { id: "USER", name: "User Service", desc: "Accounts & Profiles", x: 420, y: 220, w: 160, h: 70 },
      { id: "ORDER", name: "Order Engine", desc: "Orders & Cart", x: 780, y: 220, w: 160, h: 70 },
      { id: "PAY", name: "Payment Gateway", desc: "Stripe / Paypal", x: 160, y: 440, w: 160, h: 70 },
      { id: "NOTIF", name: "Notification Svc", desc: "Email & Webpush", x: 920, y: 440, w: 160, h: 70 },
      { id: "DB", name: "PostgreSQL DB", desc: "Primary Data Store", x: 420, y: 440, w: 160, h: 70 },
      { id: "CACHE", name: "Redis Cache", desc: "Session & Rate Limit", x: 680, y: 440, w: 160, h: 70 },
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
};
