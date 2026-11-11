import type { InputManager } from './input';
import { roundRect, text } from '../shared/draw';
import { CHARACTERS, PLAYER_COLORS } from '../shared/players';
import { CATALOG, DEFAULT_LOOK, type Category, type Look } from './three/cosmetics';
import { folk } from './three/folks';
import { Thumbs } from './three/thumbs';
import type { DressingState } from './three/views/customize';
import { button, clicked, inside, pointerAt } from './ui';
import { A, B, X, Y, promptKind } from './prompts';
import { sfx } from './sfx';
import { customizePrefs, saveCustomizePrefs, saveLook, savedLook } from './looks';

/**
 * Customize: dress up the crew. Pick a character, then a hat, a shirt and an accessory from the
 * grid. Moving over an item tries it on; A (or a click) wears it, and it's saved straight away.
 * X / C changes character, Y / V changes the colour you preview in, B / Esc goes back.
 */
const TABS: { cat: Category; label: string; color: string }[] = [
  { cat: 'hat', label: 'Hats', color: '#ff4d5a' },
  { cat: 'shirt', label: 'Shirts', color: '#2f8cff' },
  { cat: 'acc', label: 'Extras', color: '#21c45a' },
];
const COLS = 7;
const TILE = 72;
const GAP = 8;
const PANEL = { x: 664, y: 22, w: 594, h: 676 };
const GRID = { x: PANEL.x + (PANEL.w - (COLS * TILE + (COLS - 1) * GAP)) / 2, y: 122 };
const BACK_ACCS = /^(cape|backpack|jetpack|angel|bat|guitar|shell|balloon)$/;

interface Tile {
  id: string;
  name: string;
}

export class CustomizeScreen {
  /** crew only: the aliens are Kenney models with their own outfits */
  private crew = CHARACTERS.map((c, i) => ({ c, i })).filter((x) => x.c.folk);
  private char: number;
  private color: number;
  private tab = 0;
  /** -1 = the tab row; otherwise the tile index in the grid */
  private cursor = 0;
  private looks = new Map<string, Look>();
  private worn = 0;
  private bump = 0;
  private navCd = 0;
  private prev = new Map<string, { a: number; b: number; x: number; y: number; sx: number; sy: number }>();
  private thumbs = new Thumbs();
  private flash = 0;
  private lastHover = -2;

  constructor(private input: InputManager) {
    const p = customizePrefs();
    this.char = Math.min(p.char, this.crew.length - 1);
    this.color = Math.min(p.color, PLAYER_COLORS.length - 1);
    // start on what they're wearing
    this.cursor = Math.max(0, this.tiles().findIndex((t) => t.id === this.look()[this.cat()]));
    // drop any presses made before the screen opened
    for (const d of input.list()) this.prev.set(d.key, { a: d.raw.aCount, b: d.raw.bCount, x: d.raw.xCount ?? 0, y: d.raw.yCount ?? 0, sx: d.raw.x, sy: d.raw.y });
  }

  private folkId(): string {
    return this.crew[this.char].c.folk!;
  }
  private cat(): Category {
    return TABS[this.tab].cat;
  }
  private look(): Look {
    const id = this.folkId();
    let l = this.looks.get(id);
    if (!l) {
      l = savedLook(id);
      this.looks.set(id, l);
    }
    return l;
  }

  private tiles(): Tile[] {
    const cat = this.cat();
    const spec = folk(this.folkId());
    const list = CATALOG[cat].filter((c) => c.id !== 'bare').map((c) => ({ id: c.id, name: c.name }));
    if (cat === 'hat') {
      // first tile: their own signature hat (Fick's cap) or nothing; plus a "No Hat" if they have one
      const own: Tile[] = spec.hat ? [{ id: '', name: `${spec.name}'s Cap` }, { id: 'bare', name: 'No Hat' }] : [{ id: '', name: 'No Hat' }];
      return [...own, ...list];
    }
    if (cat === 'acc') return [{ id: '', name: 'Nothing' }, ...list];
    return list;
  }

  /** What the 3D view shows: the worn look with the highlighted item tried on. */
  dressing(): DressingState {
    const look = { ...this.look() };
    const t = this.cursor >= 0 ? this.tiles()[this.cursor] : null;
    if (t) look[this.cat()] = t.id;
    return {
      folkId: this.folkId(),
      color: PLAYER_COLORS[this.color],
      look,
      worn: this.worn,
      showBack: this.cat() === 'acc' && !!t && BACK_ACCS.test(t.id),
    };
  }

  private wear(i: number): void {
    const t = this.tiles()[i];
    if (!t) return;
    const l = { ...this.look(), [this.cat()]: t.id };
    this.looks.set(this.folkId(), l);
    saveLook(this.folkId(), l);
    this.worn++;
    this.flash = 1;
    sfx.select();
  }

  private setTab(t: number): void {
    this.tab = (t + TABS.length) % TABS.length;
    const worn = this.look()[this.cat()];
    this.cursor = this.cursor < 0 ? -1 : Math.max(0, this.tiles().findIndex((x) => x.id === worn));
    sfx.move();
  }

  private setChar(d: number): void {
    this.char = (this.char + d + this.crew.length) % this.crew.length;
    saveCustomizePrefs(this.char, this.color);
    const n = this.tiles().length;
    if (this.cursor >= n) this.cursor = n - 1;
    sfx.select();
  }

  private setColor(d: number): void {
    this.color = (this.color + d + PLAYER_COLORS.length) % PLAYER_COLORS.length;
    saveCustomizePrefs(this.char, this.color);
    sfx.move();
  }

  private randomize(): void {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const l: Look = {
      hat: Math.random() < 0.15 ? '' : pick(CATALOG.hat.filter((c) => c.id !== 'bare')).id,
      shirt: pick(CATALOG.shirt).id,
      acc: Math.random() < 0.15 ? '' : pick(CATALOG.acc).id,
    };
    this.looks.set(this.folkId(), l);
    saveLook(this.folkId(), l);
    this.cursor = Math.max(0, this.tiles().findIndex((t) => t.id === l[this.cat()]));
    this.worn++;
    this.flash = 1;
    sfx.select();
  }

  private reset(): void {
    this.looks.set(this.folkId(), { ...DEFAULT_LOOK });
    saveLook(this.folkId(), { ...DEFAULT_LOOK });
    this.cursor = Math.max(0, this.tiles().findIndex((t) => t.id === DEFAULT_LOOK[this.cat()]));
    this.worn++;
    sfx.back();
  }

  private move(dx: number, dy: number): void {
    const n = this.tiles().length;
    if (this.cursor < 0) {
      if (dx) this.setTab(this.tab + dx);
      if (dy > 0) this.cursor = Math.max(0, this.tiles().findIndex((t) => t.id === this.look()[this.cat()]));
      sfx.move();
      return;
    }
    if (dx) {
      const col = this.cursor % COLS;
      const nc = col + dx;
      if (nc >= 0 && nc < COLS && this.cursor + dx < n) this.cursor += dx;
      else if (nc >= COLS || this.cursor + dx >= n) this.cursor -= col; // wrap to the row start
      else this.cursor = Math.min(n - 1, this.cursor - col + COLS - 1);
    }
    if (dy) {
      const next = this.cursor + dy * COLS;
      if (next < 0) this.cursor = -1;
      else if (next < n) this.cursor = next;
      else if (Math.floor(this.cursor / COLS) < Math.floor((n - 1) / COLS)) this.cursor = n - 1;
    }
    this.bump = 1;
    sfx.move();
  }

  /** Returns 'back' when the player leaves the screen. */
  update(dt: number): 'back' | null {
    this.navCd = Math.max(0, this.navCd - dt);
    this.bump = Math.max(0, this.bump - dt * 4);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.thumbs.pump(3);
    let back = false;
    for (const d of this.input.list()) {
      const r = d.raw;
      const p = this.prev.get(d.key);
      if (p) {
        if (r.aCount > p.a && this.cursor >= 0) this.wear(this.cursor);
        if (r.bCount > p.b) back = true;
        if ((r.xCount ?? 0) > p.x) this.setChar(1);
        if ((r.yCount ?? 0) > p.y) this.setColor(1);
        const fresh = (v: number, old: number) => Math.abs(v) > 0.6 && Math.abs(old) <= 0.6;
        const dx = Math.abs(r.x) > 0.6 && (fresh(r.x, p.sx) || this.navCd === 0) ? Math.sign(r.x) : 0;
        const dy = Math.abs(r.y) > 0.6 && (fresh(r.y, p.sy) || this.navCd === 0) ? Math.sign(r.y) : 0;
        if (dx || dy) {
          this.move(Math.abs(r.x) >= Math.abs(r.y) ? dx : 0, Math.abs(r.y) > Math.abs(r.x) ? dy : 0);
          this.navCd = fresh(r.x, p.sx) || fresh(r.y, p.sy) ? 0.32 : 0.11;
        }
      }
      this.prev.set(d.key, { a: r.aCount, b: r.bCount, x: r.xCount ?? 0, y: r.yCount ?? 0, sx: r.x, sy: r.y });
    }
    if (back) {
      sfx.back();
      return 'back';
    }
    return null;
  }

  private tileRect(i: number) {
    return { x: GRID.x + (i % COLS) * (TILE + GAP), y: GRID.y + Math.floor(i / COLS) * (TILE + GAP), w: TILE, h: TILE };
  }

  /** Draws the HUD; also handles mouse clicks (returns 'back' if Back was clicked). */
  draw(ctx: CanvasRenderingContext2D, t: number): 'back' | null {
    let out: 'back' | null = null;
    const spec = folk(this.folkId());
    const color = PLAYER_COLORS[this.color];
    const look = this.look();
    const tiles = this.tiles();
    const cat = this.cat();
    const ptr = pointerAt();

    // title
    ctx.save();
    ctx.translate(48, 52);
    ctx.rotate(-0.03);
    text(ctx, 'CUSTOMIZE', 0, 0, 48, { align: 'left', color: '#ffe14d' });
    ctx.restore();
    text(ctx, 'Dress up the crew. Outfits are saved and worn in every game.', 50, 92, 17, { align: 'left', weight: 700 });

    // item banner over the character
    const cur = this.cursor >= 0 ? tiles[this.cursor] : null;
    if (cur) {
      const wearing = look[cat] === cur.id;
      const s = 1 + this.flash * 0.12;
      ctx.save();
      ctx.translate(330, 140);
      ctx.scale(s, s);
      ctx.fillStyle = 'rgba(42,27,94,0.78)';
      roundRect(ctx, -170, -26, 340, 52, 26);
      ctx.fill();
      text(ctx, cur.name, 0, -1, 26, { color: '#fff' });
      ctx.restore();
      const tag = wearing ? 'Wearing it ✓' : promptKind() === 'mouse' ? 'Trying on · click to wear' : `Trying on · ${A()} to wear`;
      text(ctx, tag, 330, 178, 16, { color: wearing ? '#7dff9a' : '#ffffff', weight: 800 });
    }

    // character picker under the pedestal
    const cy = 600;
    ctx.fillStyle = 'rgba(42,27,94,0.78)';
    roundRect(ctx, 120, cy - 34, 420, 68, 34);
    ctx.fill();
    text(ctx, spec.name, 330, cy - 6, 32, { color: '#fff' });
    text(ctx, spec.tagline, 330, cy + 22, 14, { color: '#ffd9f0', weight: 700 });
    if (button(ctx, '◀', 128, cy - 26, 52, 52, { color: '#9a5bff', size: 24, sound: 'none' })) this.setChar(-1);
    if (button(ctx, '▶', 480, cy - 26, 52, 52, { color: '#9a5bff', size: 24, sound: 'none' })) this.setChar(1);
    // colour swatches (preview only: in a party your colour comes from the lobby)
    const sw = 26;
    const sx0 = 330 - (PLAYER_COLORS.length * (sw + 8) - 8) / 2;
    PLAYER_COLORS.forEach((c, i) => {
      const x = sx0 + i * (sw + 8);
      const y = cy + 48;
      const on = i === this.color;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      roundRect(ctx, x + 1, y + 3, sw, sw, 8);
      ctx.fill();
      ctx.fillStyle = c;
      roundRect(ctx, x, y - (on ? 4 : 0), sw, sw, 8);
      ctx.fill();
      ctx.lineWidth = on ? 4 : 2;
      ctx.strokeStyle = on ? '#ffe14d' : 'rgba(255,255,255,0.8)';
      ctx.stroke();
      if (clicked(x, y - 4, sw, sw + 4)) {
        this.color = i;
        saveCustomizePrefs(this.char, this.color);
        sfx.move();
      }
    });

    // the panel
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, PANEL.x + 4, PANEL.y + 10, PANEL.w, PANEL.h, 32);
    ctx.fill();
    ctx.fillStyle = 'rgba(42,27,94,0.86)';
    roundRect(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 32);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();

    // tabs
    const tw = 176;
    const tx0 = PANEL.x + (PANEL.w - (TABS.length * tw + (TABS.length - 1) * 12)) / 2;
    TABS.forEach((tb, i) => {
      const x = tx0 + i * (tw + 12);
      const y = 40;
      const on = i === this.tab;
      const focus = on && this.cursor < 0;
      ctx.save();
      if (on) {
        ctx.translate(x + tw / 2, y + 30);
        ctx.scale(1.05, 1.05);
        ctx.translate(-(x + tw / 2), -(y + 30));
      }
      ctx.fillStyle = on ? tb.color : 'rgba(255,255,255,0.12)';
      roundRect(ctx, x, y, tw, 60, 30);
      ctx.fill();
      ctx.lineWidth = focus ? 6 : on ? 4 : 2;
      ctx.strokeStyle = focus ? '#ffe14d' : on ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.stroke();
      text(ctx, tb.label, x + tw / 2, y + 30, 30, { color: on ? '#fff' : 'rgba(255,255,255,0.7)' });
      text(ctx, String(CATALOG[tb.cat].filter((c) => c.id !== 'bare').length), x + tw - 22, y + 4, 14, { color: '#ffe14d', weight: 900 });
      ctx.restore();
      if (clicked(x, y, tw, 60) && this.tab !== i) {
        this.setTab(i);
        this.cursor = Math.max(0, this.tiles().findIndex((q) => q.id === this.look()[this.cat()]));
      }
    });

    // grid
    let hoverTile = -2;
    tiles.forEach((tl, i) => {
      const r = this.tileRect(i);
      const on = i === this.cursor;
      const wearing = look[cat] === tl.id;
      const over = inside(ptr, r.x, r.y, r.w, r.h);
      if (over) hoverTile = i;
      const grow = on ? 1.08 + this.bump * 0.04 : 1;
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.scale(grow, grow);
      ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      roundRect(ctx, r.x + 2, r.y + 5, r.w, r.h, 16);
      ctx.fill();
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, on ? '#fff6c8' : '#ffffff');
      g.addColorStop(1, on ? '#ffd76a' : '#d9d2f5');
      ctx.fillStyle = g;
      roundRect(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.fill();
      ctx.lineWidth = on ? 5 : wearing ? 4 : 2;
      ctx.strokeStyle = on ? '#ff8a1f' : wearing ? '#21c45a' : 'rgba(255,255,255,0.9)';
      ctx.stroke();
      const img = tl.id === '' || tl.id === 'bare' ? this.noneIcon(tl.id === '' && !!spec.hat && cat === 'hat') : this.thumbs.get(cat, tl.id, color, spec);
      if (img) ctx.drawImage(img, r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      else {
        // still drawing: a little spinner
        ctx.strokeStyle = 'rgba(42,27,94,0.4)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 12, t * 6, t * 6 + 4);
        ctx.stroke();
      }
      if (wearing) {
        ctx.fillStyle = '#21c45a';
        ctx.beginPath();
        ctx.arc(r.x + r.w - 8, r.y + 8, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(r.x + r.w - 14, r.y + 8);
        ctx.lineTo(r.x + r.w - 9, r.y + 13);
        ctx.lineTo(r.x + r.w - 2, r.y + 3);
        ctx.stroke();
      }
      ctx.restore();
      if (clicked(r.x, r.y, r.w, r.h)) {
        this.cursor = i;
        this.wear(i);
      }
    });
    // mouse hover tries things on too
    if (hoverTile !== this.lastHover) {
      if (hoverTile >= 0 && promptKind() === 'mouse') {
        this.cursor = hoverTile;
        this.bump = 1;
        sfx.hover();
      }
      this.lastHover = hoverTile;
    }

    // bottom buttons
    const by = PANEL.y + PANEL.h - 76;
    if (button(ctx, 'Random', PANEL.x + 26, by, 170, 54, { color: '#ff8a1f', size: 22, sound: 'none' })) this.randomize();
    if (button(ctx, 'Reset', PANEL.x + 212, by, 150, 54, { color: '#6b6f86', size: 22, sound: 'none' })) this.reset();
    if (button(ctx, 'Back', PANEL.x + PANEL.w - 196, by, 170, 54, { color: '#ff4d5a', size: 22, sound: 'none' })) {
      sfx.back();
      out = 'back';
    }

    // hints
    const k = promptKind();
    const hint =
      k === 'mouse'
        ? 'Hover to try on · Click to wear · ◀ ▶ change character · Esc: back'
        : `Stick: browse   ·   ${A()}: wear   ·   ${X()}: next character   ·   ${Y()}: colour   ·   ${B()}: back`;
    text(ctx, hint, 330, 702, 15, { weight: 700 });
    return out;
  }

  private noneCache = new Map<string, HTMLCanvasElement>();
  private noneIcon(own: boolean): HTMLCanvasElement {
    const key = own ? 'own' : 'none';
    let c = this.noneCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d')!;
    g.lineCap = 'round';
    if (own) {
      // a little star: "their usual"
      g.fillStyle = '#ffb300';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 22 : 50;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(80 + Math.cos(a) * r, 80 + Math.sin(a) * r);
      }
      g.fill();
    } else {
      g.strokeStyle = '#a69bd0';
      g.lineWidth = 12;
      g.beginPath();
      g.arc(80, 80, 44, 0, Math.PI * 2);
      g.moveTo(50, 110);
      g.lineTo(110, 50);
      g.stroke();
    }
    this.noneCache.set(key, c);
    return c;
  }
}
