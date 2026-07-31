import type { TestScenario } from "../types";

export const CUSTOM_LAYOUT_SCENARIOS: Record<number, TestScenario> = {
  1: {
    id: 1,
    title: "1. Full Microservice Mesh (Most Complex)",
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
  2: {
    id: 2,
    title: "2. Multi-Tier Fan-Out & Convergence",
    nodes: [
      { id: "INGRESS", name: "Ingress Proxy", desc: "Traffic Router", x: 380, y: 40, w: 160, h: 65 },
      { id: "SVCA", name: "Service A", desc: "Worker A", x: 60, y: 220, w: 150, h: 65 },
      { id: "SVCB", name: "Service B", desc: "Worker B", x: 280, y: 220, w: 150, h: 65 },
      { id: "SVCC", name: "Service C", desc: "Worker C", x: 500, y: 220, w: 150, h: 65 },
      { id: "SVCD", name: "Service D", desc: "Worker D", x: 720, y: 220, w: 150, h: 65 },
      { id: "BUS", name: "Event Bus", desc: "Kafka Cluster", x: 380, y: 420, w: 160, h: 65 },
    ],
    edges: [
      { source: "INGRESS", target: "SVCA", label: "route A" },
      { source: "INGRESS", target: "SVCB", label: "route B" },
      { source: "INGRESS", target: "SVCC", label: "route C" },
      { source: "INGRESS", target: "SVCD", label: "route D" },
      { source: "SVCA", target: "BUS", label: "publish A" },
      { source: "SVCB", target: "BUS", label: "publish B" },
      { source: "SVCC", target: "BUS", label: "publish C" },
      { source: "SVCD", target: "BUS", label: "publish D" },
    ],
  },
  3: {
    id: 3,
    title: "3. Diamond with Cross-Link",
    nodes: [
      { id: "SRC", name: "Data Ingestion", desc: "Source Feed", x: 360, y: 50, w: 160, h: 65 },
      { id: "PROC1", name: "Processor Alpha", desc: "Filter & Clean", x: 120, y: 230, w: 160, h: 65 },
      { id: "PROC2", name: "Processor Beta", desc: "Enrich & Transform", x: 600, y: 230, w: 160, h: 65 },
      { id: "SINK", name: "Analytics Sink", desc: "Warehouse", x: 360, y: 410, w: 160, h: 65 },
    ],
    edges: [
      { source: "SRC", target: "PROC1", label: "stream 1" },
      { source: "SRC", target: "PROC2", label: "stream 2" },
      { source: "PROC1", target: "PROC2", label: "cross sync" },
      { source: "PROC1", target: "SINK", label: "output 1" },
      { source: "PROC2", target: "SINK", label: "output 2" },
    ],
  },
  4: {
    id: 4,
    title: "4. Bidirectional Feedback Loop",
    nodes: [
      { id: "CLIENT", name: "Client App", desc: "Frontend Client", x: 260, y: 60, w: 160, h: 65 },
      { id: "WORKER", name: "Async Worker", desc: "Task Processing", x: 260, y: 340, w: 160, h: 65 },
    ],
    edges: [
      { source: "CLIENT", target: "WORKER", label: "dispatch task" },
      { source: "WORKER", target: "CLIENT", label: "↺ status callback", isCycle: true },
    ],
  },
  5: {
    id: 5,
    title: "5. Direct Two-Node Pipeline (Most Basic)",
    nodes: [
      { id: "A", name: "Source Node A", desc: "Producer", x: 100, y: 180, w: 160, h: 65 },
      { id: "B", name: "Target Node B", desc: "Consumer", x: 500, y: 180, w: 160, h: 65 },
    ],
    edges: [{ source: "A", target: "B", label: "direct flow" }],
  },
};
