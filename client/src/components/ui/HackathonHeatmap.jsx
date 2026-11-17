import { useEffect, useRef } from "react";
import "./hackathon-heatmap.css";

const TAU = Math.PI * 2;
const LOOP_SECONDS = 12;
const GRID_CELL = [64, 22];
const TEAMS = [
  [0.02, 0.62, 0.3, 1, 0],
  [0.97, 0.28, 0.32, 2, 1.9],
  [0.62, 1.02, 0.3, 1, 3.6],
  [0.35, -0.02, 0.26, 3, 5.1],
];

const PURPLE_RAMP = [
  "#13042a",
  "#1d0a3a",
  "#22104f",
  "#2c125c",
  "#36136c",
  "#40198a",
  "#4a249e",
  "#5631b6",
  "#6639cc",
  "#7646e6",
].map((color) => {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
});

const PERMUTATION = new Uint8Array(512);
{
  const values = [...Array(256).keys()];
  let seed = 7;
  const random = () =>
    (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let index = 255; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  for (let index = 0; index < PERMUTATION.length; index += 1) {
    PERMUTATION[index] = values[index & 255];
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function fade(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function gradient(hash, x, y, z) {
  const code = hash & 15;
  const u = code < 8 ? x : y;
  const v = code < 4 ? y : code === 12 || code === 14 ? x : z;
  return ((code & 1) ? -u : u) + ((code & 2) ? -v : v);
}

function noise3(x, y, z) {
  let gridX = Math.floor(x);
  let gridY = Math.floor(y);
  let gridZ = Math.floor(z);
  x -= gridX;
  y -= gridY;
  z -= gridZ;
  gridX &= 255;
  gridY &= 255;
  gridZ &= 255;

  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const a = PERMUTATION[gridX] + gridY;
  const aa = PERMUTATION[a] + gridZ;
  const ab = PERMUTATION[a + 1] + gridZ;
  const b = PERMUTATION[gridX + 1] + gridY;
  const ba = PERMUTATION[b] + gridZ;
  const bb = PERMUTATION[b + 1] + gridZ;

  const near = lerp(
    lerp(
      gradient(PERMUTATION[aa], x, y, z),
      gradient(PERMUTATION[ba], x - 1, y, z),
      u,
    ),
    lerp(
      gradient(PERMUTATION[ab], x, y - 1, z),
      gradient(PERMUTATION[bb], x - 1, y - 1, z),
      u,
    ),
    v,
  );
  const far = lerp(
    lerp(
      gradient(PERMUTATION[aa + 1], x, y, z - 1),
      gradient(PERMUTATION[ba + 1], x - 1, y, z - 1),
      u,
    ),
    lerp(
      gradient(PERMUTATION[ab + 1], x, y - 1, z - 1),
      gradient(PERMUTATION[bb + 1], x - 1, y - 1, z - 1),
      u,
    ),
    v,
  );
  return lerp(near, far, w);
}

function loopingNoise(x, y, phase, radius, z) {
  return noise3(
    x + radius * Math.cos(phase),
    y + radius * Math.sin(phase),
    z,
  );
}

function gaussian2d(x, y, centerX, centerY, radiusX, radiusY) {
  const dx = (x - centerX) / radiusX;
  const dy = (y - centerY) / radiusY;
  return Math.exp(-(dx * dx + dy * dy));
}

function seededRandom(initialSeed) {
  let seed = initialSeed >>> 0 || 1;
  return () => {
    seed =
      (Math.imul(seed ^ (seed >>> 15), 2246822507) ^
        Math.imul(seed ^ (seed >>> 13), 3266489909)) >>>
      0;
    return seed / 4294967296;
  };
}

function createGrid(width, height) {
  const scale = Math.min(width, height) / 1250;
  const columns = Math.max(4, Math.round(width / (GRID_CELL[0] * scale)));
  const rows = Math.max(4, Math.round(height / (GRID_CELL[1] * scale)));
  const count = columns * rows;
  const random = seededRandom("hackathon".length * 977 + columns * 31 + rows);
  const variation = new Float32Array(count);
  const jitter = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    variation[index] = (random() - 0.5) * 0.55;
    jitter[index] = random();
  }

  return { width, height, columns, rows, variation, jitter, colors, fresh: true };
}

function hackathonColor(u, v, phase, aspect, variation) {
  const noise = loopingNoise(u * 2.6, v * 2.6, phase, 0.5, 5.7);
  let remaining = 1;

  for (const [pointX, pointY, baseRadius, frequency, offset] of TEAMS) {
    const pull = 0.1 * (0.5 + 0.5 * Math.sin(phase * frequency + offset + 1.2));
    const x = lerp(pointX, 0.45, pull);
    const y = lerp(pointY, 0.5, pull);
    const pulse = Math.sin(phase * frequency + offset);
    const radius = baseRadius * (1 + 0.3 * pulse);
    const intensity = 0.72 + 0.28 * Math.sin(phase * frequency + offset + 0.5);
    const distance = Math.hypot(((u - x) * aspect) / 1.6, v - y);
    const falloff = Math.exp(-((distance / radius) ** 2));
    const heat = intensity * falloff + 0.04 * Math.sin(18 * distance - 3 * phase) * falloff;
    remaining *= 1 - clamp(heat, 0, 1);
  }

  const combinedHeat = 1 - remaining;
  const value =
    0.26 +
    0.74 * combinedHeat -
    0.2 * gaussian2d(u, v, 0.38, 0.48, 0.16, 0.24) +
    0.07 * noise;
  const paletteIndex = Math.floor(clamp(value + variation / 10, 0, 0.9999) * 10);
  return PURPLE_RAMP[paletteIndex];
}

function updateGrid(grid, phase, deltaSeconds) {
  const { width, height, columns, rows, colors, variation, fresh } = grid;
  const aspect = width / height;
  const amount = fresh ? 1 : 1 - Math.exp(-deltaSeconds / 0.11);

  for (let row = 0; row < rows; row += 1) {
    const v = (row + 0.5) / rows;
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const u = (column + 0.5) / columns;
      const color = hackathonColor(u, v, phase, aspect, variation[index]);
      const offset = index * 3;
      colors[offset] += (color[0] - colors[offset]) * amount;
      colors[offset + 1] += (color[1] - colors[offset + 1]) * amount;
      colors[offset + 2] += (color[2] - colors[offset + 2]) * amount;
    }
  }

  grid.fresh = false;
}

function drawGrid(context, grid) {
  const { columns, rows, width, height, colors } = grid;
  const cellWidth = width / columns;
  const cellHeight = height / rows;

  for (let row = 0; row < rows; row += 1) {
    const y0 = Math.round(row * cellHeight);
    const y1 = Math.round((row + 1) * cellHeight);
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const offset = index * 3;
      const x0 = Math.round(column * cellWidth);
      const x1 = Math.round((column + 1) * cellWidth);
      context.fillStyle = `rgb(${colors[offset] | 0}, ${colors[offset + 1] | 0}, ${colors[offset + 2] | 0})`;
      context.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

export default function HackathonHeatmap() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    const surface = canvas?.parentElement;
    if (!canvas || !context || !surface) return undefined;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let grid = null;
    let phase = 0;
    let lastTime = performance.now();

    const render = (deltaSeconds) => {
      if (!grid) return;
      updateGrid(grid, phase, deltaSeconds);
      drawGrid(context, grid);
    };

    const resize = () => {
      const { width: cssWidth, height: cssHeight } = surface.getBoundingClientRect();
      if (!cssWidth || !cssHeight) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const longestSide = Math.min(2400, Math.max(cssWidth, cssHeight) * dpr);
      const scale = longestSide / Math.max(cssWidth, cssHeight);
      canvas.width = Math.max(1, Math.round(cssWidth * scale));
      canvas.height = Math.max(1, Math.round(cssHeight * scale));
      grid = createGrid(canvas.width, canvas.height);
      context.imageSmoothingEnabled = false;
      render(0);
    };

    const frame = (now) => {
      const deltaSeconds = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      phase = (phase + (deltaSeconds * TAU) / LOOP_SECONDS) % TAU;
      render(deltaSeconds);
      animationFrame = window.requestAnimationFrame(frame);
    };

    const updateMotion = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      if (motionPreference.matches) {
        phase = 0;
        if (grid) grid.fresh = true;
        render(0);
      } else {
        lastTime = performance.now();
        animationFrame = window.requestAnimationFrame(frame);
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    window.addEventListener("resize", resize);
    motionPreference.addEventListener("change", updateMotion);
    resize();
    updateMotion();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      motionPreference.removeEventListener("change", updateMotion);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="hackathon-heatmap" aria-hidden="true">
      <canvas ref={canvasRef} className="hackathon-heatmap__canvas" />
    </div>
  );
}
