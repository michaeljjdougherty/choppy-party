import * as THREE from 'three';
import type { PartyState } from '../shared/party';
import { getBoard } from '../shared/board/boards';
import { currentPlayer, forwardDist, nearDist } from '../shared/board/engine';
import { text } from '../shared/draw';

type Project = (v: THREE.Vector3) => { x: number; y: number; visible: boolean };

const HIDE = new Set(['tour', 'orderRoll', 'orderShow', 'boss', 'chunk', 'event']);
const M = 56; // keep off-screen markers this far inside the edge

/**
 * Where the Chobglob is: a bobbing gold marker over each chest with how many spaces away it is for the
 * player whose turn it is. When the chest is off screen, the marker sits on the screen edge pointing at it.
 */
export function drawChestMarkers(ctx: CanvasRenderingContext2D, s: PartyState, t: number, project: Project, mapOpen: boolean): void {
  const b = s.board;
  if (!b || HIDE.has(b.sub) || !b.crowns.length) return;
  const def = getBoard(b.boardId);
  const me = b.players[currentPlayer(b)];
  const dist = me ? forwardDist(def, b, me.node) : null;
  for (const node of b.crowns) {
    const n = def.nodes[node];
    if (!n) continue;
    const p = project(new THREE.Vector3(n.x, n.y + 3.4, n.z));
    // forward along the path when it can get there; otherwise (a gate that only opens at night) as the crow walks
    const steps = dist?.get(node) ?? (me ? nearDist(def, me.node, 99).get(node) : undefined);
    const label = steps === undefined ? 'CHOBGLOB' : steps === 0 ? 'CHOBGLOB · HERE!' : `CHOBGLOB · ${steps} ${steps === 1 ? 'SPACE' : 'SPACES'}`;
    // behind the camera, project() mirrors the point: flip it so the edge arrow still points the right way
    let x = p.x, y = p.y;
    if (!p.visible) {
      x = 1280 - x;
      y = 720 + Math.abs(y);
    }
    const on = p.visible && x > M && x < 1280 - M && y > M + 30 && y < 720 - M;
    const bob = Math.sin(t * 3.2) * 6;
    ctx.save();
    if (on) {
      ctx.translate(x, y + bob);
      arrow(ctx, Math.PI / 2, 1);
      text(ctx, label, 0, -66, mapOpen ? 18 : 20, { color: '#ffd23f' });
    } else {
      // pin it to the edge, pointing at the chest
      const cx = 640, cy = 360;
      const dx = x - cx, dy = y - cy;
      const k = Math.min((640 - M) / Math.max(1e-3, Math.abs(dx)), (360 - M) / Math.max(1e-3, Math.abs(dy)));
      // keep clear of the roll prompt at the top and the standings in the corner
      let ex = Math.max(M, Math.min(1280 - M, cx + dx * k)), ey = Math.max(M + 30, cy + dy * k);
      // then nudge it out of the HUD: standings down the left, board info + weather top right, prompt pill top centre
      const n = b.order.length;
      const keep = [
        { x: 0, y: 0, w: 262, h: 10 + Math.min(62, 600 / Math.max(1, n)) * n },
        { x: 960, y: 0, w: 320, h: 156 + ((def.weather?.length ?? 0) ? 30 + (def.weather?.length ?? 0) * 46 : 0) },
        { x: 300, y: 0, w: 680, h: 130 },
      ];
      for (const r of keep) {
        const pad = 40;
        if (ex > r.x - pad && ex < r.x + r.w + pad && ey > r.y - pad && ey < r.y + r.h + pad) {
          const opts = [
            { x: ex, y: r.y + r.h + pad },
            { x: r.x - pad, y: ey },
            { x: r.x + r.w + pad, y: ey },
          ].filter((o) => o.x >= M && o.x <= 1280 - M && o.y <= 720 - M);
          opts.sort((a, c) => Math.hypot(a.x - ex, a.y - ey) - Math.hypot(c.x - ex, c.y - ey));
          if (opts[0]) ({ x: ex, y: ey } = opts[0]);
        }
      }
      ctx.translate(ex, ey);
      ctx.fillStyle = 'rgba(20,10,50,0.8)';
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffd23f';
      ctx.stroke();
      ctx.save();
      ctx.rotate(Math.atan2(dy, dx));
      ctx.translate(22 + Math.sin(t * 6) * 3, 0);
      arrow(ctx, 0, 0.6);
      ctx.restore();
      text(ctx, steps === undefined ? '?' : String(steps), 0, 2, 24, { color: '#ffd23f' });
      const ly = ey < 300 ? 44 : -44;
      text(ctx, 'CHOBGLOB', 0, ly, 16, { color: '#ffd23f' });
    }
    ctx.restore();
  }
}

/** A chunky gold arrow pointing along `ang`, tip at the origin. */
function arrow(ctx: CanvasRenderingContext2D, ang: number, s: number): void {
  ctx.save();
  ctx.rotate(ang);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-26, -22);
  ctx.lineTo(-26, -10);
  ctx.lineTo(-50, -10);
  ctx.lineTo(-50, 10);
  ctx.lineTo(-26, 10);
  ctx.lineTo(-26, 22);
  ctx.closePath();
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#7a4a00';
  ctx.stroke();
  ctx.restore();
}
