import { NOISE_AND_SAMPLING } from './glsl.js';

// Living sanctuary. The painting is split into a clean sky plate plus the four
// islands as separate cut-out layers, so each island can float and drift on its
// own without dragging a ghost of itself through the sky. Water, wind, cloud and
// light are animated per layer from region masks (see tools/).

export const IMG_W = 1672;
export const IMG_H = 941;

// focus: what the camera frames; door: the way in; depth: parallax weight
export const ISLANDS = {
  research: {
    focus: [452, 270], door: [444, 246], depth: 0.45, bob: [0.37, 0.0],
    poly: [[330,232],[352,214],[392,206],[400,160],[440,148],[484,160],[500,196],[550,180],[566,230],[598,286],[580,330],[540,370],[500,410],[470,450],[425,450],[392,410],[360,370],[332,330],[324,282]],
  },
  creative: {
    focus: [760, 240], door: [752, 214], depth: 0.45, bob: [0.33, 2.1],
    poly: [[606,240],[618,188],[648,160],[652,118],[676,118],[700,128],[752,108],[800,96],[836,110],[880,140],[912,190],[910,250],[890,290],[850,330],[810,362],[770,384],[720,384],[680,350],[640,320],[612,290]],
  },
  contact: {
    focus: [650, 470], door: [648, 432], depth: 0.55, bob: [0.41, 4.2],
    poly: [[518,480],[540,440],[560,400],[600,372],[630,346],[680,356],[730,372],[770,400],[784,460],[766,500],[740,540],[700,570],[660,612],[612,622],[580,620],[556,560],[528,520]],
  },
  projects: {
    focus: [1290, 400], door: [1300, 398], depth: 1.0, bob: [0.23, 1.0],
    poly: [[784,540],[810,500],[880,470],[900,400],[960,330],[1000,230],[1060,150],[1140,140],[1200,80],[1260,60],[1290,20],[1400,20],[1480,0],[1672,0],[1672,941],[1140,941],[1060,900],[1000,880],[940,880],[880,860],[830,800],[790,700],[776,600]],
  },
};
export const ISLAND_ORDER = ['research', 'creative', 'contact', 'projects'];

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uImg, uBg, uMask, uAux, uLight, uMatte, uInside;
uniform vec2 uRes, uSize;
uniform float uTime, uMotion, uUpscale, uVeil, uSharp;
uniform vec3 uCam;
uniform vec2 uVeilC, uBgOff;
// the room opening up from its entrance (device pixels, origin bottom-left)
uniform float uOpen, uInScale;
uniform vec2 uOpenC, uOpenR, uInC;
uniform vec2 uOff[4];
uniform vec4 uHov;
out vec4 outColor;

${NOISE_AND_SAMPLING}

// falling water: two staggered phases slide down the fall and cross-fade;
// a phase may only borrow pixels that are themselves water, so rock and sky
// never get dragged along
vec3 fallingWater(vec2 luv, vec3 local){
  float lane = noise(vec2(luv.x*uSize.x*0.05, 1.7));
  float stagger = noise(luv*uSize*vec2(0.015, 0.004));
  vec2 d = vec2(0.0, 30.0 + 18.0*lane)/uSize;
  float t = uTime*0.95*uMotion + stagger*1.7;
  float p0 = fract(t), p1 = fract(t + 0.5);
  vec2 u0 = luv - d*p0, u1 = luv - d*p1;
  vec3 s0 = mix(local, textureLod(uImg, u0, 0.7).rgb, texture(uMask, u0).r);
  vec3 s1 = mix(local, textureLod(uImg, u1, 0.7).rgb, texture(uMask, u1).r);
  vec3 w = mix(s1, s0, 1.0 - abs(1.0 - 2.0*p0));
  // soft veil of falling spray: broad, slow shapes rather than lines
  float veil = fbm(vec2(luv.x*uSize.x*0.028, luv.y*uSize.y*0.011 - uTime*0.85*uMotion));
  w = mix(w, vec3(0.97, 0.965, 0.985), 0.06 + 0.14*smoothstep(0.35, 0.8, veil));
  return w;
}

vec3 shadeIsland(vec2 luv){
  vec4 m = texture(uMask, luv);
  vec2 px = 1.0/uSize;
  vec2 wind = vec2(0.0);
  if (m.g > 0.004){
    vec2 wp = luv*uSize*0.018;
    float gust = 0.55 + 0.45*smoothstep(0.25, 0.85, noise(vec2(uTime*0.11, 3.7) + luv.x*1.5));
    wind = vec2(fbm2(wp - vec2(uTime*0.55, uTime*0.08)) - 0.5, fbm2(wp*1.3 + vec2(5.2, uTime*0.31)) - 0.5);
    wind *= vec2(2.0, 1.0)*gust*px*m.g*uMotion;
  }
  vec4 ax = texture(uAux, luv);
  vec2 rip = vec2(sin(luv.y*uSize.y*0.85 + uTime*1.7 + noise(luv*uSize*0.05)*6.0), 0.0)*0.5*px*ax.r*uMotion;
  vec3 col = sharpTex(uImg, luv + wind + rip);
  if (m.r > 0.004) col = mix(col, fallingWater(luv, col), m.r);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec2 ip = luv*uSize;

  // glints on the pond
  float glint = pow(noise(ip*vec2(0.55, 1.6) + vec2(uTime*0.6, -uTime*0.9)*uMotion), 18.0);
  col += vec3(1.0, 0.93, 0.8)*glint*ax.r*smoothstep(0.45, 0.8, lum)*0.8;

  // a slow band of light travelling across the glass
  if (ax.b > 0.004){
    float s = dot(ip, normalize(vec2(1.0, 0.62)));
    float sweep = mod(uTime*42.0*uMotion + 900.0, 3200.0) - 700.0;
    float band = exp(-pow((s - sweep)/34.0, 2.0));
    float wide = exp(-pow((s - sweep - 60.0)/190.0, 2.0));
    col += vec3(1.0, 0.95, 0.86)*ax.b*(band*0.11 + wide*0.04)*(0.35 + lum);
  }

  // lamps behind the panes breathe
  float flick = 0.6 + 0.25*sin(uTime*1.1 + noise(ip*0.02)*6.0) + 0.15*noise(vec2(uTime*1.7, ip.x*0.01));
  col += vec3(1.0, 0.72, 0.38)*texture(uLight, luv).r*0.05*flick;
  return col;
}

vec3 shadeSky(vec2 buv){
  vec4 m = texture(uMask, buv);
  vec3 col = sharpTex(uBg, buv);
  if (m.b > 0.004){
    vec2 px = 1.0/uSize;
    vec2 billow = (vec2(noise(buv*vec2(10.0, 18.0) + uTime*0.012), noise(buv*vec2(10.0, 18.0) + 9.3 - uTime*0.01)) - 0.5)*4.0*px*uMotion;
    float t = uTime*0.03*uMotion + noise(buv*6.0)*0.6;
    float p0 = fract(t), p1 = fract(t + 0.5);
    vec2 d = vec2(-22.0, -1.5)*px;
    vec2 u0 = buv - d*p0 + billow, u1 = buv - d*p1 + billow;
    vec3 s0 = mix(col, texture(uBg, u0).rgb, texture(uMask, u0).b);
    vec3 s1 = mix(col, texture(uBg, u1).rgb, texture(uMask, u1).b);
    col = mix(col, mix(s1, s0, 1.0 - abs(1.0 - 2.0*p0)), m.b);
  }
  // shimmer on the river far below
  vec4 ax = texture(uAux, buv);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float glint = pow(noise(buv*uSize*vec2(0.5, 1.4) + vec2(uTime*0.5, -uTime*0.7)*uMotion), 18.0);
  col += vec3(1.0, 0.93, 0.8)*glint*ax.r*smoothstep(0.45, 0.8, lum)*0.8;
  return col;
}

void main(){
  vec2 p = vec2(gl_FragCoord.x/uRes.x, 1.0 - gl_FragCoord.y/uRes.y);
  float A = uRes.x/uRes.y, I = uSize.x/uSize.y;
  vec2 vis = A > I ? vec2(1.0, I/A) : vec2(A/I, 1.0);
  vec2 uv = uCam.xy + (p - 0.5)*vis/uCam.z;
  float t = uTime;

  // which layers cover this pixel, each at its own drifted position
  float aR = texture(uMatte, uv - uOff[0]).r;
  float aC = texture(uMatte, uv - uOff[1]).g;
  float aT = texture(uMatte, uv - uOff[2]).b;
  float aP = texture(uLight, uv - uOff[3]).b;
  float cover = 1.0 - (1.0 - aR)*(1.0 - aC)*(1.0 - aT)*(1.0 - aP);

  vec3 col = vec3(0.0);
  if (cover < 0.995) col = shadeSky(uv - uBgOff);
  if (aR > 0.003) col = mix(col, shadeIsland(uv - uOff[0]), aR);
  if (aC > 0.003) col = mix(col, shadeIsland(uv - uOff[1]), aC);
  if (aT > 0.003) col = mix(col, shadeIsland(uv - uOff[2]), aT);
  if (aP > 0.003) col = mix(col, shadeIsland(uv - uOff[3]), aP);

  // the island under the pointer catches a little more light, only on itself
  float hl = aR*uHov.x + aC*uHov.y + aT*uHov.z + aP*uHov.w;
  // bright, smooth slivers of sky caught at the very edge of a cut-out stay as they are
  hl *= 1.0 - smoothstep(0.66, 0.86, dot(col, vec3(0.2126, 0.7152, 0.0722)));
  col += col*hl*0.11 + vec3(1.0, 0.86, 0.62)*hl*0.02;

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec2 ip = uv*uSize;

  // spray hanging round the falls
  float halo = texture(uLight, uv - uOff[3]*aP).g;
  if (halo > 0.01){
    float n = fbm2(ip*vec2(0.014, 0.009) + vec2(sin(t*0.1)*0.4, -t*0.22*uMotion));
    col = mix(col, vec3(0.99, 0.96, 0.96), halo*smoothstep(0.35, 0.85, n)*0.2);
  }

  // sun: bloom, slow rays, a faint anamorphic streak
  vec2 sd = ip - vec2(100.0, 277.0);
  float d = length(sd);
  vec2 dirc = sd/max(d, 1e-3);
  float rays = fbm2(dirc*2.6 + vec2(t*0.03*uMotion, 0.0))*fbm2(dirc*5.2 + vec2(3.0, -t*0.02*uMotion));
  float shaft = pow(rays*1.6, 3.0)*exp(-d/700.0)*(1.0 - cover*0.6);
  float breathe = 1.0 + 0.05*sin(t*0.37);
  col += vec3(1.0, 0.82, 0.55)*(exp(-d/85.0)*0.15*breathe + shaft*0.08);
  col += vec3(1.0, 0.86, 0.66)*exp(-abs(sd.y)/2.5)*exp(-abs(sd.x)/420.0)*0.045*breathe;

  // low mist drifting over the sea of clouds, in front of the sky only
  float seaZone = smoothstep(380.0, 720.0, ip.y)*(1.0 - cover);
  if (seaZone > 0.01){
    vec2 mp = ip*vec2(0.0026, 0.0055);
    float mist = fbm(mp + vec2(t*0.011*uMotion, 0.0) + noise(mp*1.7 - t*0.006)*0.9);
    col = mix(col, mix(vec3(1.0, 0.9, 0.87), vec3(1.0, 0.95, 0.92), lum), smoothstep(0.45, 0.8, mist)*0.09*seaZone);
  }

  // cloud shadows drift over everything
  vec2 shp = uv*vec2(1.6, 1.1) + vec2(t*0.004*uMotion, 0.0);
  col *= 0.98 + 0.03*(noise(shp*2.0)*0.6 + noise(shp*4.3 + 7.0)*0.4);

  // grade: a touch of filmic contrast, warm highlights, a light vignette
  col = mix(col, col*col*(3.0 - 2.0*col), 0.05);
  col = mix(col, col*vec3(1.03, 1.0, 0.96), smoothstep(0.5, 1.0, lum));
  vec2 vq = p - 0.5;
  col *= 1.0 - 0.14*pow(length(vq*vec2(1.0, 1.15))*1.3, 2.6);

  // warm light gathering round the entrance as we approach it
  if (uVeil > 0.0){
    float r = length((p - uVeilC)*vec2(A, 1.0));
    float v = clamp(uVeil*1.5 - r*(1.2 - uVeil), 0.0, 1.0);
    col = col*(1.0 + v*0.6);
    col = mix(col, vec3(1.0, 0.95, 0.86), smoothstep(0.45, 1.0, v));
  }

  // stepping inside: the whole view dissolves into the room while both keep
  // moving forward, so it reads as one continuous walk through the door
  if (uOpen > 0.0){
    vec3 room = texture(uInside, gl_FragCoord.xy/uRes).rgb;
    col = mix(col, room, uOpen);
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function pixels(im) {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0);
  return x.getImageData(0, 0, c.width, c.height).data;
}

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.cam = { x: 0.5, y: 0.5, z: 1.04 };
    this.par = { x: 0, y: 0, tx: 0, ty: 0, k: 1 };
    this.hover = { research: 0, creative: 0, contact: 0, projects: 0 };
    this.hoverTarget = null;
    this.veil = 0;
    this.veilC = [0.5, 0.5];
    // the room opening up from its entrance, in CSS pixels
    this.opening = { u: 0, c: [0, 0], r: [1, 1], scale: 1, inC: [0, 0] };
    this.view = 'sky'; // 'sky', 'blend' (the room opening up over it) or 'room'
    this.interior = null;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
    this.listeners = [];
    this.offsets = new Float32Array(8);
    // the box the scene is drawn into, in CSS pixels (full window, or a frame on phones)
    this.vw = innerWidth;
    this.vh = innerHeight;
    this.quality = 1;      // stepped down once if a device cannot keep up
    this.frameCap = 0;     // ms between frames when resting (0 = every frame)
    this.lastDrawn = 0;
  }

  async init() {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.images = await Promise.all([
      'assets/sanctuary.webp', 'assets/background.webp', 'assets/masks.webp',
      'assets/detail.webp', 'assets/light.webp', 'assets/mattes.webp',
    ].map(loadImage));
    // pixel-exact hit testing from the same cut-outs the shader draws
    this.hit = { matte: pixels(this.images[5]), light: pixels(this.images[4]) };

    // when the system reclaims graphics memory the context is lost; ask for it
    // back and rebuild everything on the GPU, so the scene recovers by itself
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      document.body.classList.add('no-gl'); // the still painting covers at once, even mid-intro
      this.onLost?.();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.setup();
      document.body.classList.remove('no-gl');
      this.onRestored?.();
    });
    this.setup();
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.startLoop();
  }

  // everything that lives on the GPU; run again after a lost context
  setup() {
    const gl = this.gl;
    const [img, bg, mask, aux, light, matte] = this.images;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos'); // shared with the interior program
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    const tex = (im, unit, mip) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (mip) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
    };
    tex(img, 0, true);
    tex(bg, 1, true);
    tex(mask, 2, false);
    tex(aux, 3, false);
    tex(light, 4, false);
    tex(matte, 5, false);

    const u = (n) => gl.getUniformLocation(prog, n);
    this.u = {
      res: u('uRes'), size: u('uSize'), time: u('uTime'), motion: u('uMotion'), upscale: u('uUpscale'),
      sharp: u('uSharp'), veil: u('uVeil'), cam: u('uCam'), veilC: u('uVeilC'), bgOff: u('uBgOff'),
      off: u('uOff'), hov: u('uHov'), open: u('uOpen'), openC: u('uOpenC'), openR: u('uOpenR'), inScale: u('uInScale'), inC: u('uInC'),
    };
    // units 0-5 hold the sky; 6 is the room rendered off-screen (see interior.js)
    ['uImg', 'uBg', 'uMask', 'uAux', 'uLight', 'uMatte', 'uInside'].forEach((n, i) => gl.uniform1i(u(n), i));
    gl.uniform2f(this.u.size, IMG_W, IMG_H);

    this.interior = null;
    this.canvas.width = this.canvas.height = 0; // forces resize() to size everything afresh
    this.resize();
    this.draw(this.lastT ?? 0); // painted before anything can reveal the canvas
  }

  startLoop() {
    this.start = performance.now();
    this.last = this.start;
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    this.vw = this.canvas.clientWidth || innerWidth;
    this.vh = this.canvas.clientHeight || innerHeight;
    // a pixel budget keeps every frame affordable: sharp on ordinary screens,
    // and on very dense ones a little under native, which the eye can't tell
    const phone = matchMedia('(pointer: coarse)').matches;
    const budget = phone ? 1.3e6 : 2.6e6;
    const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(budget / (this.vw * this.vh))) * this.quality;
    const w = Math.round(this.vw * dpr), h = Math.round(this.vh * dpr);
    const changed = this.canvas.width !== w || this.canvas.height !== h;
    if (changed) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl?.viewport(0, 0, w, h);
    this.interior?.resize(w, h);
    this.clampCam();
    this.onResize?.();
    // resizing wipes a WebGL canvas; paint it again at once so it never shows black
    if (changed && this.u && this.lastT !== undefined) this.draw(this.lastT);
  }

  // fraction of the painting visible at zoom 1 (cover fit)
  visible() {
    const A = this.vw / this.vh, I = IMG_W / IMG_H;
    return A > I ? [1, I / A] : [A / I, 1];
  }

  clampCam(c = this.cam) {
    const [vx, vy] = this.visible();
    const hx = vx / c.z / 2 + 0.008, hy = vy / c.z / 2 + 0.008;
    c.x = Math.min(Math.max(c.x, hx), 1 - hx);
    c.y = Math.min(Math.max(c.y, hy), 1 - hy);
    return c;
  }

  // painting pixel -> CSS pixel on screen
  toScreen(ix, iy, cam = this.cam) {
    const [vx, vy] = this.visible();
    return [((ix / IMG_W - cam.x) * cam.z / vx + 0.5) * this.vw, ((iy / IMG_H - cam.y) * cam.z / vy + 0.5) * this.vh];
  }

  // CSS pixel -> painting pixel
  toImage(sx, sy, cam = this.cam) {
    const [vx, vy] = this.visible();
    return [(cam.x + (sx / this.vw - 0.5) * vx / cam.z) * IMG_W, (cam.y + (sy / this.vh - 0.5) * vy / cam.z) * IMG_H];
  }

  // only real land counts: sky between the trees is not a click target
  islandAt(sx, sy) {
    const [x, y] = this.toImage(sx, sy);
    if (!this.hit) {
      for (const k of ['contact', 'research', 'creative', 'projects']) if (pointInPoly(x, y, ISLANDS[k].poly)) return k;
      return null;
    }
    let best = null, bestA = 0.45;
    // probe a small neighbourhood so thin vines and tree tips are easy to hit
    for (let dy = -3; dy <= 3; dy += 3) {
      for (let dx = -3; dx <= 3; dx += 3) {
        const px = Math.round(x + dx), py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= IMG_W || py >= IMG_H) continue;
        const i = (py * IMG_W + px) * 4;
        const cand = [['research', this.hit.matte[i]], ['creative', this.hit.matte[i + 1]], ['contact', this.hit.matte[i + 2]], ['projects', this.hit.light[i + 2]]];
        for (const [k, v] of cand) if (v / 255 > bestA) { best = k; bestA = v / 255; }
      }
    }
    return best;
  }

  onFrame(fn) { this.listeners.push(fn); }

  // each island floats on its own slow swell and answers the pointer by its depth
  layerOffsets(t) {
    const m = this.motion, px = this.par.x * this.par.k, py = this.par.y * this.par.k;
    const bgDepth = 0.12;
    ISLAND_ORDER.forEach((k, i) => {
      const s = ISLANDS[k];
      const [freq, phase] = s.bob;
      const amp = k === 'projects' ? 0.9 : 2.4;
      const ox = Math.sin(t * freq * 0.7 + phase) * 0.6 * m + px * (s.depth - bgDepth) * 7;
      const oy = Math.sin(t * freq + phase) * amp * m + py * (s.depth - bgDepth) * 4;
      this.offsets[i * 2] = ox / IMG_W;
      this.offsets[i * 2 + 1] = oy / IMG_H;
    });
    return [-px * bgDepth * 2 / IMG_W, -py * bgDepth * 1.2 / IMG_H];
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    // resting on a phone, every other frame is plenty for clouds and leaves
    if (this.frameCap && this.resting && now - this.last < this.frameCap - 2) return;
    const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.1));
    this.last = now;
    for (const fn of this.listeners) fn(dt, now);
    if (!this.gl || this.lost) return;
    if (this.view === 'room') { this.interior.draw(null, now); return; }

    const k = 1 - Math.exp(-dt * 2.0);
    this.par.x += (this.par.tx * this.motion - this.par.x) * k;
    this.par.y += (this.par.ty * this.motion - this.par.y) * k;
    for (const key of ISLAND_ORDER) {
      const target = this.hoverTarget === key ? 1 : 0;
      this.hover[key] += (target - this.hover[key]) * (1 - Math.exp(-dt * 4));
    }

    if (this.view === 'blend') this.interior.draw(this.interior.target, now);
    this.draw((now - this.start) / 1000);
    this.adapt(dt, now);
  }

  // If frames run long while resting, lower the resolution in one step and
  // stay there: stepping back and forth is what makes a canvas flicker.
  adapt(dt, now) {
    if (this.quality < 1 || now - this.start < 4000 || !this.resting) { this.slow = []; return; }
    (this.slow ??= []).push(dt);
    if (this.slow.length < 120) return;
    const median = [...this.slow].sort((a, b) => a - b)[60];
    this.slow = [];
    const budget = this.frameCap ? this.frameCap / 1000 : 1 / 60;
    if (median > budget * 1.35) { this.quality = 0.8; this.resize(); }
  }

  draw(t) {
    this.lastT = t;
    const gl = this.gl, u = this.u;
    gl.useProgram(this.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const bgOff = this.layerOffsets(t);
    gl.uniform2f(u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.time, t);
    gl.uniform1f(u.motion, this.motion);
    const upscale = (this.canvas.width / (IMG_W * this.visible()[0])) * this.cam.z;
    gl.uniform1f(u.upscale, upscale);
    gl.uniform1f(u.sharp, Math.min(0.45, Math.max(0, (upscale - 1) * 0.35)));
    gl.uniform3f(u.cam, this.cam.x, this.cam.y, this.cam.z);
    gl.uniform2fv(u.off, this.offsets);
    gl.uniform2f(u.bgOff, bgOff[0], bgOff[1]);
    gl.uniform4f(u.hov, this.hover.research, this.hover.creative, this.hover.contact, this.hover.projects);
    gl.uniform1f(u.veil, this.veil);
    gl.uniform2f(u.veilC, this.veilC[0], this.veilC[1]);
    const o = this.opening, k = this.canvas.width / this.vw, H = this.canvas.height;
    gl.uniform1f(u.open, this.view === 'blend' ? Math.max(o.u, 1e-4) : 0);
    gl.uniform2f(u.openC, o.c[0] * k, H - o.c[1] * k);
    gl.uniform2f(u.openR, Math.max(1, o.r[0] * k), Math.max(1, o.r[1] * k));
    gl.uniform1f(u.inScale, o.scale);
    gl.uniform2f(u.inC, o.inC[0] * k, H - o.inC[1] * k);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
