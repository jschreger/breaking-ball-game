// pitch.js — Baseball pitch physics (canonical, mound-space).
// Units inside this module: FEET and SECONDS.
// Mound-space coordinates: origin at release point.
//   x = toward plate (plate at x = 60.5 ft)
//   y = up
//   z = lateral (sign is arbitrary in-game)

export const GRAV = 32.17;          // ft/s^2
export const PLATE_X_FT = 60.5;     // release point to back of plate... front. Close enough.
const MPH_TO_FPS = 1.46667;
const DT = 0.002;                   // integration step
const KM = 0.085;                   // Magnus coefficient (tuned)

// ---------------------------------------------------------------- utilities
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ---------------------------------------------------------------- roster
// axis: unit spin axis guess (normalized in code). Force = KM*(w x v)*rpm/1800.
//   wz > 0 backspin (lift), wz < 0 topspin (drop), wy drives lateral break.
export const PITCHES = [
  {
    id: 'fourseam', name: 'Four-Seam Fastball', tag: 'THE STRAIGHT APPROACH',
    mph: 98, rpm: 2300, axis: [0, 0, 1], dragK: 0.16,
    landKts: [128, 146],
    desc: 'The hardest throw in baseball. Nearly laser-straight with a whisper of ride. Cleanest path to the boat — but you must carry speed all the way to the wires.',
  },
  {
    id: 'change', name: 'Changeup', tag: 'SAME LOOK, LESS GAS',
    mph: 85, rpm: 1600, axis: [0, 0.35, 0.94], dragK: 0.2,
    landKts: [112, 128],
    desc: 'Looks like the fastball out of your hand, then dies. Gentle arm-side fade. A forgiving approach with a little sideways personality.',
  },
  {
    id: 'slider', name: 'Slider', tag: 'LATE LATERAL BREAK',
    mph: 87, rpm: 2400, axis: [-0.35, -0.8, 0.49], dragK: 0.19,
    landKts: [116, 132],
    desc: 'Comes in looking flat, then snaps sideways late. You will drift off centerline most of the way down — then swing back aboard at the last second.',
  },
  {
    id: 'screw', name: 'Screwball', tag: 'BREAKS THE WRONG WAY',
    mph: 82, rpm: 1900, axis: [0.35, 0.8, 0.49], dragK: 0.21,
    landKts: [112, 128],
    desc: 'Mirror of the slider. It runs INTO a right-handed hitter — and runs you out over open ocean before bending back to the deck.',
  },
  {
    id: 'slurve', name: 'Slurve', tag: 'SIDEWAYS AND DOWN',
    mph: 80, rpm: 2500, axis: [-0.45, -0.62, -0.64], dragK: 0.23,
    landKts: [108, 124],
    desc: 'Half slider, half curve. Big lateral break AND heavy drop. Two problems at once, all the way to the ramp.',
  },
  {
    id: 'splitter', name: 'Splitter', tag: 'FALLS OFF THE TABLE',
    mph: 87, rpm: 1200, axis: [0, -0.5, -0.87], dragK: 0.18,
    landKts: [114, 130],
    desc: 'Rides like a fastball… then vanishes straight into the ground. The steepest late descent in the repertoire. Trust the ghost. Flare too early and you bolter.',
  },
  {
    id: 'curve', name: 'Curveball', tag: 'THE BIG DROP',
    mph: 78, rpm: 2600, axis: [0, 0, -1], dragK: 0.25,
    landKts: [104, 120],
    desc: 'Slow, loopy, heavy topspin. A long graceful dive that keeps steepening — the classic night-carrier glide slope wearing a baseball jersey.',
  },
  {
    id: 'knuckle', name: 'Knuckleball', tag: 'NOBODY HITS IT. NOBODY LANDS IT.',
    mph: 66, rpm: 200, axis: [0, 0, 1], dragK: 0.28, knuckle: true,
    landKts: [96, 114],
    desc: 'Almost no spin. It wanders. The pattern is seeded and identical every attempt — learn it, anticipate it, thread it. The final exam.',
  },
];

// ---------------------------------------------------------------- simulator
function simOnce(def, release, speed0, aimY, aimZ, seed) {
  const rand = mulberry32(seed);
  const f1 = 14 + rand() * 8, f2 = 26 + rand() * 10;
  const f3 = 17 + rand() * 9, f4 = 31 + rand() * 12;
  const p1 = rand() * 6.283, p2 = rand() * 6.283, p3 = rand() * 6.283, p4 = rand() * 6.283;
  const AMP = 34; // ft/s^2 knuckle wobble accel amplitude (capped, seeded => learnable)

  const w = norm3(def.axis || [0, 0, 1]);
  const mag = def.knuckle ? 0 : KM * (def.rpm / 1800);

  const p = [release.x, release.y, release.z];
  let dir = norm3([PLATE_X_FT - p[0], aimY - p[1], aimZ - p[2]]);
  const v = [dir[0] * speed0, dir[1] * speed0, dir[2] * speed0];

  const samples = [];
  let t = 0, cross = null, prev = null;

  for (let i = 0; i < 2500; i++) {
    const wxv = [
      w[1] * v[2] - w[2] * v[1],
      w[2] * v[0] - w[0] * v[2],
      w[0] * v[1] - w[1] * v[0],
    ];
    let ax = -def.dragK * v[0] + mag * wxv[0];
    let ay = -GRAV - def.dragK * v[1] + mag * wxv[1];
    let az = -def.dragK * v[2] + mag * wxv[2];
    if (def.knuckle) {
      az += AMP * (Math.sin(f1 * t + p1) + 0.6 * Math.sin(f2 * t + p2));
      ay += AMP * 0.45 * (Math.sin(f3 * t + p3) + 0.6 * Math.sin(f4 * t + p4));
    }
    prev = [p[0], p[1], p[2]];
    v[0] += ax * DT; v[1] += ay * DT; v[2] += az * DT;
    p[0] += v[0] * DT; p[1] += v[1] * DT; p[2] += v[2] * DT;
    t += DT;
    if (i % 4 === 0) samples.push({ t, x: p[0], y: p[1], z: p[2] });
    if (p[0] >= PLATE_X_FT) {
      const f = (PLATE_X_FT - prev[0]) / (p[0] - prev[0]);
      cross = {
        t: t - DT * (1 - f),
        y: prev[1] + (p[1] - prev[1]) * f,
        z: prev[2] + (p[2] - prev[2]) * f,
      };
      samples.push({ t, x: PLATE_X_FT, y: cross.y, z: cross.z });
      break;
    }
  }
  return { samples, cross };
}

// Resample evenly by x (smooth ghost ribbons + stable scoring).
function resampleByX(samples, step = 0.15) {
  const out = [];
  let j = 0;
  for (let x = 0; x <= PLATE_X_FT + 1e-6; x += step) {
    while (j < samples.length - 2 && samples[j + 1].x < x) j++;
    const a = samples[j], b = samples[j + 1];
    const f = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    out.push({
      x,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
    });
  }
  return out;
}

export function simulatePitch(def) {
  const release = { x: 0, y: 5.8, z: -0.8 };      // over-the-top release point
  const targetY = 2.6;                             // plate-crossing height
  const speed0 = def.mph * MPH_TO_FPS;
  const seed = hashStr(def.id);

  let aimY = targetY, aimZ = 0, best = null;
  for (let it = 0; it < 14; it++) {
    const res = simOnce(def, release, speed0, aimY, aimZ, seed);
    best = res;
    if (!res.cross) break;
    const ey = res.cross.y - targetY;
    const ez = res.cross.z - 0;
    aimY -= ey * 0.95; aimZ -= ez * 0.95;
    if (Math.abs(ey) < 0.02 && Math.abs(ez) < 0.02) break;
  }

  const pts = resampleByX(best.samples);

  // Break summary: deviation from the straight release->plate chord at mid-flight.
  let dropFt = 0, sideFt = 0;
  {
    const ax = release.x, ay = release.y, az = release.z;
    const bx = PLATE_X_FT, by = targetY, bz = 0;
    const mid = pts[Math.floor(pts.length / 2)];
    const f = (mid.x - ax) / (bx - ax);
    const cy = ay + (by - ay) * f, cz = az + (bz - az) * f;
    dropFt = -(mid.y - cy);       // positive = below the chord
    sideFt = mid.z - cz;
  }
  const flightTime = best.cross ? best.cross.t : 0;

  return {
    def,
    pts,                                   // mound-space, evenly sampled in x
    summary: {
      mph: def.mph,
      rpm: def.rpm,
      dropIn: dropFt * 12,
      sideIn: sideFt * 12,
      timeSec: flightTime,
      plateYFt: best.cross ? best.cross.y : targetY,
    },
  };
}
