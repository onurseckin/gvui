import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import {
  DEFAULT_RENDER_STATS,
  DEFAULT_WEBGL_CONFIG,
  useWebGLRendererStore,
  type RenderStats,
  type WebGLRenderConfig,
} from "../../../store/useWebGLRendererStore";
import { WebGLBufferManager } from "./bufferManager";
import { WebGLContextLossManager } from "./contextLossManager";
import { WebGLParticleSystem } from "./particleSystem";
import { createEdgeProgram, createNodeProgramWithFallback, createParticleProgram } from "./shaders";
import type { CameraBounds, IWebGLRenderer, ShaderProgramInfo, ViewportTransform } from "./types";

export class WebGLRenderer implements IWebGLRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;

  private bufferManager: WebGLBufferManager | null = null;
  private contextLossManager: WebGLContextLossManager;
  private particleSystem: WebGLParticleSystem;

  private nodeProgram: ShaderProgramInfo | null = null;
  private edgeProgram: ShaderProgramInfo | null = null;
  private particleProgram: ShaderProgramInfo | null = null;

  private config: WebGLRenderConfig;
  private stats: RenderStats;

  // View-Projection Matrix (Column-Major Float32Array 3x3)
  private viewProjMatrix: Float32Array = new Float32Array(9);

  // Performance tracking
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private fpsAccumulator: number = 0;
  private fpsLastUpdated: number = 0;

  // Cached scene references for context restoration
  private lastNodes: readonly PositionedNode[] = [];
  private lastEdges: readonly PositionedEdge[] = [];
  private lastTransform: ViewportTransform = {
    panX: 0,
    panY: 0,
    zoom: 1,
    screenWidth: 800,
    screenHeight: 600,
  };

  private isDisposed: boolean = false;

  constructor(config?: Partial<WebGLRenderConfig>) {
    this.config = { ...DEFAULT_WEBGL_CONFIG, ...config };
    this.stats = { ...DEFAULT_RENDER_STATS };

    this.contextLossManager = new WebGLContextLossManager();
    this.particleSystem = new WebGLParticleSystem({
      maxParticles: this.config.particleCount,
      flowParticlesPerEdge: 6,
      ambientParticleCount: Math.floor(this.config.particleCount * 0.25),
      baseSpeed: this.config.particleSpeed * 100,
      particleSize: this.config.particleSize,
    });

    this.setupContextLossHandlers();
  }

  private setupContextLossHandlers(): void {
    this.contextLossManager.onContextLost(() => {
      this.handleContextLost();
    });

    this.contextLossManager.onContextRestored(() => {
      this.handleContextRestored();
    });

    this.contextLossManager.onFallbackTriggered(() => {
      this.enableCanvas2DFallback();
    });
  }

  public initialize(canvas: HTMLCanvasElement): boolean {
    if (this.isDisposed) return false;
    this.canvas = canvas;
    this.contextLossManager.attach(canvas);

    if (!this.config.enabled) {
      return this.enableCanvas2DFallback();
    }

    // Try WebGL 2.0 first, then WebGL 1.0
    const contextOptions: WebGLContextAttributes = {
      alpha: true,
      antialias: this.config.antialiasing,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    };

    let glContext: WebGLRenderingContext | WebGL2RenderingContext | null = null;

    try {
      glContext = canvas.getContext("webgl2", contextOptions);
    } catch {
      glContext = null;
    }

    if (!glContext) {
      try {
        glContext = canvas.getContext("webgl", contextOptions);
      } catch {
        glContext = null;
      }
    }

    if (!glContext) {
      console.warn("[WebGLRenderer] WebGL not supported on device. Falling back to 2D Canvas.");
      return this.enableCanvas2DFallback();
    }

    this.gl = glContext;
    this.initGLState();
    this.initPrograms();

    this.bufferManager = new WebGLBufferManager(this.gl, 10000, 20000, this.config.particleCount);

    useWebGLRendererStore.getState().setContextState("ready");
    return true;
  }

  private initGLState(): void {
    const gl = this.gl;
    if (!gl) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  private initPrograms(): boolean {
    const gl = this.gl;
    if (!gl) return false;

    this.nodeProgram = createNodeProgramWithFallback(gl);
    this.edgeProgram = createEdgeProgram(gl);
    this.particleProgram = createParticleProgram(gl);

    const success = Boolean(this.nodeProgram && this.edgeProgram && this.particleProgram);
    if (!success) {
      console.warn(
        "[WebGLRenderer] Failed to initialize shader programs. Switching to 2D Canvas fallback.",
      );
      this.enableCanvas2DFallback();
      return false;
    }

    return true;
  }

  public enableCanvas2DFallback(): boolean {
    if (!this.canvas) return false;
    try {
      this.ctx2d = this.canvas.getContext("2d");
      if (this.ctx2d) {
        useWebGLRendererStore.getState().setFallbackActive(true);
        return true;
      }
    } catch (err) {
      console.error("[WebGLRenderer] Failed to obtain 2D canvas context:", err);
    }
    return false;
  }

  public isFallbackActive(): boolean {
    return this.contextLossManager.isFallback() || this.ctx2d !== null;
  }

  public handleContextLost(): void {
    console.warn("[WebGLRenderer] WebGL Context Loss event received. Cleaning GPU resources...");
    if (this.bufferManager) {
      this.bufferManager.dispose();
      this.bufferManager = null;
    }
    this.nodeProgram = null;
    this.edgeProgram = null;
    this.particleProgram = null;
    this.gl = null;

    useWebGLRendererStore.getState().setContextState("lost");
  }

  public handleContextRestored(): void {
    console.info(
      "[WebGLRenderer] WebGL Context restored. Recompiling shaders and recreating buffers...",
    );
    if (!this.canvas) return;

    const glContext = this.canvas.getContext("webgl2") || this.canvas.getContext("webgl");
    if (!glContext) {
      console.error(
        "[WebGLRenderer] Unable to recover WebGL context after restoration. Triggering fallback.",
      );
      this.enableCanvas2DFallback();
      return;
    }

    this.gl = glContext as WebGLRenderingContext | WebGL2RenderingContext;
    this.initGLState();
    const programsReady = this.initPrograms();
    if (!programsReady) {
      console.error(
        "[WebGLRenderer] Failed to recompile shaders on restoration. Switching to fallback.",
      );
      this.enableCanvas2DFallback();
      return;
    }

    this.bufferManager = new WebGLBufferManager(this.gl, 10000, 20000, this.config.particleCount);
    this.particleSystem.updateEdges(this.lastEdges);
    this.particleSystem.populateInitialParticles();

    useWebGLRendererStore.getState().setContextState("ready");

    // Re-upload all geometry and re-render cached scene
    if (this.lastNodes.length > 0 || this.lastEdges.length > 0) {
      this.render(this.lastNodes, this.lastEdges, this.lastTransform);
    }
  }

  // ==========================================================================
  // Matrix Math & Culling
  // ==========================================================================

  public computeViewProjectionMatrix(
    panX: number,
    panY: number,
    zoom: number,
    screenWidth: number,
    screenHeight: number,
  ): Float32Array {
    const sw = Math.max(1, screenWidth);
    const sh = Math.max(1, screenHeight);

    // 2D Affine transform to WebGL NDC [-1, 1]:
    // ndcX = ((worldX * zoom + panX) / sw) * 2 - 1 = worldX * (2*zoom/sw) + (2*panX/sw - 1)
    // ndcY = 1 - ((worldY * zoom + panY) / sh) * 2 = worldY * (-2*zoom/sh) + (1 - 2*panY/sh)
    const m00 = (2.0 * zoom) / sw;
    const m11 = (-2.0 * zoom) / sh;
    const m20 = (2.0 * panX) / sw - 1.0;
    const m21 = 1.0 - (2.0 * panY) / sh;

    const m = this.viewProjMatrix;
    m[0] = m00;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    m[4] = m11;
    m[5] = 0;
    m[6] = m20;
    m[7] = m21;
    m[8] = 1;

    return m;
  }

  public getVisibleBounds(transform: ViewportTransform, margin?: number): CameraBounds {
    const effectiveMargin =
      margin !== undefined ? margin : Math.max(this.config.cullingMargin, 150);
    const zoom = Math.max(0.01, transform.zoom);
    return {
      minX: (-transform.panX - effectiveMargin) / zoom,
      minY: (-transform.panY - effectiveMargin) / zoom,
      maxX: (transform.screenWidth - transform.panX + effectiveMargin) / zoom,
      maxY: (transform.screenHeight - transform.panY + effectiveMargin) / zoom,
    };
  }

  // ==========================================================================
  // Main Render Loop
  // ==========================================================================

  public render(
    nodes: readonly PositionedNode[],
    edges: readonly PositionedEdge[],
    transform: ViewportTransform,
    timeMs = performance.now(),
  ): void {
    if (this.isDisposed || !this.canvas) return;

    this.lastNodes = nodes;
    this.lastEdges = edges;
    this.lastTransform = transform;

    const startTime = performance.now();
    const timeSec = timeMs * 0.001;
    const deltaTimeSec = this.lastFrameTime > 0 ? (timeMs - this.lastFrameTime) * 0.001 : 0.016;
    this.lastFrameTime = timeMs;

    // Viewport Culling Bounds
    const bounds = this.getVisibleBounds(transform, this.config.cullingMargin);
    this.particleSystem.setBounds(bounds);

    let drawCalls = 0;
    let visibleNodes = 0;
    let visibleEdges = 0;

    // If fallback or 2D mode is active
    if (this.isFallbackActive() || !this.gl || !this.bufferManager) {
      if (!this.ctx2d) {
        this.enableCanvas2DFallback();
      }
      if (this.ctx2d) {
        const fallbackStats = this.renderCanvas2DFallback(
          this.ctx2d,
          nodes,
          edges,
          transform,
          bounds,
          timeSec,
        );
        visibleNodes = fallbackStats.visibleNodes;
        visibleEdges = fallbackStats.visibleEdges;
        drawCalls = fallbackStats.drawCalls;
      }
    } else {
      // High-Performance WebGL 2.0 / 1.0 GPU Pipeline
      const gl = this.gl;

      // Match drawing buffer to canvas physical size
      const dpr = this.config.highDpi ? this.config.pixelRatio : 1;
      const targetWidth = Math.floor(transform.screenWidth * dpr);
      const targetHeight = Math.floor(transform.screenHeight * dpr);

      if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;
      }

      gl.viewport(0, 0, targetWidth, targetHeight);

      const bg = this.config.backgroundColor;
      gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Compute Matrix
      const matrix = this.computeViewProjectionMatrix(
        transform.panX,
        transform.panY,
        transform.zoom,
        transform.screenWidth,
        transform.screenHeight,
      );

      // ----------------------------------------------------------------------
      // Pass 1: Background & Flow Particles
      // ----------------------------------------------------------------------
      if (this.config.particleCount > 0 && this.particleProgram) {
        this.particleSystem.updateEdges(edges);
        this.particleSystem.update(deltaTimeSec);

        const activeParticleCount = this.particleSystem.getActiveCount();
        if (activeParticleCount > 0) {
          this.bufferManager.ensureParticleCapacity(activeParticleCount);
          const particleData = this.bufferManager.getParticleVertexData();
          this.particleSystem.packBuffer(particleData);
          this.bufferManager.uploadParticleData(activeParticleCount);

          gl.useProgram(this.particleProgram.program);
          gl.uniformMatrix3fv(this.particleProgram.uniforms.u_viewProjectionMatrix, false, matrix);
          gl.uniform1f(this.particleProgram.uniforms.u_time, timeSec);

          this.bufferManager.bindParticleAttributes(this.particleProgram);
          this.bufferManager.drawParticles(activeParticleCount);
          drawCalls++;
        }
      }

      // ----------------------------------------------------------------------
      // Pass 2: Edges (Quad-Tessellated Polylines)
      // ----------------------------------------------------------------------
      if (edges.length > 0 && this.edgeProgram) {
        const totalSegmentsEstimate = edges.reduce(
          (acc, e) => acc + Math.max(1, (e.points?.length ?? 2) - 1),
          0,
        );
        this.bufferManager.ensureEdgeCapacity(totalSegmentsEstimate);

        const edgeVertexData = this.bufferManager.getEdgeVertexData();
        let edgeVertexOffset = 0;
        let segmentCount = 0;

        for (let e = 0; e < edges.length; e++) {
          const edge = edges[e];
          const points = edge.points && edge.points.length >= 2 ? edge.points : null;

          if (!points) continue;

          // Bounding box check for edge
          let edgeMinX = Infinity,
            edgeMinY = Infinity,
            edgeMaxX = -Infinity,
            edgeMaxY = -Infinity;
          for (let p = 0; p < points.length; p++) {
            const pt = points[p];
            if (pt.x < edgeMinX) edgeMinX = pt.x;
            if (pt.y < edgeMinY) edgeMinY = pt.y;
            if (pt.x > edgeMaxX) edgeMaxX = pt.x;
            if (pt.y > edgeMaxY) edgeMaxY = pt.y;
          }

          if (
            edgeMaxX < bounds.minX ||
            edgeMinX > bounds.maxX ||
            edgeMaxY < bounds.minY ||
            edgeMinY > bounds.maxY
          ) {
            continue; // Culled
          }

          visibleEdges++;
          const isActive = Boolean(
            edge.traffic?.status === "active" ||
            edge.isHighTraffic ||
            (edge.traffic && (edge.traffic.volume ?? 0) > 0),
          );

          const baseColor = this.config.edgeColor;
          const activeColor = this.config.edgeActiveColor;
          const lineWidth = isActive ? 2.5 : 1.5;
          const dashLength = edge.kind === "dependency" || edge.kind === "conditional" ? 8.0 : 0.0;
          const flowSpeed = isActive ? 1.5 : 0.5;

          let accumulatedDist = 0;
          for (let seg = 0; seg < points.length - 1; seg++) {
            const p1 = points[seg];
            const p2 = points[seg + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len <= 0) continue;

            const nx = -dy / len;
            const ny = dx / len;

            const vBase = edgeVertexOffset;
            const stride = WebGLBufferManager.FLOATS_PER_EDGE_VERTEX;

            // 4 vertices per segment quad
            // Vertex 0: p1, side = -1
            this.setEdgeVertex(
              edgeVertexData,
              vBase,
              p1.x,
              p1.y,
              nx,
              ny,
              -1.0,
              accumulatedDist,
              baseColor,
              activeColor,
              isActive,
              flowSpeed,
              dashLength,
              lineWidth,
            );
            // Vertex 1: p1, side = +1
            this.setEdgeVertex(
              edgeVertexData,
              vBase + 1 * stride,
              p1.x,
              p1.y,
              nx,
              ny,
              1.0,
              accumulatedDist,
              baseColor,
              activeColor,
              isActive,
              flowSpeed,
              dashLength,
              lineWidth,
            );
            // Vertex 2: p2, side = +1
            this.setEdgeVertex(
              edgeVertexData,
              vBase + 2 * stride,
              p2.x,
              p2.y,
              nx,
              ny,
              1.0,
              accumulatedDist + len,
              baseColor,
              activeColor,
              isActive,
              flowSpeed,
              dashLength,
              lineWidth,
            );
            // Vertex 3: p2, side = -1
            this.setEdgeVertex(
              edgeVertexData,
              vBase + 3 * stride,
              p2.x,
              p2.y,
              nx,
              ny,
              -1.0,
              accumulatedDist + len,
              baseColor,
              activeColor,
              isActive,
              flowSpeed,
              dashLength,
              lineWidth,
            );

            edgeVertexOffset += 4 * stride;
            segmentCount++;
            accumulatedDist += len;
          }
        }

        if (segmentCount > 0) {
          this.bufferManager.uploadEdgeData(segmentCount * 4);

          gl.useProgram(this.edgeProgram.program);
          gl.uniformMatrix3fv(this.edgeProgram.uniforms.u_viewProjectionMatrix, false, matrix);
          gl.uniform1f(this.edgeProgram.uniforms.u_time, timeSec);

          this.bufferManager.bindEdgeAttributes(this.edgeProgram);
          this.bufferManager.drawEdgeSegments(segmentCount);
          drawCalls++;
        }
      }

      // ----------------------------------------------------------------------
      // Pass 3: Nodes (Instanced SDF Quads)
      // ----------------------------------------------------------------------
      if (nodes.length > 0 && this.nodeProgram) {
        this.bufferManager.ensureNodeCapacity(nodes.length);
        const nodeInstanceData = this.bufferManager.getNodeInstanceData();
        let nodeInstanceIndex = 0;

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const nx = node.x;
          const ny = node.y;
          const nw = node.width;
          const nh = node.height;

          // Viewport AABB Culling with node radius and glow envelope margin
          const nodeRadiusMargin = Math.max(nw, nh) * 0.5 + 32;
          if (
            nx + nw + nodeRadiusMargin < bounds.minX ||
            nx - nodeRadiusMargin > bounds.maxX ||
            ny + nh + nodeRadiusMargin < bounds.minY ||
            ny - nodeRadiusMargin > bounds.maxY
          ) {
            continue;
          }

          visibleNodes++;

          const centerX = nx + nw * 0.5;
          const centerY = ny + nh * 0.5;
          const shapeType = node.kind === "terminal" || node.kind === "router" ? 0 : 2; // 0=circle, 2=rounded-rect
          const cornerRadius = 8.0;

          // Determine Colors
          const isSelected = false; // can be bound from external state
          const colors = this.resolveNodeColors(node, isSelected);

          const floatOffset = nodeInstanceIndex * WebGLBufferManager.FLOATS_PER_NODE;
          nodeInstanceData[floatOffset + 0] = centerX;
          nodeInstanceData[floatOffset + 1] = centerY;
          nodeInstanceData[floatOffset + 2] = nw;
          nodeInstanceData[floatOffset + 3] = nh;
          nodeInstanceData[floatOffset + 4] = shapeType;
          nodeInstanceData[floatOffset + 5] = cornerRadius;

          // Fill Color RGBA
          nodeInstanceData[floatOffset + 6] = colors.fill[0];
          nodeInstanceData[floatOffset + 7] = colors.fill[1];
          nodeInstanceData[floatOffset + 8] = colors.fill[2];
          nodeInstanceData[floatOffset + 9] = colors.fill[3];

          // Border Color RGBA
          nodeInstanceData[floatOffset + 10] = colors.border[0];
          nodeInstanceData[floatOffset + 11] = colors.border[1];
          nodeInstanceData[floatOffset + 12] = colors.border[2];
          nodeInstanceData[floatOffset + 13] = colors.border[3];
          nodeInstanceData[floatOffset + 14] = colors.borderWidth;

          // Glow Color RGBA
          nodeInstanceData[floatOffset + 15] = colors.glow[0];
          nodeInstanceData[floatOffset + 16] = colors.glow[1];
          nodeInstanceData[floatOffset + 17] = colors.glow[2];
          nodeInstanceData[floatOffset + 18] = colors.glow[3];
          nodeInstanceData[floatOffset + 19] = colors.glowRadius;

          // Pulse params (intensity, phase)
          nodeInstanceData[floatOffset + 20] = colors.pulseIntensity;
          nodeInstanceData[floatOffset + 21] = colors.pulsePhase;

          nodeInstanceIndex++;
        }

        if (nodeInstanceIndex > 0) {
          this.bufferManager.uploadNodeData(nodeInstanceIndex);

          gl.useProgram(this.nodeProgram.program);
          gl.uniformMatrix3fv(this.nodeProgram.uniforms.u_viewProjectionMatrix, false, matrix);
          gl.uniform1f(this.nodeProgram.uniforms.u_time, timeSec);
          gl.uniform1f(this.nodeProgram.uniforms.u_pixelRatio, dpr);
          if (this.nodeProgram.uniforms.u_glowIntensity) {
            gl.uniform1f(this.nodeProgram.uniforms.u_glowIntensity, this.config.glowIntensity);
          }
          if (this.nodeProgram.uniforms.u_pulseFrequency) {
            gl.uniform1f(this.nodeProgram.uniforms.u_pulseFrequency, this.config.pulseFrequency);
          }

          this.bufferManager.bindNodeAttributes(this.nodeProgram);
          this.bufferManager.drawInstancedNodes(nodeInstanceIndex);
          drawCalls++;
        }
      }
    }

    const frameTimeMs = performance.now() - startTime;
    this.updatePerformanceStats(
      frameTimeMs,
      drawCalls,
      nodes.length,
      edges.length,
      visibleNodes,
      visibleEdges,
      this.particleSystem.getActiveCount(),
    );
  }

  private setEdgeVertex(
    arr: Float32Array,
    offset: number,
    x: number,
    y: number,
    nx: number,
    ny: number,
    side: number,
    progress: number,
    color: [number, number, number, number],
    activeColor: [number, number, number, number],
    isActive: boolean,
    flowSpeed: number,
    dashLength: number,
    width: number,
  ): void {
    arr[offset + 0] = x;
    arr[offset + 1] = y;
    arr[offset + 2] = nx;
    arr[offset + 3] = ny;
    arr[offset + 4] = side;
    arr[offset + 5] = progress;
    arr[offset + 6] = color[0];
    arr[offset + 7] = color[1];
    arr[offset + 8] = color[2];
    arr[offset + 9] = color[3];
    arr[offset + 10] = activeColor[0];
    arr[offset + 11] = activeColor[1];
    arr[offset + 12] = activeColor[2];
    arr[offset + 13] = activeColor[3];
    arr[offset + 14] = isActive ? 1.0 : 0.0;
    arr[offset + 15] = flowSpeed;
    arr[offset + 16] = dashLength;
    arr[offset + 17] = width;
  }

  private resolveNodeColors(
    node: PositionedNode,
    isSelected: boolean,
  ): {
    fill: [number, number, number, number];
    border: [number, number, number, number];
    borderWidth: number;
    glow: [number, number, number, number];
    glowRadius: number;
    pulseIntensity: number;
    pulsePhase: number;
  } {
    let fill: [number, number, number, number] = [0.12, 0.15, 0.22, 0.95];
    let border: [number, number, number, number] = [0.25, 0.32, 0.45, 1.0];
    let glow: [number, number, number, number] = [0.2, 0.6, 1.0, 0.0];
    let glowRadius = 0.0;
    let pulseIntensity = 0.0;
    let pulsePhase = (node.x * 0.01 + node.y * 0.01) % 6.28;
    let borderWidth = 1.5;

    switch (node.status) {
      case "running":
        border = [0.2, 0.7, 1.0, 1.0];
        glow = [0.2, 0.7, 1.0, 0.8];
        glowRadius = 14.0;
        pulseIntensity = 0.8;
        break;
      case "success":
        border = [0.15, 0.8, 0.45, 1.0];
        glow = [0.15, 0.8, 0.45, 0.6];
        glowRadius = 10.0;
        pulseIntensity = 0.3;
        break;
      case "error":
        border = [0.95, 0.25, 0.3, 1.0];
        glow = [0.95, 0.25, 0.3, 0.9];
        glowRadius = 16.0;
        pulseIntensity = 1.0;
        break;
      case "warning":
        border = [0.95, 0.65, 0.15, 1.0];
        glow = [0.95, 0.65, 0.15, 0.7];
        glowRadius = 12.0;
        pulseIntensity = 0.5;
        break;
      case "cached":
        border = [0.65, 0.45, 0.95, 1.0];
        glow = [0.65, 0.45, 0.95, 0.5];
        glowRadius = 8.0;
        break;
      default:
        break;
    }

    if (isSelected) {
      border = [1.0, 1.0, 1.0, 1.0];
      glow = [0.4, 0.8, 1.0, 1.0];
      glowRadius = Math.max(glowRadius, 20.0);
      pulseIntensity = Math.max(pulseIntensity, 0.7);
      borderWidth = 2.5;
    }

    return {
      fill,
      border,
      borderWidth,
      glow,
      glowRadius,
      pulseIntensity,
      pulsePhase,
    };
  }

  // ==========================================================================
  // Canvas 2D Fallback Mode
  // ==========================================================================

  private renderCanvas2DFallback(
    ctx: CanvasRenderingContext2D,
    nodes: readonly PositionedNode[],
    edges: readonly PositionedEdge[],
    transform: ViewportTransform,
    bounds: CameraBounds,
    _timeSec: number,
  ): { visibleNodes: number; visibleEdges: number; drawCalls: number } {
    let drawCalls = 0;
    let visibleNodes = 0;
    let visibleEdges = 0;

    const width = transform.screenWidth;
    const height = transform.screenHeight;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Background fill
    const bg = this.config.backgroundColor;
    ctx.fillStyle = `rgba(${Math.round(bg[0] * 255)}, ${Math.round(bg[1] * 255)}, ${Math.round(bg[2] * 255)}, ${bg[3]})`;
    ctx.fillRect(0, 0, width, height);

    // Apply pan & zoom
    ctx.translate(transform.panX, transform.panY);
    ctx.scale(transform.zoom, transform.zoom);

    // 1. Fallback Edges
    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];
      if (!edge.points || edge.points.length < 2) continue;

      visibleEdges++;
      ctx.beginPath();
      ctx.moveTo(edge.points[0].x, edge.points[0].y);
      for (let p = 1; p < edge.points.length; p++) {
        ctx.lineTo(edge.points[p].x, edge.points[p].y);
      }

      const isActive = Boolean(
        edge.traffic?.status === "active" ||
        edge.isHighTraffic ||
        (edge.traffic && (edge.traffic.volume ?? 0) > 0),
      );

      ctx.strokeStyle = isActive ? "rgba(50, 180, 255, 0.85)" : "rgba(100, 120, 140, 0.5)";
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      if (edge.kind === "dependency" || edge.kind === "conditional") {
        ctx.setLineDash([6, 6]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      drawCalls++;
    }

    // 2. Fallback Nodes
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodeRadiusMargin = Math.max(node.width, node.height) * 0.5 + 32;
      if (
        node.x + node.width + nodeRadiusMargin < bounds.minX ||
        node.x - nodeRadiusMargin > bounds.maxX ||
        node.y + node.height + nodeRadiusMargin < bounds.minY ||
        node.y - nodeRadiusMargin > bounds.maxY
      ) {
        continue;
      }

      visibleNodes++;
      ctx.save();

      // Card Body
      const radius = 8;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(node.x, node.y, node.width, node.height, radius);
      } else {
        ctx.rect(node.x, node.y, node.width, node.height);
      }

      ctx.fillStyle = "#161b26";
      ctx.fill();

      // Node Status Glow & Border
      if (node.status === "running") {
        ctx.strokeStyle = "#38bdf8";
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 12;
      } else if (node.status === "error") {
        ctx.strokeStyle = "#f43f5e";
        ctx.shadowColor = "#f43f5e";
        ctx.shadowBlur = 14;
      } else if (node.status === "success") {
        ctx.strokeStyle = "#22c55e";
        ctx.shadowColor = "#22c55e";
        ctx.shadowBlur = 8;
      } else {
        ctx.strokeStyle = "#334155";
        ctx.shadowBlur = 0;
      }

      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      drawCalls++;
    }

    ctx.restore();
    return { visibleNodes, visibleEdges, drawCalls };
  }

  // ==========================================================================
  // Hit Testing & Coordinate Utilities
  // ==========================================================================

  public getNodeAt(
    screenX: number,
    screenY: number,
    nodes: readonly PositionedNode[],
    transform: ViewportTransform,
  ): PositionedNode | null {
    const zoom = Math.max(0.01, transform.zoom);
    const worldX = (screenX - transform.panX) / zoom;
    const worldY = (screenY - transform.panY) / zoom;

    // Search in reverse order (topmost first)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (
        worldX >= node.x &&
        worldX <= node.x + node.width &&
        worldY >= node.y &&
        worldY <= node.y + node.height
      ) {
        return node;
      }
    }
    return null;
  }

  public getEdgeAt(
    screenX: number,
    screenY: number,
    edges: readonly PositionedEdge[],
    transform: ViewportTransform,
    threshold = 8,
  ): PositionedEdge | null {
    const zoom = Math.max(0.01, transform.zoom);
    const worldX = (screenX - transform.panX) / zoom;
    const worldY = (screenY - transform.panY) / zoom;
    const hitThreshold = threshold / zoom;

    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i];
      if (!edge.points || edge.points.length < 2) continue;

      for (let p = 0; p < edge.points.length - 1; p++) {
        const p1 = edge.points[p];
        const p2 = edge.points[p + 1];
        const dist = this.pointToSegmentDistance(worldX, worldY, p1.x, p1.y, p2.x, p2.y);
        if (dist <= hitThreshold) {
          return edge;
        }
      }
    }
    return null;
  }

  private pointToSegmentDistance(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 0) {
      const sx = px - x1;
      const sy = py - y1;
      return Math.sqrt(sx * sx + sy * sy);
    }
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const ex = px - projX;
    const ey = py - projY;
    return Math.sqrt(ex * ex + ey * ey);
  }

  // ==========================================================================
  // Stats & Config
  // ==========================================================================

  private updatePerformanceStats(
    frameTimeMs: number,
    drawCalls: number,
    nodeCount: number,
    edgeCount: number,
    visibleNodeCount: number,
    visibleEdgeCount: number,
    particleCount: number,
  ): void {
    this.frameCount++;
    this.fpsAccumulator += frameTimeMs > 0 ? 1000 / frameTimeMs : 60;

    const now = performance.now();
    const gpuMemoryBytes = this.bufferManager ? this.bufferManager.getGpuMemoryBytes() : 0;
    let fps = this.stats.fps;

    if (now - this.fpsLastUpdated >= 500 || this.stats.lastRenderTimestamp === 0) {
      fps = Math.round(this.fpsAccumulator / Math.max(1, this.frameCount));
      this.frameCount = 0;
      this.fpsAccumulator = 0;
      this.fpsLastUpdated = now;
    }

    this.stats = {
      fps: Math.min(fps, 120),
      frameTimeMs: Number(frameTimeMs.toFixed(2)),
      drawCalls,
      nodeCount,
      edgeCount,
      visibleNodeCount,
      visibleEdgeCount,
      particleCount,
      gpuMemoryBytes,
      lastRenderTimestamp: now,
    };

    if (this.config.debugStats) {
      useWebGLRendererStore.getState().updateStats(this.stats);
    }
  }

  public getStats(): RenderStats {
    return { ...this.stats };
  }

  public getConfig(): WebGLRenderConfig {
    return { ...this.config };
  }

  public setConfig(config: Partial<WebGLRenderConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.particleCount !== undefined) {
      this.particleSystem.setMaxParticles(config.particleCount);
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.contextLossManager.dispose();
    if (this.bufferManager) {
      this.bufferManager.dispose();
      this.bufferManager = null;
    }
    this.particleSystem.clear();
    this.nodeProgram = null;
    this.edgeProgram = null;
    this.particleProgram = null;
    this.gl = null;
    this.ctx2d = null;
    this.canvas = null;
  }
}
