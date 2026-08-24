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

**Keyboard:** ↑↓ pitch (↓ pulls nose up) · ←→ roll · A/D rudder · W/S throttle · P call pitch · C camera · R restart · Esc pause

**Touch (iPad):** D-pad buttons (▲▼ pitch, ◀▶ turn) bottom-left · throttle slider right edge · PITCH / CAM / RST / ❚❚ buttons. Play in landscape.

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
               release point → 3.4 km astern at ~203 m. Preserves all break shapes,
               including lateral ones (the reason this game is 3D).
js/flight.js   Arcade plane: stick rates + bank-induced turn, energy model (diving
               gains speed, climbing bleeds it), velocity chases the nose, slow
               flight sags toward the sea. Nothing flies itself.
js/scoring.js  Per-frame distance-to-ghost-polyline; wire bands, trap-zone checks,
               grade logic.
js/scene.js    Three.js: ocean swell, big carrier with painted deck, arresting wires
               and parked planes, the baseball-with-wings player plane, guidance
               gates (no ribbon), three cameras.
js/hud.js      Menu, in-game pitch selector, HUD with gate guidance arrow, debrief
               plots overlaying your trace on the ideal path.
js/touch.js    iPad controls: D-pad turn buttons, throttle slider, PITCH/CAM/RST/pause.
js/main.js     State machine (menu → cruise → approach → debrief), input, persistence.
```

### Design numbers

- Approach span: 3400 m horizontal, start ≈ 203 m ASL → glideslope ≈ 3°
- Carrier: 406 × 104 m (1.4× scale), deck top 21 m; trap zone z ∈ [63, 161]
- Wires at world z = 98 / 109 / 120 / 131 (±4.2 m catch bands)
- Break scaling: 1 ft of pitch break ≈ 51 m of aircraft path deviation
- Guidance: 13 gates along the path (entry gate 26 m radius, rest 15 m) — no ribbon
