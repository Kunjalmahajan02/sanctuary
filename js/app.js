import { Scene, ISLANDS, IMG_W, IMG_H } from './scene.js';
import { Life } from './life.js';
import { renderRoom, showProject, RoomFX } from './rooms.js';
import { Interior, INTERIORS, prefetchRoom } from './interior.js';
import { Ambience } from './ambience.js';
import { ROOMS } from './content.js';

const $ = (s) => document.querySelector(s);
const body = document.body;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const scene = new Scene($('#sky'));
const life = new Life($('#life'), scene);
const roomEl = $('#room');
const fx = new RoomFX(roomEl.querySelector('.room-fx'));
let interior = null; // the painted inside of each palace, once WebGL is up
const ambience = new Ambience();
// start fetching the rooms right away: the one in the address first, then the rest
{
  const first = location.hash.replace(/^#\/?/, '').split('/')[0];
  const order = ['projects', 'research', 'creative', 'contact'];
  for (const r of order.includes(first) ? [first, ...order] : order) prefetchRoom(r).catch(() => {});
}
const DEBUG = location.search.includes('debug');
const trace = (m) => { if (DEBUG) (window.__trace ??= []).push(`${clock.toFixed(2)} ${m}`); };
if (DEBUG) window.sanctuary = { scene, life, state: () => ({ mode, current, camBlend, trace: window.__trace }) };
const frameEl = $('#frame');

// phones and narrow windows get a scrolling page with the scene in a frame;
// stepping into a place opens that frame out to the whole screen
const compactQuery = matchMedia('(max-width: 760px), (max-aspect-ratio: 5/4)');
let compact = compactQuery.matches;
body.classList.toggle('compact', compact);
compactQuery.addEventListener('change', (e) => {
  if (mode !== 'sky') return; // switch layouts only between journeys
  compact = e.matches;
  body.classList.toggle('compact', compact);
});
if (matchMedia('(pointer: coarse)').matches) scene.frameCap = 33;
scene.onResize = () => { life.resize(); labelHeights = null; };

// where each island's name card floats, in painting pixels
// (above the island; when the frame's top edge is too close, the alternative
// placement: under the rock or beside the island, never between two islands)
const LABEL_AT = {
  research: { top: [452, 140], alt: [447, 458], mode: 'below' },
  creative: { top: [760, 94], alt: [916, 214], mode: 'side' },
  contact: { top: null, alt: [792, 446], mode: 'side' },
  projects: { top: [1336, 90], alt: [1336, 112], mode: 'below' },
};
// each palace's entrance in painting pixels: its centre and [width, height].
// the camera flies to it and the room opens up from it
const DOORS = {
  research: { at: [476, 244], size: [12, 19] },  // the lit arch beneath the dome
  creative: { at: [749, 194], size: [24, 64] },  // between the columns, under the dome
  contact: { at: [645, 432], size: [15, 38] },   // the gazebo's lit doorway
  projects: { at: [1229, 380], size: [68, 116] }, // the arched glass doors above the steps
};

const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

// ---------- tweens ----------
const tweens = new Set();
function tween(dur, fn, curve = ease.inOut) {
  return new Promise((resolve) => {
    if (reduced) dur = Math.min(dur, 0.35);
    const tw = { t: 0, dur, fn, curve, resolve };
    tweens.add(tw);
  });
}
const wait = (s) => tween(s, () => {}, (t) => t);

// ---------- camera at rest ----------
let mode = 'intro';
let clock = 0;
let panX = 0.5; // user pan on narrow screens
const rest = { x: 0.5, y: 0.5, z: 1.04 };
function restCam(t) {
  const narrow = scene.vw / scene.vh < 1.25;
  // a slow, barely-there crane drift keeps the frame breathing
  const drift = reduced ? 0 : 1;
  return scene.clampCam({
    x: (narrow ? panX : rest.x) + Math.sin(t * 0.045) * 0.006 * drift,
    y: rest.y + Math.sin(t * 0.061 + 1) * 0.004 * drift,
    z: rest.z + (0.5 + 0.5 * Math.sin(t * 0.033)) * 0.018 * drift,
  });
}
let camBlend = 0; // 0 = resting camera, 1 = flight camera
const flight = { x: 0.5, y: 0.5, z: 1.04 };

// ---------- labels ----------
const labels = {};
for (const key of Object.keys(LABEL_AT)) {
  const b = document.createElement('button');
  b.className = 'label';
  b.type = 'button';
  b.dataset.room = key;
  b.innerHTML = `<span class="kind">${ROOMS[key].kind}</span><span class="name">${ROOMS[key].name}</span><i aria-hidden="true"></i>`;
  b.addEventListener('click', () => go(key));
  b.addEventListener('pointerenter', () => setHover(key));
  b.addEventListener('pointerleave', () => setHover(null));
  b.addEventListener('focus', () => setHover(key));
  b.addEventListener('blur', () => setHover(null));
  $('#labels').append(b);
  labels[key] = b;
}

// card heights are measured once per layout, never inside the frame loop
let labelHeights = null;
addEventListener('resize', () => { labelHeights = null; });
function placeLabels() {
  if (!labelHeights) labelHeights = Object.fromEntries(Object.entries(labels).map(([k, el]) => [k, el.offsetHeight || 70]));
  for (const [key, at] of Object.entries(LABEL_AT)) {
    const el = labels[key];
    const h = labelHeights[key];
    let useAlt = !at.top;
    let x, y;
    if (at.top) {
      [x, y] = scene.toScreen(...at.top);
      // a little hysteresis so a card never flickers between placements
      const wasAlt = el.dataset.mode && el.dataset.mode !== 'top';
      useAlt = y - h < (wasAlt ? 22 : 12);
    }
    const mode = useAlt ? at.mode : 'top';
    if (useAlt) [x, y] = scene.toScreen(...at.alt);
    if (el.dataset.mode !== mode) el.dataset.mode = mode;
    const shift = mode === 'below' ? 'translate(-50%, 0)' : mode === 'side' ? 'translate(0, -50%)' : 'translate(-50%, -100%)';
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) ${shift}`;
    const off = x < -40 || x > scene.vw + 40;
    if (el.classList.contains('offscreen') !== off) el.classList.toggle('offscreen', off);
  }
}

function setHover(key) {
  if (key === scene.hoverTarget) return;
  scene.hoverTarget = key;
  for (const [k, el] of Object.entries(labels)) el.classList.toggle('hot', k === key);
  for (const el of document.querySelectorAll('.compass button')) el.classList.toggle('hot', el.dataset.room === key);
  frameEl.style.cursor = key ? 'pointer' : '';
}

// ---------- pointer ----------
// positions inside the scene's own frame
function local(e) {
  const r = frameEl.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
let drag = null;
frameEl.addEventListener('pointermove', (e) => {
  const [x, y] = local(e);
  scene.par.tx = (x / scene.vw - 0.5) * 2;
  scene.par.ty = (y / scene.vh - 0.5) * 2;
  if (drag) {
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    const vis = scene.visible()[0] / scene.cam.z;
    panX = drag.pan - (dx / scene.vw) * vis;
    const c = scene.clampCam({ x: panX, y: 0.5, z: rest.z });
    panX = c.x;
    return;
  }
  if (mode === 'sky' && e.pointerType === 'mouse') setHover(scene.islandAt(x, y));
});
frameEl.addEventListener('pointerdown', (e) => {
  if (mode !== 'sky') return;
  drag = { x: e.clientX, pan: panX, moved: false };
});
addEventListener('pointerup', (e) => {
  const d = drag;
  drag = null;
  if (!d || d.moved || mode !== 'sky') return;
  if (e.target.closest('button, a') || !frameEl.contains(e.target)) return;
  const key = scene.islandAt(...local(e));
  if (key) go(key);
});
frameEl.addEventListener('pointerleave', () => { scene.par.tx = 0; scene.par.ty = 0; if (mode === 'sky') setHover(null); });

// ---------- routing ----------
function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let [room, sub] = parts;
  if (room === 'resume') room = 'contact';
  return ROOMS[room] ? { room, sub } : { room: null };
}

function go(room, sub) {
  location.hash = `#/${room}${sub ? '/' + sub : ''}`;
}

let current = null;
async function route() {
  const { room, sub } = parse();
  if (mode === 'intro') return; // the intro picks the route up when it finishes
  if (!room) {
    if (mode === 'room' || mode === 'entering') await leave();
    return;
  }
  if (mode === 'room' && current === room) {
    if (!showProject(roomEl, sub)) renderRoom(roomEl, room, sub);
    document.title = `${ROOMS[room].kind} · Kunjal Mahajan`;
    return;
  }
  if (mode === 'room') return swapRoom(room, sub);
  if (mode === 'sky') return enter(room, sub);
}
addEventListener('hashchange', route);

// ---------- journeys ----------
const FX = { projects: 'dust', research: 'dust', creative: 'petals', contact: 'seeds' };
const flash = roomEl.querySelector('.room-flash');

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// screen pixels per painting pixel at the current camera
const pxScale = () => (scene.vw * scene.cam.z) / (IMG_W * scene.visible()[0]);

// how close the camera comes to an entrance: near enough that the doorway
// is the subject, never so near that the painting turns soft
function approachZoom(room, from) {
  const h = DOORS[room].size[1];
  const framed = (0.3 * scene.vh * IMG_W * scene.visible()[0]) / (h * scene.vw);
  return Math.min(3.2, Math.max(from.z * 1.6, framed));
}

// where the interior camera rests: framed on the room, nudged aside when a
// folio covers one side of the painting
const insideCam = { x: 0.5, y: 0.5, z: 1.06 };
function insideRest(room, t) {
  const [fx, fy] = INTERIORS[room].focus;
  const folio = roomEl.querySelector('.folio.open');
  const shift = !folio ? 0 : folio.classList.contains('right') ? -0.06 : 0.06;
  const drift = reduced ? 0 : 1;
  return {
    x: fx + shift + Math.sin(t * 0.05) * 0.006 * drift,
    y: fy + Math.sin(t * 0.07 + 1) * 0.004 * drift,
    z: 1.06 + (0.5 + 0.5 * Math.sin(t * 0.037)) * 0.015 * drift,
  };
}

// crossing the threshold, u from 0 (outside) to 1 (inside): a full-frame
// dissolve, with the room taking over the forward movement and settling
function openAt(room, u) {
  scene.opening.u = smooth(0, 1, u);
  const rest = insideRest(room, clock);
  Object.assign(insideCam, { x: rest.x, y: rest.y, z: 1.0 + (rest.z + 0.02 - 1.0) * ease.out(u) });
}

// ---- phones: the framed scene opens out to the whole screen ----
let slot = null; // where the frame sits in the page, kept for the way back
const fullWidthAt1 = () => { const A = innerWidth / innerHeight, I = IMG_W / IMG_H; return A > I ? 1 : A / I; };
const clipTo = (r, k) => `inset(${(r.top * (1 - k)).toFixed(1)}px ${((innerWidth - r.right) * (1 - k)).toFixed(1)}px ${((innerHeight - r.bottom) * (1 - k)).toFixed(1)}px ${(r.left * (1 - k)).toFixed(1)}px round ${(18 * (1 - k)).toFixed(1)}px)`;

async function expandFrame(room) {
  // bring the frame to the middle of the screen first
  let r = frameEl.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) {
    scrollTo({ top: scrollY + r.top - (innerHeight - r.height) / 2, behavior: reduced ? 'auto' : 'smooth' });
    await wait(0.5);
    r = frameEl.getBoundingClientRect();
  }
  // 1. lean in towards the place until the frame shows what the full screen will
  const [dx, dy] = DOORS[room].at;
  const vxFrame = scene.visible()[0], vxFull = fullWidthAt1();
  const zMatch = Math.max(1.04, vxFrame / vxFull);
  const from = { ...scene.cam };
  Object.assign(flight, from);
  camBlend = 1;
  await tween(0.9, (k) => {
    flight.x = from.x + (dx / IMG_W - from.x) * k;
    flight.y = from.y + (dy / IMG_H - from.y) * k;
    flight.z = from.z * Math.pow(zMatch / from.z, k);
    scene.clampCam(flight);
  }, ease.inOut);
  // 2. the frame opens out to the whole screen with the same view across it
  slot = r;
  frameEl.style.clipPath = clipTo(r, 0);
  body.classList.add('immersive');
  scene.resize();
  flight.z = Math.max(1, (flight.z * vxFull) / vxFrame);
  scene.clampCam(flight);
  Object.assign(scene.cam, flight);
  await tween(0.7, (k) => { frameEl.style.clipPath = clipTo(r, k); }, ease.inOut);
  frameEl.style.clipPath = '';
}

async function collapseFrame() {
  const r = slot || frameEl.getBoundingClientRect();
  // pull back to the widest full-screen view of this spot, then fold the
  // screen back into the frame on the page and settle there
  const start = { ...flight };
  await tween(0.8, (k) => {
    flight.z = start.z * Math.pow(1 / start.z, k);
    scene.clampCam(flight);
  }, ease.inOut);
  await tween(0.7, (k) => { frameEl.style.clipPath = clipTo(r, 1 - k); }, ease.inOut);
  const vxFull = fullWidthAt1();
  body.classList.remove('immersive');
  frameEl.style.clipPath = '';
  scene.resize();
  flight.z = Math.max(1.04, (flight.z * scene.visible()[0]) / vxFull);
  scene.clampCam(flight);
  Object.assign(scene.cam, flight);
  slot = null;
}

async function enter(room, sub) {
  mode = 'entering';
  current = room;
  setHover(room);
  body.classList.add('travelling');
  renderRoom(roomEl, room, sub);
  fx.set(FX[room]);
  document.title = `${ROOMS[room].kind} · Kunjal Mahajan`;
  showStill(room);
  // the room finishes loading while we glide, so the camera never waits
  const ready = interior ? interior.use(room) : Promise.resolve();
  roomEl.classList.remove('arrived');
  body.dataset.room = room;
  trace('enter: start');
  await new Promise(requestAnimationFrame);
  trace('enter: frame');
  if (compact) await expandFrame(room);
  trace('enter: expanded');

  const [dx, dy] = DOORS[room].at;
  const from = { ...scene.cam };
  const zA = approachZoom(room, from);
  Object.assign(flight, from);
  camBlend = 1;
  tween(1.4, (k) => { scene.par.k = 1 - k; });

  // 1. glide across the sky and close in on the entrance, as one move
  // (on phones the frame has already leaned in, so the rest is shorter)
  await tween(compact ? 2.2 : 3.0, (k) => {
    const g = ease.inOut(Math.min(1, k / 0.8));
    flight.x = from.x + (dx / IMG_W - from.x) * g;
    flight.y = from.y + (dy / IMG_H - from.y) * g;
    flight.z = from.z * Math.pow(zA / from.z, ease.sine(k));
    scene.clampCam(flight);
    Object.assign(scene.cam, flight);
  }, (t) => t);
  trace('enter: glided');
  // never stand waiting at the door: if the room is still on its way, step in
  // on its painting and let the motion begin the moment it arrives
  const live = await Promise.race([ready.then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 2500))]);
  trace(`enter: ${live ? 'ready' : 'stepping in on the still'}`);
  if (!live) {
    roomEl.style.setProperty('--room-still', `url("${new URL(`assets/rooms/${INTERIORS[room].file}.webp`, document.baseURI).href}")`);
    roomEl.classList.add('still-entry');
    ready.then(() => {
      if (current !== room) return;
      roomEl.classList.remove('still-entry');
      showStill(room);
      if (mode === 'room') scene.view = 'room';
    }, () => {});
  }

  // 2. through the entrance: we keep moving in as the room takes over the view
  roomEl.hidden = false;
  roomEl.classList.add('shown');
  if (interior && live) scene.view = 'blend';
  const zB = zA * 1.25;
  await tween(1.9, (k) => {
    flight.z = zA * Math.pow(zB / zA, ease.out(k));
    scene.clampCam(flight);
    Object.assign(scene.cam, flight);
    openAt(room, k);
  }, (t) => t);

  if (interior && live) scene.view = 'room';
  scene.veil = 0;
  roomEl.classList.add('arrived');
  trace('enter: arrived');
  mode = 'room';
  setHover(null);
  roomEl.querySelector('.back').focus({ preventScroll: true });
  const now = parse();
  if (now.room !== room) route();
  else if (now.sub !== sub) showProject(roomEl, now.sub); // a project picked on the way in
}

// moving between rooms from inside: through a moment of warm light
async function swapRoom(room, sub) {
  mode = 'entering';
  roomEl.classList.remove('arrived');
  flash.classList.add('on');
  await wait(0.6);
  current = room;
  body.dataset.room = room;
  renderRoom(roomEl, room, sub);
  fx.set(FX[room]);
  showStill(room);
  if (interior) await interior.use(room);
  Object.assign(insideCam, insideRest(room, clock), { z: 1.02 });
  document.title = `${ROOMS[room].kind} · Kunjal Mahajan`;
  flash.classList.remove('on');
  roomEl.classList.add('arrived');
  await wait(0.8);
  mode = 'room';
  if (parse().room !== room) route();
}

async function leave() {
  const room = current || 'projects';
  mode = 'leaving';
  roomEl.classList.remove('arrived');
  const [dx, dy] = DOORS[room].at;
  const home = restCam(clock);
  const zA = approachZoom(room, home), zB = zA * 1.25;
  Object.assign(flight, scene.clampCam({ x: dx / IMG_W, y: dy / IMG_H, z: zB }));
  Object.assign(scene.cam, flight);
  camBlend = 1;
  scene.par.k = 0;
  openAt(room, 1);
  if (interior) scene.view = 'blend';
  await wait(0.2);

  // 1. step back out through the entrance: the sky returns over the whole view
  await tween(1.3, (k) => {
    flight.z = zB * Math.pow(zA / zB, ease.inOut(k));
    scene.clampCam(flight);
    Object.assign(scene.cam, flight);
    openAt(room, 1 - ease.inOut(k));
  }, (t) => t);

  scene.view = 'sky';
  roomEl.classList.remove('shown');
  roomEl.hidden = true;
  delete body.dataset.room;
  fx.set(null);
  current = null;
  document.title = 'Kunjal Mahajan — A Botanical Sanctuary';

  // 2. drift back out over the sky; the title returns as we arrive
  if (compact) {
    body.classList.remove('travelling');
    await collapseFrame();
  }
  const start = { ...flight };
  tween(1.8, (k) => { scene.par.k = k; });
  await tween(2.2, (k) => {
    const r = restCam(clock);
    flight.x = start.x + (r.x - start.x) * k;
    flight.y = start.y + (r.y - start.y) * k;
    flight.z = start.z * Math.pow(r.z / start.z, k);
    if (k > 0.55) body.classList.remove('travelling');
  }, ease.inOut);
  body.classList.remove('travelling');
  camBlend = 0;
  mode = 'sky';
  const label = labels[room];
  if (label && document.activeElement === document.body) label.focus({ preventScroll: true });
  if (parse().room) route();
}

// without WebGL the room still shows its painting, just without the motion
// (absolute, because a url() inside a custom property resolves against the stylesheet)
function showStill(room) {
  const src = new URL(`assets/rooms/${INTERIORS[room].file}.webp`, document.baseURI).href;
  roomEl.style.setProperty('--room-still', interior && !scene.lost ? 'none' : `url("${src}")`);
}

// ---------- per-frame ----------
scene.onFrame((dt) => {
  clock += dt;
  for (const tw of [...tweens]) {
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    tw.fn(tw.curve(tw.t));
    if (tw.t >= 1) { tweens.delete(tw); tw.resolve(); }
  }
  const r = restCam(clock);
  scene.resting = mode === 'sky' && !camBlend;
  if (camBlend) Object.assign(scene.cam, flight);
  else Object.assign(scene.cam, r);
  if (scene.view !== 'room') {
    life.update(dt);
    life.draw();
    placeLabels();
  }
  if (mode === 'entering' || mode === 'leaving' || mode === 'room') {
    fx.frame(dt);
    // once inside, the view eases towards its resting frame (and aside for a folio)
    if (mode === 'room' && current) {
      const target = insideRest(current, clock);
      const k = 1 - Math.exp(-dt * 1.6);
      insideCam.x += (target.x - insideCam.x) * k;
      insideCam.y += (target.y - insideCam.y) * k;
      insideCam.z += (target.z - insideCam.z) * k;
    }
    if (interior) Object.assign(interior.cam, insideCam);
  }
});

// ---------- UI wiring ----------
for (const b of document.querySelectorAll('.compass button')) {
  b.addEventListener('click', () => go(b.dataset.room));
  b.addEventListener('pointerenter', () => setHover(b.dataset.room));
  b.addEventListener('pointerleave', () => setHover(null));
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mode === 'room') location.hash = '#/';
});
$('#sound').addEventListener('click', () => {
  const on = ambience.toggle();
  $('#sound').setAttribute('aria-pressed', on);
  $('#sound .state').textContent = on ? 'on' : 'off';
});

// the painted inside of each palace, on the sky's own graphics context
function startInteriors() {
  try {
    if (!scene.gl || scene.lost) throw new Error('no WebGL');
    interior = new Interior(scene.gl);
    scene.interior = interior;
    interior.resize(scene.canvas.width, scene.canvas.height);
    // fetch the interiors quietly, the one asked for first
    const first = parse().room;
    for (const r of [first, 'projects', 'research', 'creative', 'contact']) if (r) interior.preload(r);
  } catch (err) {
    console.warn('Interiors unavailable, rooms show without their paintings:', err);
    interior = null;
    scene.interior = null;
  }
}

// ---------- opening shot ----------
async function intro() {
  try {
    await scene.init();
  } catch (err) {
    console.warn('Falling back to a still painting:', err);
    body.classList.add('no-gl');
    scene.startLoop();
  }
  const start = { x: rest.x, y: 0.58, z: 1.22 };
  Object.assign(flight, scene.clampCam(start));
  camBlend = 1;
  scene.veil = 1;
  scene.veilC = [0.06, 0.29];
  $('#loader').classList.add('gone');
  body.classList.add('ready');
  const s = { ...flight };
  const veil = tween(3.4, (k) => { scene.veil = 1 - k; }, ease.out);
  setTimeout(() => body.classList.add('titled'), reduced ? 0 : 1300);
  await tween(6.0, (k) => {
    const r = restCam(clock);
    flight.x = s.x + (r.x - s.x) * k;
    flight.y = s.y + (r.y - s.y) * k;
    flight.z = s.z * Math.pow(r.z / s.z, k);
  }, ease.inOut);
  await veil;
  camBlend = 0;
  mode = 'sky';
  body.classList.add('settled');
  startInteriors();
  // a lost graphics context shows the still paintings until it comes back
  scene.onLost = () => {
    body.classList.add('no-gl');
    if (current) showStill(current);
    // a room mid-crossing just shows its still, fully
    if (mode !== 'sky') { roomEl.hidden = false; roomEl.classList.add('shown'); }
  };
  scene.onRestored = () => {
    body.classList.remove('no-gl');
    startInteriors();
    if (current && interior) interior.use(current).then(() => { showStill(current); if (mode === 'room') scene.view = 'room'; });
  };
  if (parse().room) route();
}

if (!compact && innerWidth / innerHeight < 1.25) panX = 0.44;
intro();
