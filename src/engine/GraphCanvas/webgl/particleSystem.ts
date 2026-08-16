import type { PositionedEdge } from "../../../types/graphData";
import { WebGLBufferManager } from "./bufferManager";
import type { CameraBounds } from "./types";

export interface ParticleConfig {
  maxParticles: number;
  flowParticlesPerEdge: number;
  ambientParticleCount: number;
  baseSpeed: number;
  particleSize: number;
}

export interface CachedEdgePolyline {
  edgeId: string;
  points: Array<{ x: number; y: number }>;
  segmentLengths: number[];
  cumulativeLengths: number[];
  totalLength: number;
  color: [number, number, number, number];
  isActive: boolean;
  flowSpeed: number;
}

export class WebGLParticleSystem {
  private config: ParticleConfig;

  // Struct of Arrays (SoA) for ultra-high performance & cache locality
  private maxParticles: number;
  private activeCount: number = 0;

  // Particle Attributes (Typed Arrays)
  private posX: Float32Array;
  private posY: Float32Array;
  private velX: Float32Array;
  private velY: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private colorR: Float32Array;
  private colorG: Float32Array;
  private colorB: Float32Array;
  private colorA: Float32Array;
  private edgeIndices: Int32Array; // -1 if ambient, >=0 if along edge
  private edgeDistances: Float32Array;
  private edgeSpeeds: Float32Array;

  // Edge Path Cache
  private edgeCache: CachedEdgePolyline[] = [];
  private edgeIdToIndexMap: Map<string, number> = new Map();

  // Ambient Bounding Box
  private bounds: CameraBounds = {
    minX: -2000,
    minY: -2000,
    maxX: 4000,
    maxY: 4000,
  };

  constructor(config?: Partial<ParticleConfig>) {
    this.config = {
      maxParticles: config?.maxParticles ?? 5000,
      flowParticlesPerEdge: config?.flowParticlesPerEdge ?? 8,
      ambientParticleCount: config?.ambientParticleCount ?? 500,
      baseSpeed: config?.baseSpeed ?? 120,
      particleSize: config?.particleSize ?? 3.5,
    };

    this.maxParticles = Math.max(this.config.maxParticles, 1024);

    this.posX = new Float32Array(this.maxParticles);
    this.posY = new Float32Array(this.maxParticles);
    this.velX = new Float32Array(this.maxParticles);
    this.velY = new Float32Array(this.maxParticles);
    this.life = new Float32Array(this.maxParticles);
    this.maxLife = new Float32Array(this.maxParticles);
    this.size = new Float32Array(this.maxParticles);
    this.colorR = new Float32Array(this.maxParticles);
    this.colorG = new Float32Array(this.maxParticles);
    this.colorB = new Float32Array(this.maxParticles);
    this.colorA = new Float32Array(this.maxParticles);
    this.edgeIndices = new Int32Array(this.maxParticles);
    this.edgeDistances = new Float32Array(this.maxParticles);
    this.edgeSpeeds = new Float32Array(this.maxParticles);
  }

  public setBounds(bounds: CameraBounds): void {
    this.bounds = { ...bounds };
  }

  public setMaxParticles(max: number): void {
    if (max <= this.maxParticles) {
      this.config.maxParticles = max;
      return;
    }
    const newMax = Math.max(max, 1024);
    const newPosX = new Float32Array(newMax);
    const newPosY = new Float32Array(newMax);
    const newVelX = new Float32Array(newMax);
    const newVelY = new Float32Array(newMax);
    const newLife = new Float32Array(newMax);
    const newMaxLife = new Float32Array(newMax);
    const newSize = new Float32Array(newMax);
    const newColorR = new Float32Array(newMax);
    const newColorG = new Float32Array(newMax);
    const newColorB = new Float32Array(newMax);
    const newColorA = new Float32Array(newMax);
    const newEdgeIndices = new Int32Array(newMax);
    const newEdgeDistances = new Float32Array(newMax);
    const newEdgeSpeeds = new Float32Array(newMax);

    newPosX.set(this.posX.subarray(0, this.activeCount));
    newPosY.set(this.posY.subarray(0, this.activeCount));
    newVelX.set(this.velX.subarray(0, this.activeCount));
    newVelY.set(this.velY.subarray(0, this.activeCount));
    newLife.set(this.life.subarray(0, this.activeCount));
    newMaxLife.set(this.maxLife.subarray(0, this.activeCount));
    newSize.set(this.size.subarray(0, this.activeCount));
    newColorR.set(this.colorR.subarray(0, this.activeCount));
    newColorG.set(this.colorG.subarray(0, this.activeCount));
    newColorB.set(this.colorB.subarray(0, this.activeCount));
    newColorA.set(this.colorA.subarray(0, this.activeCount));
    newEdgeIndices.set(this.edgeIndices.subarray(0, this.activeCount));
    newEdgeDistances.set(this.edgeDistances.subarray(0, this.activeCount));
    newEdgeSpeeds.set(this.edgeSpeeds.subarray(0, this.activeCount));

    this.posX = newPosX;
    this.posY = newPosY;
    this.velX = newVelX;
    this.velY = newVelY;
    this.life = newLife;
    this.maxLife = newMaxLife;
    this.size = newSize;
    this.colorR = newColorR;
    this.colorG = newColorG;
    this.colorB = newColorB;
    this.colorA = newColorA;
    this.edgeIndices = newEdgeIndices;
    this.edgeDistances = newEdgeDistances;
    this.edgeSpeeds = newEdgeSpeeds;
    this.maxParticles = newMax;
    this.config.maxParticles = newMax;
  }

  public updateEdges(edges: readonly PositionedEdge[]): void {
    this.edgeCache = [];
    this.edgeIdToIndexMap.clear();

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      if (!edge.points || edge.points.length < 2) continue;

      const segmentLengths: number[] = [];
      const cumulativeLengths: number[] = [0];
      let totalLength = 0;

      for (let p = 0; p < edge.points.length - 1; p++) {
        const p1 = edge.points[p];
        const p2 = edge.points[p + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        segmentLengths.push(len);
        totalLength += len;
        cumulativeLengths.push(totalLength);
      }

      if (totalLength <= 0) continue;

      const isActive = Boolean(
        edge.traffic?.status === "active" ||
        edge.isHighTraffic ||
        (edge.traffic && (edge.traffic.volume ?? 0) > 0),
      );

      const color: [number, number, number, number] = isActive
        ? [0.2, 0.7, 1.0, 0.95]
        : [0.4, 0.5, 0.65, 0.6];

      const cacheEntry: CachedEdgePolyline = {
        edgeId: edge.id,
        points: edge.points,
        segmentLengths,
        cumulativeLengths,
        totalLength,
        color,
        isActive,
        flowSpeed: isActive ? 1.5 : 0.8,
      };

      const cacheIndex = this.edgeCache.length;
      this.edgeCache.push(cacheEntry);
      this.edgeIdToIndexMap.set(edge.id, cacheIndex);
    }
  }

  public spawnEdgeParticle(edgeIndex: number, startProgressRatio = 0): void {
    if (this.activeCount >= this.maxParticles || edgeIndex >= this.edgeCache.length) return;

    const edge = this.edgeCache[edgeIndex];
    const index = this.activeCount;

    const initialDist = edge.totalLength * startProgressRatio;
    const initialPos = this.interpolateEdgePosition(edge, initialDist);

    this.posX[index] = initialPos.x;
    this.posY[index] = initialPos.y;
    this.velX[index] = 0;
    this.velY[index] = 0;
    this.life[index] = 1.0;
    this.maxLife[index] = 1.0;
    this.size[index] = this.config.particleSize * (edge.isActive ? 1.25 : 0.9);
    this.colorR[index] = edge.color[0];
    this.colorG[index] = edge.color[1];
    this.colorB[index] = edge.color[2];
    this.colorA[index] = edge.color[3];
    this.edgeIndices[index] = edgeIndex;
    this.edgeDistances[index] = initialDist;
    this.edgeSpeeds[index] = this.config.baseSpeed * edge.flowSpeed * (0.9 + Math.random() * 0.2);

    this.activeCount++;
  }

  public spawnAmbientParticle(): void {
    if (this.activeCount >= this.maxParticles) return;

    const index = this.activeCount;
    const bw = Math.max(this.bounds.maxX - this.bounds.minX, 500);
    const bh = Math.max(this.bounds.maxY - this.bounds.minY, 500);

    this.posX[index] = this.bounds.minX + Math.random() * bw;
    this.posY[index] = this.bounds.minY + Math.random() * bh;
    this.velX[index] = (Math.random() - 0.5) * 15;
    this.velY[index] = (Math.random() - 0.5) * 15;
    this.life[index] = 3.0 + Math.random() * 4.0;
    this.maxLife[index] = this.life[index];
    this.size[index] = 1.5 + Math.random() * 2.0;
    this.colorR[index] = 0.4 + Math.random() * 0.3;
    this.colorG[index] = 0.6 + Math.random() * 0.4;
    this.colorB[index] = 0.9 + Math.random() * 0.1;
    this.colorA[index] = 0.15 + Math.random() * 0.25;
    this.edgeIndices[index] = -1; // ambient
    this.edgeDistances[index] = 0;
    this.edgeSpeeds[index] = 0;

    this.activeCount++;
  }

  public populateInitialParticles(): void {
    // 1. Edge Flow Particles
    for (let e = 0; e < this.edgeCache.length; e++) {
      const edge = this.edgeCache[e];
      const count = edge.isActive
        ? this.config.flowParticlesPerEdge * 2
        : Math.max(1, Math.floor(this.config.flowParticlesPerEdge * 0.5));

      for (let i = 0; i < count; i++) {
        this.spawnEdgeParticle(e, i / count);
      }
    }

    // 2. Ambient Particles
    const targetAmbient = Math.min(
      this.config.ambientParticleCount,
      this.maxParticles - this.activeCount,
    );
    for (let i = 0; i < targetAmbient; i++) {
      this.spawnAmbientParticle();
    }
  }

  public update(deltaSeconds: number): void {
    if (deltaSeconds <= 0) return;
    const clampedDelta = Math.min(deltaSeconds, 0.1);

    let i = 0;
    while (i < this.activeCount) {
      const edgeIdx = this.edgeIndices[i];

      if (edgeIdx >= 0 && edgeIdx < this.edgeCache.length) {
        // Flow Particle along edge
        const edge = this.edgeCache[edgeIdx];
        this.edgeDistances[i] += this.edgeSpeeds[i] * clampedDelta;

        if (this.edgeDistances[i] >= edge.totalLength) {
          // Loop back to start
          this.edgeDistances[i] = 0;
        }

        const pos = this.interpolateEdgePosition(edge, this.edgeDistances[i]);
        this.posX[i] = pos.x;
        this.posY[i] = pos.y;
        i++;
      } else if (edgeIdx === -1) {
        // Ambient Particle
        this.posX[i] += this.velX[i] * clampedDelta;
        this.posY[i] += this.velY[i] * clampedDelta;
        this.life[i] -= clampedDelta;

        if (this.life[i] <= 0) {
          // Recycle ambient particle
          this.removeParticleAt(i);
          this.spawnAmbientParticle();
        } else {
          i++;
        }
      } else {
        // Edge index no longer valid
        this.removeParticleAt(i);
      }
    }
  }

  private interpolateEdgePosition(
    edge: CachedEdgePolyline,
    dist: number,
  ): { x: number; y: number } {
    const points = edge.points;
    if (points.length === 0) return { x: 0, y: 0 };
    if (points.length === 1 || dist <= 0) return points[0];
    if (dist >= edge.totalLength) return points[points.length - 1];

    const cumLengths = edge.cumulativeLengths;
    for (let s = 0; s < edge.segmentLengths.length; s++) {
      const segStart = cumLengths[s];
      const segEnd = cumLengths[s + 1];

      if (dist >= segStart && dist <= segEnd) {
        const segLen = edge.segmentLengths[s];
        const t = segLen > 0 ? (dist - segStart) / segLen : 0;
        const p1 = points[s];
        const p2 = points[s + 1];
        return {
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t,
        };
      }
    }

    return points[points.length - 1];
  }

  private removeParticleAt(index: number): void {
    const last = this.activeCount - 1;
    if (index < last) {
      this.posX[index] = this.posX[last];
      this.posY[index] = this.posY[last];
      this.velX[index] = this.velX[last];
      this.velY[index] = this.velY[last];
      this.life[index] = this.life[last];
      this.maxLife[index] = this.maxLife[last];
      this.size[index] = this.size[last];
      this.colorR[index] = this.colorR[last];
      this.colorG[index] = this.colorG[last];
      this.colorB[index] = this.colorB[last];
      this.colorA[index] = this.colorA[last];
      this.edgeIndices[index] = this.edgeIndices[last];
      this.edgeDistances[index] = this.edgeDistances[last];
      this.edgeSpeeds[index] = this.edgeSpeeds[last];
    }
    this.activeCount--;
  }

  public packBuffer(targetBuffer: Float32Array): number {
    const count = this.activeCount;
    const stride = WebGLBufferManager.FLOATS_PER_PARTICLE;

    for (let i = 0; i < count; i++) {
      const offset = i * stride;
      targetBuffer[offset + 0] = this.posX[i];
      targetBuffer[offset + 1] = this.posY[i];
      targetBuffer[offset + 2] = this.velX[i];
      targetBuffer[offset + 3] = this.velY[i];
      targetBuffer[offset + 4] = this.size[i];
      targetBuffer[offset + 5] = this.life[i];
      targetBuffer[offset + 6] = this.maxLife[i];
      targetBuffer[offset + 7] = this.colorR[i];
      targetBuffer[offset + 8] = this.colorG[i];
      targetBuffer[offset + 9] = this.colorB[i];
      targetBuffer[offset + 10] = this.colorA[i];
    }

    return count;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public clear(): void {
    this.activeCount = 0;
    this.edgeCache = [];
    this.edgeIdToIndexMap.clear();
  }
}
