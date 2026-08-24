// flight.js — arcade jet model. Three.js conventions: object forward is -z.
// State: pos (Vector3), quat (Quaternion), vel (Vector3), speed (m/s scalar).

import * as THREE from './vendor/three.module.js';

const G = 9.81;
export const CRUISE_REF_MS = 92;   // full-throttle level speed
const ALIGN_RATE = 2.2;            // velocity chases the nose — drifty, you fly it
const PITCH_RATE = 1.45;           // stronger stick: the plane responds to YOU
const ROLL_RATE = 3.1;
const YAW_RATE = 0.5;

export class Aircraft {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.speed = 70;
    this.throttle = 0.75;
    this.grounded = false;
  }

  // Spawn aligned with a direction (unit, world-space) at a position.
  spawn(pos, dir, speedMs) {
    this.pos.copy(pos);
    this.speed = speedMs;
    this.vel.copy(dir).multiplyScalar(speedMs);
    this.throttle = 0.78;
    this.grounded = false;
    const yaw = Math.atan2(-dir.x, -dir.z);   // forward=(-sin y,0,-cos y)
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  }

  get forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
  }
  get up() {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);
  }

  update(dt, inp) {
    if (this.grounded) {
      // Arrested: decelerate hard, settle on deck.
      this.speed = Math.max(0, this.speed - 32 * dt);
      this.vel.setLength(this.speed * Math.sign(this.vel.length() || 1));
      this.pos.addScaledVector(this.vel, dt);
      return;
    }

    // ---- attitude from stick -------------------------------------------
    const dq = new THREE.Quaternion();
    if (inp.pitch) this.quat.multiply(dq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), inp.pitch * PITCH_RATE * dt));
    if (inp.roll) this.quat.multiply(dq.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -inp.roll * ROLL_RATE * dt));
    if (inp.yaw) this.quat.multiply(dq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -inp.yaw * YAW_RATE * dt));

    // ---- bank-induced turn (world-Y rotation) --------------------------
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
    const bank = -Math.asin(Math.max(-1, Math.min(1, right.y)));   // >0 rolled right
    if (Math.abs(bank) > 0.02) {
      const yawDelta = -(G * Math.tan(Math.max(-1.1, Math.min(1.1, bank))) / Math.max(this.speed, 25)) * dt;
      this.quat.premultiply(dq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDelta));
    }
    this.quat.normalize();

    // ---- energy ---------------------------------------------------------
    const fwd = this.forward;
    const thrustAcc = 9.4 * this.throttle;
    const dragAcc = 9.4 * Math.pow(this.speed / CRUISE_REF_MS, 2);
    this.speed += (thrustAcc - dragAcc - G * fwd.y) * dt;
    this.speed = Math.max(18, Math.min(140, this.speed));

    // Velocity chases the nose; slow flight sags toward the sea.
    this.vel.lerp(fwd.clone().multiplyScalar(this.speed), 1 - Math.exp(-ALIGN_RATE * dt));
    const sag = Math.max(0, 1 - Math.pow(this.speed / 55, 2));
    this.vel.y -= G * sag * dt;

    this.pos.addScaledVector(this.vel, dt);
  }

  get kts() { return this.vel.length() * 1.94384; }
  get sinkMs() { return -this.vel.y; }
}
