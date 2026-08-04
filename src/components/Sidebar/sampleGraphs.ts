/**
 * The sample datasets offered in the sidebar.
 *
 * Lives in its own module rather than beside the component so it can be imported by tests without
 * tripping the fast-refresh rule (a component file may only export components).
 */
export interface SampleGraph {
  id: string;
  name: string;
  icon: string;
}

// `id` is the filename stem under `public/data/graphs/` and `name` is that file's `title`. A stale
// id here fetches a 404 and leaves a blank canvas with no error surfaced anywhere, so
// `Sidebar.test.ts` pins this list to the directory in both directions.
export const SAMPLE_GRAPHS: SampleGraph[] = [
  { id: "ai_agent_trace", name: "Autonomous Agent Run — Plan, Execute, Verify, Revise", icon: "🤖" },
  { id: "deep_release_pipeline", name: "Deep Release Pipeline — 14 Sequential Ranks", icon: "🚀" },
  {
    id: "fanout_fanin_scatter_gather",
    name: "Scatter–Gather — One Coordinator, 15 Shards, One Reducer",
    icon: "🔀",
  },
  {
    id: "feedback_retry_state_machine",
    name: "Feedback Heavy — Retries, Compensations And Long Loop-Backs",
    icon: "🔁",
  },
  {
    id: "heavy_label_data_contracts",
    name: "Heavy Labels — Data Contracts Written Out In Full",
    icon: "🏷️",
  },
  {
    id: "long_span_bypass_network",
    name: "Long-Span Bypass — Fast Paths Skipping Five or More Ranks",
    icon: "🌉",
  },
  {
    id: "microservice_platform_topology",
    name: "Mixed Real-World — Full Platform Topology",
    icon: "🏗️",
  },
  {
    id: "multi_component_tenants",
    name: "Multi-Component — Three Fully Isolated Tenant Stacks",
    icon: "🏢",
  },
  {
    id: "parallel_bundle_transports",
    name: "Parallel Bundles — Multiple Channels Between The Same Endpoints",
    icon: "🚚",
  },
  {
    id: "peer_mesh_service_registry",
    name: "Peer Mesh — Six Sibling Services That All Talk Sideways",
    icon: "🕸️",
  },
];

