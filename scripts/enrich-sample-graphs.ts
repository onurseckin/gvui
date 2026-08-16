import { writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const GRAPHS_DIR = "/Users/onurseckinsenoglu/repos/gvui/public/data/graphs";

// 1. Enrich bugfix_pr_run.json
const bugfixPath = join(GRAPHS_DIR, "bugfix_pr_run.json");
if (existsSync(bugfixPath)) {
  const bugfix = JSON.parse(readFileSync(bugfixPath, "utf-8"));

  for (const node of bugfix.nodes) {
    if (!node.io) {
      node.io = {
        inputs: [
          {
            kind: "summary",
            label: `${node.name} Inputs`,
            preview: `Input payload for ${node.name}`,
          },
        ],
        outputs: [
          {
            kind: "summary",
            label: `${node.name} Outputs`,
            preview: `Execution result for ${node.name}`,
          },
        ],
      };
    }
    if (!node.metadata) node.metadata = {};
    if (!node.mediaAssets) node.mediaAssets = [];
    if (!node.screenshots) node.screenshots = [];

    if (node.id === "implement" || node.id === "review" || node.id === "verdict") {
      const finding = {
        id: "finding-bugfix-token-leak",
        requirementId: "REQ-AUTH-CLEAR",
        severity: "critical",
        status: "resolved",
        observation:
          "Session tokens survive logout on the mobile web client because useLogout.ts calls clearAccess() instead of clearAll().",
        pushbackReason:
          "Attempt 1 failed regression spec: session.spec.ts asserted surviving refresh token, encoding legacy defect.",
        opposedChanges: "Preserving refresh token in localStorage across logout redirect.",
        remediation:
          "Replace tokenStore.clearAccess() with tokenStore.clearAll() and verify refresh token introspection before session restore.",
        targetFiles: [
          "src/auth/useLogout.ts",
          "src/auth/bootstrap.ts",
          "src/auth/__tests__/logout.spec.ts",
        ],
        fileRefs: [
          { path: "src/auth/useLogout.ts", mode: "write", lines: "31" },
          { path: "src/auth/bootstrap.ts", mode: "write", lines: "22-38" },
          { path: "src/auth/__tests__/logout.spec.ts", mode: "write" },
        ],
        revalidationProof: {
          method: "bun test src/auth/__tests__/logout.spec.ts",
          evidence: ["26/26 assertions green", "localStorage verified clean upon logout"],
        },
        screenshots: [
          {
            id: "shot-bugfix-repro",
            type: "image",
            url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80",
            title: "Network Trace: Auth Token Leak Repro",
            description:
              "Browser network trace showing refresh token re-minting access token after logout.",
            mimeType: "image/png",
            dimensions: { width: 1920, height: 1080 },
            timestamp: "2026-08-15T10:14:00Z",
          },
        ],
      };
      node.metadata.findings = [finding];
      node.mediaAssets.push(...finding.screenshots);
      node.screenshots.push(...finding.screenshots);
    }
  }
  writeFileSync(bugfixPath, JSON.stringify(bugfix, null, 2) + "\n", "utf-8");
}

// 2. Enrich incident_response_live.json
const incidentPath = join(GRAPHS_DIR, "incident_response_live.json");
if (existsSync(incidentPath)) {
  const incident = JSON.parse(readFileSync(incidentPath, "utf-8"));
  for (const node of incident.nodes) {
    if (!node.io) {
      node.io = {
        inputs: [
          {
            kind: "summary",
            label: `${node.name} Inputs`,
            preview: `Telemetry and context for ${node.name}`,
          },
        ],
        outputs: [
          {
            kind: "summary",
            label: `${node.name} Outputs`,
            preview: `State and action output for ${node.name}`,
          },
        ],
      };
    }
    if (!node.metadata) node.metadata = {};
    if (!node.mediaAssets) node.mediaAssets = [];
    if (!node.screenshots) node.screenshots = [];

    if (node.id === "falsify" || node.id === "hypothesize" || node.id === "mitigate_drain") {
      const finding = {
        id: "finding-conn-leak-pool",
        requirementId: "REQ-DB-POOL-SAFETY",
        severity: "critical",
        status: "open",
        observation:
          "Postgres primary connection pool at 198/200 saturation due to unreleased connections during fraud-svc callback timeouts.",
        pushbackReason:
          "Rounds 1 and 2 falsified: no deploy occurred in 41h, and organic traffic is within 4% of 7-day median.",
        opposedChanges: "Unsafe direct pod restart without connection draining.",
        remediation:
          "Drain connections on payments-svc, restart pod pool, and patch connection release in exception handler.",
        targetFiles: [
          "services/payments-svc/src/pool.ts",
          "services/payments-svc/src/fraudCallback.ts",
        ],
        fileRefs: [{ path: "services/payments-svc/src/pool.ts", mode: "write" }],
        revalidationProof: {
          method: "GET /api/telemetry/postgres",
          evidence: ["Pool active connections projected to drop from 194 to 12"],
        },
        screenshots: [
          {
            id: "shot-postgres-pool-spike",
            type: "image",
            url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
            title: "Grafana: Postgres Connection Pool Saturation",
            description: "Telemetry dashboard showing active connection count climbing to 198/200.",
            mimeType: "image/png",
            dimensions: { width: 1920, height: 1080 },
            timestamp: "2026-08-15T03:14:22Z",
          },
        ],
      };
      node.metadata.findings = [finding];
      node.mediaAssets.push(...finding.screenshots);
      node.screenshots.push(...finding.screenshots);
    }
  }
  writeFileSync(incidentPath, JSON.stringify(incident, null, 2) + "\n", "utf-8");
}

// 3. Enrich research_judge_panel.json
const researchPath = join(GRAPHS_DIR, "research_judge_panel.json");
if (existsSync(researchPath)) {
  const research = JSON.parse(readFileSync(researchPath, "utf-8"));
  for (const node of research.nodes) {
    if (!node.io) {
      node.io = {
        inputs: [
          {
            kind: "summary",
            label: `${node.name} Context`,
            preview: `Input context for ${node.name}`,
          },
        ],
        outputs: [
          {
            kind: "summary",
            label: `${node.name} Synthesis`,
            preview: `Analysis output for ${node.name}`,
          },
        ],
      };
    }
    if (!node.metadata) node.metadata = {};
    if (!node.mediaAssets) node.mediaAssets = [];
    if (!node.screenshots) node.screenshots = [];

    if (node.id === "lens_perf" || node.id === "synthesize" || node.id === "judge_methodology") {
      const finding = {
        id: "finding-perf-premise-invalid",
        requirementId: "REQ-CAPACITY-EVAL",
        severity: "important",
        status: "resolved",
        observation:
          "Performance replay confirms 3-broker MSK cluster achieves 700k msg/s at 31% CPU; latency issues stem from consumer batching.",
        pushbackReason:
          "Vendor claims of 10x throughput advantage do not justify $95k migration cost when Kafka handles 3x current volume.",
        opposedChanges:
          "Premature migration from Kafka to Redpanda before fixing consumer batching bottlenecks.",
        remediation:
          "Tune consumer batch configurations in the 2 affected services and retain existing MSK infrastructure.",
        targetFiles: ["docs/rfcs/ingest-pipeline-upgrade.md", "config/consumers/batch-tuning.yaml"],
        fileRefs: [{ path: "config/consumers/batch-tuning.yaml", mode: "write" }],
        revalidationProof: {
          method: "Staging replay harness at 240k msg/s",
          evidence: ["Consumer latency p99 dropped from 420ms to 45ms with tuned batch window"],
        },
        screenshots: [
          {
            id: "shot-kafka-benchmark",
            type: "image",
            url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80",
            title: "Benchmark: Kafka MSK vs Redpanda Throughput",
            description:
              "Staging cluster throughput benchmark demonstrating Kafka CPU headroom at 240k msg/s.",
            mimeType: "image/png",
            dimensions: { width: 1920, height: 1080 },
            timestamp: "2026-08-15T14:30:00Z",
          },
        ],
      };
      node.metadata.findings = [finding];
      node.mediaAssets.push(...finding.screenshots);
      node.screenshots.push(...finding.screenshots);
    }
  }
  writeFileSync(researchPath, JSON.stringify(research, null, 2) + "\n", "utf-8");
}

// 4. Create autonomous-loop.json
const autonomousLoop = {
  id: "autonomous-loop",
  title: "Autonomous Self-Healing Loop — Anomaly Detection, Code Synthesis & Gate Verification",
  description:
    "Continuous autonomous feedback loop detecting regression anomalies, isolating root causes, synthesizing repair patches, and enforcing multi-round validator gates with visual proofs.",
  directed: true,
  entry: "node-anomaly-detector",
  exits: ["node-terminal-complete"],
  nodes: [
    {
      id: "node-anomaly-detector",
      name: "Anomaly Detector",
      kind: "input",
      status: "success",
      step: 1,
      stepLabel: "Step 1: Telemetry Stream",
      description:
        "Real-time telemetry stream captures 300ms p99 frame delay and visual smear during rapid pan/zoom canvas operations.",
      badge: { text: "P99 300ms Spike", variant: "error", icon: "IconActivity" },
      metrics: { durationMs: 50, commandCount: 1 },
      io: {
        inputs: [
          {
            kind: "prompt",
            label: "Live Telemetry Feed",
            preview: "Grafana latency telemetry feed",
          },
        ],
        outputs: [
          {
            kind: "decision",
            label: "Anomaly Alert Packet",
            preview: "Canvas dirty-rect repaint smear detected",
          },
        ],
      },
      metadata: {
        mediaAssets: [
          {
            id: "shot-telemetry-spike",
            type: "image",
            url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
            title: "Telemetry Alert: Frame Time Regression",
            description: "Grafana dashboard showing frame drops during canvas panning.",
            mimeType: "image/png",
            dimensions: { width: 1920, height: 1080 },
          },
        ],
        screenshots: [],
        findings: [],
      },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-orchestrator-plan",
      name: "Autonomous Coordinator",
      kind: "orchestrator",
      status: "success",
      step: 2,
      stepLabel: "Step 2: Task Planning",
      description:
        "Decomposes healing task into profile analysis, double-buffer synthesis, and strict visual verification gate.",
      badge: { text: "3 Wave Plan", variant: "info", icon: "IconHierarchy2" },
      metrics: { tokensIn: 8400, tokensOut: 1950, costUsd: 0.18, durationMs: 14200 },
      io: {
        inputs: [
          {
            node: "node-anomaly-detector",
            kind: "decision",
            label: "Anomaly Alert",
            preview: "Canvas dirty-rect repaint smear",
          },
        ],
        outputs: [
          {
            kind: "decision",
            label: "Work Breakdown",
            preview: "Wave 1 Diagnose -> Wave 2 Patch -> Gate 1 Audit",
          },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-agent-diagnose",
      name: "Profiler & Root Cause Agent",
      kind: "agent",
      status: "success",
      model: "Sonnet 5",
      tier: "m",
      step: 3,
      stepLabel: "Wave 1: Diagnosis",
      description:
        "Inspects canvas rendering loop: discovers dirty-rect bounding box misses transformed origin during panning, resulting in partial clearRect smears.",
      badge: { text: "Root Cause Isolated", variant: "success", icon: "IconSearch" },
      files: [{ path: "src/engine/GraphCanvas/CanvasRenderer.ts", mode: "read" }],
      metrics: { tokensIn: 11200, tokensOut: 2400, costUsd: 0.082, durationMs: 28400 },
      io: {
        inputs: [
          {
            node: "node-orchestrator-plan",
            kind: "decision",
            label: "Task Goal",
            preview: "Profile dirty-rect calculation",
          },
        ],
        outputs: [
          {
            kind: "summary",
            label: "Diagnostic Report",
            preview: "Origin matrix mismatch causing uncleared rect buffers",
          },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-agent-patch",
      name: "Synthesis & Repair Agent",
      kind: "agent",
      status: "success",
      model: "Sonnet 5",
      tier: "m",
      step: 4,
      stepLabel: "Wave 2: Synthesis",
      description:
        "Implements full offscreen double-buffering and viewport transform compensation for clean frame clearing.",
      badge: { text: "Patch Applied (Round 2)", variant: "success", icon: "IconWrench" },
      files: [
        { path: "src/engine/GraphCanvas/CanvasRenderer.ts", mode: "write" },
        { path: "src/engine/GraphCanvas/ViewportTransform.ts", mode: "write" },
      ],
      metrics: { tokensIn: 16800, tokensOut: 3200, costUsd: 0.125, durationMs: 42100, retries: 1 },
      io: {
        inputs: [
          {
            node: "node-agent-diagnose",
            kind: "summary",
            label: "Diagnostic Report",
            preview: "Origin matrix mismatch",
          },
          {
            node: "node-gate-validator",
            kind: "decision",
            label: "Pushback Decision (Round 1)",
            preview: "Round 1 patch introduced 4px edge ghosting",
          },
        ],
        outputs: [
          { kind: "file", label: "Modified Files", preview: "2 files updated" },
          {
            kind: "summary",
            label: "Synthesis Summary",
            preview: "Double-buffered transform matrix deployed",
          },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-gate-validator",
      name: "Gate: Visual & Performance Audit",
      kind: "gate",
      status: "success",
      step: 5,
      stepLabel: "Gate 1: Verification",
      description:
        "Runs automated Playwright screenshot visual diff test and 60fps frame rate benchmarks under 1000-node load.",
      badge: { text: "Gate Passed (Round 2)", variant: "success", icon: "IconShieldCheck" },
      metrics: { tokensIn: 4500, tokensOut: 1100, costUsd: 0.035, durationMs: 18200 },
      io: {
        inputs: [
          {
            node: "node-agent-patch",
            kind: "file",
            label: "Patch Code",
            preview: "CanvasRenderer.ts + ViewportTransform.ts",
          },
        ],
        outputs: [
          { kind: "decision", label: "Verdict", preview: "PASSED: 0 pixel diff, 60.1 fps steady" },
        ],
      },
      metadata: {
        findings: [
          {
            id: "finding-ghost-edge-round-1",
            requirementId: "REQ-CANVAS-CLEAN",
            severity: "critical",
            status: "resolved",
            observation:
              "Round 1 patch left a 4px ghost artifact on right-side node borders during high-DPI scaling.",
            pushbackReason:
              "Round 1 failed sub-pixel clipping: 4px border artifacts detected on Retina 2x displays.",
            opposedChanges: "Direct pixel rounding without devicePixelRatio scaling multiplier.",
            remediation:
              "Scale dirty rect clear bounds by window.devicePixelRatio before invoking ctx.clearRect.",
            targetFiles: ["src/engine/GraphCanvas/CanvasRenderer.ts"],
            fileRefs: [{ path: "src/engine/GraphCanvas/CanvasRenderer.ts", mode: "write" }],
            revalidationProof: {
              method: "Playwright pixelmatch screenshot diff",
              evidence: ["Diff pixel count: 0", "Frame budget: 16.4ms avg under 1000 nodes"],
            },
            screenshots: [
              {
                id: "shot-gate-round1-diff",
                type: "image",
                url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80",
                title: "Visual Audit: Sub-pixel Ghosting Diff",
                description: "Pixelmatch comparison showing 4px artifact on canvas border.",
                mimeType: "image/png",
                dimensions: { width: 1920, height: 1080 },
              },
            ],
          },
        ],
        mediaAssets: [],
        screenshots: [],
      },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-critic-review",
      name: "Completeness Critic Review",
      kind: "critic",
      status: "success",
      step: 6,
      stepLabel: "Step 6: Whole-Run Audit",
      description:
        "Whole-run certification audit validating that self-healing loop satisfied all criteria without residual performance leaks.",
      badge: { text: "Certified Clean", variant: "success", icon: "IconScale" },
      metrics: { tokensIn: 5600, tokensOut: 1400, costUsd: 0.045, durationMs: 8200 },
      io: {
        inputs: [
          {
            node: "node-gate-validator",
            kind: "decision",
            label: "Gate Verdict",
            preview: "PASSED: All criteria verified",
          },
        ],
        outputs: [
          {
            kind: "decision",
            label: "Critic Certification",
            preview: "Whole-run certified clean with 0 open findings",
          },
        ],
      },
      metadata: {
        findings: [],
        mediaAssets: [],
        screenshots: [],
      },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-terminal-complete",
      name: "Self-Healing Cycle Complete",
      kind: "terminal",
      status: "success",
      step: 7,
      stepLabel: "Step 7: Production Deployed",
      description: "Autonomous healing cycle sealed. Master branch hotfix verified and deployed.",
      badge: { text: "Deployment Sealed", variant: "success", icon: "IconFlagCheck" },
      metrics: { durationMs: 1200 },
      io: {
        inputs: [
          {
            node: "node-critic-review",
            kind: "decision",
            label: "Critic Packet",
            preview: "Whole-run certified",
          },
        ],
        outputs: [
          {
            kind: "summary",
            label: "Run Summary",
            preview: "Autonomous self-healing completed in 112s",
          },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
  ],
  edges: [
    {
      id: "edge-detect-plan",
      source: "node-anomaly-detector",
      target: "node-orchestrator-plan",
      kind: "sequence",
      badge: { text: "Alert Packet", variant: "error", icon: "IconActivity" },
      traffic: {
        volume: 1,
        tokens: 350,
        latencyMs: 15,
        status: "nominal",
        exchanges: [
          {
            id: "exch-1",
            source: "node-anomaly-detector",
            target: "node-orchestrator-plan",
            kind: "decision",
            summary: "P99 frame drop alert ingested",
            tokens: 350,
            durationMs: 15,
            status: "success",
          },
        ],
      },
    },
    {
      id: "edge-plan-diagnose",
      source: "node-orchestrator-plan",
      target: "node-agent-diagnose",
      kind: "spawn",
      badge: { text: "Diagnose Task", variant: "info", icon: "IconSearch" },
    },
    {
      id: "edge-diagnose-patch",
      source: "node-agent-diagnose",
      target: "node-agent-patch",
      kind: "data",
      badge: { text: "Root Cause Report", variant: "info", icon: "IconFileText" },
    },
    {
      id: "edge-patch-gate",
      source: "node-agent-patch",
      target: "node-gate-validator",
      kind: "sequence",
      badge: { text: "Patch Submission", variant: "info", icon: "IconCode" },
    },
    {
      id: "edge-gate-loop",
      source: "node-gate-validator",
      target: "node-agent-patch",
      kind: "loop",
      isCycle: true,
      condition: "ghost artifact detected",
      badge: { text: "Pushback Round 1", variant: "warning", icon: "IconRefresh" },
      traffic: {
        volume: 1,
        tokens: 650,
        latencyMs: 30,
        status: "nominal",
        exchanges: [
          {
            id: "exch-loop-1",
            source: "node-gate-validator",
            target: "node-agent-patch",
            kind: "decision",
            summary: "Round 1 pushback: 4px ghost border on high-DPI scaling",
            tokens: 650,
            durationMs: 30,
            status: "warning",
            rejectionObservation: "Sub-pixel rounding mismatch during dirty-rect clear",
          },
        ],
      },
    },
    {
      id: "edge-gate-critic",
      source: "node-gate-validator",
      target: "node-critic-review",
      kind: "sequence",
      badge: { text: "Gate Passed", variant: "success", icon: "IconShieldCheck" },
    },
    {
      id: "edge-critic-terminal",
      source: "node-critic-review",
      target: "node-terminal-complete",
      kind: "sequence",
      badge: { text: "Certified Clean", variant: "success", icon: "IconFlagCheck" },
    },
  ],
};
writeFileSync(
  join(GRAPHS_DIR, "autonomous-loop.json"),
  JSON.stringify(autonomousLoop, null, 2) + "\n",
  "utf-8",
);

// 5. Create adversarial-eval.json
const adversarialEval = {
  id: "adversarial-eval",
  title: "Adversarial Stress Evaluation — Red Team Ingestion & Safety Hardening",
  description:
    "Adversarial evaluation suite testing prompt injection boundaries, edge collision hazards, and boundary stress limits across multi-agent pipelines with automated critic review.",
  directed: true,
  entry: "node-red-team-prompt",
  exits: ["node-terminal-safe"],
  nodes: [
    {
      id: "node-red-team-prompt",
      name: "Adversarial Attack Suite",
      kind: "input",
      status: "success",
      step: 1,
      stepLabel: "Step 1: Red Team Corpus",
      description:
        "Generates 50 polymorphic attack vectors including jailbreak attempts, schema poisoning, and WASM memory exhaustion payloads.",
      badge: { text: "50 Attack Vectors", variant: "warning", icon: "IconBug" },
      metrics: { durationMs: 120, commandCount: 1 },
      io: {
        inputs: [
          {
            kind: "prompt",
            label: "Red Team Corpus Generator",
            preview: "Polymorphic payload generation suite",
          },
        ],
        outputs: [
          {
            kind: "decision",
            label: "Attack Suite Vector",
            preview: "50 categorized adversarial probes",
          },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-security-router",
      name: "Security Threat Router",
      kind: "router",
      status: "success",
      step: 2,
      stepLabel: "Step 2: Vector Routing",
      description:
        "Classifies incoming attack vectors into prompt injection, WASM memory bounds, and privilege escalation channels.",
      badge: { text: "3 Threat Channels", variant: "info", icon: "IconArrowsSplit" },
      metrics: { durationMs: 180 },
      io: {
        inputs: [
          {
            node: "node-red-team-prompt",
            kind: "decision",
            label: "Attack Suite",
            preview: "50 vectors",
          },
        ],
        outputs: [
          { kind: "decision", label: "Injection Channel", preview: "20 prompt escape attempts" },
          {
            kind: "decision",
            label: "Memory Bounds Channel",
            preview: "15 WASM buffer exhaustion attacks",
          },
          { kind: "decision", label: "Privilege Channel", preview: "15 capability leak probes" },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-agent-boundary-probe",
      name: "Boundary Stress Probe Agent",
      kind: "agent",
      status: "success",
      model: "Sonnet 5",
      tier: "m",
      step: 3,
      stepLabel: "Wave 1: Boundary Probe",
      description:
        "Executes memory-fuzzing against layout engine and WASM bindings, asserting memory safety and lack of heap corruptions.",
      badge: { text: "Fuzzing Complete", variant: "success", icon: "IconShieldCheck" },
      metrics: { tokensIn: 9800, tokensOut: 2100, costUsd: 0.076, durationMs: 34100 },
      io: {
        inputs: [
          {
            node: "node-security-router",
            kind: "decision",
            label: "Memory Attack Vectors",
            preview: "15 WASM buffer probes",
          },
        ],
        outputs: [
          {
            kind: "summary",
            label: "Memory Audit Report",
            preview: "0 OOM errors, heap bounded strictly under 64MB",
          },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-agent-sanitizer",
      name: "Sanitization & Isolation Agent",
      kind: "agent",
      status: "success",
      model: "Sonnet 5",
      tier: "m",
      step: 4,
      stepLabel: "Wave 2: Sanitization",
      description:
        "Enforces zero-trust schema validation, HTML entity scrubbing, and prompt context boundary delimiters.",
      badge: { text: "Hardened Boundaries", variant: "success", icon: "IconLock" },
      files: [{ path: "src/security/sanitizer.ts", mode: "write" }],
      metrics: { tokensIn: 14500, tokensOut: 2800, costUsd: 0.108, durationMs: 38200 },
      io: {
        inputs: [
          {
            node: "node-security-router",
            kind: "decision",
            label: "Injection Vectors",
            preview: "20 prompt escape attempts",
          },
        ],
        outputs: [
          { kind: "file", label: "Sanitizer Patch", preview: "src/security/sanitizer.ts updated" },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-gate-safety-audit",
      name: "Gate: Safety & Boundary Audit",
      kind: "gate",
      status: "success",
      step: 5,
      stepLabel: "Gate 1: Safety Gate",
      description:
        "Executes 100% automated penetration suite: verifies 0 prompt escapes, 0 WASM memory leaks, and 100% schema compliance.",
      badge: { text: "Safety Gate Passed", variant: "success", icon: "IconShieldCheck" },
      metrics: { tokensIn: 6200, tokensOut: 1400, costUsd: 0.048, durationMs: 21300 },
      io: {
        inputs: [
          {
            node: "node-agent-boundary-probe",
            kind: "summary",
            label: "Memory Audit",
            preview: "0 OOM errors",
          },
          {
            node: "node-agent-sanitizer",
            kind: "file",
            label: "Sanitizer Patch",
            preview: "sanitizer.ts",
          },
        ],
        outputs: [
          {
            kind: "decision",
            label: "Safety Verdict",
            preview: "PASSED: 50/50 vectors neutralised",
          },
        ],
      },
      metadata: {
        findings: [
          {
            id: "finding-eval-prompt-escape",
            requirementId: "REQ-SEC-INJECTION",
            severity: "critical",
            status: "resolved",
            observation:
              "Markdown raw HTML rendering vector allowed arbitrary script tag execution in node description cards.",
            pushbackReason:
              "Penetration test triggered unsanitized DOM insertion in ErrorInspector card header.",
            opposedChanges: "Using dangerouslySetInnerHTML without DOMPurify scrubbing.",
            remediation: "Wrap all markdown rendering in strict DOMPurify sanitizer pipeline.",
            targetFiles: ["src/security/sanitizer.ts", "src/components/MarkdownViewer.tsx"],
            fileRefs: [{ path: "src/security/sanitizer.ts", mode: "write" }],
            revalidationProof: {
              method: "Red team exploit test harness",
              evidence: [
                "Script tag execution blocked: 0 escapes",
                "DOMPurify verified on all input channels",
              ],
            },
            screenshots: [
              {
                id: "shot-safety-audit",
                type: "image",
                url: "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1200&q=80",
                title: "Safety Audit: DOM Sanitization Proof",
                description: "Security probe verification log showing blocked injection payload.",
                mimeType: "image/png",
                dimensions: { width: 1920, height: 1080 },
              },
            ],
          },
        ],
        mediaAssets: [],
        screenshots: [],
      },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-critic-red-team",
      name: "Completeness Critic Review",
      kind: "critic",
      status: "success",
      step: 6,
      stepLabel: "Step 6: Security Sign-off",
      description:
        "Whole-run certification audit validating zero open vulnerabilities and safe threat envelope.",
      badge: { text: "Security Certified", variant: "success", icon: "IconScale" },
      metrics: { tokensIn: 4800, tokensOut: 1200, costUsd: 0.038, durationMs: 7600 },
      io: {
        inputs: [
          {
            node: "node-gate-safety-audit",
            kind: "decision",
            label: "Safety Verdict",
            preview: "PASSED: 50/50 vectors neutralised",
          },
        ],
        outputs: [
          {
            kind: "decision",
            label: "Security Certification",
            preview: "Certified safe against red team corpus",
          },
        ],
      },
      metadata: { findings: [], mediaAssets: [], screenshots: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-terminal-safe",
      name: "Hardened Release Sealed",
      kind: "terminal",
      status: "success",
      step: 7,
      stepLabel: "Step 7: Production Release",
      description: "Security hardening sealed and verified for global production rollout.",
      badge: { text: "Release Hardened", variant: "success", icon: "IconFlagCheck" },
      metrics: { durationMs: 800 },
      io: {
        inputs: [
          {
            node: "node-critic-red-team",
            kind: "decision",
            label: "Security Certification",
            preview: "Certified safe",
          },
        ],
        outputs: [
          {
            kind: "summary",
            label: "Final Report",
            preview: "Adversarial stress evaluation passed with 0 vulnerabilities",
          },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
  ],
  edges: [
    {
      id: "edge-prompt-router",
      source: "node-red-team-prompt",
      target: "node-security-router",
      kind: "sequence",
      badge: { text: "Threat Vectors", variant: "warning", icon: "IconBug" },
    },
    {
      id: "edge-router-probe",
      source: "node-security-router",
      target: "node-agent-boundary-probe",
      kind: "spawn",
      badge: { text: "Memory Fuzzing", variant: "info", icon: "IconCpu" },
    },
    {
      id: "edge-router-sanitizer",
      source: "node-security-router",
      target: "node-agent-sanitizer",
      kind: "spawn",
      badge: { text: "Injection Scrub", variant: "info", icon: "IconLock" },
    },
    {
      id: "edge-probe-gate",
      source: "node-agent-boundary-probe",
      target: "node-gate-safety-audit",
      kind: "sequence",
      badge: { text: "Memory Proof", variant: "success", icon: "IconCheck" },
    },
    {
      id: "edge-sanitizer-gate",
      source: "node-agent-sanitizer",
      target: "node-gate-safety-audit",
      kind: "sequence",
      badge: { text: "Sanitizer Spec", variant: "success", icon: "IconCheck" },
    },
    {
      id: "edge-gate-critic",
      source: "node-gate-safety-audit",
      target: "node-critic-red-team",
      kind: "sequence",
      badge: { text: "Safety Certified", variant: "success", icon: "IconShieldCheck" },
    },
    {
      id: "edge-critic-terminal",
      source: "node-critic-red-team",
      target: "node-terminal-safe",
      kind: "sequence",
      badge: { text: "Release Hardened", variant: "success", icon: "IconFlagCheck" },
    },
  ],
};
writeFileSync(
  join(GRAPHS_DIR, "adversarial-eval.json"),
  JSON.stringify(adversarialEval, null, 2) + "\n",
  "utf-8",
);

// 6. Create multi-agent-system.json
const multiAgentSystem = {
  id: "multi-agent-system",
  title: "Multi-Agent System Orchestration — Distributed Synthesis & Quality Gates",
  description:
    "Multi-wave parallel implementer topology with telemetry streaming, isolated write scopes, automated test execution, and comprehensive validator gate sign-offs.",
  directed: true,
  entry: "node-sys-prompt",
  exits: ["node-sys-complete"],
  nodes: [
    {
      id: "node-sys-prompt",
      name: "Architecture Specification",
      kind: "input",
      status: "success",
      step: 1,
      stepLabel: "Step 1: System Spec",
      description:
        "System specification defining 3 microservices with RPC contracts, rate limiting, and distributed object caching.",
      badge: { text: "3 Microservices", variant: "info", icon: "IconServer" },
      metrics: { durationMs: 40, commandCount: 1 },
      io: {
        inputs: [
          {
            kind: "prompt",
            label: "Spec Document",
            preview: "Microservice mesh architecture spec",
          },
        ],
        outputs: [
          {
            kind: "decision",
            label: "System Goals",
            preview: "Auth, Gateway, and Storage services",
          },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-orchestrator-decompose",
      name: "Topology Orchestrator",
      kind: "orchestrator",
      status: "success",
      step: 2,
      stepLabel: "Step 2: Topology Plan",
      description:
        "Decomposes architecture into 3 parallel implementation streams with strictly isolated write scopes.",
      badge: { text: "3 Parallel Streams", variant: "info", icon: "IconHierarchy2" },
      metrics: { tokensIn: 12000, tokensOut: 2800, costUsd: 0.24, durationMs: 18500 },
      io: {
        inputs: [
          {
            node: "node-sys-prompt",
            kind: "decision",
            label: "System Spec",
            preview: "Microservice mesh architecture",
          },
        ],
        outputs: [
          {
            kind: "decision",
            label: "Scope Allocation",
            preview: "Auth (Scope A), Gateway (Scope B), Storage (Scope C)",
          },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-agent-auth-service",
      name: "Auth Service Implementer",
      kind: "agent",
      status: "success",
      model: "Sonnet 5",
      tier: "m",
      step: 3,
      stepLabel: "Wave 1: Auth Service",
      description:
        "Implements OAuth2 authentication, JWT token signing, and session revocation handlers.",
      badge: { text: "Auth Complete", variant: "success", icon: "IconKey" },
      files: [{ path: "services/auth/src/index.ts", mode: "write" }],
      metrics: { tokensIn: 18200, tokensOut: 3400, costUsd: 0.135, durationMs: 48200 },
      io: {
        inputs: [
          {
            node: "node-orchestrator-decompose",
            kind: "decision",
            label: "Scope A",
            preview: "Auth Service requirements",
          },
        ],
        outputs: [{ kind: "file", label: "Auth Code", preview: "services/auth/src/index.ts" }],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-agent-gateway-service",
      name: "Gateway Service Implementer",
      kind: "agent",
      status: "success",
      model: "Sonnet 5",
      tier: "m",
      step: 3,
      stepLabel: "Wave 1: Gateway Service",
      description:
        "Implements high-throughput reverse proxy with dynamic token-bucket rate limiting and circuit breaking.",
      badge: { text: "Gateway Complete", variant: "success", icon: "IconRouter" },
      files: [{ path: "services/gateway/src/index.ts", mode: "write" }],
      metrics: { tokensIn: 16400, tokensOut: 3100, costUsd: 0.122, durationMs: 44100 },
      io: {
        inputs: [
          {
            node: "node-orchestrator-decompose",
            kind: "decision",
            label: "Scope B",
            preview: "Gateway Service requirements",
          },
        ],
        outputs: [
          { kind: "file", label: "Gateway Code", preview: "services/gateway/src/index.ts" },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-agent-storage-service",
      name: "Storage Service Implementer",
      kind: "agent",
      status: "success",
      model: "Sonnet 5",
      tier: "m",
      step: 3,
      stepLabel: "Wave 1: Storage Service",
      description:
        "Implements distributed object cache with S3 replication, local disk fallbacks, and LRU eviction.",
      badge: { text: "Storage Complete", variant: "success", icon: "IconDatabase" },
      files: [{ path: "services/storage/src/index.ts", mode: "write" }],
      metrics: { tokensIn: 15100, tokensOut: 2900, costUsd: 0.114, durationMs: 41800 },
      io: {
        inputs: [
          {
            node: "node-orchestrator-decompose",
            kind: "decision",
            label: "Scope C",
            preview: "Storage Service requirements",
          },
        ],
        outputs: [
          { kind: "file", label: "Storage Code", preview: "services/storage/src/index.ts" },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-join-services",
      name: "Integration Aggregator",
      kind: "join",
      status: "success",
      step: 4,
      stepLabel: "Step 4: Integration Join",
      description:
        "Combines code submissions from all 3 services into unified integration test bundle.",
      badge: { text: "Mesh Unified", variant: "info", icon: "IconLayersLinked" },
      metrics: { durationMs: 350 },
      io: {
        inputs: [
          {
            node: "node-agent-auth-service",
            kind: "file",
            label: "Auth Code",
            preview: "services/auth",
          },
          {
            node: "node-agent-gateway-service",
            kind: "file",
            label: "Gateway Code",
            preview: "services/gateway",
          },
          {
            node: "node-agent-storage-service",
            kind: "file",
            label: "Storage Code",
            preview: "services/storage",
          },
        ],
        outputs: [
          { kind: "artifact", label: "Unified Mesh Bundle", preview: "3 services unified" },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-gate-integration-verify",
      name: "Gate: Mesh Integration Suite",
      kind: "gate",
      status: "success",
      step: 5,
      stepLabel: "Gate 1: Integration Suite",
      description:
        "Executes end-to-end integration tests: authenticates via Auth, proxies through Gateway, reads/writes from Storage.",
      badge: { text: "All Tests Green", variant: "success", icon: "IconShieldCheck" },
      metrics: { tokensIn: 8400, tokensOut: 1800, costUsd: 0.068, durationMs: 26400 },
      io: {
        inputs: [
          {
            node: "node-join-services",
            kind: "artifact",
            label: "Unified Mesh Bundle",
            preview: "3 services unified",
          },
        ],
        outputs: [
          {
            kind: "decision",
            label: "Integration Verdict",
            preview: "PASSED: 48/48 integration specs pass",
          },
        ],
      },
      metadata: {
        findings: [
          {
            id: "finding-jwt-clock-skew",
            requirementId: "REQ-AUTH-GATEWAY-SYNC",
            severity: "important",
            status: "resolved",
            observation:
              "Gateway rejected Auth service JWTs due to 1000ms clock-skew tolerance missing on token validation.",
            pushbackReason:
              "Integration test failed with 401 Unauthorized during token validation under concurrent load.",
            opposedChanges: "Strict zero-leeway token verification timestamp checks.",
            remediation:
              "Add 5-second clock skew leeway to JWT verification options in Gateway service.",
            targetFiles: ["services/gateway/src/jwt.ts"],
            fileRefs: [{ path: "services/gateway/src/jwt.ts", mode: "write" }],
            revalidationProof: {
              method: "bun test tests/integration/mesh.spec.ts",
              evidence: [
                "48/48 integration tests green",
                "0 token rejection under concurrent simulated load",
              ],
            },
            screenshots: [
              {
                id: "shot-mesh-integration",
                type: "image",
                url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80",
                title: "Integration Proof: 3-Service Mesh RPCs",
                description:
                  "Telemetry trace showing successful end-to-end request passing through Gateway, Auth, and Storage.",
                mimeType: "image/png",
                dimensions: { width: 1920, height: 1080 },
              },
            ],
          },
        ],
        mediaAssets: [],
        screenshots: [],
      },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-critic-system-authority",
      name: "Completeness Critic Review",
      kind: "critic",
      status: "success",
      step: 6,
      stepLabel: "Step 6: System Certification",
      description:
        "Whole-run certification audit validating end-to-end multi-agent mesh integrity and SLA requirements.",
      badge: { text: "Mesh Certified", variant: "success", icon: "IconScale" },
      metrics: { tokensIn: 6400, tokensOut: 1500, costUsd: 0.052, durationMs: 9100 },
      io: {
        inputs: [
          {
            node: "node-gate-integration-verify",
            kind: "decision",
            label: "Integration Verdict",
            preview: "PASSED: 48/48 specs pass",
          },
        ],
        outputs: [
          {
            kind: "decision",
            label: "System Certification",
            preview: "System certified for production release",
          },
        ],
      },
      metadata: { findings: [], mediaAssets: [], screenshots: [] },
      mediaAssets: [],
      screenshots: [],
    },
    {
      id: "node-sys-complete",
      name: "Production Release Sealed",
      kind: "terminal",
      status: "success",
      step: 7,
      stepLabel: "Step 7: Production Sealed",
      description:
        "Distributed multi-agent system verified, sealed, and packaged into production release image.",
      badge: { text: "Release Sealed", variant: "success", icon: "IconFlagCheck" },
      metrics: { durationMs: 1400 },
      io: {
        inputs: [
          {
            node: "node-critic-system-authority",
            kind: "decision",
            label: "System Certification",
            preview: "Certified",
          },
        ],
        outputs: [
          {
            kind: "summary",
            label: "Release Manifest",
            preview: "Release v3.0.0 built and pushed",
          },
        ],
      },
      metadata: { mediaAssets: [], screenshots: [], findings: [] },
      mediaAssets: [],
      screenshots: [],
    },
  ],
  edges: [
    {
      id: "edge-prompt-orchestrator",
      source: "node-sys-prompt",
      target: "node-orchestrator-decompose",
      kind: "sequence",
      badge: { text: "Spec Ingested", variant: "info", icon: "IconServer" },
    },
    {
      id: "edge-orch-auth",
      source: "node-orchestrator-decompose",
      target: "node-agent-auth-service",
      kind: "spawn",
      badge: { text: "Scope A: Auth", variant: "info", icon: "IconKey" },
    },
    {
      id: "edge-orch-gateway",
      source: "node-orchestrator-decompose",
      target: "node-agent-gateway-service",
      kind: "spawn",
      badge: { text: "Scope B: Gateway", variant: "info", icon: "IconRouter" },
    },
    {
      id: "edge-orch-storage",
      source: "node-orchestrator-decompose",
      target: "node-agent-storage-service",
      kind: "spawn",
      badge: { text: "Scope C: Storage", variant: "info", icon: "IconDatabase" },
    },
    {
      id: "edge-auth-join",
      source: "node-agent-auth-service",
      target: "node-join-services",
      kind: "join",
      badge: { text: "Auth Ready", variant: "success", icon: "IconCheck" },
    },
    {
      id: "edge-gateway-join",
      source: "node-agent-gateway-service",
      target: "node-join-services",
      kind: "join",
      badge: { text: "Gateway Ready", variant: "success", icon: "IconCheck" },
    },
    {
      id: "edge-storage-join",
      source: "node-agent-storage-service",
      target: "node-join-services",
      kind: "join",
      badge: { text: "Storage Ready", variant: "success", icon: "IconCheck" },
    },
    {
      id: "edge-join-gate",
      source: "node-join-services",
      target: "node-gate-integration-verify",
      kind: "sequence",
      badge: { text: "Integration Test", variant: "info", icon: "IconPlay" },
    },
    {
      id: "edge-gate-critic",
      source: "node-gate-integration-verify",
      target: "node-critic-system-authority",
      kind: "sequence",
      badge: { text: "Integration Passed", variant: "success", icon: "IconShieldCheck" },
    },
    {
      id: "edge-critic-terminal",
      source: "node-critic-system-authority",
      target: "node-sys-complete",
      kind: "sequence",
      badge: { text: "Release Sealed", variant: "success", icon: "IconFlagCheck" },
    },
  ],
};
writeFileSync(
  join(GRAPHS_DIR, "multi-agent-system.json"),
  JSON.stringify(multiAgentSystem, null, 2) + "\n",
  "utf-8",
);

// 7. Update manifest.json with all datasets in GRAPHS_DIR
const allFiles = readdirSync(GRAPHS_DIR)
  .filter((f) => f.endsWith(".json") && f !== "manifest.json")
  .map((f) => f.slice(0, -".json".length))
  .sort();

writeFileSync(join(GRAPHS_DIR, "manifest.json"), JSON.stringify(allFiles, null, 2) + "\n", "utf-8");

console.log(
  "Successfully enriched all graphs and updated manifest.json with",
  allFiles.length,
  "datasets.",
);
