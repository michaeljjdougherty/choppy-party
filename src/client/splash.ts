/**
 * Tiger Fish Interactive studio splash, shown once at boot before the title.
 *
 * A self-contained DOM overlay (no Three.js): the tiger-fish emblem leaps out of a wave, the
 * "TIGER FISH" wordmark slams down with Choppy Party confetti, then a slash CHOPS the screen in
 * two and the halves slide apart to reveal the game underneath (which keeps loading meanwhile).
 *
 * Any key, click, tap or gamepad button skips straight to the chop. `?splash=0` or automated
 * browsers (navigator.webdriver) skip it entirely; `?splash=1` forces it on for testing.
 */
import { sfx } from './sfx';

const PARTY = ['#ffd23f', '#ff5aa8', '#2f8cff', '#4cd97b', '#9a5bff', '#ff8a3d', '#5ef0e6'];
const TEAL = '#5fd8d2';
/** Seconds into the splash at which each beat happens. */
const T = { leap: 0.35, land: 1.05, slam: 1.35, sub: 1.7, chop: 3.6, end: 4.25 };
const SKIP_CHOP = 0.05;

let active = false;
export const splashActive = () => active;

export interface SplashOpts {
  /** Called on the first key/click/tap during the splash (the input is swallowed so it can't leak into the title). */
  onGesture?: () => void;
}

export function playSplash(opts: SplashOpts = {}): Promise<void> {
  const params = new URLSearchParams(location.search);
  const want = params.get('splash');
  if (want === '0' || (want !== '1' && (navigator as any).webdriver)) return Promise.resolve();
  active = true;
  const reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  injectStyle();
  const root = el('div', 'tfs');
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'Tiger Fish Interactive presents');
  // two identical halves of the scene, clipped along the chop line; they move apart at the end
  const halves = [scene('tfs-a'), scene('tfs-b')];
  for (const h of halves) root.append(h);
  const cv = el('canvas', 'tfs-fx') as HTMLCanvasElement;
  const slash = el('div', 'tfs-slash');
  const flash = el('div', 'tfs-flash');
  const hint = el('div', 'tfs-hint');
  hint.textContent = 'Press any button to skip';
  root.append(cv, flash, slash, hint);
  document.body.append(root);
  if (reduced) root.classList.add('tfs-calm');

  const ctx = cv.getContext('2d')!;
  const parts: Part[] = [];
  const fit = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the slash follows the clip line (0,62%) -> (100%,38%) at any aspect ratio
    root.style.setProperty('--cut', `${-Math.atan2(0.24 * innerHeight, innerWidth)}rad`);
  };
  fit();
  addEventListener('resize', fit);

  return new Promise<void>((resolve) => {
    // wait (briefly) for the logo pieces to decode so nothing pops in mid-leap
    let t0 = 0;
    const imgs = [...root.querySelectorAll('img')];
    Promise.race([
      Promise.all(imgs.map((i) => i.decode().catch(() => undefined))),
      new Promise((r) => setTimeout(r, 1500)),
    ]).then(() => (t0 = performance.now()));
    let chopAt = T.chop;
    let done = false;
    const fired = new Set<string>();
    const once = (k: string, at: number, t: number, fn: () => void) => {
      if (t >= at && !fired.has(k)) {
        fired.add(k);
        fn();
      }
    };
    const skip = () => {
      if (!t0) return void (chopAt = SKIP_CHOP);
      const t = (performance.now() - t0) / 1000;
      if (t < chopAt) chopAt = t + SKIP_CHOP;
    };
    let gestured = false;
    const swallow = (e: Event) => {
      if (!gestured) {
        gestured = true;
        opts.onGesture?.();
      }
      e.stopImmediatePropagation();
      if (e.type === 'keydown') e.preventDefault();
      skip();
    };
    const evs = ['keydown', 'pointerdown', 'touchstart'] as const;
    for (const ev of evs) addEventListener(ev, swallow, { capture: true, passive: false });
    // pads: only a fresh press skips (a button held since before the splash doesn't)
    const held = new Set<string>();
    const pollPads = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of pads) {
        if (!gp) continue;
        gp.buttons.forEach((b, i) => {
          const k = `${gp.index}:${i}`;
          if (b.pressed && !held.has(k)) skip();
          if (b.pressed) held.add(k);
          else held.delete(k);
        });
      }
    };

    let last = performance.now();
    const tick = (now: number) => {
      if (!t0) {
        pollPads();
        last = now;
        return void requestAnimationFrame(tick);
      }
      const t = (now - t0) / 1000;
      root.dataset.t = t.toFixed(2);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      pollPads();

      once('start', 0, t, () => root.classList.add('tfs-go'));
      once('leap', T.leap, t, () => {
        sfx.boing();
        splashDrops(parts, innerWidth / 2, innerHeight * 0.72);
      });
      once('land', T.land, t, () => sfx.land());
      once('slam', T.slam, t, () => {
        sfx.bump();
        sfx.gem();
        if (!reduced) root.classList.add('tfs-shake');
        flash.classList.add('tfs-on');
        confetti(parts, innerWidth / 2, innerHeight * 0.66, 140);
      });
      once('hint', 0.6, t, () => hint.classList.add('tfs-on'));
      once('chop', chopAt, t, () => {
        sfx.back();
        hint.classList.remove('tfs-on');
        slash.classList.add('tfs-on');
        root.classList.add('tfs-chop');
      });
      // the halves slide apart a beat after the slash lands
      once('split', chopAt + 0.12, t, () => root.classList.add('tfs-split'));

      stepParts(ctx, parts, dt);
      const endAt = chopAt + (T.end - T.chop);
      if (t >= endAt && !done) {
        done = true;
        for (const ev of evs) removeEventListener(ev, swallow, { capture: true } as any);
        removeEventListener('resize', fit);
        root.remove();
        active = false;
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** One copy of the scene: backdrop rays, wave, emblem, wordmark and the "presents" sticker. */
function scene(cls: string): HTMLElement {
  const s = el('div', `tfs-half ${cls}`);
  s.innerHTML = `
    <div class="tfs-bg"></div>
    <div class="tfs-rays"></div>
    <div class="tfs-dots"></div>
    <div class="tfs-stage">
      <div class="tfs-leap"><img class="tfs-emblem" src="splash/emblem.png" alt="" draggable="false"></div>
      <img class="tfs-title" src="splash/title.png" alt="" draggable="false">
      <img class="tfs-sub" src="splash/sub.png" alt="" draggable="false">
      <div class="tfs-tag">presents</div>
    </div>
    <svg class="tfs-wave" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 60 Q 75 20 150 60 T 300 60 T 450 60 T 600 60 T 750 60 T 900 60 T 1050 60 T 1200 60 V120 H0Z" fill="${TEAL}" opacity="0.35"/>
      <path d="M0 75 Q 75 40 150 75 T 300 75 T 450 75 T 600 75 T 750 75 T 900 75 T 1050 75 T 1200 75 V120 H0Z" fill="${TEAL}" opacity="0.6"/>
    </svg>`;
  return s;
}

interface Part {
  x: number; y: number; vx: number; vy: number; r: number; spin: number; a: number;
  life: number; max: number; color: string; kind: 'drop' | 'paper';
}

function splashDrops(parts: Part[], x: number, y: number) {
  for (let i = 0; i < 46; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const sp = 260 + Math.random() * 520;
    parts.push({
      x: x + (Math.random() - 0.5) * 140, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      r: 3 + Math.random() * 7, spin: 0, a: 0, life: 0, max: 0.9 + Math.random() * 0.6,
      color: Math.random() < 0.3 ? '#e9fffd' : TEAL, kind: 'drop',
    });
  }
}

function confetti(parts: Part[], x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    const sp = 300 + Math.random() * 700;
    parts.push({
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120, r: 6 + Math.random() * 8,
      spin: (Math.random() - 0.5) * 18, a: Math.random() * 6, life: 0, max: 1.8 + Math.random() * 1.2,
      color: PARTY[i % PARTY.length], kind: 'paper',
    });
  }
}

function stepParts(ctx: CanvasRenderingContext2D, parts: Part[], dt: number) {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt;
    if (p.life > p.max) {
      parts.splice(i, 1);
      continue;
    }
    const drag = p.kind === 'paper' ? 2.2 : 0.4;
    p.vx -= p.vx * drag * dt;
    p.vy += (p.kind === 'paper' ? 520 : 1300) * dt;
    if (p.kind === 'paper') p.vy -= p.vy * 1.6 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.a += p.spin * dt;
    const fade = Math.min(1, (p.max - p.life) / 0.35);
    ctx.globalAlpha = fade;
    ctx.fillStyle = p.color;
    if (p.kind === 'drop') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.scale(1, Math.abs(Math.cos(p.a * 1.7)) * 0.8 + 0.2);
      ctx.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.append(st);
}

// The chop runs corner to corner, a little off-diagonal so it reads as a slash, not a fold.
const CUT_A = 'polygon(0 0, 100% 0, 100% 38.4%, 0 62.4%)'; // halves overlap a hair so no seam shows
const CUT_B = 'polygon(0 61.6%, 100% 37.6%, 100% 100%, 0 100%)';

const CSS = `
.tfs { position: fixed; inset: 0; z-index: 50; overflow: hidden; cursor: pointer; user-select: none;
  -webkit-user-select: none; touch-action: none; }
.tfs-half { position: absolute; inset: 0; overflow: hidden; will-change: transform;
  transition: transform 0.6s cubic-bezier(.55,-0.35,.6,1), opacity 0.6s ease-in; }
.tfs-a { clip-path: ${CUT_A}; }
.tfs-b { clip-path: ${CUT_B}; }
.tfs-split .tfs-a { transform: translate(-14vw, -70vh) rotate(-9deg); opacity: 0; }
.tfs-split .tfs-b { transform: translate(14vw, 70vh) rotate(7deg); opacity: 0; }
.tfs-bg { position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 45%, #17305e 0%, #0d1838 55%, #060a1a 100%); }
.tfs-rays { position: absolute; left: 50%; top: 42%; width: 240vmax; height: 240vmax; margin: -120vmax 0 0 -120vmax;
  background: repeating-conic-gradient(from 0deg, rgba(95,216,210,0.13) 0deg 9deg, rgba(95,216,210,0) 9deg 22.5deg);
  opacity: 0; transform: scale(0.4); }
.tfs-go .tfs-rays { animation: tfs-rays-in 0.9s ease-out 0.1s forwards, tfs-spin 24s linear infinite; }
.tfs-dots { position: absolute; inset: 0; opacity: 0.35;
  background-image: radial-gradient(rgba(255,255,255,0.18) 1.5px, transparent 1.6px); background-size: 28px 28px; }
.tfs-stage { position: absolute; left: 50%; top: 46%; width: min(64vmin, 86vw); transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; }
.tfs-leap { width: 74%; transform: translateY(80vh); }
.tfs-emblem { display: block; width: 100%; filter: drop-shadow(0 0 2.2vmin rgba(95,216,210,0.55));
  transform-origin: 50% 100%; }
.tfs-go .tfs-leap { animation: tfs-leap 0.72s cubic-bezier(.2,.75,.35,1) ${T.leap}s both,
  tfs-bob 2.4s ease-in-out ${T.land + 0.4}s infinite; }
.tfs-go .tfs-emblem { animation: tfs-squash 0.9s ease-out ${T.leap}s both; }
.tfs-title { width: 100%; margin-top: 3.2vmin; opacity: 0; filter: drop-shadow(0 0.8vmin 0 rgba(0,0,0,0.35)); }
.tfs-go .tfs-title { animation: tfs-slam 0.5s cubic-bezier(.3,1.6,.5,1) ${T.slam - 0.12}s both; }
.tfs-sub { width: 78%; margin-top: 2vmin; opacity: 0; }
.tfs-go .tfs-sub { animation: tfs-rise 0.4s ease-out ${T.slam + 0.15}s both; }
.tfs-tag { margin-top: 3.4vmin; padding: 0.7vmin 3vmin 1vmin; border-radius: 99px; background: #ffd23f; color: #2a1b5e;
  font: 3.4vmin 'Kenney Future Narrow', 'Kenney Future', system-ui, sans-serif; letter-spacing: 0.3vmin;
  box-shadow: 0 0.7vmin 0 #c48a00, 0 1.2vmin 2vmin rgba(0,0,0,0.35); border: 0.5vmin solid #2a1b5e;
  opacity: 0; transform: rotate(-6deg) scale(0); }
.tfs-go .tfs-tag { animation: tfs-pop 0.5s cubic-bezier(.3,1.8,.5,1) ${T.sub}s both, tfs-wiggle 1.2s ease-in-out ${T.sub + 0.5}s infinite; }
.tfs-wave { position: absolute; left: -5%; bottom: -2vh; width: 110%; height: 22vh; transform: translateY(100%); }
.tfs-go .tfs-wave { animation: tfs-wave-in 0.5s ease-out both, tfs-wave-bob 2s ease-in-out 0.5s infinite; }
.tfs-fx { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; transition: opacity 0.45s ease-in; }
.tfs-split .tfs-fx { opacity: 0; }
.tfs-flash { position: absolute; left: 50%; top: 62%; width: 10vmin; height: 10vmin; margin: -5vmin; border-radius: 50%;
  border: 1.4vmin solid #fff; opacity: 0; pointer-events: none; }
.tfs-flash.tfs-on { animation: tfs-ring 0.55s ease-out forwards; }
.tfs-slash { position: absolute; left: 50%; top: 50%; width: 140vmax; height: 1.4vmin; background: #fff;
  box-shadow: 0 0 2vmin #fff, 0 0 5vmin ${TEAL}; transform: translate(-50%, -50%) rotate(var(--cut)) scaleX(0); opacity: 0;
  pointer-events: none; }
.tfs-slash.tfs-on { animation: tfs-cut 0.42s ease-out forwards; }
.tfs-hint { position: absolute; right: 2.4vmin; bottom: 2.2vmin; color: rgba(255,255,255,0.7);
  font: 2.2vmin 'Kenney Future Narrow', system-ui, sans-serif; letter-spacing: 0.15vmin; opacity: 0; transition: opacity 0.4s; }
.tfs-hint.tfs-on { opacity: 1; }
.tfs-shake .tfs-half { animation: tfs-shake 0.32s linear; }
.tfs-split .tfs-half { animation: none; }
.tfs-calm .tfs-half, .tfs-calm .tfs-rays, .tfs-calm .tfs-leap, .tfs-calm .tfs-tag { animation-duration: 0.01s !important; }
.tfs-calm.tfs-split .tfs-a, .tfs-calm.tfs-split .tfs-b { transform: none; }
@keyframes tfs-rays-in { to { opacity: 1; transform: scale(1); } }
@keyframes tfs-spin { from { rotate: 0deg; } to { rotate: 360deg; } }
@keyframes tfs-leap {
  0% { transform: translateY(80vh); }
  62% { transform: translateY(-9vmin); }
  82% { transform: translateY(1.2vmin); }
  100% { transform: translateY(0); } }
@keyframes tfs-squash {
  0% { transform: scale(0.75, 1.35) rotate(-8deg); }
  45% { transform: scale(0.9, 1.15) rotate(3deg); }
  70% { transform: scale(1.18, 0.82) rotate(0deg); }
  85% { transform: scale(0.95, 1.06); }
  100% { transform: scale(1, 1); } }
@keyframes tfs-bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -1.2vmin; } }
@keyframes tfs-slam {
  0% { opacity: 0; transform: scale(2.6) rotate(-4deg); }
  60% { opacity: 1; transform: scale(0.92) rotate(1deg); }
  100% { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes tfs-rise { from { opacity: 0; transform: translateY(2vmin); } to { opacity: 1; transform: none; } }
@keyframes tfs-pop { 0% { opacity: 0; transform: rotate(-6deg) scale(0); } 100% { opacity: 1; transform: rotate(-6deg) scale(1); } }
@keyframes tfs-wiggle { 0%, 100% { rotate: 0deg; } 50% { rotate: 4deg; } }
@keyframes tfs-wave-in { to { transform: translateY(0); } }
@keyframes tfs-wave-bob { 0%, 100% { translate: 0 0; } 50% { translate: -3% 1vh; } }
@keyframes tfs-ring { 0% { opacity: 0.9; transform: scale(0.3); } 100% { opacity: 0; transform: scale(7); } }
@keyframes tfs-cut {
  0% { opacity: 1; transform: translate(-50%, -50%) rotate(var(--cut)) scaleX(0); }
  55% { opacity: 1; transform: translate(-50%, -50%) rotate(var(--cut)) scaleX(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--cut)) scaleX(1) scaleY(0.2); } }
@keyframes tfs-shake {
  0%, 100% { translate: 0 0; } 20% { translate: -1.2vmin 0.8vmin; } 40% { translate: 1vmin -0.6vmin; }
  60% { translate: -0.6vmin -0.8vmin; } 80% { translate: 0.5vmin 0.4vmin; } }
`;
