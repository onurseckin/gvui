import type { ShaderProgramInfo } from "./types";

// ============================================================================
// GLSL Shader Sources
// ============================================================================

// ----------------------------------------------------------------------------
// 1. Node Shader: SDF Circle & Rounded Rect with AA, Borders, Glow, and Pulse Wave
// ----------------------------------------------------------------------------
export const NODE_VERTEX_SHADER = `
precision highp float;

attribute vec2 a_quadVertex;       // [-0.5, -0.5] to [0.5, 0.5] unit quad
attribute vec2 a_nodeCenter;       // World center (x, y)
attribute vec2 a_nodeSize;         // (width, height)
attribute vec2 a_shapeRadius;      // (shapeType: 0=circle, 1=rect, 2=rounded-rect; cornerRadius)
attribute vec4 a_fillColor;        // RGBA
attribute vec4 a_borderColor;      // RGBA
attribute float a_borderWidth;     // border thickness in pixels
attribute vec4 a_glowColor;        // RGBA
attribute float a_glowRadius;      // outer glow radius in pixels
attribute vec2 a_pulseParams;      // (pulseIntensity, pulsePhase)

uniform mat3 u_viewProjectionMatrix;
uniform float u_time;
uniform float u_pixelRatio;

varying vec2 v_localPos;
varying vec2 v_halfSize;
varying vec2 v_shapeRadius;
varying vec4 v_fillColor;
varying vec4 v_borderColor;
varying float v_borderWidth;
varying vec4 v_glowColor;
varying float v_glowRadius;
varying vec2 v_pulseParams;

void main() {
  v_halfSize = a_nodeSize * 0.5;
  v_shapeRadius = a_shapeRadius;
  v_fillColor = a_fillColor;
  v_borderColor = a_borderColor;
  v_borderWidth = a_borderWidth;
  v_glowColor = a_glowColor;
  v_glowRadius = a_glowRadius;
  v_pulseParams = a_pulseParams;

  // Expand quad beyond node bounds to encompass glow and pulse wave envelope
  float padding = max(a_glowRadius * 2.5 + a_borderWidth + 4.0, 16.0);
  vec2 expandedSize = a_nodeSize + vec2(padding * 2.0);
  v_localPos = a_quadVertex * expandedSize;

  vec2 worldPos = a_nodeCenter + v_localPos;
  vec3 clipPos = u_viewProjectionMatrix * vec3(worldPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
`;

export const NODE_FRAGMENT_SHADER = `
precision highp float;

uniform float u_time;
uniform float u_glowIntensity;
uniform float u_pulseFrequency;

varying vec2 v_localPos;
varying vec2 v_halfSize;
varying vec2 v_shapeRadius;
varying vec4 v_fillColor;
varying vec4 v_borderColor;
varying float v_borderWidth;
varying vec4 v_glowColor;
varying float v_glowRadius;
varying vec2 v_pulseParams;

float sdfCircle(vec2 p, float r) {
  return length(p) - r;
}

float sdfRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  float dist = 0.0;
  float shapeType = v_shapeRadius.x;
  float radius = v_shapeRadius.y;

  if (shapeType < 0.5) {
    // Circle
    dist = sdfCircle(v_localPos, min(v_halfSize.x, v_halfSize.y));
  } else if (shapeType < 1.5) {
    // Sharp rectangle
    vec2 d = abs(v_localPos) - v_halfSize;
    dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  } else {
    // Rounded rectangle
    dist = sdfRoundedBox(v_localPos, v_halfSize, clamp(radius, 0.0, min(v_halfSize.x, v_halfSize.y)));
  }

  // Antialiased Interior Fill
  float fillAlpha = 1.0 - smoothstep(-0.8, 0.8, dist);

  // Antialiased Stroke / Border
  float borderDist = abs(dist + v_borderWidth * 0.5) - v_borderWidth * 0.5;
  float borderAlpha = 1.0 - smoothstep(-0.8, 0.8, borderDist);
  if (v_borderWidth <= 0.0) {
    borderAlpha = 0.0;
  }

  // Soft Outer Glow
  float glowDist = max(0.0, dist);
  float effectiveGlowRadius = max(1.0, v_glowRadius);
  float glowFalloff = exp(-glowDist / (effectiveGlowRadius * 0.45));
  float glowAlpha = glowFalloff * v_glowColor.a * u_glowIntensity;

  // Pulse Ring Wave Animation
  float pulseIntensity = v_pulseParams.x;
  float pulsePhase = v_pulseParams.y;
  float pulseWave = sin(u_time * u_pulseFrequency * 3.14159 + pulsePhase) * 0.5 + 0.5;
  float ringCenter = pulseWave * effectiveGlowRadius * 1.8;
  float ringDist = abs(dist - ringCenter);
  float ringAlpha = exp(-ringDist / 3.5) * pulseIntensity * (1.0 - pulseWave * 0.7) * 0.9;

  // Alpha Blending Compositor
  vec4 baseColor = v_fillColor;
  vec4 color = vec4(0.0);

  // Layer 1: Glow & Pulse
  vec4 haloColor = v_glowColor;
  float combinedGlow = clamp(glowAlpha + ringAlpha, 0.0, 1.0);
  color = mix(color, haloColor, combinedGlow);

  // Layer 2: Fill
  color = mix(color, baseColor, fillAlpha * baseColor.a);

  // Layer 3: Border
  color = mix(color, v_borderColor, borderAlpha * v_borderColor.a);

  if (color.a <= 0.001) {
    discard;
  }

  gl_FragColor = color;
}
`;

// ----------------------------------------------------------------------------
// 2. Fallback Minimal Node Shader (for constrained / basic WebGL)
// ----------------------------------------------------------------------------
export const FALLBACK_NODE_VERTEX_SHADER = `
precision mediump float;
attribute vec2 a_quadVertex;
attribute vec2 a_nodeCenter;
attribute vec2 a_nodeSize;
attribute vec4 a_fillColor;
uniform mat3 u_viewProjectionMatrix;
varying vec4 v_color;

void main() {
  v_color = a_fillColor;
  vec2 worldPos = a_nodeCenter + a_quadVertex * a_nodeSize;
  vec3 clipPos = u_viewProjectionMatrix * vec3(worldPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
`;

export const FALLBACK_NODE_FRAGMENT_SHADER = `
precision mediump float;
varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
`;

// ----------------------------------------------------------------------------
// 3. Edge Shader: Antialiased lines, Flow Direction, Dashed Animation
// ----------------------------------------------------------------------------
export const EDGE_VERTEX_SHADER = `
precision highp float;

attribute vec2 a_position;       // Endpoint coordinates (world space)
attribute vec2 a_normal;         // Extrusion normal direction
attribute float a_side;          // -1.0 or +1.0 for quad strip expansion
attribute float a_progress;      // Distance along polyline in pixels
attribute vec4 a_color;          // Base color RGBA
attribute vec4 a_activeColor;    // Active glow color RGBA
attribute vec3 a_edgeParams;     // (isActive: 0/1, flowSpeed, dashLength)
attribute float a_width;         // Line width in pixels

uniform mat3 u_viewProjectionMatrix;
uniform float u_time;

varying vec2 v_lineCoords;       // (side, distance along line)
varying vec4 v_color;
varying vec4 v_activeColor;
varying vec3 v_edgeParams;
varying float v_width;

void main() {
  v_lineCoords = vec2(a_side, a_progress);
  v_color = a_color;
  v_activeColor = a_activeColor;
  v_edgeParams = a_edgeParams;
  v_width = a_width;

  // Extrude perpendicular to line direction by (halfWidth + 1.5px AA margin)
  float halfWidth = a_width * 0.5 + 1.5;
  vec2 worldPos = a_position + a_normal * (a_side * halfWidth);
  vec3 clipPos = u_viewProjectionMatrix * vec3(worldPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
`;

export const EDGE_FRAGMENT_SHADER = `
precision highp float;

uniform float u_time;

varying vec2 v_lineCoords;
varying vec4 v_color;
varying vec4 v_activeColor;
varying vec3 v_edgeParams;
varying float v_width;

void main() {
  float side = abs(v_lineCoords.x);
  float progress = v_lineCoords.y;
  float isActive = v_edgeParams.x;
  float flowSpeed = v_edgeParams.y;
  float dashLength = v_edgeParams.z;

  // Antialiased stroke across the line width
  float edgeAlpha = 1.0 - smoothstep(0.7, 1.0, side);

  // Dashed line pattern if specified
  if (dashLength > 0.0) {
    float dashOffset = u_time * flowSpeed * 30.0;
    float dashPos = mod(progress - dashOffset, dashLength * 2.0);
    if (dashPos > dashLength) {
      edgeAlpha = 0.0;
    }
  }

  // Active energy flow animation
  vec4 finalColor = v_color;
  if (isActive > 0.5) {
    float wave = sin(progress * 0.05 - u_time * flowSpeed * 6.0) * 0.5 + 0.5;
    finalColor = mix(v_color, v_activeColor, wave * 0.85);
  }

  finalColor.a *= edgeAlpha;

  if (finalColor.a <= 0.01) {
    discard;
  }

  gl_FragColor = finalColor;
}
`;

// ----------------------------------------------------------------------------
// 4. Background Particle Field Shader
// ----------------------------------------------------------------------------
export const PARTICLE_VERTEX_SHADER = `
precision highp float;

attribute vec2 a_position;
attribute vec2 a_velocity;
attribute float a_size;
attribute float a_life;
attribute float a_maxLife;
attribute vec4 a_color;

uniform mat3 u_viewProjectionMatrix;
uniform float u_time;

varying vec4 v_color;
varying float v_lifeRatio;

void main() {
  v_lifeRatio = clamp(a_life / max(a_maxLife, 0.001), 0.0, 1.0);
  v_color = a_color;

  // Gentle harmonic drifting
  vec2 drift = vec2(
    sin(u_time * 0.8 + a_position.y * 0.01) * 3.0,
    cos(u_time * 0.7 + a_position.x * 0.01) * 3.0
  );

  vec2 currentPos = a_position + drift;
  vec3 clipPos = u_viewProjectionMatrix * vec3(currentPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
  gl_PointSize = a_size * (0.6 + 0.4 * sin(u_time * 2.0 + a_position.x * 0.05));
}
`;

export const PARTICLE_FRAGMENT_SHADER = `
precision highp float;

varying vec4 v_color;
varying float v_lifeRatio;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord) * 2.0;

  if (dist > 1.0) {
    discard;
  }

  // Soft glowing point disk
  float alpha = (1.0 - smoothstep(0.0, 1.0, dist)) * v_color.a * v_lifeRatio;
  gl_FragColor = vec4(v_color.rgb, alpha);
}
`;

// ============================================================================
// Shader Compiler, Program Linker, and Fallback Utilities
// ============================================================================

export function compileShader(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const status = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (typeof status === "boolean" && !status) {
    const errorLog = gl.getShaderInfoLog(shader) || "Unknown compilation error";
    console.warn(`[WebGLRenderer] Shader compilation failed: ${errorLog}`);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

export function createShaderProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  attributeNames: string[],
  uniformNames: string[],
): ShaderProgramInfo | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  if (!vertexShader) return null;

  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!fragmentShader) {
    gl.deleteShader(vertexShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  // Clean up shaders now that they are attached
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  const linkStatus = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (typeof linkStatus === "boolean" && !linkStatus) {
    const errorLog = gl.getProgramInfoLog(program) || "Unknown link error";
    console.warn(`[WebGLRenderer] Program link failed: ${errorLog}`);
    gl.deleteProgram(program);
    return null;
  }

  const attributes: Record<string, number> = {};
  for (const name of attributeNames) {
    attributes[name] = gl.getAttribLocation(program, name);
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  return {
    program,
    attributes,
    uniforms,
  };
}

export function createNodeProgramWithFallback(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): ShaderProgramInfo | null {
  const attribs = [
    "a_quadVertex",
    "a_nodeCenter",
    "a_nodeSize",
    "a_shapeRadius",
    "a_fillColor",
    "a_borderColor",
    "a_borderWidth",
    "a_glowColor",
    "a_glowRadius",
    "a_pulseParams",
  ];
  const uniforms = [
    "u_viewProjectionMatrix",
    "u_time",
    "u_pixelRatio",
    "u_glowIntensity",
    "u_pulseFrequency",
  ];

  const primary = createShaderProgram(
    gl,
    NODE_VERTEX_SHADER,
    NODE_FRAGMENT_SHADER,
    attribs,
    uniforms,
  );

  if (primary) return primary;

  // If SDF shader failed, use fallback simple shader
  console.warn("[WebGLRenderer] Primary node shader failed, using fallback simple shader");
  const fallback = createShaderProgram(
    gl,
    FALLBACK_NODE_VERTEX_SHADER,
    FALLBACK_NODE_FRAGMENT_SHADER,
    ["a_quadVertex", "a_nodeCenter", "a_nodeSize", "a_fillColor"],
    ["u_viewProjectionMatrix"],
  );

  if (fallback) {
    fallback.isFallback = true;
  }
  return fallback;
}

export function createEdgeProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): ShaderProgramInfo | null {
  const attribs = [
    "a_position",
    "a_normal",
    "a_side",
    "a_progress",
    "a_color",
    "a_activeColor",
    "a_edgeParams",
    "a_width",
  ];
  const uniforms = ["u_viewProjectionMatrix", "u_time"];

  return createShaderProgram(gl, EDGE_VERTEX_SHADER, EDGE_FRAGMENT_SHADER, attribs, uniforms);
}

export function createParticleProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): ShaderProgramInfo | null {
  const attribs = ["a_position", "a_velocity", "a_size", "a_life", "a_maxLife", "a_color"];
  const uniforms = ["u_viewProjectionMatrix", "u_time"];

  return createShaderProgram(
    gl,
    PARTICLE_VERTEX_SHADER,
    PARTICLE_FRAGMENT_SHADER,
    attribs,
    uniforms,
  );
}
