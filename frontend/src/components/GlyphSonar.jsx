import React, { useRef, useEffect, forwardRef, useImperativeHandle, useSyncExternalStore } from 'react';
import * as THREE from 'three';

const DEFAULT_CHARSET = " ·+×○◎◉";
const DEFAULT_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

const subscribeReducedMotion = (cb) => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", cb);
  return () => media.removeEventListener("change", cb);
};

const getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

let canvas2DContext = null;
const parseColor = (colorStr, fallback = [0.04, 0.04, 0.04]) => {
  if (!canvas2DContext) {
    const canvas = document.createElement("canvas");
    canvas2DContext = canvas.getContext("2d");
  }
  if (!canvas2DContext) return fallback;
  canvas2DContext.fillStyle = "#010203";
  canvas2DContext.fillStyle = colorStr;
  const computed = String(canvas2DContext.fillStyle);
  if (computed === "#010203" && colorStr.trim().toLowerCase() !== "#010203") {
    return fallback;
  }
  if (computed.startsWith("#")) {
    const hex = computed.slice(1);
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255
    ];
  }
  const match = computed.match(/[\d.]+/g);
  return !match || match.length < 3
    ? fallback
    : [Number(match[0]) / 255, Number(match[1]) / 255, Number(match[2]) / 255];
};

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// sRGB to OKLab color space
const rgbToOklab = ([r, g, b]) => {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
};

// GLSL Shaders
const VERTEX_SHADER = `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FIELD_SHADER = `
precision highp float;
uniform vec2 uCell;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform vec2 uDrift;
uniform float uThreshold;
uniform float uAmbient;
uniform float uReveal;
uniform float uPersistence;
uniform float uWidth;
uniform float uFalloff;
uniform vec4 uPings[16];
uniform vec4 uPingShape[16];
uniform vec4 uObstacle;
out vec4 fragColor;

float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * noise3(p);
    p = p * 2.03 + vec3(17.1, 3.7, 1.3);
    amplitude *= 0.5;
  }
  return sum / 0.9375;
}

void main() {
  vec2 center = gl_FragCoord.xy * uCell;
  float unit = min(uResolution.x, uResolution.y);
  vec2 q = center / unit * (4.2 / uScale) - uDrift * uTime;
  float z = uTime * 0.03;
  vec2 warp = vec2(fbm(vec3(q * 0.6, z + 3.1)), fbm(vec3(q * 0.6 + 7.3, z + 8.4))) - 0.5;
  float n = fbm(vec3(q + warp * 1.2, z * 1.3));
  float shoal = smoothstep(uThreshold, uThreshold + 0.08, n);
  float core = smoothstep(uThreshold, uThreshold + 0.26, n);
  float hidden = smoothstep(uThreshold - 0.2, uThreshold, n) * (1.0 - shoal);
  float speck = hash2(floor(gl_FragCoord.xy) + 17.0);
  float stipple = hash2(floor(gl_FragCoord.xy) * 1.37 + 71.0);

  float crest = 0.0;
  float tail = 0.0;
  for (int k = 0; k < 16; k++) {
    vec4 ping = uPings[k];
    if (ping.w <= 0.0) continue;
    vec4 shape = uPingShape[k];
    float age = uTime - ping.z;
    if (age < 0.0) continue;
    vec2 rel = center - ping.xy;
    float dist = length(rel);
    if (dist > shape.y) continue;
    float radius = age * shape.x;
    float lag = radius - dist;
    if (lag < -uWidth * 3.0) continue;
    float fade = ping.w * (1.0 - smoothstep(shape.y * 0.5, shape.y, dist)) * inversesqrt(1.0 + dist / uFalloff) * smoothstep(0.0, shape.w, radius);
    float shadow = 1.0;
    if (shape.z < 0.5 && uObstacle.w > 0.001) {
      vec2 toward = uObstacle.xy - ping.xy;
      float reach = length(toward);
      if (reach > uObstacle.z * 2.5 && dist > reach - uObstacle.z) {
        vec2 dir = toward / reach;
        float side = abs(rel.x * dir.y - rel.y * dir.x);
        float beyond = max(dist - reach, 0.0);
        float spread = uObstacle.z * dist / reach;
        float soft = uObstacle.z * 0.3 + 0.35 * sqrt(beyond * uObstacle.z);
        float inside = 1.0 - smoothstep(spread - soft, spread + soft, side);
        float heal = mix(0.25, 1.0, exp(-beyond / (uObstacle.z * 16.0)));
        shadow = 1.0 - inside * heal * uObstacle.w * step(0.0, dot(rel, dir));
      }
    }
    float width = lag < 0.0 ? uWidth * 0.6 : uWidth;
    float x = lag / width;
    float front = exp(-x * x * x * x);
    float after = lag > 0.0 ? exp(-lag / max(shape.x * uPersistence, 1.0)) : 0.0;
    crest += front * fade * shadow;
    tail += after * (1.0 - front) * fade * shadow;
  }
  crest = min(crest, 1.4);
  tail = min(tail, 1.2);

  float shown = step(stipple, 0.22 + 0.6 * core);
  float rest = uAmbient * shoal * shown * (0.45 + 0.55 * core);
  float lit = shoal * (0.65 + 0.35 * core) * (crest * 1.5 + tail * 0.55);
  float ghost = hidden * uReveal * (crest * 0.5 + tail * 0.22);
  float water = (1.0 - shoal) * crest * (0.18 + 0.32 * step(0.72, speck));
  float value = clamp(rest + lit + ghost + water, 0.0, 1.0);
  float heat = clamp(crest * 1.4 + tail * 0.6, 0.0, 1.0);
  float struck = 0.6 + 0.4 * clamp(crest * 1.3, 0.0, 1.0);
  float open = 0.5 + 0.28 * clamp(crest, 0.0, 1.0);
  float tone = mix(0.12 + 0.3 * core, mix(open, struck, max(shoal, hidden * 0.6)), heat);
  fragColor = vec4(value, tone, 0.0, 1.0);
}
`;

const GLYPH_SHADER = `
precision highp float;
uniform sampler2D uField;
uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;
uniform float uCount;
uniform vec2 uCell;
uniform float uSpan;
uniform float uGamma;
uniform float uDither;
uniform float uInk;
uniform vec3 uLabA;
uniform vec3 uLabB;
out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 labToLinear(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return max(vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ), 0.0);
}

float glyphCoverage(float index, vec2 g) {
  vec2 f = fract(g) - 0.5;
  vec2 texel = vec2(0.5 + f.x * uSpan, 0.5 - f.y * uSpan);
  float inside = step(0.0, texel.x) * step(texel.x, 1.0) * step(0.0, texel.y) * step(texel.y, 1.0);
  vec2 slot = vec2(mod(index, uAtlasGrid.x), floor(index / uAtlasGrid.x));
  vec2 uv = (slot + clamp(texel, 0.0, 1.0)) / uAtlasGrid;
  vec2 scale = vec2(uSpan) / uAtlasGrid;
  return textureGrad(uAtlas, uv, dFdx(g) * scale, dFdy(g) * scale).r * inside;
}

vec3 palette(float t) {
  vec3 deep = vec3(uLabA.x * 0.55, uLabA.yz * 0.85);
  vec3 top = uInk > 0.5
    ? vec3(uLabB.x * 0.72, uLabB.yz * 1.05)
    : vec3(min(uLabB.x * 1.08 + 0.05, 0.99), uLabB.yz * 0.35);
  vec3 lab = t < 0.45 ? mix(deep, uLabA, smoothstep(0.0, 0.45, t))
    : t < 0.85 ? mix(uLabA, uLabB, smoothstep(0.45, 0.85, t))
    : mix(uLabB, top, smoothstep(0.85, 1.0, t));
  return labToLinear(lab);
}

void main() {
  vec2 g = gl_FragCoord.xy / uCell;
  vec2 cellId = floor(g);
  vec4 field = texelFetch(uField, ivec2(cellId), 0);
  float dither = hash(cellId) - 0.5;
  float value = clamp(field.r + dither * uDither * step(0.015, field.r), 0.0, 1.0);
  float level = pow(value, uGamma);
  float index = floor(level * (uCount - 1.0) + 0.5);
  float energy = 0.0;
  vec3 color = vec3(0.0);
  if (index >= 1.0) {
    float cover = glyphCoverage(index, g);
    color = palette(clamp(field.g, 0.0, 1.0));
    energy = cover * (0.16 + 0.95 * level);
  }
  fragColor = vec4(color * energy, energy);
}
`;

const DOWNSAMPLE_SHADER = `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 a = texture(uSource, vUv + uTexel * vec2(-1.0, -1.0));
  vec4 b = texture(uSource, vUv + uTexel * vec2(1.0, -1.0));
  vec4 c = texture(uSource, vUv + uTexel * vec2(-1.0, 1.0));
  vec4 d = texture(uSource, vUv + uTexel * vec2(1.0, 1.0));
  fragColor = (a + b + c + d) * 0.125 + texture(uSource, vUv) * 0.5;
}
`;

const UPSAMPLE_SHADER = `
precision highp float;
uniform sampler2D uSource;
uniform sampler2D uBase;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 sum = texture(uSource, vUv) * 4.0;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, 0.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(1.0, 0.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(0.0, -1.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(0.0, 1.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, -1.0));
  sum += texture(uSource, vUv + uTexel * vec2(1.0, -1.0));
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, 1.0));
  sum += texture(uSource, vUv + uTexel * vec2(1.0, 1.0));
  fragColor = texture(uBase, vUv) + sum / 16.0;
}
`;

const COMPOSITE_SHADER = `
precision highp float;
uniform sampler2D uLines;
uniform sampler2D uBloom;
uniform vec3 uBackground;
uniform float uGlow;
uniform float uExposure;
uniform float uMode;
uniform float uGrain;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec4 lines = texture(uLines, vUv);
  vec4 bloom = texture(uBloom, vUv);
  vec3 color;
  if (uMode < 0.5) {
    vec3 light = (lines.rgb + bloom.rgb * uGlow) * uExposure;
    vec3 exposed = 1.0 - exp(-light);
    float peak = max(exposed.r, max(exposed.g, exposed.b));
    exposed = mix(exposed, vec3(peak), smoothstep(0.75, 1.0, peak) * 0.35);
    color = uBackground + (1.0 - uBackground) * exposed;
  } else {
    float energy = lines.a + bloom.a * uGlow * 0.2;
    vec3 hue = (lines.rgb + bloom.rgb * uGlow * 0.2) / max(energy, 1e-4);
    float cover = clamp(1.0 - exp(-energy * uExposure * 1.4), 0.0, 0.95);
    color = mix(uBackground, clamp(hue * 0.85, 0.0, 1.0), cover);
  }
  float grain = hash(gl_FragCoord.xy + uGrain * 311.0) - 0.5;
  fragColor = vec4(encode(color) + grain * (1.2 / 255.0), 1.0);
}
`;

const GlyphSonar = forwardRef(function GlyphSonar(
  {
    colors = ["#7C5CFF", "#FF9FFC"],
    backgroundColor = "#0A0A0A",
    mode = "auto",
    charset = DEFAULT_CHARSET,
    fontFamily = DEFAULT_FONT,
    glyphSize = 11,
    spacing = 1,
    glyphWeight = 1,
    density = 0.5,
    scale = 1,
    drift = 1,
    driftAngle = 20,
    ambient = 0.35,
    autoPing = true,
    interval = 3.4,
    originX = 0.5,
    originY = 0.5,
    pingSpeed = 1,
    range = 1,
    ringWidth = 1,
    persistence = 0.6,
    reveal = 0.5,
    glow = 0.12,
    intensity = 1,
    speed = 1,
    interactive = true,
    clickPing = true,
    echo = true,
    echoStrength = 1,
    paused = false,
    quality = 1,
    className = "",
    style = {},
    children
  },
  ref
) {
  const containerRef = useRef(null);
  const internalRef = useRef(null);
  const isReducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);

  const propsRef = useRef({
    colors,
    backgroundColor,
    mode,
    charset,
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
    reveal,
    glow,
    intensity,
    speed,
    interactive,
    clickPing,
    echo,
    echoStrength,
    paused,
    quality,
    reduced: isReducedMotion
  });

  useEffect(() => {
    propsRef.current = {
      colors,
      backgroundColor,
      mode,
      charset,
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
      reveal,
      glow,
      intensity,
      speed,
      interactive,
      clickPing,
      echo,
      echoStrength,
      paused,
      quality,
      reduced: isReducedMotion
    };
    internalRef.current?.sync();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const setupWebGL = (targetEl, propsHolder) => {
      let renderer;
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.style.pointerEvents = "none";
      targetEl.prepend(canvas);

      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: false,
          antialias: false,
          powerPreference: "high-performance"
        });
      } catch {
        canvas.remove();
        return null;
      }

      if (!renderer.capabilities.isWebGL2) {
        renderer.dispose();
        canvas.remove();
        return null;
      }

      renderer.autoClear = false;
      const floatType =
        renderer.extensions.has("EXT_color_buffer_float") ||
        renderer.extensions.has("EXT_color_buffer_half_float")
          ? THREE.HalfFloatType
          : THREE.UnsignedByteType;

      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quadGeo = new THREE.PlaneGeometry(2, 2);

      const pingsUniform = Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0));
      const pingShapeUniform = Array.from({ length: 16 }, () => new THREE.Vector4(1, 1, 0, 0));

      const pingPool = Array.from({ length: 16 }, () => ({
        active: false,
        x: 0,
        y: 0,
        born: 0,
        amplitude: 0,
        speed: 0.17,
        range: 0.75,
        birth: 0.08,
        echo: false,
        echoed: false
      }));

      const createShaderMat = (fragShader, uniforms) =>
        new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3,
          uniforms,
          vertexShader: VERTEX_SHADER,
          fragmentShader: fragShader,
          depthTest: false,
          depthWrite: false,
          blending: THREE.NoBlending
        });

      const fieldMat = createShaderMat(FIELD_SHADER, {
        uCell: { value: new THREE.Vector2(11, 11) },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uScale: { value: 1 },
        uDrift: { value: new THREE.Vector2() },
        uThreshold: { value: 0.55 },
        uAmbient: { value: 0.35 },
        uReveal: { value: 0.5 },
        uPersistence: { value: 1.4 },
        uWidth: { value: 8 },
        uFalloff: { value: 300 },
        uPings: { value: pingsUniform },
        uPingShape: { value: pingShapeUniform },
        uObstacle: { value: new THREE.Vector4(0, 0, 22, 0) }
      });

      const glyphMat = createShaderMat(GLYPH_SHADER, {
        uField: { value: null },
        uAtlas: { value: null },
        uAtlasGrid: { value: new THREE.Vector2(16, 1) },
        uCount: { value: 2 },
        uCell: { value: new THREE.Vector2(11, 11) },
        uSpan: { value: 1 },
        uGamma: { value: 1 },
        uDither: { value: 0.05 },
        uInk: { value: 0 },
        uLabA: { value: new THREE.Vector3() },
        uLabB: { value: new THREE.Vector3() }
      });

      const downsampleMat = createShaderMat(DOWNSAMPLE_SHADER, {
        uSource: { value: null },
        uTexel: { value: new THREE.Vector2() }
      });

      const upsampleMat = createShaderMat(UPSAMPLE_SHADER, {
        uSource: { value: null },
        uBase: { value: null },
        uTexel: { value: new THREE.Vector2() }
      });

      const compositeMat = createShaderMat(COMPOSITE_SHADER, {
        uLines: { value: null },
        uBloom: { value: null },
        uBackground: { value: new THREE.Vector3() },
        uGlow: { value: 0.3 },
        uExposure: { value: 1.2 },
        uMode: { value: 0 },
        uGrain: { value: 0 }
      });

      const mesh = new THREE.Mesh(quadGeo, compositeMat);
      mesh.frustumCulled = false;
      const scene = new THREE.Scene();
      scene.add(mesh);

      const createRenderTarget = (w, h) =>
        new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
          type: floatType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
          generateMipmaps: false
        });

      let linesRT = null;
      let bloomDownRTs = [];
      let bloomUpRTs = [];
      let fieldRT = null;
      let cachedFieldSize = "";
      let atlasObj = null;
      let cachedAtlasKey = "";
      let isDestroyed = false;
      let animId = 0;
      let lastTime = 0;
      let isVisible = true;
      let simTime = 0;
      let nextAutoPingTime = 0;
      let viewWidth = 1;
      let viewHeight = 1;
      let pixelRatio = 1;
      let grainPhase = 0;

      const mouse = {
        x: 0,
        y: 0,
        smoothX: 0,
        smoothY: 0,
        presence: 0,
        inside: false,
        placed: false
      };

      const disposeRTs = () => {
        linesRT?.dispose();
        bloomDownRTs.forEach((rt) => rt.dispose());
        bloomUpRTs.forEach((rt) => rt.dispose());
        linesRT = null;
        bloomDownRTs = [];
        bloomUpRTs = [];
      };

      const renderPass = (material, renderTarget) => {
        mesh.material = material;
        renderer.setRenderTarget(renderTarget);
        renderer.render(scene, camera);
      };

      const getBaseGlyphSize = () =>
        clamp(propsHolder.current.glyphSize, 5, 40) *
        clamp(Math.min(viewWidth, viewHeight) / 520, 0.75, 1) *
        pixelRatio;

      const getCellSize = () => getBaseGlyphSize() * clamp(propsHolder.current.spacing, 0.7, 3);
      const getDiagonal = () => Math.hypot(viewWidth, viewHeight) * pixelRatio;

      const computeEchoFalloff = (ping, dist) => {
        const reach = ping.range * getDiagonal();
        const start = 0.5 * reach;
        const norm = clamp((dist - start) / (reach - start), 0, 1);
        const smooth = 1 - norm * norm * (3 - 2 * norm);
        return smooth / Math.sqrt(1 + dist / (0.25 * getDiagonal()));
      };

      const spawnPing = (normX, normY, amp, isEcho, birth, atTime = simTime) => {
        const props = propsHolder.current;
        let idx = pingPool.findIndex((p) => !p.active);
        if (idx < 0) {
          idx = 0;
          for (let i = 1; i < 16; i++) {
            if (pingPool[i].born < pingPool[idx].born) idx = i;
          }
        }
        const effectiveRange = clamp(props.range, 0.1, 3) * (isEcho ? 0.34 : 0.75);
        Object.assign(pingPool[idx], {
          active: true,
          x: normX,
          y: normY,
          born: atTime,
          amplitude: amp,
          speed: 0.17 * clamp(props.pingSpeed, 0.1, 4),
          range: effectiveRange,
          birth,
          echo: isEcho,
          echoed: isEcho
        });
      };

      const getOriginCoords = () => {
        const props = propsHolder.current;
        return [clamp(props.originX, -1, 2), clamp(props.originY, -1, 2)];
      };

      const drawGlyphVector = (ctx, char, cx, cy, sz, strokeW) => {
        ctx.lineWidth = strokeW;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const strokeCirc = (r) => {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, 2 * Math.PI);
          ctx.stroke();
        };
        const fillCirc = (r) => {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, 2 * Math.PI);
          ctx.fill();
        };
        const strokeDiamond = (r) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy - r);
          ctx.lineTo(cx + r, cy);
          ctx.lineTo(cx, cy + r);
          ctx.lineTo(cx - r, cy);
          ctx.closePath();
          ctx.stroke();
        };
        const fillDiamond = (r) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy - r);
          ctx.lineTo(cx + r, cy);
          ctx.lineTo(cx, cy + r);
          ctx.lineTo(cx - r, cy);
          ctx.closePath();
          ctx.fill();
        };
        const strokeTriangle = (r) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy - r);
          ctx.lineTo(cx + 0.92 * r, cy + 0.6 * r);
          ctx.lineTo(cx - 0.92 * r, cy + 0.6 * r);
          ctx.closePath();
          ctx.stroke();
        };
        const fillTriangle = (r) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy - r);
          ctx.lineTo(cx + 0.92 * r, cy + 0.6 * r);
          ctx.lineTo(cx - 0.92 * r, cy + 0.6 * r);
          ctx.closePath();
          ctx.fill();
        };

        switch (char) {
          case "·":
            fillCirc(Math.max(0.065 * sz, 0.8 * strokeW));
            return true;
          case "•":
            fillCirc(0.13 * sz);
            return true;
          case "●":
            fillCirc(0.25 * sz);
            return true;
          case "+":
            ctx.beginPath();
            ctx.moveTo(cx - 0.2 * sz, cy);
            ctx.lineTo(cx + 0.2 * sz, cy);
            ctx.moveTo(cx, cy - 0.2 * sz);
            ctx.lineTo(cx, cy + 0.2 * sz);
            ctx.stroke();
            return true;
          case "×":
            ctx.beginPath();
            ctx.moveTo(cx - 0.16 * sz, cy - 0.16 * sz);
            ctx.lineTo(cx + 0.16 * sz, cy + 0.16 * sz);
            ctx.moveTo(cx + 0.16 * sz, cy - 0.16 * sz);
            ctx.lineTo(cx - 0.16 * sz, cy + 0.16 * sz);
            ctx.stroke();
            return true;
          case "○":
            strokeCirc(0.26 * sz);
            return true;
          case "□":
            ctx.beginPath();
            ctx.rect(cx - 0.23 * sz, cy - 0.23 * sz, 0.46 * sz, 0.46 * sz);
            ctx.stroke();
            return true;
          case "■":
            ctx.fillRect(cx - 0.21 * sz, cy - 0.21 * sz, 0.42 * sz, 0.42 * sz);
            return true;
          case "◇":
            strokeDiamond(0.3 * sz);
            return true;
          case "◆":
            fillDiamond(0.28 * sz);
            return true;
          case "△":
            strokeTriangle(0.3 * sz);
            return true;
          case "▲":
            fillTriangle(0.28 * sz);
            return true;
          case "◎":
            strokeCirc(0.28 * sz);
            fillCirc(0.085 * sz);
            return true;
          case "◉":
            strokeCirc(0.28 * sz);
            fillCirc(0.15 * sz);
            return true;
          default:
            return false;
        }
      };

      const renderAtlasIfNeeded = () => {
        const props = propsHolder.current;
        const charSetStr = String(props.charset ?? "") || DEFAULT_CHARSET;
        const fontStr = String(props.fontFamily ?? "") || DEFAULT_FONT;
        const glyphPx = Math.round(clamp(getBaseGlyphSize(), 8, 96));
        const strokeW = clamp(props.glyphWeight, 0.4, 3);
        const cacheKey = `${charSetStr}|${fontStr}|${glyphPx}|${strokeW}`;

        if (cacheKey === cachedAtlasKey && atlasObj) return;

        cachedAtlasKey = cacheKey;
        atlasObj?.texture.dispose();

        const uniqueChars = Array.from(new Set(Array.from(charSetStr))).slice(0, 180);
        if (!uniqueChars.includes(" ")) uniqueChars.unshift(" ");
        if (uniqueChars.length < 2) uniqueChars.push("·");

        const strokeWidthPx = Math.max(1, Math.round(0.075 * glyphPx * strokeW));
        const halfPixelOffset = 0.5 * (strokeWidthPx % 2 === 1 ? 1 : 0);
        const fontSpec = `500 ${Math.round(0.78 * glyphPx)}px ${fontStr}`;

        const drawSingleGlyph = (ctx, ch, cx, cy) => {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#ffffff";
          const wasVector = drawGlyphVector(ctx, ch, cx + halfPixelOffset, cy + halfPixelOffset, glyphPx, strokeWidthPx);
          if (!wasVector) {
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = fontSpec;
            ctx.fillText(ch, cx, cy + 0.04 * glyphPx);
          }
        };

        const measureCanvas = document.createElement("canvas");
        measureCanvas.width = glyphPx;
        measureCanvas.height = glyphPx;
        const measureCtx = measureCanvas.getContext("2d", { willReadFrequently: true });

        // Sort glyphs by visual ink density ramp
        const sortedGlyphs = uniqueChars
          .map((ch) => {
            if (!measureCtx || ch === " ") return { character: ch, ink: 0 };
            measureCtx.fillStyle = "#000000";
            measureCtx.fillRect(0, 0, glyphPx, glyphPx);
            drawSingleGlyph(measureCtx, ch, Math.floor(glyphPx / 2), Math.floor(glyphPx / 2));
            const imgData = measureCtx.getImageData(0, 0, glyphPx, glyphPx).data;
            let sum = 0;
            for (let i = 0; i < imgData.length; i += 4) sum += imgData[i];
            return { character: ch, ink: sum };
          })
          .sort((a, b) => a.ink - b.ink)
          .map((item) => item.character);

        const rows = Math.ceil(sortedGlyphs.length / 16);
        const atlasCanvas = document.createElement("canvas");
        atlasCanvas.width = 16 * glyphPx;
        atlasCanvas.height = rows * glyphPx;
        const atlasCtx = atlasCanvas.getContext("2d");

        if (atlasCtx) {
          atlasCtx.fillStyle = "#000000";
          atlasCtx.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);
          sortedGlyphs.forEach((ch, idx) => {
            if (ch !== " ") {
              const col = idx % 16;
              const row = Math.floor(idx / 16);
              drawSingleGlyph(
                atlasCtx,
                ch,
                col * glyphPx + Math.floor(glyphPx / 2),
                row * glyphPx + Math.floor(glyphPx / 2)
              );
            }
          });
        }

        const texture = new THREE.CanvasTexture(atlasCanvas);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.anisotropy = 4;
        texture.needsUpdate = true;

        atlasObj = { texture, count: sortedGlyphs.length, rows };
        glyphMat.uniforms.uAtlas.value = atlasObj.texture;
        glyphMat.uniforms.uAtlasGrid.value.set(16, atlasObj.rows);
        glyphMat.uniforms.uCount.value = atlasObj.count;
      };

      const renderFrame = () => {
        if (!linesRT || !bloomDownRTs.length) return;
        renderAtlasIfNeeded();

        const cellSize = getCellSize();
        const fieldCols = Math.ceil((viewWidth * pixelRatio) / cellSize);
        const fieldRows = Math.ceil((viewHeight * pixelRatio) / cellSize);
        const sizeKey = `${fieldCols}|${fieldRows}`;

        if (sizeKey !== cachedFieldSize || !fieldRT) {
          cachedFieldSize = sizeKey;
          fieldRT?.dispose();
          fieldRT = new THREE.WebGLRenderTarget(fieldCols, fieldRows, {
            type: floatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false,
            generateMipmaps: false
          });
        }

        const props = propsHolder.current;
        const bgRgb = parseColor(props.backgroundColor, [0.04, 0.04, 0.04]);
        const bgLuminance = 0.2126 * bgRgb[0] + 0.7152 * bgRgb[1] + 0.0722 * bgRgb[2];
        const isLightMode = props.mode === "ink" || (props.mode === "auto" && bgLuminance > 0.5);

        const labColorA = rgbToOklab(parseColor(props.colors[0], [0.48, 0.36, 1]));
        const labColorB = rgbToOklab(parseColor(props.colors[1], [1, 0.62, 0.99]));

        const resX = viewWidth * pixelRatio;
        const resY = viewHeight * pixelRatio;
        const diagonal = getDiagonal();
        const currentCell = getCellSize();

        const driftRad = (clamp(props.driftAngle, -360, 360) * Math.PI) / 180;
        const driftSpeed = 0.03 * clamp(props.drift, 0, 5);

        // Update Field Uniforms
        const fUniforms = fieldMat.uniforms;
        fUniforms.uCell.value.set(currentCell, currentCell);
        fUniforms.uResolution.value.set(resX, resY);
        fUniforms.uTime.value = simTime;
        fUniforms.uScale.value = clamp(props.scale, 0.2, 5);
        fUniforms.uDrift.value.set(Math.cos(driftRad) * driftSpeed, -Math.sin(driftRad) * driftSpeed);
        fUniforms.uThreshold.value = 0.66 - 0.26 * clamp(props.density, 0, 1);
        fUniforms.uAmbient.value = clamp(props.ambient, 0, 1);
        fUniforms.uReveal.value = clamp(props.reveal, 0, 1);
        fUniforms.uPersistence.value = clamp(props.persistence, 0.05, 10);
        fUniforms.uWidth.value = Math.max(1, 0.8 * currentCell * clamp(props.ringWidth, 0.2, 5));
        fUniforms.uFalloff.value = 0.25 * diagonal;

        pingPool.forEach((p, idx) => {
          if (p.active) {
            pingsUniform[idx].set(p.x * resX, (1 - p.y) * resY, p.born, p.amplitude);
            pingShapeUniform[idx].set(
              p.speed * diagonal,
              p.range * diagonal,
              p.echo ? 1 : 0,
              Math.max(1, p.birth * diagonal)
            );
          } else {
            pingsUniform[idx].set(0, 0, 0, 0);
          }
        });

        const obstaclePresence = props.interactive && props.echo && !props.reduced ? mouse.presence : 0;
        fUniforms.uObstacle.value.set(
          mouse.smoothX,
          mouse.smoothY,
          26 * pixelRatio,
          obstaclePresence * clamp(props.echoStrength, 0, 1)
        );

        // Update Glyph Uniforms
        const gUniforms = glyphMat.uniforms;
        gUniforms.uField.value = fieldRT ? fieldRT.texture : null;
        gUniforms.uCell.value.set(currentCell, currentCell);
        gUniforms.uSpan.value = currentCell / Math.max(1, getBaseGlyphSize());
        gUniforms.uGamma.value = 0.9;
        gUniforms.uDither.value = 0.12 / Math.sqrt(Math.max((atlasObj?.count ?? 8) / 8, 1));
        gUniforms.uInk.value = isLightMode ? 1 : 0;
        gUniforms.uLabA.value.set(labColorA[0], labColorA[1], labColorA[2]);
        gUniforms.uLabB.value.set(labColorB[0], labColorB[1], labColorB[2]);

        // Update Composite Uniforms
        const cUniforms = compositeMat.uniforms;
        cUniforms.uBackground.value.set(srgbToLinear(bgRgb[0]), srgbToLinear(bgRgb[1]), srgbToLinear(bgRgb[2]));
        cUniforms.uGlow.value = clamp(props.glow, 0, 3);
        cUniforms.uExposure.value = (isLightMode ? 4 : 1.25) * clamp(props.intensity, 0, 4);
        cUniforms.uMode.value = isLightMode ? 1 : 0;
        cUniforms.uGrain.value = grainPhase;

        // Pass 1: Simulate Field
        if (fieldRT) renderPass(fieldMat, fieldRT);

        // Pass 2: Render Glyphs
        renderPass(glyphMat, linesRT);

        // Pass 3: Multi-tier Bloom Downsampling
        let currentSrc = linesRT;
        for (let i = 0; i < bloomDownRTs.length; i++) {
          const dest = bloomDownRTs[i];
          downsampleMat.uniforms.uSource.value = currentSrc.texture;
          downsampleMat.uniforms.uTexel.value.set(1 / currentSrc.width, 1 / currentSrc.height);
          renderPass(downsampleMat, dest);
          currentSrc = dest;
        }

        // Pass 4: Multi-tier Bloom Upsampling
        let currentBloom = bloomDownRTs[bloomDownRTs.length - 1];
        for (let i = bloomDownRTs.length - 2; i >= 0; i--) {
          const dest = bloomUpRTs[i];
          upsampleMat.uniforms.uSource.value = currentBloom.texture;
          upsampleMat.uniforms.uBase.value = bloomDownRTs[i].texture;
          upsampleMat.uniforms.uTexel.value.set(1 / currentBloom.width, 1 / currentBloom.height);
          renderPass(upsampleMat, dest);
          currentBloom = dest;
        }

        // Pass 5: Final Composite to Screen
        compositeMat.uniforms.uLines.value = linesRT.texture;
        compositeMat.uniforms.uBloom.value = currentBloom.texture;
        renderPass(compositeMat, null);
      };

      const onFrame = (now) => {
        animId = 0;
        if (isDestroyed) return;

        const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
        lastTime = now;

        const updateSimulation = (delta) => {
          const props = propsHolder.current;
          const targetPresence = props.interactive && props.echo && mouse.inside && !props.reduced ? 1 : 0;
          mouse.presence +=
            (targetPresence - mouse.presence) *
            (1 - Math.exp(-delta / (targetPresence > mouse.presence ? 0.18 : 0.35)));

          if (mouse.placed) {
            const smoothFactor = 1 - Math.exp(-delta / 0.05);
            mouse.smoothX += (mouse.x - mouse.smoothX) * smoothFactor;
            mouse.smoothY += (mouse.y - mouse.smoothY) * smoothFactor;
          } else {
            mouse.smoothX = mouse.x;
            mouse.smoothY = mouse.y;
            mouse.placed = true;
          }

          if (props.paused || props.reduced) return;

          simTime += delta * clamp(props.speed, 0, 4);
          const intervalSec = clamp(props.interval, 0.6, 30);

          if (props.autoPing) {
            if (nextAutoPingTime > simTime + intervalSec) {
              nextAutoPingTime = simTime + intervalSec;
            }
            if (simTime >= nextAutoPingTime) {
              const [ox, oy] = getOriginCoords();
              spawnPing(ox, oy, 1, false, 0.08, nextAutoPingTime);
              nextAutoPingTime = Math.max(nextAutoPingTime + intervalSec, simTime + 0.25 * intervalSec);
            }
          } else {
            nextAutoPingTime = simTime + 0.15 * intervalSec;
          }

          const diag = getDiagonal();
          const persist = clamp(props.persistence, 0.05, 10);
          for (const p of pingPool) {
            if (
              p.active &&
              (simTime - p.born) * p.speed * diag > p.range * diag + p.speed * diag * persist * 4
            ) {
              p.active = false;
            }
          }

          // Handle echo reflection off obstacle / cursor
          const diagResX = viewWidth * pixelRatio;
          const diagResY = viewHeight * pixelRatio;
          const diagRadius = 26 * pixelRatio;
          const shouldEcho = props.interactive && props.echo && mouse.presence > 0.5;

          for (const p of pingPool) {
            if (!p.active || p.echoed) continue;
            const waveRadius = (simTime - p.born) * p.speed * diag;
            const distToObstacle = Math.hypot(mouse.smoothX - p.x * diagResX, mouse.smoothY - (1 - p.y) * diagResY);

            if (distToObstacle < 3 * diagRadius || waveRadius < distToObstacle) continue;

            p.echoed = true;
            if (!shouldEcho || waveRadius - distToObstacle > p.speed * diag * 0.25) continue;

            const echoAmp = p.amplitude * computeEchoFalloff(p, distToObstacle) * 0.62 * clamp(props.echoStrength, 0, 2);
            if (echoAmp > 0.04) {
              spawnPing(mouse.smoothX / diagResX, 1 - mouse.smoothY / diagResY, echoAmp, true, 0.02);
            }
          }

          grainPhase = (grainPhase + 0.618034) % 1;
        };

        updateSimulation(dt);
        renderFrame();

        const props = propsHolder.current;
        const shouldRun = !props.paused && !props.reduced;
        const mouseMoving = Math.abs(mouse.presence - (mouse.inside ? 1 : 0)) > 0.002;

        if (isVisible && !document.hidden && (shouldRun || mouseMoving)) {
          animId = requestAnimationFrame(onFrame);
        }
      };

      const requestFrame = () => {
        if (!isDestroyed && !animId && isVisible) {
          lastTime = performance.now();
          animId = requestAnimationFrame(onFrame);
        }
      };

      const onResize = () => {
        const rect = targetEl.getBoundingClientRect();
        viewWidth = Math.max(1, rect.width);
        viewHeight = Math.max(1, rect.height);
        pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * clamp(propsHolder.current.quality, 0.25, 1);

        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(viewWidth, viewHeight, false);

        const renderW = Math.round(viewWidth * pixelRatio);
        const renderH = Math.round(viewHeight * pixelRatio);

        disposeRTs();
        linesRT = createRenderTarget(renderW, renderH);

        const pyramidSteps = clamp(Math.floor(Math.log2(Math.min(renderW, renderH) / 8)), 3, 6);
        for (let i = 1; i <= pyramidSteps; i++) {
          bloomDownRTs.push(createRenderTarget(renderW >> i, renderH >> i));
          bloomUpRTs.push(createRenderTarget(renderW >> i, renderH >> i));
        }

        renderFrame();
        requestFrame();
      };

      const getPointerPos = (e) => {
        const rect = targetEl.getBoundingClientRect();
        return [(e.clientX - rect.left) * pixelRatio, (rect.height - (e.clientY - rect.top)) * pixelRatio];
      };

      const onPointerMove = (e) => {
        if (e.pointerType === "touch") return;
        const [px, py] = getPointerPos(e);
        mouse.x = px;
        mouse.y = py;
        if (!mouse.inside) {
          mouse.smoothX = px;
          mouse.smoothY = py;
        }
        mouse.inside = true;
        requestFrame();
      };

      const onPointerDown = (e) => {
        const props = propsHolder.current;
        if (e.button !== 0 || !props.interactive || !props.clickPing || props.paused || props.reduced) return;
        const [px, py] = getPointerPos(e);
        spawnPing(px / (viewWidth * pixelRatio), 1 - py / (viewHeight * pixelRatio), 1.15, false, 0.025);
        requestFrame();
      };

      const onPointerLeave = () => {
        mouse.inside = false;
        requestFrame();
      };

      targetEl.addEventListener("pointermove", onPointerMove);
      targetEl.addEventListener("pointerdown", onPointerDown);
      targetEl.addEventListener("pointerleave", onPointerLeave);
      targetEl.addEventListener("pointercancel", onPointerLeave);

      const resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(targetEl);

      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          isVisible = entries.some((e) => e.isIntersecting);
          if (isVisible) requestFrame();
        },
        { rootMargin: "80px" }
      );
      intersectionObserver.observe(targetEl);

      const onVisibilityChange = () => {
        if (!document.hidden) requestFrame();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

      const onContextLost = (e) => e.preventDefault();
      canvas.addEventListener("webglcontextlost", onContextLost);

      // Initial pings
      const initialProps = propsHolder.current;
      if (initialProps.autoPing) {
        const intervalVal = clamp(initialProps.interval, 0.6, 30);
        const [ox, oy] = getOriginCoords();
        spawnPing(ox, oy, 1, false, 0.08, simTime - 1.42 * intervalVal);
        spawnPing(ox, oy, 1, false, 0.08, simTime - 0.42 * intervalVal);
        nextAutoPingTime = simTime + 0.58 * intervalVal;
      }

      onResize();

      return {
        sync: () => {
          const currentExpectedDpr =
            Math.min(window.devicePixelRatio || 1, 2) * clamp(propsHolder.current.quality, 0.25, 1);
          if (Math.abs(currentExpectedDpr - pixelRatio) > 0.001) {
            onResize();
          } else {
            renderFrame();
          }
          requestFrame();
        },
        destroy: () => {
          isDestroyed = true;
          cancelAnimationFrame(animId);
          targetEl.removeEventListener("pointermove", onPointerMove);
          targetEl.removeEventListener("pointerdown", onPointerDown);
          targetEl.removeEventListener("pointerleave", onPointerLeave);
          targetEl.removeEventListener("pointercancel", onPointerLeave);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          canvas.removeEventListener("webglcontextlost", onContextLost);
          resizeObserver.disconnect();
          intersectionObserver.disconnect();
          disposeRTs();
          fieldRT?.dispose();
          atlasObj?.texture.dispose();
          quadGeo.dispose();
          [fieldMat, glyphMat, downsampleMat, upsampleMat, compositeMat].forEach((mat) => mat.dispose());
          renderer.dispose();
          renderer.forceContextLoss();
          canvas.remove();
        },
        ping: (x, y) => {
          const props = propsHolder.current;
          if (props.paused || props.reduced) return;
          spawnPing(clamp(x, -1, 2), clamp(y, -1, 2), 1.15, false, 0.025);
          requestFrame();
        }
      };
    };

    const instance = setupWebGL(container, propsRef);
    internalRef.current = instance;

    return () => {
      instance?.destroy();
      internalRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      ping: (x, y) =>
        internalRef.current?.ping(x ?? propsRef.current.originX, y ?? propsRef.current.originY)
    }),
    []
  );

  return (
    <div
      ref={containerRef}
      className={`relative isolate h-full min-h-[240px] w-full overflow-hidden ${className}`}
      style={{ backgroundColor, ...style }}
    >
      {children && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  );
});

export default GlyphSonar;
