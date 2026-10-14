import React, { useEffect, useRef, useCallback } from 'react';

// Fast 2D Simplex Noise for procedural drifting shoals
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

const grad2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1]
];

const p = new Uint8Array(512);
const perm = new Uint8Array(256);
for (let i = 0; i < 256; i++) perm[i] = i;
// Deterministic shuffle
let seed = 42;
for (let i = 255; i > 0; i--) {
  seed = (seed * 16807) % 2147483647;
  const j = seed % (i + 1);
  const temp = perm[i];
  perm[i] = perm[j];
  perm[j] = temp;
}
for (let i = 0; i < 512; i++) {
  p[i] = perm[i & 255];
}

function simplex2(xin, yin) {
  let n0 = 0, n1 = 0, n2 = 0;
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;

  let i1, j1;
  if (x0 > y0) {
    i1 = 1; j1 = 0;
  } else {
    i1 = 0; j1 = 1;
  }

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1.0 + 2.0 * G2;
  const y2 = y0 - 1.0 + 2.0 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    const gi0 = p[ii + p[jj]] % 8;
    n0 = t0 * t0 * (grad2[gi0][0] * x0 + grad2[gi0][1] * y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    const gi1 = p[ii + i1 + p[jj + j1]] % 8;
    n1 = t1 * t1 * (grad2[gi1][0] * x1 + grad2[gi1][1] * y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    const gi2 = p[ii + 1 + p[jj + 1]] % 8;
    n2 = t2 * t2 * (grad2[gi2][0] * x2 + grad2[gi2][1] * y2);
  }

  return 70.0 * (n0 + n1 + n2);
}

// Multi-octave FBM noise for organic continents / shoals
function fbm(x, y) {
  return (
    0.55 * simplex2(x, y) +
    0.30 * simplex2(x * 2.1 + 1.2, y * 2.1 + 2.3) +
    0.15 * simplex2(x * 4.4 + 3.4, y * 4.4 + 5.6)
  );
}

/**
 * GlyphSonar Component (React Bits Pro specification)
 * 
 * Sonar pings sweeping a field of procedural glyphs, lighting up drifting shoals.
 * Reacts to clicks with expanding wavefronts and sparkles with subtle autonomous blinking.
 */
export default function GlyphSonar({
  glyphs = " ·+×○◎◉",
  fontFamily = "monospace",
  glyphSize = 11,
  spacing = 1.0,
  glyphWeight = 1.0,
  density = 0.55,
  scale = 1.0,
  drift = 1.0,
  driftAngle = 20,
  ambient = 0.22,
  autoPing = true,
  interval = 3.6,
  originX = 0.5,
  originY = 0.5,
  pingSpeed = 1.0,
  range = 1.0,
  ringWidth = 45,
  persistence = 0.75,
  color = "#a855f7", // Phosphor accent (violet / purple by default)
  className = "",
  style = {},
  children
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const pingsRef = useRef([]);
  const lastAutoPingRef = useRef(0);
  const mouseRef = useRef({ x: -1000, y: -1000, isOver: false });
  const animFrameRef = useRef(null);
  const lastTimeRef = useRef(0);

  // Parse color to RGB for alpha compositing
  const hexToRgb = useCallback((hex) => {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const num = parseInt(c, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }, []);

  // Trigger manual ping from any coordinate
  const triggerPing = useCallback((x, y, intensity = 1.2) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maxRadius = Math.hypot(canvas.width, canvas.height) * range;
    pingsRef.current.push({
      x,
      y,
      radius: 0,
      maxRadius,
      speed: 260 * pingSpeed,
      intensity,
      ringWidth: ringWidth * 1.2,
      birthTime: performance.now()
    });
  }, [range, pingSpeed, ringWidth]);

  // Click handler: react on click with a glowing sonar wave
  const handleClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    triggerPing(x, y, 1.4);
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = e.clientX - rect.left;
    mouseRef.current.y = e.clientY - rect.top;
    mouseRef.current.isOver = true;
  };

  const handleMouseLeave = () => {
    mouseRef.current.isOver = false;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    let width = 0;
    let height = 0;

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    handleResize();

    const rad = (driftAngle * Math.PI) / 180;
    const driftVecX = Math.cos(rad) * 0.03 * drift;
    const driftVecY = Math.sin(rad) * 0.03 * drift;

    const rgb = hexToRgb(color);
    const glyphList = Array.from(glyphs);
    const maxGlyphIdx = glyphList.length - 1;

    // Render loop
    const render = (now) => {
      animFrameRef.current = requestAnimationFrame(render);
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;
      const time = now * 0.001;

      // Auto ping emission
      if (autoPing && now - lastAutoPingRef.current > interval * 1000) {
        lastAutoPingRef.current = now;
        triggerPing(width * originX, height * originY, 1.0);
      }

      // Update active pings
      for (let i = pingsRef.current.length - 1; i >= 0; i--) {
        const ping = pingsRef.current[i];
        ping.radius += ping.speed * dt;
        if (ping.radius > ping.maxRadius) {
          pingsRef.current.splice(i, 1);
        }
      }

      ctx.clearRect(0, 0, width, height);

      const cellSize = Math.max(12, Math.round(glyphSize * 1.5 * spacing));
      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);

      const noiseScale = 0.0035 / Math.max(0.2, scale);

      // Pre-compute current pings list
      const activePings = pingsRef.current;
      const numPings = activePings.length;

      ctx.font = `${Math.round(glyphSize)}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(0.8, glyphWeight);

      // Draw grid of glyphs
      for (let r = 0; r < rows; r++) {
        const y = r * cellSize + cellSize * 0.5;

        for (let c = 0; c < cols; c++) {
          const x = c * cellSize + cellSize * 0.5;

          // Compute drifting coordinates
          const sampleX = x * noiseScale - time * driftVecX;
          const sampleY = y * noiseScale - time * driftVecY;

          // Raw noise value [-1, 1] normalized to [0, 1]
          const rawNoise = (fbm(sampleX, sampleY) + 1.0) * 0.5;

          // Adjust by density threshold
          let signal = Math.max(0, (rawNoise - (1.0 - density)) / density);

          // Calculate illumination from expanding sonar wavefronts
          let pingBoost = 0;
          for (let pIdx = 0; pIdx < numPings; pIdx++) {
            const ping = activePings[pIdx];
            const dx = x - ping.x;
            const dy = y - ping.y;
            const dist = Math.hypot(dx, dy);

            // Ring distance from current wave radius
            const waveDelta = dist - ping.radius;

            // Wavefront passes through: excitation & phosphor decay behind wave
            if (waveDelta <= 0 && waveDelta > -ping.ringWidth * 3) {
              const progressBehind = -waveDelta / (ping.ringWidth * 3);
              const decay = Math.exp(-progressBehind * (2.5 / persistence));
              const falloff = Math.max(0, 1.0 - dist / ping.maxRadius);
              const boost = ping.intensity * decay * falloff;
              if (boost > pingBoost) pingBoost = boost;
            } else if (Math.abs(waveDelta) < ping.ringWidth * 0.5) {
              // Peak bright wavefront crest
              const crest = 1.0 - Math.abs(waveDelta) / (ping.ringWidth * 0.5);
              const falloff = Math.max(0, 1.0 - dist / ping.maxRadius);
              const boost = ping.intensity * crest * 1.5 * falloff;
              if (boost > pingBoost) pingBoost = boost;
            }
          }

          // Subtle autonomous blinking & twinkling
          const blinkPhase = Math.sin(time * 2.5 + c * 1.7 + r * 2.3);
          const isBlinking = blinkPhase > 0.88 ? 0.35 * (blinkPhase - 0.88) * 8 : 0;

          // Mouse proximity perturbation
          let mouseBoost = 0;
          if (mouseRef.current.isOver) {
            const mDist = Math.hypot(x - mouseRef.current.x, y - mouseRef.current.y);
            if (mDist < 90) {
              mouseBoost = (1.0 - mDist / 90) * 0.45;
            }
          }

          // Combined intensity calculation
          const effectiveSignal = Math.min(1.0, signal * ambient + pingBoost + isBlinking + mouseBoost);

          if (effectiveSignal < 0.08) continue; // Skip near-invisible glyphs for speed

          // Determine glyph index based on intensity ramp
          const glyphIdx = Math.min(
            maxGlyphIdx,
            Math.max(1, Math.floor(effectiveSignal * (maxGlyphIdx + 0.8)))
          );

          // Alpha and color calculation
          const alpha = Math.min(1.0, effectiveSignal * 0.95);
          const isExcited = pingBoost > 0.35 || isBlinking > 0.2;

          // Render vector primitives for built-in vector glyphs to ensure razor-sharp rendering
          if (glyphList[glyphIdx] === "·") {
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.6})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.2 * glyphWeight, 0, Math.PI * 2);
            ctx.fill();
          } else if (glyphList[glyphIdx] === "+") {
            const len = 3 * glyphWeight;
            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.8})`;
            ctx.beginPath();
            ctx.moveTo(x - len, y);
            ctx.lineTo(x + len, y);
            ctx.moveTo(x, y - len);
            ctx.lineTo(x, y + len);
            ctx.stroke();
          } else if (glyphList[glyphIdx] === "×") {
            const d = 2.4 * glyphWeight;
            ctx.strokeStyle = isExcited
              ? `rgba(255, 255, 255, ${alpha})`
              : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(x - d, y - d);
            ctx.lineTo(x + d, y + d);
            ctx.moveTo(x - d, y + d);
            ctx.lineTo(x + d, y - d);
            ctx.stroke();
          } else if (glyphList[glyphIdx] === "○") {
            const r = 3.6 * glyphWeight;
            ctx.strokeStyle = isExcited
              ? `rgba(243, 232, 255, ${alpha})`
              : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.9})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();
          } else if (glyphList[glyphIdx] === "◎") {
            const r1 = 4.2 * glyphWeight;
            const r2 = 2.0 * glyphWeight;
            ctx.strokeStyle = `rgba(${Math.min(255, rgb.r + 50)}, ${Math.min(255, rgb.g + 50)}, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, r1, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, r2, 0, Math.PI * 2);
            ctx.stroke();
          } else if (glyphList[glyphIdx] === "◉") {
            const r1 = 4.6 * glyphWeight;
            const r2 = 2.0 * glyphWeight;
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, r1, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, r2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Text fallback
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
            ctx.fillText(glyphList[glyphIdx], x, y);
          }
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
    };
  }, [
    glyphs,
    fontFamily,
    glyphSize,
    spacing,
    glyphWeight,
    density,
    scale,
    drift,
    driftAngle,
    ambient,
    autoPing,
    interval,
    originX,
    originY,
    pingSpeed,
    range,
    ringWidth,
    persistence,
    color,
    hexToRgb,
    triggerPing
  ]);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative w-full h-full overflow-hidden select-none cursor-crosshair ${className}`}
      style={style}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full pointer-events-none"
      />
      {children && (
        <div className="relative z-10 w-full h-full pointer-events-auto">
          {children}
        </div>
      )}
    </div>
  );
}
