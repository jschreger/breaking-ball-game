# BREAKING BALL — Carrier Approach

A browser flight game with one twist: **every approach onto the carrier must fly the
trajectory of a specific baseball pitch.**

Each pitch travels 60.5 feet from mound to plate. We scale that space up ~150×,
anchor the plate-crossing point to the touchdown spot on the carrier deck, and hand
you a jet. The pitch's *break becomes your glide path*: a curveball is a long steep
dive, a slider snaps sideways late, a splitter falls off the table right at the boat,
and the knuckleball wanders on a seeded pattern you have to learn.

Fly the blue ghost ribbon down to the deck, catch **wire 2 or 3**, land inside the
speed window — get graded like a Navy LSO would grade you.

## Run it

```bash
cd noah_game
python3 -m http.server 8000
# open http://localhost:8000
```

Needs a one-time internet connection for the three.js CDN module. Keyboard required.

## Controls

**Keyboard:** ↑↓ pitch (↓ pulls nose up) · ←→ roll · A/D rudder · W/S throttle · C camera · R restart · Esc pause

**Touch (iPad):** left half of screen = virtual stick (drag up = nose up, sideways = roll) · right-edge slider = throttle · CAM / RST / ❚❚ buttons. Play in landscape.

## The roster

1. **Four-Seam Fastball** — straight and fast; carry your speed to the deck
2. **Changeup** — same look, less gas, gentle arm-side fade
3. **Slider** — late lateral break back toward centerline
4. **Screwball** — runs out over open ocean before bending aboard
5. **Slurve** — big sideways AND downward break
6. **Splitter** — fastball look, then falls off the table at the ramp
7. **Curveball** — the classic ever-steepening dive
8. **Knuckleball** — near-zero spin, seeded wander; the final exam

Land safely to unlock the next pitch. Best grades persist in `localStorage`.

## Grading (Navy LSO flavor)

- **OK** — on path ≥88%, wire 2–3, ≤5 m lateral offset, inside the speed window
- **(OK)** — passed everything with a little slop
- **_NO WAVE_** — landed but marginal; you'd hear about it
- **CUT** — unsafe: wild sink rate, huge offset, or badly off-path
- **BOLTER** — missed every wire; go around
- Score combines path adherence (RMS cross-track error vs. the ghost), wire value,
  touchdown speed window, lateral offset, and sink rate.

## How it works

```
js/pitch.js    Baseball physics: gravity + linear drag + Magnus lift (spin axis × v),
               integrated at dt=2 ms in mound-space (feet). Aim solver iterates the
               initial direction until the ball crosses the plate at 2.6 ft.
               Knuckleball wobble = seeded sinusoid sum (identical every attempt).
js/mapper.js   Uniform scale s = approachLength / 60.5 ft. Plate → touchdown point,
               release point → 2.8 km astern at ~170 m. Preserves all break shapes,
               including lateral ones (the reason this game is 3D).
js/flight.js   Arcade jet: stick rates + bank-induced turn, energy model (diving
               gains speed, climbing bleeds it), velocity chases the nose, slow
               flight sags toward the sea.
js/scoring.js  Per-frame distance-to-ghost-polyline; wire bands, trap-zone checks,
               grade logic.
js/scene.js    Three.js: ocean swell, carrier with painted deck + arresting wires,
               jet, pulsing ghost ribbon with rings, three cameras.
js/hud.js      Menus, briefing (with side/top ghost previews), HUD, debrief plots
               overlaying your trace on the ghost.
js/main.js     State machine, input, persistence.
```

### Design numbers

- Approach span: 2800 m horizontal, start ≈ 171 m ASL → glideslope ≈ 3°
- Deck: 290 × 74 m; trap zone z ∈ [45, 115]; wires at z = 70/78/86/94
- Break scaling: 1 ft of pitch break ≈ 46 m of aircraft path deviation
