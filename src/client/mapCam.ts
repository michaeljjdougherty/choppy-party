/**
 * Board map view: a free camera anyone on this screen can open with Y (or M, or the Map button)
 * to look over the whole board. Local to this screen only; the game itself never sees it.
 */
export const mapCam = {
  on: false,
  /** Set when the map opens, so the board view can frame the board. */
  fresh: false,
  yaw: 0,
  pitch: 0.95,
  dist: 40,
  fx: 0,
  fz: 0,
};

export function openMap(): void {
  mapCam.on = true;
  mapCam.fresh = true;
}

export function closeMap(): void {
  mapCam.on = false;
}

/** Apply a frame of controls (stick pan, orbit, tilt, zoom), all roughly -1..1 per second. */
export function steerMap(c: { panX: number; panY: number; orbit: number; tilt: number; zoom: number }, dt: number, span: number): void {
  const pan = mapCam.dist * 0.9 * dt;
  const cos = Math.cos(mapCam.yaw), sin = Math.sin(mapCam.yaw);
  // screen right / screen up, turned by the camera's yaw
  mapCam.fx += (c.panX * cos + c.panY * sin) * pan;
  mapCam.fz += (-c.panX * sin + c.panY * cos) * pan;
  const lim = span * 0.75;
  mapCam.fx = Math.max(-lim, Math.min(lim, mapCam.fx));
  mapCam.fz = Math.max(-lim, Math.min(lim, mapCam.fz));
  mapCam.yaw += c.orbit * 1.8 * dt;
  mapCam.pitch = Math.max(0.35, Math.min(1.45, mapCam.pitch + c.tilt * 1.2 * dt));
  mapCam.dist = Math.max(8, Math.min(span * 1.6, mapCam.dist * Math.exp(-c.zoom * 1.4 * dt)));
}
