// scoring.js — path adherence + Navy-LSO-flavored landing grades.

export function distToSegmentSq(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const L2 = abx * abx + aby * aby + abz * abz;
  let t = L2 > 0 ? (apx * abx + apy * aby + apz * abz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

// Current cross-track error against the ghost polyline (points are coarse
// enough that a full scan is cheap and bulletproof).
export function crossTrackErr(pos, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = distToSegmentSq(pos, pts[i - 1], pts[i]);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export const WIRES_Z = [98, 109, 120, 131];    // wire 1..4 world z (carrier scaled 1.4×)
export const WIRE_HALF_W = 4.2;
export const TRAP_Z_MIN = 63, TRAP_Z_MAX = 161; // legal touchdown zone

export function findWire(z) {
  for (let i = 0; i < WIRES_Z.length; i++) {
    if (Math.abs(z - WIRES_Z[i]) <= WIRE_HALF_W) return i + 1;
  }
  return 0;
}

export function gradeApproach(ev) {
  // ev: {adherence (0..1), wire (0..4), latOff, sinkMs, kts, landKts:[lo,hi],
  //      outcome: 'trap'|'bolter'|'deck'|'water'|'flyover'}
  const notes = [];
  switch (ev.outcome) {
    case 'water': notes.push('Splashed short of the ship.'); break;
    case 'deck': notes.push('Hit the deck outside the landing area.'); break;
    case 'flyover': notes.push('Flew over the boat. The boat noticed.'); break;
  }
  if (ev.outcome !== 'trap') {
    const grade = ev.outcome === 'bolter' ? 'BOLTER' : 'CUT';
    return { grade, score: ev.outcome === 'bolter' ? 15 : 0, safe: false, notes };
  }

  const a = Math.max(0, Math.min(1, ev.adherence));
  const wirePts = (ev.wire === 2 || ev.wire === 3) ? 1 : ev.wire > 0 ? 0.6 : 0;
  const inWindow = ev.kts >= ev.landKts[0] && ev.kts <= ev.landKts[1];
  const nearWindow = !inWindow && Math.abs(
    ev.kts - Math.max(ev.landKts[0], Math.min(ev.landKts[1], ev.kts))
  ) <= 8;

  const unsafe = a < 0.5 || ev.sinkMs > 9 || Math.abs(ev.latOff) > 18;
  const pass = !unsafe && a >= 0.75 && wirePts >= 0.6 &&
               Math.abs(ev.latOff) <= 10 && ev.sinkMs <= 6.5 && inWindow;

  let grade;
  if (pass && a >= 0.88 && Math.abs(ev.latOff) <= 5 && ev.wire >= 2 && ev.wire <= 3) grade = 'OK';
  else if (pass) grade = '(OK)';
  else if (unsafe) grade = 'CUT';
  else grade = '_NO WAVE_';

  let score = a * 55
    + wirePts * 20
    + (inWindow ? 10 : nearWindow ? 5 : 0)
    + (Math.abs(ev.latOff) <= 6 ? 8 : Math.abs(ev.latOff) <= 12 ? 4 : 0)
    + (ev.sinkMs <= 5 ? 7 : ev.sinkMs <= 7 ? 4 : 0);

  notes.push(`Wire ${ev.wire || 'none — bolter risk'}`);
  notes.push(`On-path ${Math.round(a * 100)}%`);
  if (!inWindow) notes.push('Speed outside the window for this pitch.');

  return {
    grade,
    score: Math.round(Math.max(0, Math.min(100, score))),
    safe: true,
    notes,
  };
}
