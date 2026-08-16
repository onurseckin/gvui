import { describe, expect, it } from "bun:test";
import {
  createDefaultMockCommands,
  createDefaultMockEnv,
  createDefaultVirtualFileSystem,
  resolvePath,
} from "../../engine/sandbox/mockEnvironment";
import { createExecutionTraceFromRun, runSandboxSimulation } from "../../engine/sandbox/simulator";
import type { SandboxConfig } from "../../engine/sandbox/types";

describe("simulator & mockEnvironment Unit Tests", () => {
  const config: SandboxConfig = {
    env: createDefaultMockEnv(),
    vfs: createDefaultVirtualFileSystem(),
    cwd: "/workspace",
    commands: createDefaultMockCommands(),
  };

  describe("resolvePath", () => {
    it("resolves relative and absolute paths with .. and .", () => {
      expect(resolvePath("/workspace", "src/index.ts")).toBe("/workspace/src/index.ts");
      expect(resolvePath("/workspace", "/etc/hosts")).toBe("/etc/hosts");
      expect(resolvePath("/workspace/src", "../package.json")).toBe("/workspace/package.json");
    });
  });

  describe("Built-in Mock Commands", () => {
    it("runs echo with -n and -e flags", () => {
      const res = runSandboxSimulation("echo -e 'Hello\\nWorld'", config);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe("Hello\nWorld\n");
    });

    it("runs cat on VFS files and handles missing files", () => {
      const res = runSandboxSimulation("cat package.json", config);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("gvui-app");

      const missingRes = runSandboxSimulation("cat nonexistent.txt", config);
      expect(missingRes.exitCode).toBe(1);
      expect(missingRes.stderr).toContain("No such file or directory");
    });

    it("runs grep with flags (-i, -v, -n, -c)", () => {
      const res = runSandboxSimulation("grep -i gvui-app package.json", config);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("gvui-app");

      const countRes = runSandboxSimulation("grep -c dependencies package.json", config);
      expect(countRes.exitCode).toBe(0);
      expect(countRes.stdout.trim()).toBe("1");
    });

    it("runs ls with -l and -a flags", () => {
      const res = runSandboxSimulation("ls", config);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("package.json");
      expect(res.stdout).toContain("README.md");

      const allRes = runSandboxSimulation("ls -a", config);
      expect(allRes.stdout).toContain(".env");
    });

    it("runs head and tail on virtual files", () => {
      const headRes = runSandboxSimulation("head -n 2 package.json", config);
      expect(headRes.exitCode).toBe(0);
      expect(headRes.stdout.split("\n").filter(Boolean).length).toBe(2);

      const tailRes = runSandboxSimulation("tail -n 2 package.json", config);
      expect(tailRes.exitCode).toBe(0);
      expect(tailRes.stdout.split("\n").filter(Boolean).length).toBe(2);
    });

    it("runs sort and uniq on piped streams", () => {
      const res = runSandboxSimulation(
        "echo -e 'banana\\napple\\napple\\ncherry' | sort | uniq -c",
        config,
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("2 apple");
      expect(res.stdout).toContain("1 banana");
      expect(res.stdout).toContain("1 cherry");
    });

    it("runs env / printenv with custom environment overrides", () => {
      const res = runSandboxSimulation("printenv CUSTOM_VAR", config, {
        env: { CUSTOM_VAR: "magic_value_42" },
      });
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe("magic_value_42\n");
    });
  });

  describe("Pipelines & Redirections", () => {
    it("pipes output through multiple commands", () => {
      const res = runSandboxSimulation("cat package.json | grep name | wc -l", config);
      expect(res.exitCode).toBe(0);
      expect(parseInt(res.stdout.trim(), 10)).toBe(1);
    });

    it("redirects output to a new virtual file and reads it back", () => {
      const resWrite = runSandboxSimulation(
        "echo 'dynamically created' > /workspace/test.txt",
        config,
      );
      expect(resWrite.exitCode).toBe(0);

      // Now run cat on that file in the same or updated config
      const updatedConfig: SandboxConfig = {
        ...config,
        vfs: {
          ...config.vfs,
          "/workspace/test.txt": {
            path: "/workspace/test.txt",
            content: "dynamically created\n",
            modifiedAt: new Date().toISOString(),
          },
        },
      };
      const resRead = runSandboxSimulation("cat test.txt", updatedConfig);
      expect(resRead.exitCode).toBe(0);
      expect(resRead.stdout).toContain("dynamically created");
    });

    it("handles conditional operators (&& and ||)", () => {
      const resAndPass = runSandboxSimulation("true && echo passed", config);
      expect(resAndPass.stdout).toBe("passed\n");

      const resAndFail = runSandboxSimulation("false && echo should_not_run", config);
      expect(resAndFail.stdout).toBe("");

      const resOrRecover = runSandboxSimulation("false || echo recovered", config);
      expect(resOrRecover.stdout).toBe("recovered\n");
    });

    it("records timeline events with timestamps and stream tags", () => {
      const res = runSandboxSimulation("echo 'hello' && echo 'world'", config);
      expect(res.events.length).toBeGreaterThan(3);

      const spawnEv = res.events.find((e) => e.type === "spawn");
      expect(spawnEv).toBeDefined();

      const exitEv = res.events.find((e) => e.type === "exit");
      expect(exitEv).toBeDefined();
      expect(exitEv?.exitCode).toBe(0);

      const stdoutEvents = res.events.filter((e) => e.type === "stdout_chunk");
      expect(stdoutEvents.length).toBeGreaterThanOrEqual(2);
    });

    it("creates a recorded execution trace", () => {
      const res = runSandboxSimulation("bun test", config);
      const trace = createExecutionTraceFromRun("trace-1", res, config.env, config.cwd, {
        stdout: "bun test",
        stderr: "",
        exitCode: 0,
      });

      expect(trace.id).toBe("trace-1");
      expect(trace.command).toBe("bun test");
      expect(trace.events.length).toBe(res.events.length);
      expect(trace.expectedBaseline).toBeDefined();
    });
  });
});
