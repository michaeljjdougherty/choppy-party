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
 * feet... removed at Michael's ask: off screen, only the glowing trail along the path shows the way.
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
    // off screen: nothing here (Michael: no arrows, the sparkle trail on the path does the pointing)
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

