// Optional soundscape, synthesised so there are no audio files to load:
// falling water, a breeze that rises and settles, and the odd distant bird.

export class Ambience {
  constructor() {
    this.on = false;
    this.ctx = null;
  }

  build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 4;
    const white = ctx.createBuffer(2, len, ctx.sampleRate);
    const brown = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const w = white.getChannelData(c), b = brown.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const n = Math.random() * 2 - 1;
        w[i] = n;
        last = (last + 0.02 * n) / 1.02;
        b[i] = last * 3.5;
      }
    }
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // water: band-limited hiss with a slow swell
    const water = loop(white);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    water.connect(bp).connect(lp).connect(wg).connect(this.master);
    const swell = ctx.createOscillator(); swell.frequency.value = 0.09;
    const swellAmt = ctx.createGain(); swellAmt.gain.value = 0.012;
    swell.connect(swellAmt).connect(wg.gain); swell.start();

    // wind: brown noise through a slowly opening and closing filter
    const wind = loop(brown);
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 520; wl.Q.value = 0.8;
    const wgn = ctx.createGain(); wgn.gain.value = 0.11;
    wind.connect(wl).connect(wgn).connect(this.master);
    const gust = ctx.createOscillator(); gust.frequency.value = 0.055;
    const gustAmt = ctx.createGain(); gustAmt.gain.value = 260;
    gust.connect(gustAmt).connect(wl.frequency); gust.start();
    const gust2 = ctx.createOscillator(); gust2.frequency.value = 0.031;
    const gust2Amt = ctx.createGain(); gust2Amt.gain.value = 0.05;
    gust2.connect(gust2Amt).connect(wgn.gain); gust2.start();

    this.scheduleBird();
  }

  scheduleBird() {
    clearTimeout(this.birdTimer);
    this.birdTimer = setTimeout(() => {
      if (this.on) this.bird();
      this.scheduleBird();
    }, 5000 + Math.random() * 11000);
  }

  bird() {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.master);
    const notes = 2 + ((Math.random() * 4) | 0), base = 2600 + Math.random() * 1600;
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.11 + Math.random() * 0.06);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.25), t);
      o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.3), t + 0.07);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(pan);
      o.start(t); o.stop(t + 0.1);
    }
  }

  toggle() {
    if (!this.ctx) this.build();
    this.on = !this.on;
    const g = this.master.gain, now = this.ctx.currentTime;
    if (this.on) this.ctx.resume();
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(this.on ? 1 : 0, now + 1.8);
    return this.on;
  }
}
