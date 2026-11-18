import { useEffect, useRef } from "react";
import "./PixelField.css";

// Pixel heat field in the style of the Forum INSAT Entreprise 2026 design
// system (hackathon axis). Computed on the GPU at cell resolution and
// upscaled pixel-sharp:
//   - four soft "team" shapes drift in from the edges, swell and recede,
//     with faint ripples, over a slow simplex-noise flow;
//   - heat is quantised into the 10-step violet palette with a per-cell
//     grain, so edges stay crisp and pixelated;
//   - the pointer (mouse or finger) adds heat that shows as stepped red
//     rings, easing in and following smoothly.
// Falls back to the plain night background when WebGL is unavailable, and
// stays still when the user prefers reduced motion.

const VIOLET = ["#13042a", "#1d0a3a", "#22104f", "#2c125c", "#36136c", "#40198a", "#4a249e", "#5631b6", "#6639cc", "#7646e6"];
const RED = ["#000000", "#3d0838", "#540a33", "#760a2c", "#931028", "#b8192a", "#e8102c"];

const hexToVec = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const paletteUniform = (list, size) => {
  const out = new Float32Array(size * 3);
  list.forEach((hex, i) => out.set(hexToVec(hex), i * 3));
  return out;
};

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Simplex noise: Ian McEwan / Stefan Gustavson (MIT), widely used GLSL snippet.
const FRAGMENT = `
precision highp float;
uniform vec2 uGrid;
uniform float uTime;
uniform vec3 uPointer;   // x, y in cells (top-left origin), strength 0..1
uniform float uRadius;   // pointer radius in cells
uniform float uAspect;
uniform vec3 uViolet[10];
uniform vec3 uRed[7];

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float cellHash(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 violetAt(float t) {
  int k = int(floor(clamp(t, 0.0, 0.9999) * 10.0));
  vec3 c = uViolet[0];
  for (int i = 0; i < 10; i++) { if (i == k) c = uViolet[i]; }
  return c;
}
vec3 redAt(int k) {
  vec3 c = uRed[0];
  for (int i = 0; i < 7; i++) { if (i == k) c = uRed[i]; }
  return c;
}

// One drifting shape: anchored near an edge, pulled slightly inwards,
// breathing in size and intensity, with faint ripples inside.
float shape(vec2 uv, float a, vec2 anchor, float size, float speed, float phase, float t) {
  float s = t * speed + phase;
  vec2 c = mix(anchor, vec2(0.5, 0.5), 0.12 * (0.5 + 0.5 * sin(s + 1.1)));
  float r = size * (1.0 + 0.28 * sin(s));
  // Distance in screen proportions, valid for landscape and portrait.
  float d = length(vec2((uv.x - c.x) * a, uv.y - c.y)) / sqrt(max(a, 0.3));
  float body = exp(-pow(d / r, 2.0));
  float intensity = 0.72 + 0.28 * sin(s + 0.6);
  return clamp(intensity * body + 0.045 * sin(18.0 * d - 3.0 * t) * body, 0.0, 1.0);
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = vec2((cell.x + 0.5) / uGrid.x, 1.0 - (cell.y + 0.5) / uGrid.y);
  float a = clamp(uAspect, 0.35, 2.0);
  float grain = (cellHash(cell) - 0.5) * 0.55;
  float t = uTime;

  float flow = 0.62 * snoise(vec3(uv * 2.6 + 0.5 * vec2(cos(t * 0.35), sin(t * 0.35)), 5.7 + t * 0.05));

  float empty = 1.0;
  empty *= 1.0 - shape(uv, a, vec2(0.02, 0.62), 0.24, 0.35, 0.0, t);
  empty *= 1.0 - shape(uv, a, vec2(0.97, 0.28), 0.25, 0.70, 1.9, t);
  empty *= 1.0 - shape(uv, a, vec2(0.62, 1.02), 0.24, 0.35, 3.6, t);
  empty *= 1.0 - shape(uv, a, vec2(0.35, -0.02), 0.21, 1.05, 5.1, t);

  // Pointer heat (bottom-left GL origin vs top-left pointer coordinates).
  vec2 pc = vec2(uPointer.x, uGrid.y - uPointer.y);
  float pd = length(cell + 0.5 - pc) / uRadius;
  float warm = exp(-pd * pd) * uPointer.z;

  // Darker centre behind the voting panel keeps text legible.
  vec2 dc = (uv - vec2(0.5, 0.48)) / vec2(0.26, 0.3);
  float calm = exp(-dot(dc, dc));

  float heat = 0.06 + 0.82 * (1.0 - empty) - 0.4 * calm + 0.08 * flow + 0.3 * warm;
  vec3 col = violetAt(heat + grain / 10.0);
  // Veil: keep the night ground dominant (darker in the centre) without
  // dimming the red pointer rings drawn after it.
  col = mix(vec3(0.0196, 0.0118, 0.102), col, 0.72 - 0.38 * calm);

  // Stepped red rings around the pointer.
  float r = 1.05 * warm + 0.04 * flow;
  int ri = int(floor(clamp(r + grain / 7.0, 0.0, 0.9999) * 7.0));
  if (ri > 0) {
    float w = ri == 1 ? 0.4 : (ri == 2 ? 0.65 : (ri == 3 ? 0.85 : 1.0));
    col = mix(col, redAt(ri), w);
  }
  col += (1.0 - col) * warm * 0.12;
  gl_FragColor = vec4(col, 1.0);
}
`;

const compile = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "shader compile failed");
  }
  return shader;
};

export default function PixelField({ cell = 10 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) {
      canvas.style.display = "none";
      return undefined;
    }

    let program;
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link failed");
    } catch (error) {
      console.warn("PixelField disabled:", error.message);
      canvas.style.display = "none";
      return undefined;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = Object.fromEntries(
      ["uGrid", "uTime", "uPointer", "uRadius", "uAspect", "uViolet", "uRed"].map((n) => [n, gl.getUniformLocation(program, n)])
    );
    gl.uniform3fv(u.uViolet, paletteUniform(VIOLET, 10));
    gl.uniform3fv(u.uRed, paletteUniform(RED, 7));

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let cellPx = cell;
    let cols = 0;
    let rows = 0;
    // Pointer eases towards its target for a smooth follow.
    const pointer = { x: -100, y: -100, tx: -100, ty: -100, s: 0, ts: 0 };
    let raf = 0;
    let last = 0;
    let time = 0;
    const frameMs = coarse ? 1000 / 30 : 1000 / 60;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      cellPx = w < 640 ? Math.round(cell * 1.2) : cell;
      cols = Math.max(8, Math.round(w / cellPx));
      rows = Math.max(8, Math.round(h / cellPx));
      canvas.width = cols;
      canvas.height = rows;
      gl.viewport(0, 0, cols, rows);
      gl.uniform2f(u.uGrid, cols, rows);
      gl.uniform1f(u.uAspect, w / h);
      gl.uniform1f(u.uRadius, w < 640 ? 7 : 9);
    };

    const render = () => {
      gl.uniform1f(u.uTime, time);
      gl.uniform3f(u.uPointer, pointer.x / cellPx, pointer.y / cellPx, pointer.s);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < frameMs) return;
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      time += dt;
      const follow = 1 - Math.pow(0.001, dt); // frame-rate independent easing
      pointer.x += (pointer.tx - pointer.x) * follow;
      pointer.y += (pointer.ty - pointer.y) * follow;
      pointer.s += (pointer.ts - pointer.s) * (1 - Math.pow(0.02, dt));
      render();
    };

    const onPointer = (event) => {
      if (pointer.s < 0.02) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
      }
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
      pointer.ts = event.pointerType === "mouse" || event.buttons > 0 || event.type === "pointerdown" ? 1 : 0;
    };
    const onRelease = (event) => {
      if (event.pointerType !== "mouse") pointer.ts = 0;
    };
    const onLeave = () => {
      pointer.ts = 0;
    };

    resize();
    time = 4.2; // start mid-motion rather than at a symmetric pose
    render();
    if (!reduceMotion) {
      raf = requestAnimationFrame(loop);
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
      window.addEventListener("pointerup", onRelease, { passive: true });
      window.addEventListener("pointercancel", onLeave, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }
    const onResize = () => {
      resize();
      render();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [cell]);

  return <canvas ref={canvasRef} className="pixel-field" aria-hidden="true" />;
}
