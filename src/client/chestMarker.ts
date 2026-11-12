import * as THREE from 'three';
import type { PartyState } from '../shared/party';
import { getBoard } from '../shared/board/boards';
import { currentPlayer, forwardDist } from '../shared/board/engine';
import { text } from '../shared/draw';

type Project = (v: THREE.Vector3) => { x: number; y: number; visible: boolean };

const HIDE = new Set(['tour', 'orderRoll', 'orderShow', 'boss', 'chunk', 'event']);
const M = 56; // keep off-screen markers this far inside the edge

/**
 * Where the Chobglob is: a bobbing gold marker over each chest with how many spaces away it is for the
 * player whose turn it is. When the chest is off screen, a gold arrow lies on the ground at that player's
 * feet pointing at it (Michael: not floating over the HUD), with the number of spaces on it.
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
    const steps = dist?.get(node);
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
    }
    ctx.restore();
    // off screen: a gold arrow painted on the ground around the player whose turn it is, pointing at the chest
    if (!on && me) ground(ctx, def.nodes[me.node], n, steps, t, project);
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

/** Smoothed spot under the current player, so the ground arrow glides along as they hop. */
const feet = new THREE.Vector3(NaN, 0, 0);
function ground(ctx: CanvasRenderingContext2D, at: { x: number; y: number; z: number } | undefined, chest: { x: number; z: number }, steps: number | undefined, t: number, project: Project): void {
  if (!at) return;
  if (Number.isNaN(feet.x) || feet.distanceTo(new THREE.Vector3(at.x, at.y, at.z)) > 12) feet.set(at.x, at.y, at.z);
  else feet.lerp(new THREE.Vector3(at.x, at.y, at.z), 0.12);
  const ang = Math.atan2(chest.z - feet.z, chest.x - feet.x);
  const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
  const pulse = Math.sin(t * 4) * 0.12;
  // arrow shape in (along, across) metres, starting just outside the player's space
  const r0 = 1.25 + pulse;
  const shape: [number, number][] = [[r0, -0.32], [r0 + 0.9, -0.32], [r0 + 0.9, -0.7], [r0 + 1.75, 0], [r0 + 0.9, 0.7], [r0 + 0.9, 0.32], [r0, 0.32]];
  const pts = shape.map(([a, c]) => project(new THREE.Vector3(feet.x + ux * a + vx * c, feet.y + 0.08, feet.z + uz * a + vz * c)));
  if (pts.some((q) => !q.visible)) return;
  ctx.save();
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
  ctx.shadowColor = 'rgba(255,190,40,0.9)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = 'rgba(255,210,63,0.92)';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#7a4a00';
  ctx.stroke();
  // the number of spaces sits on the arrow's tail
  if (steps !== undefined) {
    const c = project(new THREE.Vector3(feet.x + ux * (r0 + 0.5), feet.y + 0.1, feet.z + uz * (r0 + 0.5)));
    text(ctx, String(steps), c.x, c.y + 1, 18, { color: '#3a2a10', outline: false });
  }
  ctx.restore();
}
