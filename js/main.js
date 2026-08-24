// main.js — game state machine: menu → cruise (call your pitch) → fly the
// gates yourself → debrief. No autopilot ribbon; the designer was clear.

import { PITCHES, simulatePitch } from './pitch.js';
import { buildApproach } from './mapper.js';
import { Aircraft } from './flight.js';
import { Scene3D, DECK_TOP } from './scene.js';
import { HUD } from './hud.js';
import { TouchControls } from './touch.js';
import { crossTrackErr, gradeApproach, findWire, TRAP_Z_MIN, TRAP_Z_MAX } from './scoring.js';

const SAVE_KEY = 'breaking-ball-save-v1';
const APPROACH_LEN = 3400;      // carrier got bigger — longer, same 3° slope
const TOUCH_Z = 115;            // between wires 2 and 3 (world z)
const GEAR_H = 2;
const CONTACT_Y = DECK_TOP + GEAR_H;

const $ = id => document.getElementById(id);

class Game {
  constructor() {
    this.hud = new HUD();
    this.scene3d = new Scene3D($('view'));
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) {
      document.body.classList.add('touch-device');
      this.touch = new TouchControls({
        onCam: () => { this.scene3d.camMode = (this.scene3d.camMode + 1) % 3; },
        onRestart: () => { if (['cruise', 'flying', 'landed'].includes(this.state)) this.enterCruise(this.armed ? this.pitchIndex : null); },
        onPause: () => { if (['cruise', 'flying', 'landed'].includes(this.state)) this.pause(); },
        onPitch: () => { if (this.state === 'cruise') this.openSelector(); },
      });
      const _show = this.hud.showScreen.bind(this.hud);
      this.hud.showScreen = name => {
        _show(name);
        const inFlight = name === '' || name === 'selector';
        this.touch[inFlight ? 'show' : 'hide']();
        document.body.classList.toggle('flying', inFlight);
      };
    }
    this.plane = new Aircraft();
    this.save = this.loadSave();
    this.state = 'menu';
    this.input = { pitch: 0, roll: 0, yaw: 0 };
    this.keys = {};
    this.trace = [];
    this.errSum = 0; this.errN = 0;
    this.armed = false;
    this.nextGate = 0;

    this.bindInput();
    this.hud.renderMenu(PITCHES, this.save);
    $('takeoff').onclick = () => this.enterCruise(null);
    this.hud.showScreen('menu');
    $('loading').classList.remove('visible');

    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.unlocked && s.best) return s;
    } catch (_) {}
    return { unlocked: 1, best: {} };
  }
  persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); }

  bindInput() {
    window.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys[e.key] = true;
      const k = e.key.toLowerCase();

      if (this.state === 'flying' || this.state === 'landed' || this.state === 'cruise') {
        if (k === 'c') this.scene3d.camMode = (this.scene3d.camMode + 1) % 3;
        if (k === 'r') this.enterCruise(this.armed ? this.pitchIndex : null);
        if (e.key === 'Escape') this.pause();
        if (k === 'p' && this.state === 'cruise') this.openSelector();
      } else if (this.state === 'paused') {
        if (e.key === 'Escape' || k === 'r') this.resume();
      } else if (this.state === 'debrief') {
        if (e.key === 'Enter') $('deb-next').click();
        if (k === 'r') $('deb-retry').click();
      }

      if (this.state === 'flying' || this.state === 'cruise') {
        if (e.key === 'w' || e.key === 'W') this.plane.throttle = Math.min(1, this.plane.throttle + 0.06);
        if (e.key === 's' || e.key === 'S') this.plane.throttle = Math.max(0, this.plane.throttle - 0.06);
      }
    });
    window.addEventListener('keyup', e => { this.keys[e.key] = false; });

    $('deb-retry').onclick = () => this.enterCruise(this.pitchIndex);
    $('deb-next').onclick = () => {
      const next = this.pitchIndex + 1;
      next < PITCHES.length ? this.enterCruise(next) : this.toMenu();
    };
    $('deb-menu').onclick = () => this.toMenu();
    $('pause-resume').onclick = () => this.resume();
    $('pause-restart').onclick = () => { this.resume(); this.enterCruise(this.armed ? this.pitchIndex : null); };
    $('pause-quit').onclick = () => this.toMenu();
  }

  toMenu() {
    this.state = 'menu';
    this.hud.renderMenu(PITCHES, this.save);
    this.hud.showScreen('menu');
  }

  // ---- cruise: airborne behind the boat, call your pitch -----------------
  enterCruise(preselect = null) {
    this.state = 'cruise';
    this.armed = false;
    this.scene3d.clearGates();
    this.scene3d.resetShipWires();

    const startPos = new THREE.Vector3(0, 205, TOUCH_Z + APPROACH_LEN + 120);
    this.plane.spawn(startPos, new THREE.Vector3(0, 0, -1), 70);

    this.trace = [];
    this.errSum = 0; this.errN = 0;
    this.nextGate = 0;
    this.hud.showLegend(!this.isTouch);
    this.hud.hideGateHint();
    this.hud.showScreen(preselect === null ? 'selector' : '');
    this.hud.setPitchLabel('CALL YOUR PITCH');
    if (preselect === null) this.renderSelector();
    else this.armPitch(preselect);
  }

  openSelector() {
    this.renderSelector();
    this.hud.showScreen('selector');
  }

  renderSelector() {
    this.hud.renderSelector(PITCHES, this.save, i => this.armPitch(i));
  }

  armPitch(i) {
    if (i >= this.save.unlocked) {
      this.hud.flashMsg('LOCKED — LAND THE PREVIOUS PITCH FIRST', '#ff5252');
      return;
    }
    this.pitchIndex = i;
    this.def = PITCHES[i];
    this.traj = simulatePitch(this.def);
    this.approach = buildApproach(this.traj.pts, { lengthM: APPROACH_LEN, touchZ: TOUCH_Z });
    this.scene3d.setGates(this.approach.pts);
    this.armed = true;
    this.nextGate = 0;
    this.errSum = 0; this.errN = 0;
    this.hud.showScreen('');     // closes the selector
    this.hud.setPitchLabel(`${i + 1}. ${this.def.name}`);
    this.hud.flashMsg(`${this.def.name.toUpperCase()} — FLY THE ORANGE ENTRY GATE`, '#38e1ff');
  }

  pause() {
    this._prePause = this.state;
    this.state = 'paused';
    this.hud.showScreen('pause');
  }
  resume() {
    this.state = this._prePause || 'cruise';
    this.hud.showScreen(this.state === 'cruise' && !this.armed ? 'selector' : '');
  }

  fail(outcome, pos) {
    this.outcome = outcome;
    this.scene3d.spawnBoom(pos, outcome === 'water' ? 0x9fd8ff : 0xff8830);
    this.state = 'crashed';
    this.finishIn = 1.3;
  }

  evaluate() {
    const adherence = this.errN > 0 ? Math.exp(-(this.errSum / this.errN) / 42) : 0;
    const ev = {
      adherence,
      wire: this.touchedWire || 0,
      latOff: this.plane.pos.x,
      sinkMs: this.touchSink ?? this.plane.sinkMs,
      kts: this.touchKts ?? this.plane.kts,
      landKts: this.def.landKts,
      outcome: this.outcome || 'trap',
    };
    const result = gradeApproach(ev);

    if (result.safe) {
      const nextIdx = this.pitchIndex + 1;
      if (nextIdx < PITCHES.length && nextIdx >= this.save.unlocked) this.save.unlocked = nextIdx + 1;
    }
    const prevBest = this.save.best[this.def.id];
    if (!prevBest || result.score > prevBest.score) {
      this.save.best[this.def.id] = { grade: result.grade, score: result.score };
    }
    this.persist();

    this.state = 'debrief';
    this.hud.showLegend(false);
    this.hud.hideGateHint();
    this.hud.showScreen('debrief');
    this.hud.fillDebrief(result, this.approach.pts, this.trace);

    const hasNext = this.pitchIndex + 1 < PITCHES.length;
    $('deb-next-label').textContent = hasNext ? `NEXT: ${PITCHES[this.pitchIndex + 1].name.toUpperCase()}` : 'MENU';
    $('deb-next').onclick = () => {
      hasNext ? this.enterCruise(null) : this.toMenu();   // NEXT → call the next pitch in the air
    };
  }

  // ---- per-frame flight update (cruise AND flying share controls) --------
  updateFlying(dt) {
    const k = this.keys;
    const inp = this.input;
    if (this.touch) {
      this.touch.sample();
      inp.pitch = this.touch.pitch;
      inp.roll = this.touch.roll;
      this.plane.throttle = this.touch.throttle;
    } else {
      inp.pitch = (k['ArrowDown'] ? 1 : 0) - (k['ArrowUp'] ? 1 : 0);   // ↓ pulls nose up
      inp.roll = (k['ArrowRight'] ? 1 : 0) - (k['ArrowLeft'] ? 1 : 0);
      inp.yaw = (k['d'] || k['D'] ? 1 : 0) - (k['a'] || k['A'] ? 1 : 0);

      if (k['w'] || k['W']) this.plane.throttle = Math.min(1, this.plane.throttle + 0.45 * dt);
      if (k['s'] || k['S']) this.plane.throttle = Math.max(0, this.plane.throttle - 0.45 * dt);
    }

    const prevY = this.plane.pos.y;
    this.plane.update(dt, inp);
    const p = this.plane;

    // ---- gate progression (both cruise-armed and flying) ----------------
    if (this.armed && this.nextGate < this.scene3d.gates.length) {
      const gp = this.scene3d.gatePts[this.nextGate].pos;
      const dx = p.pos.x - gp.x, dy = p.pos.y - gp.y, dz = p.pos.z - gp.z;
      const d = Math.hypot(dx, dy, dz);
      const passR = this.nextGate === 0 ? 30 : 20;

      // HUD guidance to the next gate
      const fwd = p.forward;
      const tx = gp.x - p.pos.x, tz = gp.z - p.pos.z;
      const dot = tx * fwd.x + tz * fwd.z;
      const cross = fwd.x * tz - fwd.z * tx;
      const angDeg = Math.atan2(cross, dot) * 180 / Math.PI;
      const vdir = dy >= 0 ? '↑' : '↓';
      this.hud.updateGateHint(
        `GATE ${this.nextGate + 1}/${this.scene3d.gates.length} · ${Math.round(d)}m ${vdir}${Math.abs(Math.round(dy))}m`,
        angDeg
      );

      if (d < passR) {
        this.nextGate++;
        this.scene3d.setNextGate(this.nextGate);
        if (this.state === 'cruise' && this.nextGate >= 1) {
          // ENTRY GATE CLEARED — the attempt (and scoring) begins NOW
          this.state = 'flying';
          this.errSum = 0; this.errN = 0;
          this.trace = [p.pos.clone()];
          this.hud.flashMsg('APPROACH START — FLY THE GATES, CATCH A WIRE', '#3ddc84');
        }
      }
    } else if (this.state === 'cruise') {
      this.hud.hideGateHint();
    }

    if (this.state === 'cruise') {
      // free flight: respawn instead of grading
      if (p.pos.y < 1) {
        this.scene3d.spawnBoom(p.pos, 0x9fd8ff);
        this.enterCruise(this.armed ? this.pitchIndex : null);
        this.hud.flashMsg('WATCH THE WATER', '#ff5252');
        return;
      }
      if (p.pos.z < TOUCH_Z - 280 || Math.abs(p.pos.x) > 1200 || p.pos.y > 700) {
        this.enterCruise(this.armed ? this.pitchIndex : null);
        return;
      }
      return;
    }

    // ---- flying: scoring + landing ---------------------------------------
    const err = crossTrackErr(p.pos, this.approach.pts);
    this.curErr = err;
    this.errSum += err; this.errN += 1;
    this.hud.updateFlight(p, err, p.throttle);

    if (p.pos.y <= 0.7) return this.fail('water', p.pos);

    const overDeckX = Math.abs(p.pos.x) <= 50;
    const overDeckZ = p.pos.z >= -202 && p.pos.z <= 202;

    if (prevY > CONTACT_Y && p.pos.y <= CONTACT_Y) {
      this.touchSink = p.sinkMs;
      this.touchKts = p.kts;
      if (overDeckX && overDeckZ && p.pos.z >= TRAP_Z_MIN && p.pos.z <= TRAP_Z_MAX) {
        this.touchedWire = findWire(p.pos.z);
        if (this.touchedWire) this.scene3d.flashWire(this.touchedWire);
        if (!this.touchedWire) {
          this.outcome = 'bolter';
          this.hud.flashMsg('MISSED THE WIRES — BOLTER', '#ff9f43');
        } else {
          this.hud.flashMsg(`WIRE ${this.touchedWire}!`, '#3ddc84');
        }
        p.grounded = true;
        this.state = 'landed';
        this.landedTimer = this.touchedWire ? 2.0 : 1.4;
      } else if (overDeckX && overDeckZ) {
        return this.fail('deck', p.pos);
      }
    }

    if (p.pos.z < -230) return this.fail('flyover', p.pos);
    if (Math.abs(p.pos.x) > 900 || p.pos.y > 600 || p.vel.length() < 12)
      return this.fail('water', p.pos);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.033);

    if (this.state === 'cruise' || this.state === 'flying') {
      this.updateFlying(dt);
    } else if (this.state === 'landed') {
      this.plane.update(dt, this.input);
      this.landedTimer -= dt;
      if (this.landedTimer <= 0) this.evaluate();
    } else if (this.state === 'crashed') {
      this.finishIn -= dt;
      if (this.finishIn <= 0) this.evaluate();
    }

    if (['cruise', 'flying', 'landed'].includes(this.state)) {
      if (this.state === 'flying') {
        this.trace.push(this.plane.pos.clone());
        if (this.trace.length > 4000) this.trace.shift();
      }
      this.scene3d.updateJet(this.plane.pos, this.plane.quat, this.plane.throttle);
      this.scene3d.updateCamera(dt, this.plane.pos, this.plane.quat);
    }

    this.scene3d.render(dt);
  }
}

// three is needed in main for vectors/clock
import * as THREE from './vendor/three.module.js';

window.addEventListener('DOMContentLoaded', () => { window.__game = new Game(); window.THREE = THREE; });
