// hud.js — DOM overlay: menu, in-game pitch selector, HUD, gate guidance, debrief.

import { KT_TO_MS } from './mapper.js';

const $ = id => document.getElementById(id);

function fmtGrade(g) {
  return g.replace('_', '');
}

export class HUD {
  constructor() {
    this.screens = ['loading', 'menu', 'selector', 'debrief', 'pause'];
    this.el = {
      spd: $('spd'), alt: $('alt'), vs: $('vs'), thr: $('thr-fill'),
      err: $('err-fill'), errVal: $('err-val'), pitchLabel: $('pitch-label'),
      msg: $('msg'), legend: $('legend'),
      gateHint: $('gate-hint'), gateArrow: $('gate-arrow'), gateText: $('gate-text'),
    };
  }

  showScreen(name) {
    this.screens.forEach(s => $(s).classList.toggle('visible', s === name));
    const inFlight = name === '' || name === 'selector';
    $('hud-flight').style.display = inFlight ? 'block' : 'none';
    if (!inFlight) this.el.msg.style.opacity = 0;
  }

  // ------------------------------------------------------------- menu
  renderMenu(pitches, save) {
    const list = $('menu-list');
    list.innerHTML = '';
    pitches.forEach((p, i) => {
      const unlocked = i < save.unlocked;
      const best = save.best[p.id];
      const card = document.createElement('div');
      card.className = 'card' + (unlocked ? '' : ' locked');
      card.innerHTML = `
        <div class="card-top">
          <span class="card-name">${i + 1}. ${p.name}</span>
          <span class="card-best">${best != null ? fmtGrade(best.grade) + ' · ' + best.score : (unlocked ? '—' : '🔒')}</span>
        </div>
        <div class="card-tag">${p.tag}</div>
        <div class="card-desc">${unlocked ? p.desc : 'Land the previous pitch to unlock.'}</div>`;
      list.appendChild(card);
    });
  }

  // ------------------------------------------------------------- in-game pitch selector
  renderSelector(pitches, save, onPick) {
    const list = $('selector-list');
    list.innerHTML = '';
    pitches.forEach((p, i) => {
      const unlocked = i < save.unlocked;
      const best = save.best[p.id];
      const b = document.createElement('button');
      b.className = 'card' + (unlocked ? '' : ' locked');
      b.innerHTML = `
        <div class="card-top">
          <span class="card-name">${p.name}</span>
          <span class="card-best">${best != null ? fmtGrade(best.grade) + ' · ' + best.score : (unlocked ? p.tag : '🔒')}</span>
        </div>
        <div class="card-tag">${p.mph} MPH · ${p.rpm.toLocaleString()} RPM</div>
        <div class="card-desc">${unlocked ? p.desc : 'Land the previous pitch to unlock.'}</div>`;
      if (unlocked) b.onclick = () => onPick(i);
      list.appendChild(b);
    });
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

  updateGateHint(text, angleDeg) {
    this.el.gateHint.style.display = 'block';
    this.el.gateText.textContent = text;
    this.el.gateArrow.style.transform = `rotate(${angleDeg.toFixed(1)}deg)`;
  }

  hideGateHint() {
    this.el.gateHint.style.display = 'none';
  }

  flashMsg(text, color = '#ffd166') {
    this.el.msg.textContent = text;
    this.el.msg.style.color = color;
    this.el.msg.style.opacity = 1;
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => { this.el.msg.style.opacity = 0; }, 2400);
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

  // flown path can be sparse vs ghost — normalize both together
  const ptsOf = p => mode === 'side'
    ? [p.z, p.y]
    : [p.x, -p.z];

  const all = flown ? [...ghost, ...flown] : ghost;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  all.forEach(p => {
    const [x, y] = ptsOf(p);
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
  ctx.fillText(mode === 'side' ? 'SIDE VIEW — your line vs the ideal' : 'TOP VIEW — your line vs the ideal', pad, H - 5);
}
