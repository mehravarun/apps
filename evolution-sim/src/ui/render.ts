/* Drawing: the world canvas, family tree, diet-vs-size scatter, totals chart and stat readouts.
   Reads a Snapshot from the worker and never changes the rules. Visuals match evolution_v8.html. */
import { AGENT_STRIDE, type Snapshot } from './protocol.js';

export const TICKS_PER_SEC = 60;
const $ = (id: string) => document.getElementById(id)!;

export interface View { ctx: CanvasRenderingContext2D; w: number; h: number }

export function setupCanvas(id: string): View {
  const dpr = window.devicePixelRatio || 1;
  const cv = $(id) as HTMLCanvasElement, w = cv.width, h = cv.height;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d')!; ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

const inkColor = () => getComputedStyle(document.body).getPropertyValue('--ink').trim() || '#2c2c2a';
const speciesColor = (id: number) => `hsl(${(id * 137.508) % 360}, 65%, 52%)`;

export function drawWorld({ ctx, w, h }: View, s: Snapshot) {
  const ink = inkColor(), cell = s.plantCell;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.scale(w / s.width, h / s.height);       // fit any world size into the canvas
  for (let i = 0; i < s.biomass.length; i++) {
    const b = s.biomass[i];
    if (b <= 0) continue;
    ctx.fillStyle = `rgba(99,153,34,${(0.1 + b * 0.55).toFixed(2)})`;
    ctx.fillRect((i % s.cols) * cell, Math.floor(i / s.cols) * cell, cell, cell);
  }
  ctx.fillStyle = 'rgba(133,79,11,0.75)';
  for (let i = 0; i < s.carcasses.length; i += 2) ctx.fillRect(s.carcasses[i] - 2, s.carcasses[i + 1] - 2, 4, 4);
  const A = s.agents;
  for (let o = 0; o < A.length; o += AGENT_STRIDE) {
    ctx.fillStyle = speciesColor(A[o + 3]);
    ctx.beginPath(); ctx.arc(A[o], A[o + 1], A[o + 2], 0, Math.PI * 2); ctx.fill();
    if (A[o + 4]) { ctx.strokeStyle = ink; ctx.lineWidth = 1.5 * s.scale; ctx.stroke(); }
  }
  ctx.restore();
}

export function drawTree({ ctx, w, h }: View, s: Snapshot) {
  const ink = inkColor();
  ctx.clearRect(0, 0, w, h);
  const now = s.tick, t0 = Math.max(0, now - 60 * TICKS_PER_SEC * 10);   // last 10 sim-minutes
  const list = s.tree;
  if (!list.length) return;
  const rowH = (h - 16) / list.length, X = (t: number) => 8 + (Math.max(t, t0) - t0) / Math.max(1, now - t0) * (w - 40);
  const rowOf = new Map(list.map((sp, i) => [sp.id, i]));
  const Y = (i: number) => 8 + rowH * (i + 0.5);
  list.forEach((sp, i) => {
    const parentRow = sp.parent === null ? undefined : rowOf.get(sp.parent);
    if (parentRow !== undefined && sp.born > t0) {
      ctx.strokeStyle = 'rgba(136,135,128,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(sp.born), Y(parentRow)); ctx.lineTo(X(sp.born), Y(i)); ctx.stroke();
    }
    ctx.fillStyle = speciesColor(sp.id);
    for (let k = 0; k < sp.history.length; k++) {
      const p = sp.history[k], next = sp.history[k + 1];
      if (p.t < t0) continue;
      const x0 = X(p.t), x1 = next ? X(next.t) : X(sp.died ?? now);
      const th = Math.min(rowH - 1, 1 + Math.log2(p.n + 1) * 1.6);
      ctx.fillRect(x0, Y(i) - th / 2, Math.max(1, x1 - x0), th);
    }
    if (sp.died === null) {
      ctx.fillStyle = ink; ctx.font = '10px system-ui'; ctx.textAlign = 'left';
      ctx.fillText(String(sp.count), w - 30, Y(i) + 3);
    }
  });
}

export function drawScatter({ ctx, w, h }: View, s: Snapshot) {
  const pad = 8;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(136,135,128,0.4)'; ctx.setLineDash([3, 3]);
  const xm = pad + 0.5 * (w - 2 * pad);
  ctx.beginPath(); ctx.moveTo(xm, 0); ctx.lineTo(xm, h); ctx.stroke(); ctx.setLineDash([]);
  const A = s.agents;
  for (let o = 0; o < A.length; o += AGENT_STRIDE) {
    const x = pad + A[o + 5] * (w - 2 * pad);
    const y = h - pad - Math.min(A[o + 6], 3) / 3 * (h - 2 * pad);
    ctx.fillStyle = speciesColor(A[o + 3]);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
}

export function drawPop({ ctx, w, h }: View, s: Snapshot) {
  const pad = 6, recent = s.logTail;
  ctx.clearRect(0, 0, w, h);
  const series: [string, number[]][] = [
    ['#639922', recent.map(r => r.plants)], ['#888780', recent.map(r => r.organisms)],
    ['#D85A30', recent.map(r => r.hunters)], ['#7F77DD', recent.map(r => r.speciesAlive)]];
  for (const [color, vals] of series) {
    const max = Math.max(1, ...vals);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    vals.forEach((v, i) => {
      const x = i / Math.max(1, vals.length - 1) * w, y = h - pad - v / max * (h - 2 * pad);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
}

export function drawStats(s: Snapshot) {
  $('sPop').textContent = String(s.organisms);
  $('sSpecies').textContent = `${s.speciesAlive} / ${s.speciesEver}`;
  $('sHunters').textContent = String(s.hunters);
  $('sTime').textContent = Math.floor(s.tick / TICKS_PER_SEC) + 's';
  const recent = s.logTail.slice(-30), sum = (k: keyof Snapshot['logTail'][number]) => recent.reduce((t, r) => t + r[k], 0);
  const attempts = sum('huntAttempts');
  $('sHunt').textContent = attempts ? `${Math.round(100 * sum('huntSuccesses') / attempts)}% of ${attempts}` : 'no hunts';
  $('sLife').textContent = s.meanLifespanGene.toFixed(2);
  const last = s.logTail.at(-1);
  if (last) {
    $('sExtra').textContent = `${last.copies.toFixed(1)} copies · ${last.regulators.toFixed(1)} reg`;
    $('sRecomb').textContent = last.recomb.toFixed(2);
    $('sGenome').textContent = `Regulators per organism by condition: juvenile ${last.regJuvenile.toFixed(2)} · hungry ${last.regHungry.toFixed(2)} · switch (m1 > 0) ${last.regSwitch.toFixed(2)}`;
  }
  const sf = s.seasonFactor;
  $('sSeason').textContent = s.seasons
    ? `Plant growth now: ${Math.round(sf * 100)}% of normal (${['spring', 'summer', 'autumn', 'winter'].at(Math.floor(((s.tick / s.seasonLength + 0.125) % 1) * 4))})`
    : 'Plant growth now: normal (seasons off)';
  const T = s.totals, born = T.sexualBirths + T.asexualBirths;
  const died = T.deaths.starved + T.deaths.eaten + T.deaths.old + T.deaths.genetic;
  const pct = (k: keyof typeof T.deaths) => died ? Math.round(100 * T.deaths[k] / died) + '%' : '0%';
  const n = (v: number) => v.toLocaleString('en-US');
  $('tEver').textContent = n(T.founders + T.added + born);
  $('tDied').textContent = n(died);
  $('tGen').textContent = `${T.maxGeneration} / ${s.meanGeneration.toFixed(0)}`;
  $('tAge').textContent = died ? `${(T.ageAtDeathSum / died / TICKS_PER_SEC).toFixed(0)} s` : '–';
  $('tBirths').textContent = `${n(T.sexualBirths)} / ${n(T.asexualBirths)}`;
  $('tKills').textContent = T.huntAttempts ? `${n(T.huntSuccesses)} (${Math.round(100 * T.huntSuccesses / T.huntAttempts)}%)` : '0';
  $('tCauses').textContent = `Deaths by cause since the start: starved ${pct('starved')} · eaten ${pct('eaten')} · old age ${pct('old')} · bad genes ${pct('genetic')}. Founders ${T.founders}, added later ${T.added}.`;
  $('sDeaths').textContent = `Deaths in the last 30 s: starved ${sum('diedStarved')} · eaten ${sum('diedEaten')} · old age ${sum('diedOld')} · bad genes ${sum('diedGenetic')} · scavenging bites ${sum('scavengeBites')}`;
}
