import { describe, expect, it, beforeEach } from "bun:test";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { DEFAULT_WEBGL_CONFIG, useWebGLRendererStore } from "../../../store/useWebGLRendererStore";
import {
  WebGLBufferManager,
  WebGLContextLossManager,
  WebGLParticleSystem,
  WebGLRenderer,
  compileShader,
  createEdgeProgram,
  createNodeProgramWithFallback,
  createParticleProgram,
  createShaderProgram,
  type ViewportTransform,
} from "./index";

// ============================================================================
// Mock WebGL & Canvas Implementation for Headless Bun Testing (Zero `any`)
// ============================================================================

class MockWebGLBuffer {}
class MockWebGLShader {}
class MockWebGLProgram {}

interface MockShaderState {
  source: string;
  type: number;
  compiled: boolean;
  infoLog: string;
}

interface MockProgramState {
  shaders: MockWebGLShader[];
  linked: boolean;
  infoLog: string;
}

class MockWebGLRenderingContext {
  public canvas: HTMLCanvasElement;
  public drawingBufferWidth = 800;
  public drawingBufferHeight = 600;

  // Constants
  public readonly VERTEX_SHADER = 35633;
  public readonly FRAGMENT_SHADER = 35632;
  public readonly COMPILE_STATUS = 35713;
  public readonly LINK_STATUS = 35714;
  public readonly ARRAY_BUFFER = 34962;
  public readonly ELEMENT_ARRAY_BUFFER = 34963;
  public readonly STATIC_DRAW = 35044;
  public readonly DYNAMIC_DRAW = 35048;
  public readonly FLOAT = 5126;
  public readonly UNSIGNED_SHORT = 5123;
  public readonly UNSIGNED_INT = 5125;
  public readonly TRIANGLES = 4;
  public readonly POINTS = 0;
  public readonly BLEND = 3042;
  public readonly SRC_ALPHA = 770;
  public readonly ONE_MINUS_SRC_ALPHA = 771;
  public readonly DEPTH_TEST = 2929;
  public readonly CULL_FACE = 2884;
  public readonly COLOR_BUFFER_BIT = 16384;

  private shaderMap = new Map<MockWebGLShader, MockShaderState>();
  private programMap = new Map<MockWebGLProgram, MockProgramState>();

  public failNextCompileCount = 0;
  public failNextLink = false;
  public drawCallsCount = 0;
  public instancedDrawCallsCount = 0;
  public deletedBuffersCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public clearColor(): void {}
  public clear(): void {}
  public viewport(): void {}
  public enable(): void {}
  public disable(): void {}
  public blendFunc(): void {}
  public useProgram(_program: WebGLProgram | null): void {}

  public bindBuffer(_target: number, _buffer: WebGLBuffer | null): void {}

  public bufferData(): void {}
  public bufferSubData(): void {}

  public createBuffer(): WebGLBuffer {
    return new MockWebGLBuffer() as unknown as WebGLBuffer;
  }

  public deleteBuffer(): void {
    this.deletedBuffersCount++;
  }

  public createShader(type: number): WebGLShader {
    const shader = new MockWebGLShader() as unknown as WebGLShader;
    this.shaderMap.set(shader as unknown as MockWebGLShader, {
      source: "",
      type,
      compiled: false,
      infoLog: "",
    });
    return shader;
  }

  public deleteShader(shader: WebGLShader): void {
    this.shaderMap.delete(shader as unknown as MockWebGLShader);
  }

  public shaderSource(shader: WebGLShader, source: string): void {
    const state = this.shaderMap.get(shader as unknown as MockWebGLShader);
    if (state) state.source = source;
  }

  public compileShader(shader: WebGLShader): void {
    const state = this.shaderMap.get(shader as unknown as MockWebGLShader);
    if (state) {
      if (this.failNextCompileCount > 0) {
        this.failNextCompileCount--;
        state.compiled = false;
        state.infoLog = "Synthetic shader compile failure";
      } else {
        state.compiled = true;
        state.infoLog = "";
      }
    }
  }

  public getShaderParameter(shader: WebGLShader, pname: number): unknown {
    const state = this.shaderMap.get(shader as unknown as MockWebGLShader);
    if (pname === this.COMPILE_STATUS) {
      return state ? state.compiled : false;
    }
    return null;
  }

  public getShaderInfoLog(shader: WebGLShader): string | null {
    const state = this.shaderMap.get(shader as unknown as MockWebGLShader);
    return state ? state.infoLog : null;
  }

  public createProgram(): WebGLProgram {
    const program = new MockWebGLProgram() as unknown as WebGLProgram;
    this.programMap.set(program as unknown as MockWebGLProgram, {
      shaders: [],
      linked: false,
      infoLog: "",
    });
    return program;
  }

  public deleteProgram(program: WebGLProgram): void {
    this.programMap.delete(program as unknown as MockWebGLProgram);
  }

  public attachShader(program: WebGLProgram, shader: WebGLShader): void {
    const state = this.programMap.get(program as unknown as MockWebGLProgram);
    if (state) {
      state.shaders.push(shader as unknown as MockWebGLShader);
    }
  }

  public linkProgram(program: WebGLProgram): void {
    const state = this.programMap.get(program as unknown as MockWebGLProgram);
    if (state) {
      if (this.failNextLink) {
        state.linked = false;
        state.infoLog = "Synthetic link failure";
      } else {
        state.linked = true;
        state.infoLog = "";
      }
    }
  }

  public getProgramParameter(program: WebGLProgram, pname: number): unknown {
    const state = this.programMap.get(program as unknown as MockWebGLProgram);
    if (pname === this.LINK_STATUS) {
      return state ? state.linked : false;
    }
    return null;
  }

  public getProgramInfoLog(program: WebGLProgram): string | null {
    const state = this.programMap.get(program as unknown as MockWebGLProgram);
    return state ? state.infoLog : null;
  }

  public getAttribLocation(_program: WebGLProgram, name: string): number {
    return Math.abs(name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 16;
  }

  public getUniformLocation(_program: WebGLProgram, name: string): WebGLUniformLocation | null {
    return { name } as unknown as WebGLUniformLocation;
  }

  public enableVertexAttribArray(): void {}
  public disableVertexAttribArray(): void {}
  public vertexAttribPointer(): void {}
  public uniform1f(): void {}
  public uniform2f(): void {}
  public uniform3f(): void {}
  public uniform4f(): void {}
  public uniform1i(): void {}
  public uniformMatrix3fv(): void {}
  public uniformMatrix4fv(): void {}

  public drawArrays(): void {
    this.drawCallsCount++;
  }

  public drawElements(): void {
    this.drawCallsCount++;
  }

  public getExtension(name: string): unknown {
    if (name === "ANGLE_instanced_arrays") {
      return {
        vertexAttribDivisorANGLE: () => {},
        drawArraysInstancedANGLE: () => {
          this.drawCallsCount++;
          this.instancedDrawCallsCount++;
        },
        drawElementsInstancedANGLE: () => {
          this.drawCallsCount++;
          this.instancedDrawCallsCount++;
        },
      };
    }
    if (name === "OES_element_index_uint") {
      return {};
    }
    return null;
  }

  public isContextLost(): boolean {
    return false;
  }
}

class MockCanvas2DContext {
  public canvas: HTMLCanvasElement;
  public fillStyle: unknown = "#000";
  public strokeStyle: unknown = "#000";
  public lineWidth = 1;
  public shadowBlur = 0;
  public shadowColor = "";
  public lineDash: number[] = [];

  public strokesCount = 0;
  public fillsCount = 0;
  public clearsCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public save(): void {}
  public restore(): void {}
  public translate(): void {}
  public scale(): void {}
  public setTransform(): void {}
  public beginPath(): void {}
  public moveTo(): void {}
  public lineTo(): void {}
  public rect(): void {}
  public roundRect(): void {}
  public stroke(): void {
    this.strokesCount++;
  }
  public fill(): void {
    this.fillsCount++;
  }
  public clearRect(): void {
    this.clearsCount++;
  }
  public fillRect(): void {
    this.fillsCount++;
  }
  public setLineDash(dash: number[]): void {
    this.lineDash = dash;
  }
}

class MockHTMLCanvasElement {
  public width = 800;
  public height = 600;
  private listeners = new Map<string, Set<(event: Event) => void>>();
  public webglCtx: MockWebGLRenderingContext;
  public ctx2d: MockCanvas2DContext;
  public forceFailWebGL = false;

  constructor() {
    this.webglCtx = new MockWebGLRenderingContext(this as unknown as HTMLCanvasElement);
    this.ctx2d = new MockCanvas2DContext(this as unknown as HTMLCanvasElement);
  }

  public addEventListener(type: string, listener: (event: Event) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  public removeEventListener(type: string, listener: (event: Event) => void): void {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(listener);
    }
  }

  public dispatchEvent(event: Event): boolean {
    const set = this.listeners.get(event.type);
    if (set) {
      for (const listener of set) {
        listener(event);
      }
    }
    return true;
  }

  public getContext(contextId: string): unknown {
    if (this.forceFailWebGL && (contextId === "webgl" || contextId === "webgl2")) {
      return null;
    }
    if (contextId === "webgl" || contextId === "webgl2") {
      return this.webglCtx;
    }
    if (contextId === "2d") {
      return this.ctx2d;
    }
    return null;
  }
}

function createSampleNode(
  id: string,
  x: number,
  y: number,
  status: PositionedNode["status"] = "running",
): PositionedNode {
  return {
    id,
    name: `Node ${id}`,
    x,
    y,
    width: 160,
    height: 80,
    status,
    kind: "agent",
  };
}

function createSampleEdge(
  id: string,
  source: string,
  target: string,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): PositionedEdge {
  return {
    id,
    source,
    target,
    path: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`,
    points: [p1, p2],
    traffic: { status: "active", volume: 100 },
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe("WebGL Renderer & Shader Layer Comprehensive Tests", () => {
  beforeEach(() => {
    useWebGLRendererStore.getState().resetConfig();
    useWebGLRendererStore.getState().resetStats();
  });

  describe("1. useWebGLRendererStore Zustand Store", () => {
    it("initializes with default configuration and state", () => {
      const state = useWebGLRendererStore.getState();
      expect(state.enabled).toBe(DEFAULT_WEBGL_CONFIG.enabled);
      expect(state.particleCount).toBe(DEFAULT_WEBGL_CONFIG.particleCount);
      expect(state.glowIntensity).toBe(DEFAULT_WEBGL_CONFIG.glowIntensity);
      expect(state.bloomEnabled).toBe(DEFAULT_WEBGL_CONFIG.bloomEnabled);
      expect(state.fallbackActive).toBe(false);
      expect(state.contextState).toBe("uninitialized");
    });

    it("updates configuration values and syncs top-level state", () => {
      const store = useWebGLRendererStore.getState();
      store.setConfig({
        particleCount: 8000,
        glowIntensity: 1.2,
        bloomEnabled: false,
        pulseFrequency: 2.0,
      });

      const updated = useWebGLRendererStore.getState();
      expect(updated.particleCount).toBe(8000);
      expect(updated.glowIntensity).toBe(1.2);
      expect(updated.bloomEnabled).toBe(false);
      expect(updated.pulseFrequency).toBe(2.0);
      expect(updated.config.particleCount).toBe(8000);
    });

    it("updates render statistics correctly", () => {
      const store = useWebGLRendererStore.getState();
      store.updateStats({
        fps: 59,
        drawCalls: 12,
        nodeCount: 10500,
        edgeCount: 15000,
        gpuMemoryBytes: 2500000,
      });

      const stats = useWebGLRendererStore.getState().stats;
      expect(stats.fps).toBe(59);
      expect(stats.drawCalls).toBe(12);
      expect(stats.nodeCount).toBe(10500);
      expect(stats.edgeCount).toBe(15000);
      expect(stats.gpuMemoryBytes).toBe(2500000);
    });

    it("handles fallback and context state changes", () => {
      const store = useWebGLRendererStore.getState();
      store.setFallbackActive(true);
      expect(useWebGLRendererStore.getState().fallbackActive).toBe(true);
      expect(useWebGLRendererStore.getState().contextState).toBe("fallback");

      store.setContextState("ready");
      expect(useWebGLRendererStore.getState().fallbackActive).toBe(false);
      expect(useWebGLRendererStore.getState().contextState).toBe("ready");
    });

    it("toggles enabled state and resets configuration", () => {
      const store = useWebGLRendererStore.getState();
      store.toggleEnabled();
      expect(useWebGLRendererStore.getState().enabled).toBe(!DEFAULT_WEBGL_CONFIG.enabled);

      store.resetConfig();
      expect(useWebGLRendererStore.getState().enabled).toBe(DEFAULT_WEBGL_CONFIG.enabled);
    });
  });

  describe("2. Shader Compilation & Graceful Fallback", () => {
    it("compiles shaders and links program successfully", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const gl = mockCanvas.webglCtx as unknown as WebGLRenderingContext;

      const shader = compileShader(gl, gl.VERTEX_SHADER, "precision mediump float; void main() {}");
      expect(shader).not.toBeNull();

      const program = createShaderProgram(
        gl,
        "precision mediump float; void main() { gl_Position = vec4(0.0); }",
        "precision mediump float; void main() { gl_FragColor = vec4(1.0); }",
        ["a_pos"],
        ["u_matrix"],
      );
      expect(program).not.toBeNull();
      expect(program?.attributes.a_pos).toBeDefined();
      expect(program?.uniforms.u_matrix).toBeDefined();
    });

    it("returns null and deletes shader when shader compilation fails", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const gl = mockCanvas.webglCtx as unknown as WebGLRenderingContext;
      mockCanvas.webglCtx.failNextCompileCount = 1;

      const shader = compileShader(gl, gl.VERTEX_SHADER, "syntax error glsl");
      expect(shader).toBeNull();
    });

    it("creates node, edge, and particle programs with full attribute bindings", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const gl = mockCanvas.webglCtx as unknown as WebGLRenderingContext;

      const nodeProg = createNodeProgramWithFallback(gl);
      expect(nodeProg).not.toBeNull();
      expect(nodeProg?.attributes.a_nodeCenter).toBeDefined();
      expect(nodeProg?.uniforms.u_viewProjectionMatrix).toBeDefined();

      const edgeProg = createEdgeProgram(gl);
      expect(edgeProg).not.toBeNull();
      expect(edgeProg?.attributes.a_position).toBeDefined();

      const particleProg = createParticleProgram(gl);
      expect(particleProg).not.toBeNull();
      expect(particleProg?.attributes.a_position).toBeDefined();
    });

    it("falls back to minimal shader when primary SDF node shader fails", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const gl = mockCanvas.webglCtx as unknown as WebGLRenderingContext;

      // Fail first compile attempt (primary SDF shader vertex shader), then fallback shader compiles succeed
      mockCanvas.webglCtx.failNextCompileCount = 1;

      const program = createNodeProgramWithFallback(gl);
      expect(program).not.toBeNull();
      expect(program?.isFallback).toBe(true);
    });
  });

  describe("3. WebGLBufferManager (10k+ Node Dynamic Batching & Memory Tracking)", () => {
    it("initializes buffers and tracks allocated GPU memory", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const gl = mockCanvas.webglCtx as unknown as WebGLRenderingContext;

      const bufferMgr = new WebGLBufferManager(gl, 10000, 20000, 5000);
      expect(bufferMgr.supportsInstancing).toBe(true);
      expect(bufferMgr.getGpuMemoryBytes()).toBeGreaterThan(0);

      const memInitial = bufferMgr.getGpuMemoryBytes();
      // Ensure capacity for 25,000 nodes -> memory should scale up
      bufferMgr.ensureNodeCapacity(25000);
      expect(bufferMgr.getGpuMemoryBytes()).toBeGreaterThan(memInitial);

      bufferMgr.dispose();
      expect(bufferMgr.getGpuMemoryBytes()).toBe(0);
    });

    it("supports dynamic edge and particle capacity scaling for massive graphs", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const gl = mockCanvas.webglCtx as unknown as WebGLRenderingContext;

      const bufferMgr = new WebGLBufferManager(gl, 1000, 1000, 500);
      bufferMgr.ensureEdgeCapacity(30000);
      bufferMgr.ensureParticleCapacity(12000);

      expect(bufferMgr.getEdgeVertexData().length).toBeGreaterThanOrEqual(30000 * 4 * 18);
      expect(bufferMgr.getParticleVertexData().length).toBeGreaterThanOrEqual(12000 * 11);
    });

    it("uploads and binds attributes without errors", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const gl = mockCanvas.webglCtx as unknown as WebGLRenderingContext;
      const bufferMgr = new WebGLBufferManager(gl, 1000, 1000, 500);

      const nodeProg = createNodeProgramWithFallback(gl)!;
      const edgeProg = createEdgeProgram(gl)!;
      const particleProg = createParticleProgram(gl)!;

      bufferMgr.uploadNodeData(100);
      bufferMgr.bindNodeAttributes(nodeProg);
      bufferMgr.drawInstancedNodes(100);
      expect(mockCanvas.webglCtx.instancedDrawCallsCount).toBe(1);

      bufferMgr.uploadEdgeData(200);
      bufferMgr.bindEdgeAttributes(edgeProg);
      bufferMgr.drawEdgeSegments(50);
      expect(mockCanvas.webglCtx.drawCallsCount).toBe(2);

      bufferMgr.uploadParticleData(300);
      bufferMgr.bindParticleAttributes(particleProg);
      bufferMgr.drawParticles(300);
      expect(mockCanvas.webglCtx.drawCallsCount).toBe(3);
    });
  });

  describe("4. WebGLContextLossManager (Context Loss, Recovery & Fallback Escalation)", () => {
    it("registers event listeners and tracks state transitions", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const lossManager = new WebGLContextLossManager();
      lossManager.attach(mockCanvas as unknown as HTMLCanvasElement);

      expect(lossManager.getState()).toBe("ready");
      expect(lossManager.isLost()).toBe(false);

      let lostFired = false;
      let restoredFired = false;
      lossManager.onContextLost(() => {
        lostFired = true;
      });
      lossManager.onContextRestored(() => {
        restoredFired = true;
      });

      lossManager.simulateContextLost();
      expect(lostFired).toBe(true);
      expect(lossManager.getState()).toBe("lost");
      expect(lossManager.isLost()).toBe(true);

      lossManager.simulateContextRestored();
      expect(restoredFired).toBe(true);
      expect(lossManager.getState()).toBe("ready");
    });

    it("escalates to permanent Canvas 2D fallback when consecutive context losses exceed threshold", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const lossManager = new WebGLContextLossManager({ maxConsecutiveLosses: 3 });
      lossManager.attach(mockCanvas as unknown as HTMLCanvasElement);

      let fallbackFired = false;
      lossManager.onFallbackTriggered(() => {
        fallbackFired = true;
      });

      lossManager.simulateContextLost();
      lossManager.simulateContextRestored();

      lossManager.simulateContextLost();
      lossManager.simulateContextRestored();

      // Third consecutive context loss -> triggers fallback escalation
      lossManager.simulateContextLost();
      expect(fallbackFired).toBe(true);
      expect(lossManager.isFallback()).toBe(true);
      expect(lossManager.getState()).toBe("fallback");
    });
  });

  describe("5. WebGLParticleSystem (Edge Flow & Ambient Simulation)", () => {
    it("simulates active flow particles along edge polylines", () => {
      const particleSystem = new WebGLParticleSystem({
        maxParticles: 1000,
        flowParticlesPerEdge: 4,
        ambientParticleCount: 50,
      });

      const edge = createSampleEdge("e1", "n1", "n2", { x: 0, y: 0 }, { x: 100, y: 100 });
      particleSystem.updateEdges([edge]);
      particleSystem.populateInitialParticles();

      expect(particleSystem.getActiveCount()).toBeGreaterThanOrEqual(4);

      const targetBuffer = new Float32Array(1000 * 11);
      const packedCount = particleSystem.packBuffer(targetBuffer);
      expect(packedCount).toBe(particleSystem.getActiveCount());

      // Advance simulation
      particleSystem.update(0.05);
      expect(particleSystem.getActiveCount()).toBeGreaterThan(0);
    });

    it("recycles ambient particles and handles dynamic edge changes", () => {
      const particleSystem = new WebGLParticleSystem({
        maxParticles: 500,
        ambientParticleCount: 100,
      });

      particleSystem.setBounds({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
      for (let i = 0; i < 20; i++) {
        particleSystem.spawnAmbientParticle();
      }
      expect(particleSystem.getActiveCount()).toBe(20);

      // Advance by long time to trigger particle expiration & recycling
      particleSystem.update(10.0);
      expect(particleSystem.getActiveCount()).toBe(20);

      particleSystem.clear();
      expect(particleSystem.getActiveCount()).toBe(0);
    });
  });

  describe("6. WebGLRenderer Main Rendering Pipeline & Interaction", () => {
    it("computes view-projection matrix and visible culling bounds accurately", () => {
      const renderer = new WebGLRenderer();
      const transform: ViewportTransform = {
        panX: 100,
        panY: 50,
        zoom: 2.0,
        screenWidth: 1000,
        screenHeight: 500,
      };

      const matrix = renderer.computeViewProjectionMatrix(
        transform.panX,
        transform.panY,
        transform.zoom,
        transform.screenWidth,
        transform.screenHeight,
      );
      expect(matrix.length).toBe(9);
      // Check m00 = 2 * zoom / screenWidth = 2 * 2 / 1000 = 0.004
      expect(matrix[0]).toBeCloseTo(0.004, 5);

      const bounds = renderer.getVisibleBounds(transform, 50);
      expect(bounds.minX).toBe((-100 - 50) / 2.0); // -75
      expect(bounds.maxX).toBe((1000 - 100 + 50) / 2.0); // 475
    });

    it("renders 10,000+ nodes and edges via WebGL pipeline", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const renderer = new WebGLRenderer({ particleCount: 500 });
      const initialized = renderer.initialize(mockCanvas as unknown as HTMLCanvasElement);
      expect(initialized).toBe(true);

      // Generate 10,000 nodes and 10,000 edges
      const nodes: PositionedNode[] = [];
      const edges: PositionedEdge[] = [];
      for (let i = 0; i < 10000; i++) {
        const x = (i % 100) * 200;
        const y = Math.floor(i / 100) * 120;
        nodes.push(createSampleNode(`node-${i}`, x, y, i % 2 === 0 ? "running" : "success"));
      }
      for (let i = 0; i < 5000; i++) {
        const src = nodes[i];
        const tgt = nodes[i + 1];
        edges.push(
          createSampleEdge(
            `edge-${i}`,
            src.id,
            tgt.id,
            { x: src.x + 80, y: src.y + 40 },
            { x: tgt.x + 80, y: tgt.y + 40 },
          ),
        );
      }

      const transform: ViewportTransform = {
        panX: 0,
        panY: 0,
        zoom: 1,
        screenWidth: 1920,
        screenHeight: 1080,
      };

      renderer.render(nodes, edges, transform, 1000);
      expect(mockCanvas.webglCtx.drawCallsCount).toBeGreaterThan(0);

      const stats = renderer.getStats();
      expect(stats.nodeCount).toBe(10000);
      expect(stats.edgeCount).toBe(5000);
      expect(stats.visibleNodeCount).toBeGreaterThan(0);
      expect(stats.visibleEdgeCount).toBeGreaterThan(0);

      renderer.dispose();
    });

    it("executes Canvas 2D Fallback mode when WebGL is unavailable or lost", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      mockCanvas.forceFailWebGL = true; // Simulates missing WebGL on device

      const renderer = new WebGLRenderer();
      const initialized = renderer.initialize(mockCanvas as unknown as HTMLCanvasElement);
      expect(initialized).toBe(true);
      expect(renderer.isFallbackActive()).toBe(true);

      const nodes = [createSampleNode("n1", 50, 50), createSampleNode("n2", 300, 300)];
      const edges = [createSampleEdge("e1", "n1", "n2", { x: 130, y: 90 }, { x: 380, y: 340 })];
      const transform: ViewportTransform = {
        panX: 0,
        panY: 0,
        zoom: 1,
        screenWidth: 800,
        screenHeight: 600,
      };

      renderer.render(nodes, edges, transform, 1000);
      expect(mockCanvas.ctx2d.strokesCount).toBeGreaterThan(0);
      expect(mockCanvas.ctx2d.fillsCount).toBeGreaterThan(0);

      renderer.dispose();
    });

    it("performs hit testing for nodes and edges", () => {
      const renderer = new WebGLRenderer();
      const nodes = [createSampleNode("n1", 100, 100), createSampleNode("n2", 400, 200)];
      const edges = [createSampleEdge("e1", "n1", "n2", { x: 260, y: 140 }, { x: 400, y: 240 })];
      const transform: ViewportTransform = {
        panX: 50,
        panY: 50,
        zoom: 1.5,
        screenWidth: 1000,
        screenHeight: 800,
      };

      // Screen coordinate calculation for n1:
      // screenX = worldX * zoom + panX = 150 * 1.5 + 50 = 275
      // screenY = worldY * zoom + panY = 140 * 1.5 + 50 = 260
      const hitNode = renderer.getNodeAt(275, 260, nodes, transform);
      expect(hitNode?.id).toBe("n1");

      const missNode = renderer.getNodeAt(10, 10, nodes, transform);
      expect(missNode).toBeNull();

      // Screen coordinate for edge midpoint:
      // mid world = (330, 190) -> screen = (330 * 1.5 + 50, 190 * 1.5 + 50) = (545, 335)
      const hitEdge = renderer.getEdgeAt(545, 335, edges, transform, 10);
      expect(hitEdge?.id).toBe("e1");

      const missEdge = renderer.getEdgeAt(10, 10, edges, transform, 10);
      expect(missEdge).toBeNull();
    });

    it("deletes old GPU buffers on capacity expansion to prevent memory leaks", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const gl = mockCanvas.webglCtx as unknown as WebGLRenderingContext;

      const bufferMgr = new WebGLBufferManager(gl, 1000, 1000, 500);
      const initialDeletes = mockCanvas.webglCtx.deletedBuffersCount;

      // Expand node capacity -> should delete previous node instance buffer
      bufferMgr.ensureNodeCapacity(3000);
      expect(mockCanvas.webglCtx.deletedBuffersCount).toBeGreaterThan(initialDeletes);

      const afterNodeDeletes = mockCanvas.webglCtx.deletedBuffersCount;
      // Expand edge capacity -> should delete previous edge vertex and index buffers
      bufferMgr.ensureEdgeCapacity(3000);
      expect(mockCanvas.webglCtx.deletedBuffersCount).toBeGreaterThan(afterNodeDeletes);

      const afterEdgeDeletes = mockCanvas.webglCtx.deletedBuffersCount;
      // Expand particle capacity -> should delete previous particle buffer
      bufferMgr.ensureParticleCapacity(2000);
      expect(mockCanvas.webglCtx.deletedBuffersCount).toBeGreaterThan(afterEdgeDeletes);

      bufferMgr.dispose();
    });

    it("includes node radius and glow margin in viewport culling to prevent clipping at canvas borders", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const renderer = new WebGLRenderer();
      renderer.initialize(mockCanvas as unknown as HTMLCanvasElement);

      // Node positioned right near the left edge of the visible screen (x: -50, width: 100)
      // Screen width is 800, panX is 0, zoom is 1.
      // Left border is x = 0. Node body extends from -50 to 50.
      // With node radius + glow margin (>= 82px), node's left edge (-50) and glow are preserved.
      const borderNode = createSampleNode("border-node", -50, 100, "running");
      // Far offscreen node (x: -500)
      const farNode = createSampleNode("far-node", -500, 100, "running");

      const transform: ViewportTransform = {
        panX: 0,
        panY: 0,
        zoom: 1,
        screenWidth: 800,
        screenHeight: 600,
      };

      renderer.render([borderNode, farNode], [], transform, 1000);
      const stats = renderer.getStats();

      // borderNode should be visible, farNode should be culled
      expect(stats.visibleNodeCount).toBe(1);

      renderer.dispose();
    });

    it("handles WebGL context loss and restoration with shader recompilation and geometry re-upload", () => {
      const mockCanvas = new MockHTMLCanvasElement();
      const renderer = new WebGLRenderer();
      renderer.initialize(mockCanvas as unknown as HTMLCanvasElement);

      const nodes = [createSampleNode("n1", 100, 100), createSampleNode("n2", 300, 100)];
      const edges = [createSampleEdge("e1", "n1", "n2", { x: 180, y: 140 }, { x: 300, y: 140 })];
      const transform: ViewportTransform = {
        panX: 0,
        panY: 0,
        zoom: 1,
        screenWidth: 800,
        screenHeight: 600,
      };

      renderer.render(nodes, edges, transform, 1000);
      const drawCallsBefore = mockCanvas.webglCtx.drawCallsCount;
      expect(drawCallsBefore).toBeGreaterThan(0);

      // Trigger Context Loss
      renderer.handleContextLost();
      expect(useWebGLRendererStore.getState().contextState).toBe("lost");

      // Trigger Context Restoration
      renderer.handleContextRestored();
      expect(useWebGLRendererStore.getState().contextState).toBe("ready");

      // Re-upload and draw calls should have executed upon restoration
      expect(mockCanvas.webglCtx.drawCallsCount).toBeGreaterThan(drawCallsBefore);

      const stats = renderer.getStats();
      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);

      renderer.dispose();
    });
  });
});
