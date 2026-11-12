import * as THREE from 'three';
import type { BoardDef, BoardState } from '../../../shared/board/types';
import { prop } from '../assets';

/**
 * Michael: when an item puts something on the board or on a player, you should be able to see it.
 * - Spike Traps sit on their space as real spikes with a pulsing red warning ring (in the owner's colour edge).
 * - A Knight Shield is a shimmering bubble round its player.
 * - Roll boosts and curses float over the player as a badge: "+5 STEPS", "3 DICE", "4-6 DICE", "SLOW DICE", "MAX 3".
 * View only; it reads the board state each frame.
 */
export function buildBoardStatus(scene: THREE.Scene, def: BoardDef, colorOf: (id: string) => string, top: number) {
  // ---- spike traps
  const traps = new Map<string, { g: THREE.Group; ring: THREE.MeshBasicMaterial; spikes: THREE.Object3D }>();
  const makeTrap = (node: string, owner: string) => {
    const n = def.nodes[node];
    const g = new THREE.Group();
    let spikes: THREE.Object3D;
    try {
      spikes = prop('platformer/trap-spikes', 1.25);
    } catch {
      spikes = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 8), new THREE.MeshStandardMaterial({ color: '#c9ccd6', metalness: 0.6, roughness: 0.3 }));
    }
    spikes.position.y = top + 0.02;
    g.add(spikes);
    const ring = new THREE.MeshBasicMaterial({ color: '#ff2a3a', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    const r = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.2, 40), ring);
    r.rotation.x = -Math.PI / 2;
    r.position.y = top + 0.04;
    g.add(r);
    const edge = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.3, 40), new THREE.MeshBasicMaterial({ color: colorOf(owner), transparent: true, opacity: 0.9, depthWrite: false }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = top + 0.045;
    g.add(edge);
    g.position.set(n.x, n.y, n.z);
    scene.add(g);
    return { g, ring, spikes };
  };

  // ---- shields and roll badges per player
  const bubbleMat = new THREE.MeshStandardMaterial({ color: '#8fd8ff', emissive: '#3fa9f5', emissiveIntensity: 0.6, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const bubbleGeo = new THREE.SphereGeometry(1.05, 28, 18);
  const bubbles = new Map<string, THREE.Mesh>();
  const badges = new Map<string, { sp: THREE.Sprite; key: string; cv: HTMLCanvasElement; tex: THREE.CanvasTexture }>();
  const badgeText = (b: BoardState, id: string): [string, string] | null => {
    const p = b.players[id];
    const bits: string[] = [];
    let col = '#21c45a';
    if (p.dice > 2) bits.push(`${p.dice} DICE`);
    if (p.rollBonus > 0) bits.push(`+${p.rollBonus} STEPS`);
    if (p.rollMin) bits.push(`${p.rollMin}-6 DICE`);
    if (p.slowRoll) bits.push('SLOW DICE');
    if (p.rollCap > 0) {
      bits.push(`MAX ${p.rollCap}`);
      col = '#ff4d5a';
    }
    return bits.length ? [bits.join(' · '), col] : null;
  };
  const drawBadge = (cv: HTMLCanvasElement, txt: string, col: string) => {
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, cv.width, cv.height);
    g.font = '900 40px system-ui, sans-serif';
    const w = Math.min(cv.width - 8, g.measureText(txt).width + 44);
    g.fillStyle = col;
    g.beginPath();
    g.roundRect((cv.width - w) / 2, 6, w, 60, 30);
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, cv.width / 2, 38);
  };

  return {
    update(b: BoardState, t: number, posOf: (id: string) => THREE.Vector3 | undefined): void {
      // traps: add new ones, drop sprung ones, pulse the rest
      const spikes = b.hazards?.spikes ?? {};
      for (const [node, tr] of traps)
        if (!spikes[node]) {
          scene.remove(tr.g);
          traps.delete(node);
        }
      for (const [node, owner] of Object.entries(spikes)) {
        let tr = traps.get(node);
        if (!tr) traps.set(node, (tr = makeTrap(node, owner)));
        tr.ring.opacity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 5));
        tr.spikes.position.y = top + 0.02 + Math.max(0, Math.sin(t * 2.2)) * 0.06;
      }
      for (const id of Object.keys(b.players)) {
        const at = posOf(id);
        const p = b.players[id];
        // shield bubble
        let bub = bubbles.get(id);
        if (p.shield && at) {
          if (!bub) {
            bub = new THREE.Mesh(bubbleGeo, bubbleMat);
            scene.add(bub);
            bubbles.set(id, bub);
          }
          bub.visible = true;
          bub.position.set(at.x, at.y + 0.85, at.z);
          bub.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
          bub.rotation.y = t * 0.6;
        } else if (bub) bub.visible = false;
        // roll badge
        const want = at ? badgeText(b, id) : null;
        let bd = badges.get(id);
        if (want) {
          if (!bd) {
            const cv = document.createElement('canvas');
            cv.width = 512;
            cv.height = 72;
            const tex = new THREE.CanvasTexture(cv);
            tex.colorSpace = THREE.SRGBColorSpace;
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
            sp.renderOrder = 20;
            sp.scale.set(3.2, 0.45, 1);
            scene.add(sp);
            bd = { sp, key: '', cv, tex };
            badges.set(id, bd);
          }
          const key = want.join('|');
          if (key !== bd.key) {
            drawBadge(bd.cv, want[0], want[1]);
            bd.tex.needsUpdate = true;
            bd.key = key;
          }
          bd.sp.visible = true;
          bd.sp.position.set(at!.x, at!.y + 2.25 + Math.sin(t * 3) * 0.05, at!.z);
        } else if (bd) bd.sp.visible = false;
      }
    },
  };
}
