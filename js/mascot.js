// Mini Kunjal: a small living guide who floats at the edge of the sky. She
// greets first-time visitors, points the way to the projects, reacts to taps
// and now and then tells a developer joke. She can be sent away, and comes
// back from a little sprig in the corner.

const GREETING_NEW = [
  'Hi! I’m mini Kunjal ♡ welcome to my sanctuary.',
  'My projects grow in the Glasshouse. Want to see?',
];
const GREETING_BACK = ['Welcome back! The waterfalls missed you.'];
const TAPS = ['Hehe! ♡', 'That tickles!', 'Boop!', '✨ sparkle mode ✨', 'Hi again!'];
const JOKES = [
  'Why do programmers prefer dark mode? Light attracts bugs.',
  'I told my neural network a joke. It didn’t laugh: not enough training data.',
  'There are 10 kinds of people: those who read binary and those who don’t.',
  'My code never has bugs. It just grows surprise features.',
  'A SQL query walks into a bar, sees two tables and asks: “Can I join you?”',
  'I’d tell you a UDP joke, but you might not get it.',
  'Overfitting is memorising every flower in the garden and still missing the gate.',
  '!false. It’s funny because it’s true.',
  'I named the Wi-Fi “Botanical Sanctuary”. The plants still won’t connect.',
  'Gradient descent: how I find my way down these islands, one small step at a time.',
];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: just forget */ } },
};

// Her painting, kept alive in a small WebGL canvas: hair sways, the cape and
// skirt flutter, her hand waves about the wrist, she blinks. See tools/make_mascot.py.
const W = 1024, H = 1536;          // the original painting, which positions below use
const PAD = 0.05;                  // room round her so swaying hair is never clipped

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uImg, uMotion;
uniform vec2 uRes;
uniform float uTime, uWave, uPoint, uBlink, uWind;
out vec4 outColor;
const vec2 SIZE = vec2(${W}.0, ${H}.0);
const float PAD = ${PAD};

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f*f*(3.0 - 2.0*f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }

void main(){
  vec2 uv = vec2(gl_FragCoord.x/uRes.x, 1.0 - gl_FragCoord.y/uRes.y);
  vec2 iuv = (uv - PAD)/(1.0 - 2.0*PAD);
  vec2 p = iuv*SIZE;
  float t = uTime;
  vec4 m = texture(uMotion, clamp(iuv, 0.0, 1.0));

  // hair: a slow sway that grows towards the ends, with a breath of breeze
  vec2 d = vec2(0.0);
  float sway = sin(t*0.9 + p.y*0.006)*0.6 + sin(t*1.7 + p.y*0.013 + 1.3)*0.4;
  d.x += m.r*(sway*9.0 + (noise(p*0.01 + t*0.4) - 0.5)*4.0)*uWind;
  d.y += m.r*sin(t*1.3 + p.x*0.01)*2.0*uWind;
  // cape and skirt: a soft wave running down the cloth
  float wave = sin(t*1.6 - p.y*0.018 + p.x*0.006);
  d.x += m.g*(wave*7.0 + (noise(p*0.012 + vec2(t*0.5, 0.0)) - 0.5)*5.0)*uWind;
  d.y += m.g*sin(t*1.2 - p.x*0.01)*3.0*uWind;
  vec2 sp = p - d;

  // the raised hand waves about the wrist
  float ang = (uWave*sin(t*7.0)*0.24 + sin(t*1.1)*0.03*uWind)*m.b;
  vec2 pivot = vec2(262.0, 395.0);
  sp = pivot + rot(sp - pivot, ang);

  // the pointing hand gives a little jab towards where it points
  float pw = smoothstep(820.0, 870.0, p.x)*smoothstep(345.0, 380.0, p.y)*(1.0 - smoothstep(470.0, 505.0, p.y));
  sp.x -= pw*uPoint*12.0*(0.5 + 0.5*sin(t*5.0));

  vec4 col = texture(uImg, sp/SIZE);

  // a blink: the lids come down over both eyes, following the tilt of her head
  if (uBlink > 0.01){
    for (int i = 0; i < 2; i++){
      vec2 e = i == 0 ? vec2(502.0, 160.0) : vec2(554.0, 182.0);
      vec2 l = rot(p - e, -0.38);
      float rx = 12.5, ry = 6.8;
      float inside = 1.0 - smoothstep(0.9, 1.05, length(l/vec2(rx, ry)));
      float edge = -ry + 1.75*ry*uBlink;
      if (inside > 0.0){
        vec2 lidAt = e + rot(vec2(l.x*0.9, -ry - 6.0), 0.38);
        vec3 lid = texture(uImg, lidAt/SIZE).rgb*0.93;
        float cover = inside*(1.0 - smoothstep(edge - 0.6, edge + 0.6, l.y));
        col.rgb = mix(col.rgb, lid*col.a, cover);
        float lash = inside*(1.0 - smoothstep(0.6, 1.5, abs(l.y - edge)))*smoothstep(0.05, 0.3, uBlink);
        col.rgb = mix(col.rgb, vec3(0.2, 0.12, 0.09)*col.a, lash*0.85);
      }
    }
  }
  outColor = col;
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

class MascotArt {
  constructor(host) {
    this.host = host;
    this.canvas = host.querySelector('.mk-canvas');
    this.start = performance.now();
    this.last = 0;
    this.wave = 0; this.waveTo = 0;
    this.point = 0; this.pointTo = 0;
    this.blinkAt = -1e9;
    this.running = false;
    this.visible = false;
    this.wind = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1;
    this.cap = matchMedia('(pointer: coarse)').matches ? 33 : 0;
    this.init().catch(() => this.fallback());
  }

  async init() {
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error('no WebGL');
    this.gl = gl;
    const [img, motion] = await Promise.all([loadImage('assets/mascot/mini-kunjal.webp'), loadImage('assets/mascot/motion.webp')]);
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = (im, unit, premul, mip) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (mip) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
    };
    tex(img, 0, true, true);
    tex(motion, 1, false, false);
    const u = (n) => gl.getUniformLocation(prog, n);
    gl.uniform1i(u('uImg'), 0);
    gl.uniform1i(u('uMotion'), 1);
    this.u = { res: u('uRes'), time: u('uTime'), wave: u('uWave'), point: u('uPoint'), blink: u('uBlink'), wind: u('uWind') };
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.fallback(); });
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.host.classList.add('mk-live');
    this.run();
  }

  // without WebGL she is still there, as her painting
  fallback() {
    this.gl = null;
    this.host.classList.remove('mk-live');
  }

  resize() {
    if (!this.gl) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  blink() { this.blinkAt = performance.now(); }

  // only drawn while she is on screen
  setVisible(on) {
    this.visible = on;
    if (on) this.run();
  }

  run() {
    if (this.running || !this.gl || !this.visible) return;
    this.running = true;
    const frame = (now) => {
      if (!this.gl || !this.visible || document.hidden) { this.running = false; return; }
      requestAnimationFrame(frame);
      if (this.cap && now - this.last < this.cap - 2) return;
      const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
      this.last = now;
      const k = 1 - Math.exp(-dt * 6);
      this.wave += (this.waveTo - this.wave) * k;
      this.point += (this.pointTo - this.point) * k;
      const bt = (now - this.blinkAt) / 150;
      const blink = bt >= 0 && bt < 2 ? 1 - Math.abs(1 - bt) : 0;
      const gl = this.gl, u = this.u;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u.res, this.canvas.width, this.canvas.height);
      gl.uniform1f(u.time, (now - this.start) / 1000);
      gl.uniform1f(u.wave, this.wave);
      gl.uniform1f(u.point, this.point);
      gl.uniform1f(u.blink, blink);
      gl.uniform1f(u.wind, this.wind);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    requestAnimationFrame(frame);
  }
}

export class Mascot {
  constructor({ onShowProjects }) {
    this.onShowProjects = onShowProjects;
    this.taps = 0;
    this.jokeIndex = Math.floor(Math.random() * JOKES.length);
    this.away = store.get('mk-away') === '1';
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const el = document.createElement('aside');
    el.className = 'mascot';
    el.setAttribute('aria-label', 'Mini Kunjal, your guide');
    el.innerHTML = `
      <div class="mk-bubble" role="status" aria-live="polite" hidden>
        <p class="mk-text"></p>
        <div class="mk-actions"></div>
      </div>
      <button class="mk-figure" type="button" aria-label="Say hi to mini Kunjal">
        <span class="mk-art"><img class="mk-still" src="assets/mascot/mini-kunjal.webp" alt="" draggable="false"><canvas class="mk-canvas"></canvas></span>
        <span class="mk-spark" aria-hidden="true"></span>
      </button>
      <button class="mk-dismiss" type="button" aria-label="Send mini Kunjal away" title="Send her away">×</button>`;
    const sprig = document.createElement('button');
    sprig.className = 'mk-sprig';
    sprig.type = 'button';
    sprig.title = 'Bring mini Kunjal back';
    sprig.setAttribute('aria-label', 'Bring mini Kunjal back');
    sprig.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 C12 14 12 9 12 4" stroke="#7d9a68" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 12 C7 12 5 9 5 6 C9 6 12 8 12 12 Z M12 9 C16 9 19 7 19 4 C15 4 12 6 12 9 Z" fill="#a9bf94"/><circle cx="12" cy="4" r="2.4" fill="#f29fb2"/></svg>';
    document.body.append(el, sprig);
    this.el = el;
    this.sprig = sprig;
    this.bubble = el.querySelector('.mk-bubble');
    this.text = el.querySelector('.mk-text');
    this.actions = el.querySelector('.mk-actions');
    this.art = new MascotArt(el.querySelector('.mk-art'));

    el.querySelector('.mk-figure').addEventListener('click', () => this.tapped());
    el.querySelector('.mk-dismiss').addEventListener('click', () => this.dismiss());
    sprig.addEventListener('click', () => this.recall());
    this.scheduleBlink();
    this.setAway(this.away, true);
  }

  // ---- presence ----
  setAway(away, instant = false) {
    this.away = away;
    this.syncArt();
    document.body.classList.toggle('mk-away', away);
    if (instant) this.el.classList.add('mk-instant');
    requestAnimationFrame(() => this.el.classList.remove('mk-instant'));
  }

  dismiss() {
    this.say(null);
    this.setAway(true);
    store.set('mk-away', '1');
    clearTimeout(this.jokeTimer);
  }

  recall() {
    this.setAway(false);
    store.set('mk-away', '0');
    this.pose('wave', 1600);
    this.say('I’m back! ♡', null, 3200);
    this.scheduleJoke();
  }

  // the sky is her place; during journeys and inside rooms she steps aside
  syncArt() {
    this.art?.setVisible(!this.away && !this.offstage);
  }

  setScene(onSky) {
    this.offstage = !onSky;
    this.syncArt();
    document.body.classList.toggle('mk-offstage', !onSky);
    if (!onSky) { this.say(null); clearTimeout(this.jokeTimer); }
    else this.scheduleJoke();
  }

  // ---- first meeting ----
  greet() {
    if (this.away) return;
    const seen = store.get('mk-seen') === '1';
    store.set('mk-seen', '1');
    this.pose('wave', 2200);
    if (seen) {
      this.say(GREETING_BACK[0], null, 4200);
      this.scheduleJoke();
      return;
    }
    this.say(GREETING_NEW[0], null, 3600).then(() => {
      if (this.away || document.body.classList.contains('mk-offstage')) return;
      this.pose('point');
      this.say(GREETING_NEW[1], [
        { label: 'Show me ✨', act: () => { this.say(null); this.pose(null); this.onShowProjects(); } },
        { label: 'Later', quiet: true, act: () => { this.say('Okay! I’ll be right here.', null, 2400); this.pose(null); } },
      ], 9000).then(() => this.pose(null));
      this.scheduleJoke();
    });
  }

  // ---- reactions ----
  tapped() {
    this.taps += 1;
    this.el.classList.remove('mk-hop');
    void this.el.offsetWidth;
    this.el.classList.add('mk-hop');
    this.burst();
    if (this.taps % 3 === 0) this.joke();
    else this.say(TAPS[(this.taps - 1) % TAPS.length], null, 2000);
  }

  joke() {
    const j = JOKES[this.jokeIndex % JOKES.length];
    this.jokeIndex += 1;
    this.pose('talk', 2600);
    this.say(j, null, 6500);
  }

  // every minute or so on the sky, she has something to share
  scheduleJoke() {
    clearTimeout(this.jokeTimer);
    if (this.away) return;
    this.jokeTimer = setTimeout(() => {
      const busy = !this.bubble.hidden || document.body.classList.contains('mk-offstage') || document.hidden;
      if (!busy && !this.away) this.joke();
      this.scheduleJoke();
    }, 55000 + Math.random() * 35000);
  }

  // ---- the speech bubble ----
  say(text, actions = null, ms = 4000) {
    clearTimeout(this.sayTimer);
    if (!text) {
      this.bubble.classList.remove('mk-open');
      this.hideTimer = setTimeout(() => { this.bubble.hidden = true; }, 350);
      this.el.classList.remove('mk-speaking');
      this.resolveSay?.();
      return Promise.resolve();
    }
    clearTimeout(this.hideTimer);
    this.resolveSay?.();
    this.text.textContent = text;
    this.actions.innerHTML = '';
    for (const a of actions || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.quiet ? 'mk-btn mk-quiet' : 'mk-btn';
      b.textContent = a.label;
      b.addEventListener('click', (e) => { e.stopPropagation(); a.act(); });
      this.actions.append(b);
    }
    this.actions.hidden = !actions;
    this.bubble.hidden = false;
    requestAnimationFrame(() => this.bubble.classList.add('mk-open'));
    this.el.classList.add('mk-speaking');
    return new Promise((resolve) => {
      this.resolveSay = resolve;
      this.sayTimer = setTimeout(() => {
        this.bubble.classList.remove('mk-open');
        this.el.classList.remove('mk-speaking');
        this.hideTimer = setTimeout(() => { this.bubble.hidden = true; }, 350);
        this.resolveSay = null;
        resolve();
      }, ms);
    });
  }

  // wave, point or talk; null returns her to floating
  pose(name, ms) {
    clearTimeout(this.poseTimer);
    this.el.classList.remove('mk-wave', 'mk-point', 'mk-talking');
    if (name) this.el.classList.add(name === 'talk' ? 'mk-talking' : `mk-${name}`);
    this.art.waveTo = name === 'wave' ? 1 : 0;
    this.art.pointTo = name === 'point' ? 1 : 0;
    if (name && ms) this.poseTimer = setTimeout(() => this.pose(null), ms);
  }

  blink() {
    this.art.blink();
  }

  scheduleBlink() {
    setTimeout(() => {
      this.blink();
      if (Math.random() < 0.25) setTimeout(() => this.blink(), 260); // a double blink now and then
      this.scheduleBlink();
    }, 2600 + Math.random() * 3800);
  }

  // a little cloud of petals and sparkles around her
  burst() {
    if (this.reduced) return;
    const host = this.el.querySelector('.mk-spark');
    for (let i = 0; i < 9; i++) {
      const p = document.createElement('i');
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
      const d = 34 + Math.random() * 26;
      p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      p.style.setProperty('--dy', `${Math.sin(a) * d - 12}px`);
      p.style.setProperty('--hue', ['#f29fb2', '#fff4f5', '#e9c46a', '#f7b9c6'][i % 4]);
      p.textContent = i % 3 === 0 ? '✦' : i % 3 === 1 ? '♡' : '•';
      host.append(p);
      setTimeout(() => p.remove(), 1000);
    }
  }
}
