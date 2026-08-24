// touch.js — iPad controls per the designer: BUTTONS you press to turn.
// D-pad (bottom-left): ▲ nose up · ▼ nose down · ◀ turn left · ▶ turn right.
// Right edge: throttle slider. Top: PITCH / CAM / RST / ❚❚ buttons.

export class TouchControls {
  constructor({ onCam, onRestart, onPause, onPitch }) {
    this.pitch = 0;
    this.roll = 0;
    this.throttle = 0.75;
    this._active = new Set();

    this.ui = document.getElementById('touch-ui');
    this.track = document.getElementById('thr-track');
    this.fill = document.getElementById('thr-touch-fill');
    this._thrId = null;

    const block = e => e.preventDefault();
    document.addEventListener('gesturestart', block);

    // ---- turn/pitch buttons --------------------------------------------
    document.querySelectorAll('#dpad button').forEach(b => {
      const c = b.dataset.c;                       // e.g. 'pitch:1', 'roll:-1'
      const start = e => { e.preventDefault(); this._active.add(c); };
      const end = e => { e.preventDefault(); this._active.delete(c); };
      b.addEventListener('touchstart', start, { passive: false });
      b.addEventListener('touchend', end);
      b.addEventListener('touchcancel', end);
    });

    // ---- throttle slider -------------------------------------------------
    this.track.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._thrId = t.identifier;
      this._setThrottleFromY(t.clientY);
    }, { passive: false });

    window.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._thrId) {
          e.preventDefault();
          this._setThrottleFromY(t.clientY);
        }
      }
    }, { passive: false });

    const thrEnd = e => {
      for (const t of e.changedTouches) if (t.identifier === this._thrId) this._thrId = null;
    };
    window.addEventListener('touchend', thrEnd);
    window.addEventListener('touchcancel', thrEnd);

    // ---- buttons -----------------------------------------------------------
    const bind = (id, fn) => document.getElementById(id).addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); });
    bind('tb-cam', onCam);
    bind('tb-rst', onRestart);
    bind('tb-pause', onPause);
    bind('tb-pitch', onPitch);
  }

  // call once per frame before reading pitch/roll
  sample() {
    this.pitch = (this._active.has('pitch:1') ? 1 : 0) - (this._active.has('pitch:-1') ? 1 : 0);
    this.roll = (this._active.has('roll:1') ? 1 : 0) - (this._active.has('roll:-1') ? 1 : 0);
  }

  _setThrottleFromY(clientY) {
    const r = this.track.getBoundingClientRect();
    if (!r.height) return;                       // slider not visible yet
    this.throttle = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    this.fill.style.height = `${Math.round(this.throttle * 100)}%`;
  }

  show() { this.ui.style.display = 'block'; }
  hide() { this.ui.style.display = 'none'; this._active.clear(); this.pitch = this.roll = 0; }
}
