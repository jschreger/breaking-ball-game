// mapper.js — rigidly maps mound-space pitch trajectories into approach-space.
//
// Mound-space: x toward plate (0 .. 60.5 ft), y up (feet), z lateral (feet).
// Approach-space (game world):
//   +z is behind the ship (plane flies toward -z), x lateral, y up (meters).
//   Plate-crossing point  ->  the touchdown point on the carrier deck.
//   Release point         ->  start of final approach.
// Uniform scale s = approachLength / 60.5ft preserves ALL break shapes,
// including lateral ones (the whole reason this game is 3D).

import { PLATE_X_FT } from './pitch.js';

const FT_TO_M = 0.3048;

export function buildApproach(moundPts, opts = {}) {
  const lengthM = opts.lengthM ?? 2800;   // release -> touchdown horizontal span
  const touchY = opts.touchY ?? 23;       // touchdown altitude (deck 21 m + 2 m gear)
  const touchZ = opts.touchZ ?? 82;       // touchdown z on the ship (wire 2-3 zone)
  const deckY = opts.deckY ?? 21;

  const s = lengthM / (PLATE_X_FT * FT_TO_M);

  // Find crossing sample (x == PLATE_X_FT is the last point).
  const cross = moundPts[moundPts.length - 1];

  const pts = moundPts.map(p => ({
    x: p.z * FT_TO_M * s,                          // lateral (sign flip irrelevant)
    y: touchY + (p.y - cross.y) * FT_TO_M * s,     // vertical, anchored at crossing
    z: touchZ + (PLATE_X_FT - p.x) * FT_TO_M * s,  // release -> far behind the ship
  }));

  // Path length (for par-time and HUD readouts).
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  }

  return {
    pts,
    scale: s,
    pathLengthM: len,
    start: pts[0],
    end: pts[pts.length - 1],
    startAltM: pts[0].y,
    deckY,
    touchY,
    touchZ,
  };
}

export const KT_TO_MS = 0.514444;
