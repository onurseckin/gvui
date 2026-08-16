import { execSync } from "child_process";

export function parsePortArgs(args: string[]): number[] {
  const ports = new Set<number>();
  if (args.length === 0) {
    // Default port range 4444..4447 plus common Vite preview/dev ports
    for (let p = 4444; p <= 4447; p++) ports.add(p);
    ports.add(5555);
    ports.add(5173);
  } else {
    for (const arg of args) {
      if (arg.includes("-")) {
        const [startStr, endStr] = arg.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let p = start; p <= end; p++) {
            if (p > 0 && p < 65536) ports.add(p);
          }
        }
      } else {
        const port = parseInt(arg, 10);
        if (!isNaN(port) && port > 0 && port < 65536) {
          ports.add(port);
        }
      }
    }
  }
  return Array.from(ports).sort((a, b) => a - b);
}

export function findPidsOnPorts(ports: number[]): { port: number; pid: number }[] {
  if (ports.length === 0) return [];
  const results: { port: number; pid: number }[] = [];
  const myPid = process.pid;
  const parentPid = process.ppid;

  for (const port of ports) {
    try {
      const output = execSync(`lsof -ti:${port} 2>/dev/null`, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();

      if (output) {
        const pids = output
          .split(/\s+/)
          .map((p) => parseInt(p, 10))
          .filter((p) => !isNaN(p) && p !== myPid && p !== parentPid && p > 0);

        for (const pid of pids) {
          results.push({ port, pid });
        }
      }
    } catch {
      // lsof returns exit code 1 when no processes are found
    }
  }

  // Deduplicate by pid and port
  const unique = new Map<string, { port: number; pid: number }>();
  for (const item of results) {
    unique.set(`${item.port}:${item.pid}`, item);
  }
  return Array.from(unique.values());
}

export function killPids(targets: { port: number; pid: number }[]): {
  killed: number[];
  failed: number[];
} {
  const pidsToKill = Array.from(new Set(targets.map((t) => t.pid)));
  const killed: number[] = [];
  const failed: number[] = [];

  for (const pid of pidsToKill) {
    try {
      process.kill(pid, "SIGTERM");
      killed.push(pid);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "ESRCH") {
        // Process already gone
        killed.push(pid);
      } else {
        try {
          process.kill(pid, "SIGKILL");
          killed.push(pid);
        } catch {
          failed.push(pid);
        }
      }
    }
  }

  return { killed, failed };
}

export function cleanPorts(portsToClean?: number[]): {
  ports: number[];
  found: { port: number; pid: number }[];
  killed: number[];
  failed: number[];
} {
  const ports = portsToClean ?? parsePortArgs(process.argv.slice(2));
  const found = findPidsOnPorts(ports);

  if (found.length === 0) {
    console.log(`✓ Ports [${ports.join(", ")}] are clear.`);
    return { ports, found: [], killed: [], failed: [] };
  }

  console.log(
    `Cleaning ${found.length} process(es) on port(s): ${Array.from(new Set(found.map((f) => f.port))).join(", ")}`,
  );
  for (const item of found) {
    console.log(`  - Port ${item.port}: PID ${item.pid}`);
  }

  const { killed, failed } = killPids(found);

  if (killed.length > 0) {
    console.log(`✓ Terminated PID(s): ${killed.join(", ")}`);
  }
  if (failed.length > 0) {
    console.warn(`⚠️ Could not terminate PID(s): ${failed.join(", ")}`);
  }

  return { ports, found, killed, failed };
}

// Execute if run directly
if (import.meta.main || process.argv[1]?.endsWith("clean-ports.ts")) {
  cleanPorts();
}
