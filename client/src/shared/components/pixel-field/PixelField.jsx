import { useEffect, useRef } from "react";
import "./PixelField.css";

// A field of large pixels coloured by a slowly flowing "heat", in the
// hackathon violet palette. The pointer (mouse or finger) warms the cells
// towards red and leaves a trail that cools down.
// Canvas 2D at cell resolution, upscaled pixel-sharp; capped at 30 fps.

const VIOLET = [
  "#05031a", "#0d0326", "#13042a", "#1d0a3a", "#22104f",
  "#2c125c", "#36136c", "#40198a", "#4a249e", "#5631b6",
];
const RED = ["#2b0840", "#3d0838", "#540a33", "#760a2c", "#931028", "#b8192a", "#e8102c"];

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const VIOLET_RGB = VIOLET.map(toRgb);
const RED_RGB = RED.map(toRgb);

// Small value-noise implementation (deterministic, no dependencies).
const PERM = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let seed = 7;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807) % 2147483647;
    const j = seed % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return new Uint8Array([...p, ...p]);
})();
const lattice = (x, y) => PERM[(PERM[x & 255] + y) & 255] / 255;
const smooth = (t) => t * t * (3 - 2 * t);
const noise = (x, y) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = lattice(xi, yi);
  const b = lattice(xi + 1, yi);
  const c = lattice(xi, yi + 1);
  const d = lattice(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
};

const FRAME_MS = 1000 / 30;

export default function PixelField({ cell = 12, calmCenter = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cols = 0;
    let rows = 0;
    let image = null;
    let warmth = null; // per-cell pointer heat, decays every frame
    let dither = null; // per-cell fixed offset so quantised steps look pixelated
    let cellPx = cell;
    const pointer = { x: -1, y: -1, active: false };
    let raf = 0;
    let last = 0;
    const start = performance.now();

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      cellPx = w < 640 ? Math.round(cell * 1.35) : cell;
      cols = Math.max(8, Math.ceil(w / cellPx));
      rows = Math.max(8, Math.ceil(h / cellPx));
      canvas.width = cols;
      canvas.height = rows;
      image = ctx.createImageData(cols, rows);
      warmth = new Float32Array(cols * rows);
      dither = new Float32Array(cols * rows);
      for (let i = 0; i < dither.length; i++) {
        dither[i] = (lattice(i % cols, Math.floor(i / cols) * 7 + 3) - 0.5) * 0.12;
      }
    };

    const warm = () => {
      if (!pointer.active) return;
      const radius = 6;
      const r2 = radius * radius;
      const cx = pointer.x / cellPx;
      const cy = pointer.y / cellPx;
      const x0 = Math.max(0, Math.floor(cx - radius * 2));
      const x1 = Math.min(cols - 1, Math.ceil(cx + radius * 2));
      const y0 = Math.max(0, Math.floor(cy - radius * 2));
      const y1 = Math.min(rows - 1, Math.ceil(cy + radius * 2));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
          const add = Math.exp(-d2 / r2) * 0.35;
          const i = y * cols + x;
          warmth[i] = Math.min(1, warmth[i] + add);
        }
      }
    };

    const draw = (now) => {
      const t = reduceMotion ? 0 : (now - start) / 1000;
      const data = image.data;
      warm();
      for (let y = 0; y < rows; y++) {
        const v = y / rows;
        for (let x = 0; x < cols; x++) {
          const u = x / cols;
          const i = y * cols + x;
          // Flowing heat: two noise octaves drifting in different directions.
          let h =
            0.62 * noise(x * 0.07 + t * 0.12, y * 0.07 - t * 0.08) +
            0.38 * noise(x * 0.16 - t * 0.2, y * 0.16 + t * 0.1);
          h = 0.05 + h * 0.95 + 0.18 * v - 0.12;
          if (calmCenter) {
            // Keep the middle (where the panel sits) darker for legibility.
            const dx = (u - 0.5) / 0.36;
            const dy = (v - 0.48) / 0.42;
            h -= 0.5 * Math.exp(-(dx * dx + dy * dy));
          }
          h += dither[i];
          let rgb;
          const w = warmth[i];
          if (w > 0.06) {
            rgb = RED_RGB[Math.min(RED_RGB.length - 1, Math.floor(w * RED_RGB.length))];
          } else {
            const k = Math.max(0, Math.min(VIOLET_RGB.length - 1, Math.floor(h * VIOLET_RGB.length)));
            rgb = VIOLET_RGB[k];
          }
          const o = i * 4;
          data[o] = rgb[0];
          data[o + 1] = rgb[1];
          data[o + 2] = rgb[2];
          data[o + 3] = 255;
          warmth[i] = w * 0.9; // the trail cools down
        }
      }
      ctx.putImageData(image, 0, 0);
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };

    const onPointer = (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = event.pointerType === "mouse" || event.buttons > 0 || event.type === "pointerdown";
    };
    const onLeave = () => {
      pointer.active = false;
    };

    resize();
    if (reduceMotion) {
      draw(start);
    } else {
      raf = requestAnimationFrame(loop);
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
      window.addEventListener("pointerup", onLeave, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }
    const onResize = () => {
      resize();
      if (reduceMotion) draw(start);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointerup", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, [cell, calmCenter]);

  return <canvas ref={canvasRef} className="pixel-field" aria-hidden="true" />;
}
