// The inside of each palace: one painted interior per room, kept alive with
// the same per-region approach as the sky (see tools/make_room_masks.py).
import { NOISE_AND_SAMPLING } from './glsl.js';

export const INTERIORS = {
  projects: { file: 'glasshouse', sun: [430, 290], focus: [0.5, 0.52] },
  research: { file: 'observatory', sun: [1195, 370], focus: [0.56, 0.48] },
  creative: { file: 'pavilion', sun: [180, 350], focus: [0.52, 0.5] },
  contact: { file: 'postgarden', sun: [168, 315], focus: [0.6, 0.5] },
};
const W = 1672, H = 941;

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uImg, uMask, uAux, uCloth;
uniform vec2 uRes, uSize, uSun;
uniform float uTime, uMotion, uUpscale, uSharp;
uniform vec3 uCam;
out vec4 outColor;

${NOISE_AND_SAMPLING}

void main(){
  vec2 p = vec2(gl_FragCoord.x/uRes.x, 1.0 - gl_FragCoord.y/uRes.y);
  float A = uRes.x/uRes.y, I = uSize.x/uSize.y;
  vec2 vis = A > I ? vec2(1.0, I/A) : vec2(A/I, 1.0);
  vec2 uv = uCam.xy + (p - 0.5)*vis/uCam.z;
  vec2 px = 1.0/uSize;
  vec2 ip = uv*uSize;
  float t = uTime;

  vec4 m = texture(uMask, uv);   // r still water, g foliage, b sky through glass
  vec4 ax = texture(uAux, uv);   // r polished floor, g falling water, b sparkles
  vec4 cl = texture(uCloth, uv); // r curtains, g lamps

  vec2 disp = vec2(0.0);
  // an indoor draught: softer and slower than the wind outside
  if (m.g > 0.004){
    vec2 wp = ip*0.016;
    float gust = 0.6 + 0.4*smoothstep(0.2, 0.9, noise(vec2(t*0.09, 1.3) + uv.x*1.2));
    disp += vec2(fbm2(wp - vec2(t*0.35, t*0.05)) - 0.5, fbm2(wp*1.3 + vec2(4.1, t*0.22)) - 0.5)*vec2(1.6, 0.8)*gust*px*m.g*uMotion;
  }
  // sheer curtains billow in long, slow waves that travel down the fabric
  if (cl.r > 0.004){
    float wave = sin(ip.y*0.018 - t*0.9 + fbm2(ip*0.004 + t*0.05)*4.0);
    vec2 billow = vec2(wave*2.6 + (fbm2(ip*0.006 + vec2(t*0.11, 0.0)) - 0.5)*3.0, wave*0.8);
    disp += billow*px*cl.r*uMotion;
  }
  // the reflecting pool shivers
  if (m.r > 0.004){
    disp += vec2(sin(ip.y*0.9 + t*1.5 + noise(ip*0.05)*6.0), cos(ip.x*0.12 + t*1.1))*vec2(0.7, 0.3)*px*m.r*uMotion;
  }
  vec3 col = sharpTex(uImg, uv + disp);

  // clouds beyond the glass drift by; only cloud is ever borrowed
  if (m.b > 0.004){
    vec2 billow = (vec2(noise(uv*vec2(10.0, 18.0) + t*0.012), noise(uv*vec2(10.0, 18.0) + 9.3 - t*0.01)) - 0.5)*3.0*px*uMotion;
    float ph = t*0.028*uMotion + noise(uv*6.0)*0.6;
    float p0 = fract(ph), p1 = fract(ph + 0.5);
    vec2 d = vec2(-20.0, -1.0)*px;
    vec2 u0 = uv - d*p0 + billow, u1 = uv - d*p1 + billow;
    vec3 s0 = mix(col, texture(uImg, u0).rgb, texture(uMask, u0).b);
    vec3 s1 = mix(col, texture(uImg, u1).rgb, texture(uMask, u1).b);
    col = mix(col, mix(s1, s0, 1.0 - abs(1.0 - 2.0*p0)), m.b);
  }

  // falling water, softened into spray
  if (ax.g > 0.004){
    float lane = noise(vec2(ip.x*0.06, 1.7));
    vec2 d = vec2(0.0, 22.0 + 12.0*lane)*px;
    float ph = t*0.9*uMotion + noise(ip*vec2(0.015, 0.004))*1.7;
    float p0 = fract(ph), p1 = fract(ph + 0.5);
    vec2 u0 = uv - d*p0, u1 = uv - d*p1;
    vec3 s0 = mix(col, textureLod(uImg, u0, 0.6).rgb, texture(uAux, u0).g);
    vec3 s1 = mix(col, textureLod(uImg, u1, 0.6).rgb, texture(uAux, u1).g);
    vec3 w = mix(s1, s0, 1.0 - abs(1.0 - 2.0*p0));
    float veil = fbm(vec2(ip.x*0.03, ip.y*0.012 - t*0.8*uMotion));
    w = mix(w, vec3(0.98, 0.97, 0.98), 0.08 + 0.16*smoothstep(0.35, 0.8, veil));
    col = mix(col, w, ax.g);
  }

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));

  // water glints
  float glint = pow(noise(ip*vec2(0.5, 1.4) + vec2(t*0.5, -t*0.8)*uMotion), 16.0);
  col += vec3(1.0, 0.93, 0.8)*glint*m.r*smoothstep(0.4, 0.8, lum)*0.9;

  // light moving across the polished floor: dappled by leaves and lifted by
  // reflections off the water
  if (ax.r > 0.004){
    float dap = fbm2(ip*vec2(0.0045, 0.009) + vec2(t*0.018, t*0.007)*uMotion);
    float sweep = fbm2(ip*0.002 - vec2(t*0.01, 0.0)*uMotion);
    col *= 1.0 + (dap - 0.5)*0.16*ax.r + (sweep - 0.5)*0.06*ax.r;
  }

  // crystal and brass catch the light now and then
  if (ax.b > 0.004){
    float tw = pow(noise(ip*0.09 + vec2(t*0.7, -t*0.4)), 7.0);
    float slow = 0.5 + 0.5*sin(t*0.8 + ip.x*0.05);
    col += vec3(1.0, 0.96, 0.88)*ax.b*(tw*0.9 + slow*0.04);
  }

  // lanterns breathe
  if (cl.g > 0.004){
    float flick = 0.65 + 0.2*sin(t*1.7 + ip.x*0.1) + 0.15*noise(vec2(t*3.1, ip.y*0.05));
    col += vec3(1.0, 0.7, 0.36)*cl.g*0.09*flick;
  }

  // the sun: a soft bloom and slow shafts reaching into the room
  vec2 sd = ip - uSun;
  float d = length(sd);
  vec2 dir = sd/max(d, 1e-3);
  float rays = fbm2(dir*2.4 + vec2(t*0.025*uMotion, 0.0))*fbm2(dir*5.0 + vec2(2.0, -t*0.018*uMotion));
  float breathe = 1.0 + 0.05*sin(t*0.33);
  col += vec3(1.0, 0.84, 0.6)*(exp(-d/80.0)*0.12*breathe + pow(rays*1.6, 3.0)*exp(-d/900.0)*0.07);

  // grade: a touch of contrast, warm highlights, a light vignette
  col = mix(col, col*col*(3.0 - 2.0*col), 0.05);
  col = mix(col, col*vec3(1.025, 1.0, 0.965), smoothstep(0.5, 1.0, lum));
  vec2 vq = p - 0.5;
  col *= 1.0 - 0.12*pow(length(vq*vec2(1.0, 1.15))*1.3, 2.6);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => im.decode().then(() => res(im), () => res(im));
    im.onerror = rej;
    im.src = src;
  });
}

// the pictures are fetched as soon as the page opens, before any GPU work, so
// a room is almost always ready by the time anyone walks up to its door
const fetched = {};
export function prefetchRoom(room) {
  const f = INTERIORS[room].file;
  fetched[room] ??= Promise.all([`${f}.webp`, `${f}-masks.webp`, `${f}-aux.webp`, `${f}-cloth.webp`].map((n) => loadImage(`assets/rooms/${n}`)));
  return fetched[room];
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// texture units: the sky uses 0-5 and samples this room's off-screen frame
// from 6; the room's own pictures sit on 7-10
const FRAME_UNIT = 6, FIRST_UNIT = 7;

export class Interior {
  // shares the sky's WebGL context, so the two can be blended in one pass
  constructor(gl) {
    this.gl = gl;
    this.cam = { x: 0.5, y: 0.5, z: 1.08 };
    this.motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
    this.images = {};
    this.textures = {};
    this.room = null;
    this.start = performance.now();
    this.size = [1, 1];

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);
    const u = (n) => gl.getUniformLocation(prog, n);
    this.u = { res: u('uRes'), size: u('uSize'), sun: u('uSun'), time: u('uTime'), motion: u('uMotion'), upscale: u('uUpscale'), sharp: u('uSharp'), cam: u('uCam') };
    ['uImg', 'uMask', 'uAux', 'uCloth'].forEach((n, i) => gl.uniform1i(u(n), FIRST_UNIT + i));
    gl.uniform2f(this.u.size, W, H);
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');

    // the off-screen frame the sky blends in while the room opens up
    this.frameTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + FRAME_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.target = gl.createFramebuffer();
  }

  resize(w, h) {
    if (this.size[0] === w && this.size[1] === h) return;
    const gl = this.gl;
    this.size = [w, h];
    gl.activeTexture(gl.TEXTURE0 + FRAME_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.frameTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // fetch a room's pictures ahead of time (into the browser's cache only);
  // they go onto the GPU when we walk towards that room
  preload(room) {
    return prefetchRoom(room);
  }

  // only the room we are in lives on the GPU, which keeps phones comfortable
  release(except) {
    for (const [room, txs] of Object.entries(this.textures)) {
      if (room === except) continue;
      txs.forEach((tx) => this.gl.deleteTexture(tx));
      delete this.textures[room];
    }
  }

  upload(room, imgs) {
    if (this.textures[room]) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + 15); // a spare unit, so the bound rooms are untouched
    this.textures[room] = imgs.map((im, i) => {
      const tx = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (i === 0) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      return tx;
    });
  }

  async use(room) {
    const imgs = await this.preload(room);
    const gl = this.gl;
    this.release(room);
    this.upload(room, imgs);
    this.textures[room].forEach((tx, i) => {
      gl.activeTexture(gl.TEXTURE0 + FIRST_UNIT + i);
      gl.bindTexture(gl.TEXTURE_2D, tx);
    });
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.sun, ...INTERIORS[room].sun);
    this.room = room;
  }

  visible() {
    const A = this.size[0] / this.size[1], I = W / H;
    return A > I ? [1, I / A] : [A / I, 1];
  }

  clampCam(c = this.cam) {
    const [vx, vy] = this.visible();
    const hx = vx / c.z / 2 + 0.004, hy = vy / c.z / 2 + 0.004;
    c.x = Math.min(Math.max(c.x, hx), 1 - hx);
    c.y = Math.min(Math.max(c.y, hy), 1 - hy);
    return c;
  }

  // to the screen (target null) or to the off-screen frame for blending
  draw(target, now = performance.now()) {
    if (!this.room) return;
    const gl = this.gl, u = this.u;
    const [w, h] = this.size;
    gl.useProgram(this.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
    const c = this.clampCam({ ...this.cam });
    const upscale = (w / (W * this.visible()[0])) * c.z;
    gl.uniform2f(u.res, w, h);
    gl.uniform1f(u.time, (now - this.start) / 1000);
    gl.uniform1f(u.motion, this.motion);
    gl.uniform1f(u.upscale, upscale);
    gl.uniform1f(u.sharp, Math.min(0.45, Math.max(0, (upscale - 1) * 0.35)));
    gl.uniform3f(u.cam, c.x, c.y, c.z);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
