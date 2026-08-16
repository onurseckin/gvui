import type { ShaderProgramInfo } from "./types";

export interface BufferAllocationStats {
  nodeBufferSize: number;
  edgeBufferSize: number;
  particleBufferSize: number;
  totalGpuMemoryBytes: number;
}

export class WebGLBufferManager {
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private isWebGL2: boolean;
  private instancingExt: ANGLE_instanced_arrays | null = null;

  // Node Buffers
  private nodeQuadBuffer: WebGLBuffer | null = null;
  private nodeInstanceBuffer: WebGLBuffer | null = null;
  private nodeIndexBuffer: WebGLBuffer | null = null;
  private nodeInstanceData: Float32Array;
  private nodeCapacity: number;

  // Edge Buffers
  private edgeVertexBuffer: WebGLBuffer | null = null;
  private edgeIndexBuffer: WebGLBuffer | null = null;
  private edgeVertexData: Float32Array;
  private edgeIndexData: Uint32Array | Uint16Array;
  private edgeCapacity: number;
  private supportsUint32Indices: boolean = false;

  // Particle Buffers
  private particleVertexBuffer: WebGLBuffer | null = null;
  private particleVertexData: Float32Array;
  private particleCapacity: number;

  // Tracked GPU Memory (bytes)
  private allocatedMemoryBytes: number = 0;

  // Floats per node instance (center: 2, size: 2, shapeRadius: 2, fill: 4, border: 4, borderWidth: 1, glow: 4, glowRadius: 1, pulse: 2)
  public static readonly FLOATS_PER_NODE = 22;
  // Floats per edge vertex (pos: 2, norm: 2, side: 1, progress: 1, color: 4, activeColor: 4, params: 3, width: 1)
  public static readonly FLOATS_PER_EDGE_VERTEX = 18;
  // Floats per particle (pos: 2, vel: 2, size: 1, life: 1, maxLife: 1, color: 4)
  public static readonly FLOATS_PER_PARTICLE = 11;

  constructor(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    initialNodeCapacity = 10000,
    initialEdgeCapacity = 20000,
    initialParticleCapacity = 5000,
  ) {
    this.gl = gl;
    this.isWebGL2 =
      typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    if (!this.isWebGL2) {
      const ext = gl.getExtension("ANGLE_instanced_arrays");
      if (ext && typeof ext === "object") {
        this.instancingExt = ext as ANGLE_instanced_arrays;
      }
      const uintExt = gl.getExtension("OES_element_index_uint");
      this.supportsUint32Indices = Boolean(uintExt);
    } else {
      this.supportsUint32Indices = true;
    }

    this.nodeCapacity = Math.max(initialNodeCapacity, 1024);
    this.edgeCapacity = Math.max(initialEdgeCapacity, 2048);
    this.particleCapacity = Math.max(initialParticleCapacity, 1024);

    this.nodeInstanceData = new Float32Array(
      this.nodeCapacity * WebGLBufferManager.FLOATS_PER_NODE,
    );
    this.edgeVertexData = new Float32Array(
      this.edgeCapacity * 4 * WebGLBufferManager.FLOATS_PER_EDGE_VERTEX,
    );

    if (this.supportsUint32Indices) {
      this.edgeIndexData = new Uint32Array(this.edgeCapacity * 6);
    } else {
      this.edgeIndexData = new Uint16Array(this.edgeCapacity * 6);
    }

    this.particleVertexData = new Float32Array(
      this.particleCapacity * WebGLBufferManager.FLOATS_PER_PARTICLE,
    );

    this.initBuffers();
  }

  public get supportsInstancing(): boolean {
    return this.isWebGL2 || this.instancingExt !== null;
  }

  public initBuffers(): void {
    const gl = this.gl;

    // 1. Static Quad Buffer for Unit Quad [-0.5, 0.5]
    this.nodeQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeQuadBuffer);
    const quadVertices = new Float32Array([
      -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    // 2. Node Instance Buffer
    this.nodeInstanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.nodeInstanceData.byteLength, gl.DYNAMIC_DRAW);

    // 3. Edge Vertex & Index Buffers
    this.edgeVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.edgeVertexData.byteLength, gl.DYNAMIC_DRAW);

    this.edgeIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIndexBuffer);
    this.populateEdgeIndices();
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.edgeIndexData, gl.STATIC_DRAW);

    // 4. Particle Vertex Buffer
    this.particleVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleVertexData.byteLength, gl.DYNAMIC_DRAW);

    this.updateAllocatedMemoryBytes();
  }

  private populateEdgeIndices(): void {
    const indices = this.edgeIndexData;
    const count = this.edgeCapacity;
    for (let i = 0; i < count; i++) {
      const vOffset = i * 4;
      const iOffset = i * 6;
      indices[iOffset + 0] = vOffset + 0;
      indices[iOffset + 1] = vOffset + 1;
      indices[iOffset + 2] = vOffset + 2;
      indices[iOffset + 3] = vOffset + 0;
      indices[iOffset + 4] = vOffset + 2;
      indices[iOffset + 5] = vOffset + 3;
    }
  }

  private updateAllocatedMemoryBytes(): void {
    const quadBytes = 6 * 2 * 4;
    const nodeBytes = this.nodeInstanceData.byteLength;
    const edgeVertBytes = this.edgeVertexData.byteLength;
    const edgeIdxBytes = this.edgeIndexData.byteLength;
    const particleBytes = this.particleVertexData.byteLength;
    this.allocatedMemoryBytes =
      quadBytes + nodeBytes + edgeVertBytes + edgeIdxBytes + particleBytes;
  }

  public getGpuMemoryBytes(): number {
    return this.allocatedMemoryBytes;
  }

  public ensureNodeCapacity(requiredCount: number): void {
    if (requiredCount <= this.nodeCapacity) return;

    let newCapacity = this.nodeCapacity;
    while (newCapacity < requiredCount) {
      newCapacity = Math.floor(newCapacity * 1.5);
    }

    this.nodeCapacity = newCapacity;
    this.nodeInstanceData = new Float32Array(
      this.nodeCapacity * WebGLBufferManager.FLOATS_PER_NODE,
    );

    const gl = this.gl;
    if (this.nodeInstanceBuffer) {
      gl.deleteBuffer(this.nodeInstanceBuffer);
    }
    this.nodeInstanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.nodeInstanceData.byteLength, gl.DYNAMIC_DRAW);

    this.updateAllocatedMemoryBytes();
  }

  public ensureEdgeCapacity(requiredSegmentCount: number): void {
    if (requiredSegmentCount <= this.edgeCapacity) return;

    let newCapacity = this.edgeCapacity;
    while (newCapacity < requiredSegmentCount) {
      newCapacity = Math.floor(newCapacity * 1.5);
    }

    this.edgeCapacity = newCapacity;
    this.edgeVertexData = new Float32Array(
      this.edgeCapacity * 4 * WebGLBufferManager.FLOATS_PER_EDGE_VERTEX,
    );

    if (this.supportsUint32Indices) {
      this.edgeIndexData = new Uint32Array(this.edgeCapacity * 6);
    } else {
      this.edgeIndexData = new Uint16Array(this.edgeCapacity * 6);
    }

    this.populateEdgeIndices();

    const gl = this.gl;
    if (this.edgeVertexBuffer) {
      gl.deleteBuffer(this.edgeVertexBuffer);
    }
    this.edgeVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.edgeVertexData.byteLength, gl.DYNAMIC_DRAW);

    if (this.edgeIndexBuffer) {
      gl.deleteBuffer(this.edgeIndexBuffer);
    }
    this.edgeIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.edgeIndexData, gl.STATIC_DRAW);

    this.updateAllocatedMemoryBytes();
  }

  public ensureParticleCapacity(requiredParticleCount: number): void {
    if (requiredParticleCount <= this.particleCapacity) return;

    let newCapacity = this.particleCapacity;
    while (newCapacity < requiredParticleCount) {
      newCapacity = Math.floor(newCapacity * 1.5);
    }

    this.particleCapacity = newCapacity;
    this.particleVertexData = new Float32Array(
      this.particleCapacity * WebGLBufferManager.FLOATS_PER_PARTICLE,
    );

    const gl = this.gl;
    if (this.particleVertexBuffer) {
      gl.deleteBuffer(this.particleVertexBuffer);
    }
    this.particleVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleVertexData.byteLength, gl.DYNAMIC_DRAW);

    this.updateAllocatedMemoryBytes();
  }

  public getNodeInstanceData(): Float32Array {
    return this.nodeInstanceData;
  }

  public getEdgeVertexData(): Float32Array {
    return this.edgeVertexData;
  }

  public getParticleVertexData(): Float32Array {
    return this.particleVertexData;
  }

  public uploadNodeData(nodeCount: number): void {
    const gl = this.gl;
    if (!this.nodeInstanceBuffer || nodeCount <= 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeInstanceBuffer);
    const subArray = this.nodeInstanceData.subarray(
      0,
      nodeCount * WebGLBufferManager.FLOATS_PER_NODE,
    );
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, subArray);
  }

  public uploadEdgeData(vertexCount: number): void {
    const gl = this.gl;
    if (!this.edgeVertexBuffer || vertexCount <= 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeVertexBuffer);
    const subArray = this.edgeVertexData.subarray(
      0,
      vertexCount * WebGLBufferManager.FLOATS_PER_EDGE_VERTEX,
    );
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, subArray);
  }

  public uploadParticleData(particleCount: number): void {
    const gl = this.gl;
    if (!this.particleVertexBuffer || particleCount <= 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVertexBuffer);
    const subArray = this.particleVertexData.subarray(
      0,
      particleCount * WebGLBufferManager.FLOATS_PER_PARTICLE,
    );
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, subArray);
  }

  public bindNodeAttributes(programInfo: ShaderProgramInfo): void {
    const gl = this.gl;
    const stride = WebGLBufferManager.FLOATS_PER_NODE * 4;

    // 1. Static Unit Quad Attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeQuadBuffer);
    const quadLoc = programInfo.attributes.a_quadVertex;
    if (quadLoc >= 0) {
      gl.enableVertexAttribArray(quadLoc);
      gl.vertexAttribPointer(quadLoc, 2, gl.FLOAT, false, 2 * 4, 0);
      this.vertexAttribDivisor(quadLoc, 0);
    }

    // 2. Instanced Per-Node Attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeInstanceBuffer);

    const setupAttrib = (name: string, size: number, floatOffset: number): void => {
      const loc = programInfo.attributes[name];
      if (loc !== undefined && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, floatOffset * 4);
        this.vertexAttribDivisor(loc, 1);
      }
    };

    setupAttrib("a_nodeCenter", 2, 0);
    setupAttrib("a_nodeSize", 2, 2);
    setupAttrib("a_shapeRadius", 2, 4);
    setupAttrib("a_fillColor", 4, 6);
    setupAttrib("a_borderColor", 4, 10);
    setupAttrib("a_borderWidth", 1, 14);
    setupAttrib("a_glowColor", 4, 15);
    setupAttrib("a_glowRadius", 1, 19);
    setupAttrib("a_pulseParams", 2, 20);
  }

  public bindEdgeAttributes(programInfo: ShaderProgramInfo): void {
    const gl = this.gl;
    const stride = WebGLBufferManager.FLOATS_PER_EDGE_VERTEX * 4;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeVertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIndexBuffer);

    const setupAttrib = (name: string, size: number, floatOffset: number): void => {
      const loc = programInfo.attributes[name];
      if (loc !== undefined && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, floatOffset * 4);
        this.vertexAttribDivisor(loc, 0);
      }
    };

    setupAttrib("a_position", 2, 0);
    setupAttrib("a_normal", 2, 2);
    setupAttrib("a_side", 1, 4);
    setupAttrib("a_progress", 1, 5);
    setupAttrib("a_color", 4, 6);
    setupAttrib("a_activeColor", 4, 10);
    setupAttrib("a_edgeParams", 3, 14);
    setupAttrib("a_width", 1, 17);
  }

  public bindParticleAttributes(programInfo: ShaderProgramInfo): void {
    const gl = this.gl;
    const stride = WebGLBufferManager.FLOATS_PER_PARTICLE * 4;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVertexBuffer);

    const setupAttrib = (name: string, size: number, floatOffset: number): void => {
      const loc = programInfo.attributes[name];
      if (loc !== undefined && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, floatOffset * 4);
        this.vertexAttribDivisor(loc, 0);
      }
    };

    setupAttrib("a_position", 2, 0);
    setupAttrib("a_velocity", 2, 2);
    setupAttrib("a_size", 1, 4);
    setupAttrib("a_life", 1, 5);
    setupAttrib("a_maxLife", 1, 6);
    setupAttrib("a_color", 4, 7);
  }

  public drawInstancedNodes(nodeCount: number): void {
    if (nodeCount <= 0) return;
    const gl = this.gl;
    if (this.isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext;
      gl2.drawArraysInstanced(gl2.TRIANGLES, 0, 6, nodeCount);
    } else if (this.instancingExt) {
      this.instancingExt.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, nodeCount);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  public drawEdgeSegments(segmentCount: number): void {
    if (segmentCount <= 0) return;
    const gl = this.gl;
    const indexCount = segmentCount * 6;
    const indexType = this.supportsUint32Indices ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    gl.drawElements(gl.TRIANGLES, indexCount, indexType, 0);
  }

  public drawParticles(particleCount: number): void {
    if (particleCount <= 0) return;
    const gl = this.gl;
    gl.drawArrays(gl.POINTS, 0, particleCount);
  }

  private vertexAttribDivisor(index: number, divisor: number): void {
    if (this.isWebGL2) {
      (this.gl as WebGL2RenderingContext).vertexAttribDivisor(index, divisor);
    } else if (this.instancingExt) {
      this.instancingExt.vertexAttribDivisorANGLE(index, divisor);
    }
  }

  public recreate(newGl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.gl = newGl;
    this.isWebGL2 =
      typeof WebGL2RenderingContext !== "undefined" && newGl instanceof WebGL2RenderingContext;
    if (!this.isWebGL2) {
      const ext = newGl.getExtension("ANGLE_instanced_arrays");
      this.instancingExt = ext && typeof ext === "object" ? (ext as ANGLE_instanced_arrays) : null;
      const uintExt = newGl.getExtension("OES_element_index_uint");
      this.supportsUint32Indices = Boolean(uintExt);
    } else {
      this.supportsUint32Indices = true;
    }
    this.initBuffers();
  }

  public dispose(): void {
    const gl = this.gl;
    if (this.nodeQuadBuffer) {
      gl.deleteBuffer(this.nodeQuadBuffer);
      this.nodeQuadBuffer = null;
    }
    if (this.nodeInstanceBuffer) {
      gl.deleteBuffer(this.nodeInstanceBuffer);
      this.nodeInstanceBuffer = null;
    }
    if (this.nodeIndexBuffer) {
      gl.deleteBuffer(this.nodeIndexBuffer);
      this.nodeIndexBuffer = null;
    }
    if (this.edgeVertexBuffer) {
      gl.deleteBuffer(this.edgeVertexBuffer);
      this.edgeVertexBuffer = null;
    }
    if (this.edgeIndexBuffer) {
      gl.deleteBuffer(this.edgeIndexBuffer);
      this.edgeIndexBuffer = null;
    }
    if (this.particleVertexBuffer) {
      gl.deleteBuffer(this.particleVertexBuffer);
      this.particleVertexBuffer = null;
    }
    this.allocatedMemoryBytes = 0;
  }
}
