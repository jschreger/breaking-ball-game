// hud.js — DOM overlay management: menus, briefing, HUD readouts, debrief.

import { KT_TO_MS } from './mapper.js';

const $ = id => document.getElementById(id);

function fmtGrade(g) {
  return g.replace('_', '');
}

export class HUD {
  constructor() {
    this.screens = ['loading', 'menu', 'brief', 'debrief', 'pause'];
    this.el = {
      spd: $('spd'), alt: $('alt'), vs: $('vs'), thr: $('thr-fill'),
      err: $('err-fill'), errVal: $('err-val'), pitchLabel: $('pitch-label'),
      msg: $('msg'), legend: $('legend'),
    };
  }

  showScreen(name) {
    this.screens.forEach(s => $(s).classList.toggle('visible', s === name));
    $('hud-flight').style.display = name === '' ? 'block' : 'none';
    if (name !== '') this.el.msg.style.opacity = 0;
  }

  // ------------------------------------------------------------- menu
  renderMenu(pitches, save, onStart) {
    const list = $('menu-list');
    list.innerHTML = '';
    pitches.forEach((p, i) => {
      const unlocked = i < save.unlocked;
      const best = save.best[p.id];
      const card = document.createElement('button');
      card.className = 'card' + (unlocked ? '' : ' locked');
      card.innerHTML = `
        <div class="card-top">
          <span class="card-name">${i + 1}. ${p.name}</span>
          <span class="card-best">${best != null ? fmtGrade(best.grade) + ' · ' + best.score : (unlocked ? '—' : '🔒')}</span>
        </div>
        <div class="card-tag">${p.tag}</div>
        <div class="card-desc">${unlocked ? p.desc : 'Land the previous pitch to unlock.'}</div>`;
      if (unlocked) card.onclick = () => onStart(i);
      list.appendChild(card);
    });
  }

  // ------------------------------------------------------------- brief
  fillBrief(traj, approach, def, onStart) {
    $('brief-title').textContent = def.name.toUpperCase();
    $('brief-tag').textContent = def.tag;
    $('brief-desc').textContent = def.desc;
    const s = traj.summary;
    $('brief-stats').innerHTML = `
      <tr><td>Throw speed</td><td>${s.mph} mph</td></tr>
      <tr><td>Spin rate</td><td>${s.rpm.toLocaleString()} rpm</td></tr>
      <tr><td>Vertical break</td><td>${(Math.abs(s.dropIn) / 12).toFixed(1)} ft ${s.dropIn > 0 ? 'DROP' : 'RIDE'}</td></tr>
      <tr><td>Lateral break</td><td>${(Math.abs(s.sideIn) / 12).toFixed(1)} ft</td></tr>
      <tr><td>Start altitude</td><td>~${Math.round(approach.startAltM)} m</td></tr>
      <tr><td>Landing speed window</td><td>${def.landKts[0]}–${def.landKts[1]} kts</td></tr>
      <tr><td>Ghost length</td><td>${(approach.pathLengthM / 1000).toFixed(1)} km · par ~${Math.round(approach.pathLengthM / ((def.landKts[0] + def.landKts[1]) / 2 * KT_TO_MS))} s</td></tr>`;
    drawPlot($('brief-side'), approach.pts, null, 'side');
    drawPlot($('brief-top'), approach.pts, null, 'top');
    $('brief-start').onclick = onStart;
  }

  // ------------------------------------------------------------- flight
  updateFlight(a, curErr, throttle) {
    this.el.spd.textContent = Math.round(a.kts);
    this.el.alt.textContent = Math.round(Math.max(0, a.pos.y - 21) * 3.281);
    this.el.vs.textContent = a.sinkMs.toFixed(1);
    this.el.thr.style.width = `${Math.round(throttle * 100)}%`;
    const pct = Math.max(0, 100 - Math.min(100, curErr * 1.6));
    this.el.err.style.width = `${pct}%`;
    this.el.err.style.background =
      curErr < 15 ? '#3ddc84' : curErr < 35 ? '#ffd166' : '#ff5252';
    this.el.errVal.textContent = `${Math.round(curErr)} m off-path`;
  }

  flashMsg(text, color = '#ffd166') {
    this.el.msg.textContent = text;
    this.el.msg.style.color = color;
    this.el.msg.style.opacity = 1;
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => { this.el.msg.style.opacity = 0; }, 2200);
  }

  setPitchLabel(name) { this.el.pitchLabel.textContent = name; }
  showLegend(show) { this.el.legend.style.display = show ? 'block' : 'none'; }

  // ------------------------------------------------------------- debrief
  fillDebrief(result, ghostPts, flownPts) {
    $('deb-grade').textContent = fmtGrade(result.grade);
    $('deb-grade').className = 'grade ' +
      (result.grade === 'OK' ? 'g-ok' : result.grade === '(OK)' ? 'g-okish' :
       result.grade === 'BOLTER' ? 'g-bolter' : result.score > 40 ? 'g-nowave' : 'g-cut');
    $('deb-score').textContent = `${result.score} / 100`;
    $('deb-notes').innerHTML = result.notes.map(n => `<li>${n}</li>`).join('');
    drawPlot($('deb-side'), ghostPts, flownPts, 'side');
    drawPlot($('deb-top'), ghostPts, flownPts, 'top');
  }
}

// ---------------------------------------------------------------- plotting
export function drawPlot(canvas, ghost, flown, mode) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(10,16,22,0.85)';
  ctx.fillRect(0, 0, W, H);

  const ptsOf = p => mode === 'side'
    ? [p.z, p.y]   // side profile: distance-to-ship vs altitude
    : [p.x, -p.z]; // top-down: lateral vs along-track

  const all = flown ? [...ghost, ...flown] : ghost;
  const proj = all.map(ptsOf);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  proj.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  const pad = 18;
  const sx = v => pad + (v - minX) / (maxX - minX || 1) * (W - 2 * pad);
  const sy = v => H - pad - (v - minY) / (maxY - minY || 1) * (H - 2 * pad);

  const draw = (arr, color, width, dash) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    arr.forEach((p, i) => {
      const [x, y] = ptsOf(p);
      i === 0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y));
    });
    ctx.stroke(); ctx.setLineDash([]);
  };

  draw(ghost, '#38e1ff', 2.5);
  if (flown && flown.length > 1) draw(flown, '#ff9f43', 2.5, [7, 5]);
  if (flown && flown.length) {
    const [tx, ty] = ptsOf(flown[flown.length - 1]);
    ctx.fillStyle = '#ff5252';
    ctx.beginPath(); ctx.arc(sx(tx), sy(ty), 4.5, 0, 6.283); ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px monospace';
  ctx.fillText(mode === 'side' ? 'SIDE VIEW — altitude vs distance' : 'TOP VIEW — lateral vs track', pad, H - 5);
}
