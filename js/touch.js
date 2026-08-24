// touch.js — on-screen controls for iPads / touch devices.
// Left 55% of screen = virtual stick (drag: up = nose up, sideways = roll).
// Right edge = vertical throttle slider. Top-right = CAM / RST / PAUSE buttons.

const R = 60; // stick radius in px

export class TouchControls {
  constructor({ onCam, onRestart, onPause }) {
    this.pitch = 0;
    this.roll = 0;
    this.throttle = 0.75;

    this.ui = document.getElementById('touch-ui');
    this.zone = document.getElementById('stick-zone');
    this.base = document.getElementById('stick-base');
    this.knob = document.getElementById('stick-knob');
    this.track = document.getElementById('thr-track');
    this.fill = document.getElementById('thr-touch-fill');

    this._stickId = null;
    this._thrId = null;
    this._origin = null;

    // block iOS pinch/double-tap zoom during play
    const block = e => e.preventDefault();
    document.addEventListener('gesturestart', block);

    // ---- virtual stick -------------------------------------------------
    this.zone.addEventListener('touchstart', e => {
      e.preventDefault();
      if (this._stickId !== null) return;
      const t = e.changedTouches[0];
      this._stickId = t.identifier;
      this._origin = { x: t.clientX, y: t.clientY };
      this.base.style.display = this.knob.style.display = 'block';
      this._place(this.base, t.clientX, t.clientY);
      this._place(this.knob, t.clientX, t.clientY);
    }, { passive: false });

    window.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._stickId) {
          e.preventDefault();
          let dx = t.clientX - this._origin.x;
          let dy = t.clientY - this._origin.y;
          const len = Math.hypot(dx, dy);
          if (len > R) { dx *= R / len; dy *= R / len; }
          this.pitch = clamp(-dy / R);   // drag up = nose up (direct mapping)
          this.roll = clamp(dx / R);
          this._place(this.knob, this._origin.x + dx, this._origin.y + dy);
        } else if (t.identifier === this._thrId) {
          e.preventDefault();
          this._setThrottleFromY(t.clientY);
        }
      }
    }, { passive: false });

    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._stickId) {
          this._stickId = null;
          this.pitch = this.roll = 0;
          this.base.style.display = this.knob.style.display = 'none';
        }
        if (t.identifier === this._thrId) this._thrId = null;
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    // ---- throttle slider -------------------------------------------------
    this.track.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._thrId = t.identifier;
      this._setThrottleFromY(t.clientY);
    }, { passive: false });

    // ---- buttons -----------------------------------------------------------
    const bind = (id, fn) => document.getElementById(id).addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); });
    bind('tb-cam', onCam);
    bind('tb-rst', onRestart);
    bind('tb-pause', onPause);
  }

  _setThrottleFromY(clientY) {
    const r = this.track.getBoundingClientRect();
    if (!r.height) return;                       // slider not visible yet
    this.throttle = clamp(1 - (clientY - r.top) / r.height);
    this.fill.style.height = `${Math.round(this.throttle * 100)}%`;
  }

  _place(el, x, y) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  show() { this.ui.style.display = 'block'; }
  hide() { this.ui.style.display = 'none'; this._stickId = this._thrId = null; this.pitch = this.roll = 0; }
}

function clamp(v) { return Math.max(-1, Math.min(1, v)); }
