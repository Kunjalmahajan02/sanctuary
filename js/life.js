// Small living things drawn over the painting, in painting coordinates so they
// travel with the camera: drifting pollen in the sunlight, blossom petals on
// the wind, a few distant birds and two butterflies over the flower beds.

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

// shared breeze, also felt by the shader's leaves
export function breeze(t) {
  return 0.6 + 0.4 * Math.sin(t * 0.21) * Math.sin(t * 0.077 + 1.3);
}

const BLOSSOM_TREES = [[862, 168], [820, 150], [1530, 392], [1585, 410], [1060, 404], [668, 140]];
const FLOWER_BEDS = [[1450, 520], [1010, 525], [1240, 470]];

// soft glowing mote, rendered once and stamped
function moteSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,246,220,0.85)');
  g.addColorStop(0.35, 'rgba(255,226,170,0.35)');
  g.addColorStop(1, 'rgba(255,220,160,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return c;
}

export class Life {
  constructor(canvas, scene) {
    this.sprite = moteSprite();
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = scene;
    this.t = 0;
    this.reduced = scene.motion < 1;
    this.motes = Array.from({ length: 46 }, () => this.mote(true));
    this.petals = Array.from({ length: 12 }, () => this.petal(true));
    this.birds = [];
    this.nextFlock = rand(4, 9);
    this.flies = FLOWER_BEDS.slice(0, 2).map(([x, y], i) => ({
      ax: x, ay: y, x, y, seed: rand(0, 100), hue: i ? '#fff6dc' : '#fbe3ef', flap: rand(0, TAU),
    }));
    this.resize();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.c.width = Math.round(this.scene.vw * dpr);
    this.c.height = Math.round(this.scene.vh * dpr);
  }

  mote(initial) {
    // pollen hangs mostly in the warm air near the sun and around the islands
    const nearSun = Math.random() < 0.45;
    return {
      x: nearSun ? rand(0, 700) : rand(300, 1672),
      y: nearSun ? rand(120, 520) : rand(80, 700),
      r: rand(0.6, 1.7),
      vx: rand(1.5, 5), vy: rand(-1.2, 0.6),
      ph: rand(0, TAU), life: initial ? rand(0, 1) : 0, span: rand(9, 20),
    };
  }

  petal(initial) {
    const [tx, ty] = BLOSSOM_TREES[(Math.random() * BLOSSOM_TREES.length) | 0];
    return {
      x: tx + rand(-30, 30), y: ty + rand(-15, 15),
      vx: rand(8, 16), vy: rand(4, 9),
      rot: rand(0, TAU), spin: rand(-1.4, 1.4), tumble: rand(0, TAU), tumbleSpeed: rand(1.5, 3.2),
      size: rand(2.2, 3.6), white: Math.random() < 0.3,
      life: initial ? rand(0, 0.8) : 0, span: rand(14, 26),
    };
  }

  flock() {
    const n = (rand(2, 6)) | 0;
    const y0 = rand(70, 250), x0 = -30, sp = rand(16, 24), s = rand(4, 6.5);
    for (let i = 0; i < n; i++) {
      this.birds.push({
        x: x0 - i * rand(14, 26), y: y0 + rand(-14, 14) + i * rand(-3, 5),
        vx: sp * rand(0.95, 1.05), vy: rand(-0.6, 0.4), s: s * rand(0.85, 1.1),
        flap: rand(0, TAU), glide: 0,
      });
    }
  }

  update(dt) {
    if (this.reduced) dt *= 0.3;
    this.t += dt;
    const w = breeze(this.t);

    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.life += dt / m.span;
      m.x += (m.vx * w + Math.sin(this.t * 0.7 + m.ph) * 2) * dt;
      m.y += (m.vy + Math.cos(this.t * 0.5 + m.ph) * 1.5) * dt;
      if (m.life >= 1) this.motes[i] = this.mote(false);
    }
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      p.life += dt / p.span;
      p.x += (p.vx * (0.4 + w) + Math.sin(this.t * 1.1 + p.tumble) * 5) * dt;
      p.y += (p.vy + Math.sin(this.t * 1.7 + p.rot) * 3) * dt;
      p.rot += p.spin * dt;
      p.tumble += p.tumbleSpeed * dt;
      if (p.life >= 1 || p.x > 1720) this.petals[i] = this.petal(false);
    }
    this.nextFlock -= dt;
    if (this.nextFlock <= 0) { this.flock(); this.nextFlock = rand(20, 40); }
    for (const b of this.birds) {
      // flap a few beats, then glide, like swifts high over a valley
      b.glide -= dt;
      if (b.glide < -rand(1.2, 2.2)) b.glide = rand(1.5, 3);
      b.flap += dt * (b.glide > 0 ? 0 : 9);
      b.x += b.vx * dt;
      b.y += (b.vy + Math.sin(this.t * 0.4 + b.s) * 1.2) * dt;
    }
    this.birds = this.birds.filter((b) => b.x < 1720);
    for (const f of this.flies) {
      f.seed += dt;
      f.x = f.ax + Math.sin(f.seed * 0.53) * 40 + Math.sin(f.seed * 1.31) * 14;
      f.y = f.ay + Math.sin(f.seed * 0.71 + 1) * 18 + Math.cos(f.seed * 1.9) * 6;
      f.flap += dt * 26;
    }
  }

  draw() {
    const { ctx, scene, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.c.width, this.c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const z = scene.cam.z * (scene.vw / (1672 * scene.visible()[0]));
    const fade = 1 - scene.veil;
    if (fade <= 0.01) return;
    ctx.globalAlpha = fade;

    // pollen
    for (const m of this.motes) {
      const [x, y] = scene.toScreen(m.x, m.y);
      const a = Math.sin(m.life * Math.PI) * (0.55 + 0.45 * Math.sin(this.t * 2.3 + m.ph));
      if (!(a > 0.02) || !Number.isFinite(x + y)) continue;
      const r = m.r * Math.max(z, 0.7) * 3;
      ctx.globalAlpha = fade * a;
      ctx.drawImage(this.sprite, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = fade;

    // petals: a little ellipse that tumbles (squashes) as it turns in the air
    for (const p of this.petals) {
      const [x, y] = scene.toScreen(p.x, p.y);
      const a = Math.min(1, p.life * 6) * Math.min(1, (1 - p.life) * 4);
      const s = p.size * Math.max(z, 0.7);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.tumble)));
      ctx.globalAlpha = fade * a * 0.92;
      ctx.fillStyle = p.white ? '#fbeff0' : '#f2bccb';
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.bezierCurveTo(-s * 0.4, -s * 0.75, s * 0.6, -s * 0.6, s, 0);
      ctx.bezierCurveTo(s * 0.6, s * 0.6, -s * 0.4, s * 0.75, -s, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = fade;

    // distant birds, hazy with distance
    ctx.lineCap = 'round';
    for (const b of this.birds) {
      const [x, y] = scene.toScreen(b.x, b.y);
      const s = b.s * Math.max(z, 0.7);
      const lift = b.glide > 0 ? 0.12 : Math.sin(b.flap);
      ctx.strokeStyle = 'rgba(86,70,84,0.55)';
      ctx.lineWidth = Math.max(0.9, s * 0.18);
      ctx.beginPath();
      ctx.moveTo(x - s, y - lift * s * 0.7);
      ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.25 - lift * s * 0.2, x, y);
      ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.25 - lift * s * 0.2, x + s, y - lift * s * 0.7);
      ctx.stroke();
    }

    // butterflies
    for (const f of this.flies) {
      const [x, y] = scene.toScreen(f.x, f.y);
      const s = 3.2 * Math.max(z, 0.7);
      const open = 0.25 + 0.75 * Math.abs(Math.sin(f.flap));
      ctx.fillStyle = f.hue;
      ctx.globalAlpha = fade * 0.9;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(x + dir * s * 0.55 * open, y - s * 0.2, s * 0.6 * open, s * 0.75, dir * 0.4, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + dir * s * 0.4 * open, y + s * 0.45, s * 0.4 * open, s * 0.45, dir * 0.6, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
