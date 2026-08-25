# HANDOFF — BREAKING BALL: Carrier Approach

**Status:** Live at https://jschreger.github.io/breaking-ball-game/ · repo `github.com/jschreger/breaking-ball-game`
**Last pass:** Designer (Noah) feedback round 1 fully addressed — see "Design history" below.
**Audience:** next developer/agent picking this up.

---

## What this is

A browser flight game (desktop keyboard + iPad touch) where every carrier approach
must follow the trajectory of a baseball pitch — flown **by the player**, with no
autopilot. Pitch physics is real (gravity + drag + Magnus lift), scaled up ~150× from
mound to carrier deck. The player takes off, calls a pitch from an in-game selector,
flies through an entry gate, then performs every break themselves through 13 guidance
gates, and traps on an arresting wire. Navy-LSO-style grading (OK / (OK) / _NO WAVE_ /
CUT / BOLTER).

## Run it

```bash
cd noah_game
python3 -m http.server 8000     # or any static server
# open http://localhost:8000
```

No build step, no CDN, no import map — three.js is vendored at `js/vendor/three.module.js`
(v0.160.0). Works offline and on any browser with ES modules (Safari 10.1+).

## Deploy

Push to `main` → GitHub Pages auto-builds. That's it. Pages caches ~10 min at the
Fastly edge + browser; `index.html` references `style.css?v=N` / `main.js?v=N` —
**bump `N` whenever you change CSS or JS** or users may see stale assets.

## File map

```
index.html          Markup: menu (TAKE OFF + roster), in-game selector, HUD, debrief, pause
css/style.css       All styling (military-mono theme; cyan=guide, orange=action)
js/pitch.js         Pitch physics in mound-space (feet). Gravity + linear drag + Magnus
                    (spin axis × velocity), dt=2ms. Aim solver iterates initial direction
                    until the ball crosses the plate at 2.6 ft. Knuckleball wobble = seeded
                    sinusoid sum (identical every attempt → learnable). Exports PITCHES
                    roster (8 pitches: mph, rpm, spin axis, drag, speed window, copy)
                    and simulatePitch(def) → {pts (evenly resampled by x, ~0.15 ft),
                    summary {dropIn, sideIn, mph, rpm}}.
js/mapper.js        Mound-space → world-space. Uniform scale s = APPROACH_LEN / 60.5 ft.
                    Plate → touchdown point (0, 23, 115); release → 3.4 km astern, ~203 m.
                    Lateral break preserved (why the game is 3D). Exports buildApproach().
js/flight.js        Arcade plane. Stick rates (pitch 1.45, roll 3.1, yaw 0.5 rad/s),
                    bank-induced turn (g·tan(bank)/v), energy model (dive gains speed,
                    climb bleeds it, drag = 9.4·(v/92)²), velocity chases the nose at
                    ALIGN_RATE 2.2 (drifty on purpose — the player flies it), slow-flight
                    sag. Exports Aircraft.
js/scoring.js       crossTrackErr() vs ghost polyline; WIRES_Z [98,109,120,131] ±4.2 m;
                    trap zone z ∈ [63,161]; gradeApproach() → OK/(OK)/_NO WAVE_/CUT/
                    BOLTER + 0–100 score.
js/scene.js         Three.js: animated ocean, carrier (1.4× XZ scale, deck top y=21),
                    painted deck texture, 4 arresting wires, 5 parked planes, island,
                    the baseball-with-wings player plane, gate system (setGates/
                    setNextGate/clearGates), boom effects, 3 cameras (chase/cockpit/tower).
js/hud.js           DOM: menu roster, in-game pitch selector, flight HUD, gate guidance
                    arrow (angle + distance + vertical), flash messages, debrief with
                    side/top plots (ghost cyan vs your trace orange).
js/touch.js         iPad: D-pad buttons (▲▼ pitch, ◀▶ roll), throttle slider,
                    PITCH/CAM/RST/❚❚ buttons. Buttons set/clear a Set; sample() per frame.
js/main.js          State machine + loop + localStorage persistence (SAVE_KEY
                    'breaking-ball-save-v1' → {unlocked, best}). Exposes window.__game
                    and window.THREE for console debugging.
```

## Game flow / state machine

```
menu ──TAKE OFF──▶ cruise ──call pitch──▶ cruise(armed) ──pass entry gate──▶ flying
 ▲                    │  │                                                    │  │
 │                    │  └── respawn on: water / out of bounds (keeps arm)    │  ├── touchdown in trap zone → landed → debrief
 └────────────────────┴───────────── ESC pause ──────────────────────────────┘  ├── deck outside trap zone → crash → debrief
                                                                                 ├── water → crash → debrief
debrief: RETRY (re-arms same pitch) · NEXT (→ selector, unlocks next) · MENU ◀── └── past bow (z < −230) → flyover → debrief
```

- **Scoring starts only when the entry gate is passed** (`state === 'flying'`).
  Cruise is free flight — crashes there just respawn.
- Attempt = adherence (mean cross-track vs ideal path) + wire 2/3 + lateral offset +
  sink rate + speed window (per-pitch `landKts`).
- Unlock rule: land safely (not crash/bolter) → next pitch unlocks. Best grade/score
  saved per pitch.

## Design decisions worth knowing

1. **Uniform scale mapping.** One scale factor (~184) maps mound→approach. 1 ft of
   pitch break ≈ 51 m of flight path. Non-uniform carrier scale (XZ only, ×1.4) keeps
   deck height at 21 m so `CONTACT_Y = 23` stays simple.
2. **Gates, never a ribbon.** The original ghost ribbon made the game feel like an
   autopilot — the designer killed it. Gates are the only in-flight guidance. Don't
   reintroduce a full-path line in the HUD; debrief-only overlays are fine.
3. **Selection is in-game only.** The menu is TAKE OFF + roster info. Never pre-arm a
   pitch from the menu; the only exception is RETRY (same pitch re-armed).
4. **Velocity chases the nose** (ALIGN_RATE 2.2) rather than being rigidly bound to
   it — this creates the drifty, "you must actually fly it" feel.
5. **Knuckleball is seeded per pitch id**, not per attempt — learnable pattern.

## Known limitations / next steps (designer's backlog)

- **No sound.** Engine pitch tied to throttle + wind noise would help speed feel a lot.
- **Landing feel:** touchdown → instant arrest. A short roll-out with hook-catch
  animation would sell the trap.
- **Gate visuals:** next gate pulses; passed gates vanish. Could add a "gate cleared"
  tick sound/flash.
- **Missed-entry-gate handling:** if the player blows through the entry gate outside
  its 30 m radius, they must circle back; there's no "RE-ENTER" prompt.
- **Difficulty tuning:** adherence constant (`/42` in evaluate()), gate radius (15 m),
  and wire band (±4.2 m) are the three knobs. Noah found round 1 hard to control on
  first contact; consider an easy mode (wider bands, slower speeds) if asked.
- **Mobile perf:** pixel ratio capped at 1.5 on touch; shadows could be dropped on
  coarse-pointer devices if iPads struggle.
- **Replay:** debrief shows 2D plots only. A 3D chase-cam replay of the attempt is
  the obvious stretch goal (trace is already recorded in `this.trace`).
- **Tests:** pitch physics + scoring are pure modules and were smoke-tested in Node
  (`node /tmp/test_physics.mjs` pattern — import pitch.js/mapper.js/scoring.js).
  No formal test suite; consider adding one if this grows.

## Debugging

- `window.__game` — full game instance in console (state, plane, approach, save).
- `window.THREE` — for constructing vectors in console experiments.
- Playwright e2e pattern that worked (use a **named session** to avoid colliding with
  other automation sharing the default browser): `playwright-cli -s=noahtest …`,
  then drive via `eval` with `window.__game`.

## Contact

Built for Jesse Schreger's son Noah (the designer). All design direction comes from
Noah; implement what he asks, don't relitigate it.
