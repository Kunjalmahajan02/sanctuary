// The four rooms. Each one is a painted interior (see interior.js) with the
// content set into it: plaques on the glasshouse floor, a log beside the
// telescope, frames in the pavilion, a letter by the postbox.
import { PROFILE, ROOMS, PROJECTS, RESEARCH, CREATIVE, ABOUT } from './content.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ext = (href, label, cls = '') => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${label}<span class="sr"> (opens in a new tab)</span></a>`;

function title(room, extra = '') {
  const meta = ROOMS[room];
  return `<span class="eyebrow">${esc(meta.kind)}</span><h1 id="room-title">${esc(meta.name)}</h1><p class="blurb">${esc(meta.blurb)}</p>${extra}`;
}

// ---------- the glasshouse ----------

function plaques(active) {
  return `<ol class="plaques" aria-label="Projects">${PROJECTS.map((p, i) => `
    <li><a class="plaque${p.id === active ? ' on' : ''}" href="#/projects/${p.id}"${p.id === active ? ' aria-current="true"' : ''}>
      <span class="no">No. ${String(i + 1).padStart(2, '0')}</span>
      <strong>${esc(p.title)}</strong>
      <span class="line">${esc(p.line)}</span>
      <span class="badge ${p.verified ? 'ok' : ''}">${p.verified ? '◆ verified from code' : '◇ from résumé'}</span>
    </a></li>`).join('')}</ol>`;
}

function projectDetail(id) {
  const i = PROJECTS.findIndex((p) => p.id === id);
  const p = PROJECTS[i];
  if (!p) return '';
  const next = PROJECTS[(i + 1) % PROJECTS.length];
  const sec = (h, body) => (body ? `<section class="plate"><h4>${h}</h4>${body}</section>` : '');
  return `<article class="detail">
    <span class="no">No. ${String(i + 1).padStart(2, '0')} · ${esc(p.status)}</span>
    <h2>${esc(p.title)}</h2>
    <p class="lede">${esc(p.line)}</p>
    <div class="links">${(p.links || []).map((l) => ext(l.href, `${esc(l.label)} ↗`, 'pill')).join('')}${p.note ? `<span class="pill quiet">${esc(p.note)}</span>` : ''}</div>
    ${sec('The problem', `<p>${esc(p.problem)}</p>`)}
    ${sec('Why it matters', `<p>${esc(p.why)}</p>`)}
    ${sec('My approach', `<p>${esc(p.approach)}</p>${p.points ? `<ul>${p.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`)}
    <section class="plate"><h4>How it works</h4><ol class="steps">${p.steps.map(([h, b], k) => `<li><span>${String(k + 1).padStart(2, '0')}</span><div><strong>${esc(h)}</strong><p>${esc(b)}</p></div></li>`).join('')}</ol></section>
    ${p.demo === 'morse' ? morseDemo() : ''}
    <section class="plate"><h4>Built with</h4><div class="chips">${p.stack.map((s) => `<span>${esc(s)}</span>`).join('')}</div>${p.extra ? `<p class="small">${esc(p.extra)}</p>` : ''}</section>
    <section class="plate seal ${p.verified ? 'ok' : ''}"><strong>${p.verified ? '◆ Verified from repository' : '◇ Not yet verified against code'}</strong><p>${esc(p.source)}</p></section>
    ${p.learned || p.improve ? `<section class="plate"><h4>Learned & next</h4>${p.learned ? `<ul>${p.learned.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${p.improve ? `<h5>What I’d improve</h5><ul>${p.improve.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>` : ''}
    ${p.testing ? `<section class="plate"><h4>Testing</h4><p>${esc(p.testing)}</p>${p.tests ? `<div class="table"><table><thead><tr><th>ID</th><th>Test</th><th>Documented result</th></tr></thead><tbody>${p.tests.map((r) => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>` : ''}
    <a class="next" href="#/projects/${next.id}"><span>Next specimen</span>${esc(next.title)} →</a>
  </article>`;
}

const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };

function morseDemo() {
  return `<section class="plate morse"><h4>Try the encoding</h4>
    <form class="morse-form"><label for="morse-in">Type a word to see it blinked</label>
    <div class="row"><input id="morse-in" maxlength="12" value="SOS" autocomplete="off"><button type="submit">Blink it</button></div></form>
    <div class="eye" aria-hidden="true"><svg viewBox="0 0 120 60"><path class="lid-top" d="M8 30 Q60 -6 112 30"/><path class="lid-bot" d="M8 30 Q60 66 112 30"/><circle class="iris" cx="60" cy="30" r="13"/><circle cx="60" cy="30" r="5" class="pupil"/></svg></div>
    <p class="morse-out" aria-live="polite"></p>
    <p class="small">A browser demo of the encoding only — the real BlinkBridge reads blinks from a webcam with MediaPipe Face Mesh.</p></section>`;
}

function wireMorse(root) {
  const form = root.querySelector('.morse-form');
  if (!form) return;
  const eye = root.querySelector('.eye'), out = root.querySelector('.morse-out');
  let run = 0;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = ++run;
    const word = root.querySelector('#morse-in').value.toUpperCase().replace(/[^A-Z0-9 ]/g, '');
    const seq = [...word].map((ch) => (ch === ' ' ? '/' : MORSE[ch] || '')).join(' ');
    out.innerHTML = [...seq].map((c) => `<span>${c === '.' ? '●' : c === '-' ? '▬' : c === '/' ? ' / ' : ' '}</span>`).join('');
    const spans = out.querySelectorAll('span');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < seq.length; k++) {
      if (id !== run) return;
      const c = seq[k];
      if (c === '.' || c === '-') {
        spans[k].classList.add('on');
        eye.classList.add('shut');
        await wait(c === '.' ? 180 : 520);
        eye.classList.remove('shut');
        await wait(220);
      } else await wait(380);
    }
  });
}

function projects(sub) {
  const open = PROJECTS.some((p) => p.id === sub);
  return `<header class="stage-title">${title('projects')}</header>
    ${plaques(sub)}
    <aside class="folio right${open ? ' open' : ''}" aria-label="Project details"${open ? '' : ' hidden'}>
      <a class="folio-close" href="#/projects" aria-label="Close project">×</a>
      <div class="folio-scroll">${open ? projectDetail(sub) : ''}</div>
    </aside>`;
}

// ---------- the observatory ----------

function research() {
  return `<aside class="folio left open log-folio" aria-labelledby="room-title">
    <div class="folio-scroll">
      <header class="folio-head">${title('research')}<p class="intro">${esc(RESEARCH.intro)}</p></header>
      ${RESEARCH.groups.map((g) => `<section class="log"><h3>${esc(g.title)}</h3>${g.items.map(([sym, h, b]) => `
        <article class="entry"><span class="sym">${sym}</span><div><h4>${esc(h)}</h4><p>${esc(b)}</p></div></article>`).join('')}</section>`).join('')}
    </div>
  </aside>`;
}

// ---------- the pavilion ----------

function creative() {
  return `<header class="stage-title left">${title('creative', `<blockquote class="quote">${esc(CREATIVE.quote)}</blockquote>
      <div class="chips also" aria-label="Also me">${CREATIVE.also.map((a) => `<span>${esc(a)}</span>`).join('')}</div>`)}</header>
    <div class="gallery">${CREATIVE.features.map((f) => `
      <figure class="frame" tabindex="0"><div class="arch"><img src="${esc(f.img)}" alt="${esc(f.title)}" loading="lazy" decoding="async"></div>
      <figcaption><h3>${esc(f.title)}</h3><p>${esc(f.line)}</p>${f.notes.length ? `<ul>${f.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</figcaption></figure>`).join('')}</div>`;
}

// ---------- the post garden ----------

function contact() {
  return `<aside class="folio left open letter-folio" aria-labelledby="room-title">
    <div class="folio-scroll">
      <header class="folio-head">${title('contact')}</header>
      <article class="letter">
        <p class="dear">dear visitor,</p>
        <p>${esc(ABOUT.bio)}</p>
        <p>Want to talk about a project, an opportunity or an idea? Write to me — I read every message.</p>
        <p class="sign">— Kunjal, ${esc(PROFILE.place)}</p>
        <span class="wax" aria-hidden="true">K</span>
      </article>
      <div class="ways">
        <a class="way" href="mailto:${esc(PROFILE.email)}"><span class="ico">✉</span><span><strong>Email</strong><em>${esc(PROFILE.email)}</em></span></a>
        <button class="way copy" type="button" data-copy="${esc(PROFILE.email)}"><span class="ico">⧉</span><span><strong>Copy email</strong><em class="copy-msg">to your clipboard</em></span></button>
        ${ext(PROFILE.resume, '<span class="ico">❦</span><span><strong>Résumé</strong><em>read or download the PDF ↗</em></span>', 'way')}
        ${ext(PROFILE.github, '<span class="ico">⌥</span><span><strong>GitHub</strong><em>Kunjalmahajan02 ↗</em></span>', 'way')}
        ${ext(PROFILE.linkedin, '<span class="ico">in</span><span><strong>LinkedIn</strong><em>kunjal-mahajan ↗</em></span>', 'way')}
      </div>
      <details class="almanac"><summary>A little more about me <span aria-hidden="true">＋</span></summary>
        <section><h4>Education</h4>${ABOUT.education.map(([a, b, c]) => `<p><strong>${esc(a)}</strong><br>${esc(b)}<br><em>${esc(c)}</em></p>`).join('')}</section>
        <section><h4>Leadership</h4><ul>${ABOUT.leadership.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
        <section><h4>Certifications</h4><ul>${ABOUT.certifications.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
        <section><h4>Skills</h4>${ABOUT.skills.map(([h, xs]) => `<h5>${esc(h)}</h5><div class="chips">${xs.map((x) => `<span>${esc(x)}</span>`).join('')}</div>`).join('')}</section>
      </details>
    </div>
  </aside>`;
}

const RENDER = { projects, research, creative, contact };

export function renderRoom(el, room, sub) {
  el.dataset.room = room;
  el.querySelector('.room-body').innerHTML = RENDER[room](sub);
  for (const a of el.querySelectorAll('.room-nav a')) a.toggleAttribute('aria-current', a.dataset.room === room);
  wireMorse(el);
  const copy = el.querySelector('.copy');
  if (copy) copy.addEventListener('click', async () => {
    const msg = copy.querySelector('.copy-msg');
    try { await navigator.clipboard.writeText(copy.dataset.copy); msg.textContent = 'copied ♡'; }
    catch { msg.textContent = copy.dataset.copy; }
  });
  // staggered arrival once we are inside
  el.querySelectorAll('.stage-title, .plaques > li, .folio.left, .gallery > .frame').forEach((n, i) => {
    n.style.setProperty('--i', Math.min(i, 10));
    n.classList.add('rise');
  });
}

// opening or switching a project inside the glasshouse without rebuilding the room
export function showProject(el, sub) {
  const folio = el.querySelector('.folio.right');
  const list = el.querySelector('.plaques');
  if (!folio || !list) return false;
  const open = PROJECTS.some((p) => p.id === sub);
  list.outerHTML = plaques(sub);
  folio.querySelector('.folio-scroll').innerHTML = open ? projectDetail(sub) : '';
  folio.querySelector('.folio-scroll').scrollTop = 0;
  if (open) folio.hidden = false;
  requestAnimationFrame(() => folio.classList.toggle('open', open));
  if (!open) setTimeout(() => { if (!folio.classList.contains('open')) folio.hidden = true; }, 700);
  wireMorse(el);
  return true;
}

// ambient particles in a room: dust in the light, stars, petals, drifting seeds
export class RoomFX {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = null;
    this.p = [];
    this.t = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.c.width = innerWidth * this.dpr;
    this.c.height = innerHeight * this.dpr;
    this.w = innerWidth; this.h = innerHeight;
  }

  set(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const n = { dust: 60, stars: 220, petals: 34, seeds: 26 }[mode] || 0;
    this.p = Array.from({ length: n }, () => this.spawn(true));
  }

  spawn(init) {
    const R = Math.random, w = this.w, h = this.h;
    switch (this.mode) {
      case 'stars': return { x: R() * w, y: R() * h * 0.85, r: R() ** 3 * 1.6 + 0.3, ph: R() * 6.3, sp: 0.5 + R() * 2 };
      case 'petals': return { x: R() * w * 1.2 - w * 0.1, y: init ? R() * h : -20, vx: 10 + R() * 25, vy: 18 + R() * 26, rot: R() * 6.3, spin: (R() - 0.5) * 2, tu: R() * 6.3, s: 4 + R() * 5 };
      case 'seeds': return { x: init ? R() * w : -20, y: R() * h, vx: 8 + R() * 14, vy: -3 - R() * 6, ph: R() * 6.3, s: 5 + R() * 4 };
      default: return { x: R() * w, y: init ? R() * h : h + 10, vx: (R() - 0.3) * 6, vy: -2 - R() * 6, r: 0.6 + R() * 1.6, ph: R() * 6.3 };
    }
  }

  frame(dt) {
    const { ctx } = this;
    this.t += dt;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const t = this.t;
    if (this.mode === 'stars') {
      for (const s of this.p) {
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        ctx.fillStyle = `rgba(255,246,228,${a * 0.9})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
        if (s.r > 1.4) { ctx.fillStyle = `rgba(255,236,200,${a * 0.12})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, 6.283); ctx.fill(); }
      }
      // a rare shooting star
      if (!this.meteor && Math.random() < dt / 9) this.meteor = { x: Math.random() * this.w * 0.7, y: Math.random() * this.h * 0.35, l: 0 };
      if (this.meteor) {
        const m = this.meteor; m.l += dt;
        const k = m.l / 0.9, x = m.x + k * 260, y = m.y + k * 110;
        const g = ctx.createLinearGradient(x - 120, y - 50, x, y);
        g.addColorStop(0, 'rgba(255,240,210,0)'); g.addColorStop(1, `rgba(255,248,230,${0.8 * (1 - k)})`);
        ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 120, y - 50); ctx.lineTo(x, y); ctx.stroke();
        if (k >= 1) this.meteor = null;
      }
      return;
    }
    for (let i = 0; i < this.p.length; i++) {
      const q = this.p[i];
      if (this.mode === 'petals') {
        q.x += (q.vx + Math.sin(t + q.tu) * 12) * dt; q.y += q.vy * dt; q.rot += q.spin * dt; q.tu += dt * 2.4;
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(1, 0.3 + 0.7 * Math.abs(Math.cos(q.tu)));
        ctx.fillStyle = i % 4 ? 'rgba(242,170,190,0.85)' : 'rgba(255,240,244,0.9)';
        ctx.beginPath(); ctx.moveTo(-q.s, 0);
        ctx.bezierCurveTo(-q.s * 0.4, -q.s * 0.75, q.s * 0.6, -q.s * 0.6, q.s, 0);
        ctx.bezierCurveTo(q.s * 0.6, q.s * 0.6, -q.s * 0.4, q.s * 0.75, -q.s, 0); ctx.fill(); ctx.restore();
        if (q.y > this.h + 20 || q.x > this.w + 30) this.p[i] = this.spawn(false);
      } else if (this.mode === 'seeds') {
        // dandelion seeds
        q.x += (q.vx + Math.sin(t * 0.8 + q.ph) * 6) * dt; q.y += (q.vy + Math.cos(t * 0.6 + q.ph) * 5) * dt;
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.sin(t + q.ph) * 0.3);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, q.s * 1.6); ctx.stroke();
        for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * q.s, Math.sin(a) * q.s); ctx.stroke(); }
        ctx.fillStyle = 'rgba(160,130,90,0.7)'; ctx.beginPath(); ctx.ellipse(0, q.s * 1.7, 0.9, 1.6, 0, 0, 6.283); ctx.fill(); ctx.restore();
        if (q.x > this.w + 30 || q.y < -30) this.p[i] = this.spawn(false);
      } else {
        // dust turning in the glasshouse light
        q.x += (q.vx + Math.sin(t * 0.5 + q.ph) * 4) * dt; q.y += q.vy * dt;
        const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + q.ph));
        ctx.fillStyle = `rgba(255,236,190,${a})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.283); ctx.fill();
        if (q.y < -10) this.p[i] = this.spawn(false);
      }
    }
  }
}
