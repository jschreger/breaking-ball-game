// main.js — game state machine, input, loop, persistence.

import { PITCHES, simulatePitch } from './pitch.js';
import { buildApproach } from './mapper.js';
import { Aircraft } from './flight.js';
import { Scene3D, DECK_TOP } from './scene.js';
import { HUD } from './hud.js';
import { crossTrackErr, gradeApproach, findWire, TRAP_Z_MIN, TRAP_Z_MAX } from './scoring.js';
import { TouchControls } from './touch.js';

const SAVE_KEY = 'breaking-ball-save-v1';
const APPROACH_LEN = 2800;
const TOUCH_Z = 82;
const GEAR_H = 2;               // wheels height above deck-contact
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
        onRestart: () => { if (['flying', 'landed'].includes(this.state)) this.launch(); },
        onPause: () => { if (['flying', 'landed'].includes(this.state)) this.pause(); },
      });
      // touch UI follows screen state
      const _show = this.hud.showScreen.bind(this.hud);
      this.hud.showScreen = name => {
        _show(name);
        this.touch[name === '' ? 'show' : 'hide']();
        document.body.classList.toggle('flying', name === '');
      };
    }
    this.plane = new Aircraft();
    this.save = this.loadSave();
    this.state = 'menu';
    this.input = { pitch: 0, roll: 0, yaw: 0 };
    this.keys = {};
    this.trace = [];
    this.errSum = 0; this.errN = 0;

    this.bindInput();
    this.hud.renderMenu(PITCHES, this.save, i => this.startPitch(i));
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

      if (this.state === 'flying' || this.state === 'landed') {
        if (k === 'c') this.scene3d.camMode = (this.scene3d.camMode + 1) % 3;
        if (k === 'r') this.launch();
        if (e.key === 'Escape') this.pause();
      } else if (this.state === 'paused') {
        if (e.key === 'Escape' || k === 'r') this.resume();
      } else if (this.state === 'brief') {
        if (e.key === 'Enter' || k === ' ') $('brief-start').click();
      } else if (this.state === 'debrief') {
        if (e.key === 'Enter') $('deb-next').click();
        if (k === 'r') $('deb-retry').click();
      } else if (this.state === 'menu') {
        if (k === 'escape' ) {} // no-op
      }

      // throttle held keys
      if (this.state === 'flying') {
        if (e.key === 'w' || e.key === 'W') this.plane.throttle = Math.min(1, this.plane.throttle + 0.06);
        if (e.key === 's' || e.key === 'S') this.plane.throttle = Math.max(0, this.plane.throttle - 0.06);
      }
    });
    window.addEventListener('keyup', e => { this.keys[e.key] = false; });

    $('deb-retry').onclick = () => this.launch();
    $('deb-menu').onclick = () => this.toMenu();
    $('pause-resume').onclick = () => this.resume();
    $('pause-restart').onclick = () => { this.resume(); this.launch(); };
    $('pause-quit').onclick = () => this.toMenu();
  }

  toMenu() {
    this.state = 'menu';
    this.hud.renderMenu(PITCHES, this.save, i => this.startPitch(i));
    this.hud.showScreen('menu');
  }

  startPitch(i) {
    this.pitchIndex = i;
    this.def = PITCHES[i];
    this.traj = simulatePitch(this.def);
    this.approach = buildApproach(this.traj.pts, { lengthM: APPROACH_LEN, touchZ: TOUCH_Z });
    this.scene3d.setGhost(this.approach.pts);
    this.state = 'brief';
    this.hud.showScreen('brief');
    this.hud.fillBrief(this.traj, this.approach, this.def, () => this.launch());
    this.renderSceneOnly();
  }

  launch() {
    const a = this.approach;
    const dir = new THREE.Vector3(
      a.pts[6].x - a.pts[0].x,
      a.pts[6].y - a.pts[0].y,
      a.pts[6].z - a.pts[0].z
    ).normalize();
    const startMs = ((this.def.landKts[0] + this.def.landKts[1]) / 2) * 0.514444 * 1.05;
    const startPos = new THREE.Vector3(a.start.x, a.start.y + 8, a.start.z + 60);
    this.plane.spawn(startPos, dir, startMs);

    this.trace = [startPos.clone()];
    this.errSum = 0; this.errN = 0;
    this.outcome = null;
    this.landedTimer = 0;
    this.scene3d.resetShipWires();
    this.hud.setPitchLabel(`${this.pitchIndex + 1}. ${this.def.name}`);
    this.hud.showLegend(!this.isTouch);
    this.hud.showScreen('');
    this.state = 'flying';
  }

  pause() {
    this._prePause = this.state;   // 'flying' or 'landed'
    this.state = 'paused';
    this.hud.showScreen('pause');
  }
  resume() {
    this.state = this._prePause || 'flying';
    this.hud.showScreen('');
  }

  fail(outcome, pos) {
    this.outcome = outcome;
    this.scene3d.spawnBoom(pos, outcome === 'water' ? 0x9fd8ff : 0xff8830);
    this.state = 'crashed';
    this.finishIn = 1.3;
  }

  evaluate() {
    const p = this.plane;
    const adherence = this.errN > 0 ? Math.exp(-(this.errSum / this.errN) / 42) : 0;
    const ev = {
      adherence,
      wire: this.touchedWire || 0,
      latOff: p.pos.x,
      sinkMs: this.touchSink ?? p.sinkMs,
      kts: this.touchKts ?? p.kts,
      landKts: this.def.landKts,
      outcome: this.outcome || 'trap',
    };
    const result = gradeApproach(ev);

    // progression + best-grade bookkeeping
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
    this.hud.showScreen('debrief');
    this.hud.fillDebrief(result, this.approach.pts, this.trace);

    const hasNext = this.pitchIndex + 1 < PITCHES.length;
    $('deb-next-label').textContent =
      !hasNext ? 'MENU' :
      result.safe ? `NEXT PITCH: ${PITCHES[this.pitchIndex + 1].name.toUpperCase()}` :
      'RETRY UNLOCKS NOTHING — NEXT ANYWAY';
    $('deb-next').onclick = () => {
      hasNext ? this.startPitch(Math.min(this.pitchIndex + 1, PITCHES.length - 1)) : this.toMenu();
    };
  }

  updateFlying(dt) {
    const k = this.keys;
    const inp = this.input;
    if (this.touch) {
      inp.pitch = this.touch.pitch;
      inp.roll = this.touch.roll;
      this.plane.throttle = this.touch.throttle;
    } else {
      inp.pitch = (k['ArrowDown'] ? 1 : 0) - (k['ArrowUp'] ? 1 : 0);   // pull back = nose up
      inp.roll = (k['ArrowRight'] ? 1 : 0) - (k['ArrowLeft'] ? 1 : 0);
      inp.yaw = (k['d'] || k['D'] ? 1 : 0) - (k['a'] || k['A'] ? 1 : 0);

      if (k['w'] || k['W']) this.plane.throttle = Math.min(1, this.plane.throttle + 0.45 * dt);
      if (k['s'] || k['S']) this.plane.throttle = Math.max(0, this.plane.throttle - 0.45 * dt);
    }

    const prevY = this.plane.pos.y;
    this.plane.update(dt, inp);

    // path adherence
    const err = crossTrackErr(this.plane.pos, this.approach.pts);
    this.curErr = err;
    this.errSum += err; this.errN += 1;

    this.hud.updateFlight(this.plane, err, this.plane.throttle);

    if ((k['h'] || k['H']) !== !!this._hintOn) {
      this._hintOn = !!(k['h'] || k['H']);
      this.hud.flashMsg(this._hintOn ? 'FOLLOW THE BLUE RIBBON — CATCH WIRE 2 OR 3' : '', '#38e1ff');
    }

    // ---- outcome checks -------------------------------------------------
    const p = this.plane;
    if (p.pos.y <= 0.7) return this.fail('water', p.pos);

    const overDeckX = Math.abs(p.pos.x) <= 36;
    const overDeckZ = p.pos.z >= -144 && p.pos.z <= 144;

    if (prevY > CONTACT_Y && p.pos.y <= CONTACT_Y) {
      this.touchSink = p.sinkMs;
      this.touchKts = p.kts;
      if (overDeckX && overDeckZ && p.pos.z >= TRAP_Z_MIN && p.pos.z <= TRAP_Z_MAX) {
        this.touchedWire = findWire(p.pos.z);
        if (this.touchedWire) this.scene3d.flashWire(this.touchedWire);
        if (!this.touchedWire) {
          // missed every wire — that's a bolter
          this.outcome = 'bolter';
          this.hud.flashMsg('MISSED THE WIRES — BOLTER', '#ff9f43');
        } else {
          this.hud.flashMsg(`WIRE ${this.touchedWire}!`, '#3ddc84');
        }
        p.grounded = true;
        this.state = 'landed';
        this.landedTimer = this.touchedWire ? 2.0 : 1.4;
      } else if (overDeckX && overDeckZ) {
        return this.fail('deck', p.pos);   // hit the parked deck forward of the trap area
      }
      // touched "contact height" off the ship = keep flying (it's just altitude)
    }

    if (p.pos.z < -170) return this.fail('flyover', p.pos);
    if (Math.abs(p.pos.x) > 900 || p.pos.y > 600 || p.vel.length() < 12)
      return this.fail('water', p.pos);
  }

  renderSceneOnly() {
    // place jet at ghost start for the briefing backdrop
    const a = this.approach.start;
    this.scene3d.updateJet(new THREE.Vector3(a.x, a.y + 8, a.z + 60),
      new THREE.Quaternion(), 0.75);
    this.scene3d.updateCamera(1, new THREE.Vector3(a.x, a.y + 30, a.z + 130), new THREE.Quaternion());
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.033);

    if (this.state === 'flying') {
      this.updateFlying(dt);
    } else if (this.state === 'landed') {
      this.plane.update(dt, this.input);
      this.curErr = this.curErr || 0;
      this.landedTimer -= dt;
      if (this.landedTimer <= 0) this.evaluate();
    } else if (this.state === 'crashed') {
      this.finishIn -= dt;
      if (this.finishIn <= 0) this.evaluate();
    }

    if (['flying', 'landed'].includes(this.state)) {
      this.trace.push(this.plane.pos.clone());
      if (this.trace.length > 4000) this.trace.shift();
      this.scene3d.updateJet(this.plane.pos, this.plane.quat, this.plane.throttle);
      this.scene3d.updateCamera(dt, this.plane.pos, this.plane.quat);
    }

    this.scene3d.render(dt);
  }
}

// three is needed in main for vectors/clock
import * as THREE from 'three';

window.addEventListener('DOMContentLoaded', () => { window.__game = new Game(); });
