import type { TestScenario } from "../types";

export const TEST_SCENARIOS: Record<number, TestScenario> = {
  1: {
    id: 1,
    title: "1. Complex Cyclic Mesh",
    nodes: [
      { id: "A", name: "API Gateway", desc: "Ingress Router", x: 440, y: 30, w: 160, h: 70 },
      { id: "G", name: "Notification Svc", desc: "Push & Email", x: 760, y: 30, w: 160, h: 70 },
      { id: "B", name: "Auth Service", desc: "JWT Verification", x: 40, y: 240, w: 160, h: 70 },
      { id: "C", name: "User Service", desc: "User Profile", x: 440, y: 240, w: 160, h: 70 },
      { id: "D", name: "Order Service", desc: "Order Processor", x: 840, y: 240, w: 160, h: 70 },
      { id: "E", name: "Payment Gateway", desc: "Stripe & Paypal", x: 160, y: 490, w: 160, h: 70 },
      { id: "H", name: "Postgres DB", desc: "Relational Store", x: 440, y: 490, w: 160, h: 70 },
      { id: "F", name: "Redis Cluster", desc: "Cache Datastore", x: 740, y: 490, w: 160, h: 70 },
    ],
    edges: [
      { source: "A", target: "B", label: "auth check" },
      { source: "A", target: "C", label: "user route" },
      { source: "A", target: "D", label: "order route" },
      { source: "A", target: "G", label: "push notify" },
      { source: "B", target: "C", label: "token verify" },
      { source: "C", target: "E", label: "checkout" },
      { source: "E", target: "C", label: "↺ status callback", isCycle: true },
      { source: "C", target: "H", label: "profile sync" },
      { source: "D", target: "F", label: "cache write" },
      { source: "F", target: "B", label: "↺ session sync", isCycle: true },
      { source: "D", target: "H", label: "order persist" },
      { source: "D", target: "E", label: "process charge" },
      { source: "E", target: "D", label: "↺ settlement ack", isCycle: true },
      { source: "D", target: "G", label: "order event" },
      { source: "G", target: "B", label: "↺ auth alert", isCycle: true },
    ],
  },
  2: {
    id: 2,
    title: "2. Multi-Child Cluster",
    nodes: [
      { id: "A", name: "Parent Node A", desc: "Center", x: 340, y: 30, w: 150, h: 60 },
      { id: "B1", name: "Child B1", desc: "Left", x: 40, y: 360, w: 140, h: 60 },
      { id: "B2", name: "Child B2", desc: "Center", x: 345, y: 360, w: 140, h: 60 },
      { id: "B3", name: "Child B3", desc: "Right", x: 650, y: 360, w: 140, h: 60 },
    ],
    edges: [
      { source: "A", target: "B1", label: "left branch" },
      { source: "A", target: "B2", label: "center branch" },
      { source: "A", target: "B3", label: "right branch" },
    ],
  },
  3: {
    id: 3,
    title: "3. Diagonal Child Node",
    nodes: [
      { id: "A", name: "Parent Node A", desc: "Top-Left", x: 80, y: 50, w: 160, h: 65 },
      { id: "B", name: "Child Node B", desc: "Down-Right", x: 480, y: 360, w: 160, h: 65 },
    ],
    edges: [{ source: "A", target: "B", label: "connects to" }],
  },
  4: {
    id: 4,
    title: "4. Cycle Loopback",
    nodes: [
      { id: "A", name: "Service A", desc: "Top", x: 280, y: 50, w: 160, h: 65 },
      { id: "B", name: "Service B", desc: "Bottom", x: 280, y: 360, w: 160, h: 65 },
    ],
    edges: [
      { source: "A", target: "B", label: "request" },
      { source: "B", target: "A", label: "↺ callback loop", isCycle: true },
    ],
  },
  5: {
    id: 5,
    title: "5. Obstacle Avoidance",
    nodes: [
      { id: "A", name: "Source A", desc: "Top-Left", x: 60, y: 50, w: 150, h: 60 },
      { id: "C", name: "Obstacle Node C", desc: "Blocking Middle", x: 330, y: 220, w: 160, h: 65 },
      { id: "B", name: "Target B", desc: "Bottom-Right", x: 600, y: 390, w: 150, h: 60 },
    ],
    edges: [{ source: "A", target: "B", label: "bypass route" }],
  },
};
