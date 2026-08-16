import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import type {
  RenderStats,
  WebGLContextState,
  WebGLRenderConfig,
} from "../../../store/useWebGLRendererStore";

export type { RenderStats, WebGLContextState, WebGLRenderConfig };

export type ShaderType =
  | "node"
  | "edge"
  | "background-particles"
  | "edge-particles"
  | "glow-overlay";

export type NodeShape = "circle" | "rect" | "rounded-rect";

export interface NodeRenderData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: NodeShape;
  cornerRadius: number;
  fillColor: [number, number, number, number];
  borderColor: [number, number, number, number];
  borderWidth: number;
  glowColor: [number, number, number, number];
  glowRadius: number;
  pulseIntensity: number;
  pulsePhase: number;
  isSelected: boolean;
  status:
    | "pending"
    | "running"
    | "success"
    | "error"
    | "warning"
    | "skipped"
    | "cached"
    | "default";
}

export interface EdgeRenderData {
  id: string;
  sourceId: string;
  targetId: string;
  points: Array<{ x: number; y: number }>;
  width: number;
  color: [number, number, number, number];
  activeColor: [number, number, number, number];
  isActive: boolean;
  flowSpeed: number;
  dashLength: number;
}

export interface ParticleData {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: [number, number, number, number];
  edgeProgress: number;
  edgeIndex: number;
}

export interface ViewportTransform {
  panX: number;
  panY: number;
  zoom: number;
  screenWidth: number;
  screenHeight: number;
}

export interface CameraBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BufferAttribute {
  name: string;
  size: number;
  type: number;
  normalized: boolean;
  stride: number;
  offset: number;
}

export interface ShaderProgramInfo {
  program: WebGLProgram;
  attributes: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation | null>;
  isFallback?: boolean;
}

export interface WebGLRenderingContextLike {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  clearColor(r: number, g: number, b: number, a: number): void;
  clear(mask: number): void;
  viewport(x: number, y: number, width: number, height: number): void;
  enable(cap: number): void;
  disable(cap: number): void;
  blendFunc(sfactor: number, dfactor: number): void;
  useProgram(program: WebGLProgram | null): void;
  bindBuffer(target: number, buffer: WebGLBuffer | null): void;
  bufferData(target: number, data: BufferSource | null, usage: number): void;
  bufferSubData(target: number, offset: number, data: BufferSource): void;
  createBuffer(): WebGLBuffer | null;
  deleteBuffer(buffer: WebGLBuffer | null): void;
  createShader(type: number): WebGLShader | null;
  deleteShader(shader: WebGLShader | null): void;
  shaderSource(shader: WebGLShader, source: string): void;
  compileShader(shader: WebGLShader): void;
  getShaderParameter(shader: WebGLShader, pname: number): unknown;
  getShaderInfoLog(shader: WebGLShader): string | null;
  createProgram(): WebGLProgram | null;
  deleteProgram(program: WebGLProgram | null): void;
  attachShader(program: WebGLProgram, shader: WebGLShader): void;
  linkProgram(program: WebGLProgram): void;
  getProgramParameter(program: WebGLProgram, pname: number): unknown;
  getProgramInfoLog(program: WebGLProgram): string | null;
  getAttribLocation(program: WebGLProgram, name: string): number;
  getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null;
  enableVertexAttribArray(index: number): void;
  disableVertexAttribArray(index: number): void;
  vertexAttribPointer(
    index: number,
    size: number,
    type: number,
    normalized: boolean,
    stride: number,
    offset: number,
  ): void;
  uniform1f(location: WebGLUniformLocation | null, v0: number): void;
  uniform2f(location: WebGLUniformLocation | null, v0: number, v1: number): void;
  uniform3f(location: WebGLUniformLocation | null, v0: number, v1: number, v2: number): void;
  uniform4f(
    location: WebGLUniformLocation | null,
    v0: number,
    v1: number,
    v2: number,
    v3: number,
  ): void;
  uniform1i(location: WebGLUniformLocation | null, v0: number): void;
  uniformMatrix3fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Float32List,
  ): void;
  uniformMatrix4fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Float32List,
  ): void;
  drawArrays(mode: number, first: number, count: number): void;
  drawElements(mode: number, count: number, type: number, offset: number): void;
  getExtension(name: string): unknown;
  isContextLost(): boolean;
}

export interface IWebGLRenderer {
  initialize(canvas: HTMLCanvasElement): boolean;
  dispose(): void;
  render(
    nodes: readonly PositionedNode[],
    edges: readonly PositionedEdge[],
    transform: ViewportTransform,
    timeMs?: number,
  ): void;
  getStats(): RenderStats;
  getConfig(): WebGLRenderConfig;
  setConfig(config: Partial<WebGLRenderConfig>): void;
  handleContextLost(): void;
  handleContextRestored(): void;
  isFallbackActive(): boolean;
}
