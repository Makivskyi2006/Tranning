'use strict';
/* ---------- состояние ---------- */
const KEY = 'trk.v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = (() => {
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && v.logs) return v; } catch (e) {}
  return { pos: 0, cycle: 1, logs: [], active: null, body: [], step: 2.5 };
})();
// миграция со старой 5-недельной версии: вернуть позицию в круг из трёх и сбросить незавершённую старую тренировку
S.pos = ((S.pos % WORKOUTS.length) + WORKOUTS.length) % WORKOUTS.length;
// один раз: позиция в круге = следующая после последней выполненной тренировки (порядок дней изменился)
if (S.order !== 2) {
  for (let i = S.logs.length - 1; i >= 0; i--) {
    const k = WORKOUTS.findIndex(w => w.id === S.logs[i].wid);
    if (k >= 0) { S.pos = (k + 1) % WORKOUTS.length; break; }
  }
  S.order = 2;
}
if (S.active && !ALL_WORKOUTS.some(x => x.id === S.active.wid)) S.active = null;
let view = 'home', exSel = null, timer = null, wakeLock = null, sheet = null;

function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

/* ---------- утилиты ---------- */
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; };
const fmt = n => (Math.round(n * 100) / 100).toString();
const r25 = n => Math.round(n / 2.5) * 2.5;
const mmss = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const dShort = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const dLong = iso => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
const repRange = t => { const m = String(t).match(/(\d+)(?:-(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : [0, 0]; };
const e1rm = (w, r) => w * (1 + r / 30);
const wByPos = () => WORKOUTS[((S.pos % WORKOUTS.length) + WORKOUTS.length) % WORKOUTS.length];

function lastLogFor(name) {
  for (let i = S.logs.length - 1; i >= 0; i--) {
    const e = S.logs[i].ex.find(x => x.name === name);
    if (e && e.sets.length) return { log: S.logs[i], ex: e };
  }
  return null;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200);
}

/* ---------- таймер ---------- */
let actx = null;
function unlockAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) {}
}
function beep(times = 3) {
  try {
    unlockAudio();
    for (let i = 0; i < times; i++) {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.28;
      o.frequency.value = i === times - 1 ? 1320 : 990; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.25);
    }
  } catch (e) {}
  try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {}
}
function startTimer(sec) {
  if (!sec) return;
  timer = { end: Date.now() + sec * 1000, total: sec, fired: false };
  renderTimer();
}
function stopTimer() { timer = null; renderTimer(); }
function renderTimer() {
  const bar = $('#timer');
  if (!timer) { bar.classList.remove('on'); document.body.classList.remove('has-timer'); return; }
  const left = (timer.end - Date.now()) / 1000;
  bar.classList.add('on'); document.body.classList.add('has-timer');
  bar.classList.toggle('done', left <= 0);
  $('#tLeft').textContent = left > 0 ? mmss(left) : 'Go!';
  $('#tFill').style.width = Math.min(100, Math.max(0, 100 - (left / timer.total) * 100)) + '%';
  if (left <= 0 && !timer.fired) { timer.fired = true; beep(); setTimeout(() => { if (timer && timer.fired && timer.end < Date.now() - 8000) stopTimer(); }, 9000); }
}
setInterval(renderTimer, 250);

/* ---------- тренировка ---------- */
function freshEx(e) {
  const last = lastLogFor(e.name);
  const sets = [];
  for (let i = 0; i < e.sets; i++) {
    const ls = last ? last.ex.sets[Math.min(i, last.ex.sets.length - 1)] : null;
    sets.push({ w: ls ? String(ls.w) : '', r: ls ? String(ls.r) : '', done: false });
  }
  return { name: e.name, sets };
}

function startWorkout(wid) {
  const w = ALL_WORKOUTS.find(x => x.id === wid);
  S.active = { wid, title: w.title, startedAt: Date.now(), ex: w.ex.map(freshEx) };
  save(); view = 'workout'; lockScreen(); render();
}

// незавершённая тренировка подхватывает актуальный список упражнений (подходы у совпадающих упражнений остаются)
function syncActive() {
  const a = S.active; if (!a) return;
  const w = ALL_WORKOUTS.find(x => x.id === a.wid); if (!w) return;
  const kept = w.ex.map(p => a.ex.find(e => e.name === p.name) || freshEx(p));
  a.ex = kept; a.title = w.title; save();
}
syncActive();

async function lockScreen() {
  try { if (navigator.wakeLock && S.active) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (S.active) lockScreen(); renderTimer(); }
});

function finishWorkout() {
  const a = S.active; if (!a) return;
  const ex = a.ex.map(e => ({
    name: e.name,
    sets: e.sets.filter(s => s.done).map(s => ({ w: num(s.w) || 0, r: num(s.r) || 0 })),
  })).filter(e => e.sets.length);
  if (!ex.length) {
    if (confirm('Discard workout?')) { S.active = null; save(); stopTimer(); view = 'home'; render(); }
    return;
  }
  const left = a.ex.reduce((n, e) => n + e.sets.filter(s => !s.done).length, 0);
  if (left && !confirm(`${left} sets not done. Finish?`)) return;

  // рекорды: сравниваем расчётный максимум на 1 повторение с прошлыми тренировками
  const prs = [];
  ex.forEach(e => {
    const best = Math.max(...e.sets.map(s => e1rm(s.w, s.r)));
    const prev = S.logs.flatMap(l => l.ex.filter(x => x.name === e.name).flatMap(x => x.sets.map(s => e1rm(s.w, s.r))));
    if (prev.length && best > Math.max(...prev) + 0.01 && best > 0) prs.push(e.name);
  });
  const volume = ex.reduce((n, e) => n + e.sets.reduce((m, s) => m + s.w * s.r, 0), 0);
  const log = { id: 'l' + Date.now(), date: new Date().toISOString(), wid: a.wid, title: a.title, dur: Math.round((Date.now() - a.startedAt) / 60000), ex };
  S.logs.push(log);
  const wi = WORKOUTS.findIndex(x => x.id === a.wid);
  if (wi >= 0) { S.pos = wi + 1; if (S.pos >= WORKOUTS.length) { S.pos = 0; S.cycle++; } }
  S.active = null; save(); stopTimer();
  try { wakeLock && wakeLock.release(); } catch (e) {}
  view = 'home';
  sheet = { type: 'summary', log, volume, prs };
  render();
}

/* ---------- экраны ---------- */
function render() {
  const app = $('#app');
  const tab = view === 'workout' ? 'home' : view === 'ex' ? 'progress' : view;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === tab));
  if (view === 'workout' && !S.active) view = 'home';
  app.innerHTML = { home: vHome, workout: vWorkout, history: vHistory, progress: vProgress, ex: vEx, more: vMore }[view]();
  $('#sheet').innerHTML = sheet ? vSheet() : '';
  $('#sheet').classList.toggle('on', !!sheet);
  if (view === 'workout') S.active.ex.forEach((_, i) => updateWarm(i));
  renderTimer();
}

function vHome() {
  const nxt = wByPos();
  const a = S.active;
  let h = `<div class="stats"><div><b>${S.logs.length}</b><span>total</span></div><div><b>${S.cycle}</b><span>week</span></div></div>`;
  if (a) {
    h += `<div class="hero"><h2>${esc(a.title)}</h2>
      <button class="big" data-a="resume">Continue</button></div>`;
  } else {
    h += `<div class="hero"><h2>${esc(nxt.title)}</h2>
      <button class="big" data-a="start" data-id="${nxt.id}">Start</button></div>`;
  }
  h += `<h3>Plan</h3><div class="plan">`;
  WORKOUTS.forEach((w, i) => {
    const done = i < S.pos % WORKOUTS.length, isNext = i === S.pos % WORKOUTS.length;
    h += `<button class="row ${done ? 'done' : ''} ${isNext ? 'next' : ''}" data-a="pick" data-i="${i}">
      <span>${done ? '✓' : isNext ? '▶' : '•'}</span><span>${esc(w.title)}</span></button>`;
  });
  h += `<div class="blk">Deload</div>` + EXTRA.map(w => `<button class="row" data-a="start" data-id="${w.id}"><span>•</span><span>${esc(w.title.replace('Deload · ', ''))}</span></button>`).join('');
  h += `</div>`;
  return h;
}

function vWorkout() {
  const a = S.active, w = ALL_WORKOUTS.find(x => x.id === a.wid);
  const mins = Math.floor((Date.now() - a.startedAt) / 60000);
  let h = `<button class="link back" data-a="home">← Back</button>
  <div class="wh"><div><h1>${esc(a.title)}</h1><small>${mins} min · ${a.ex.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0)}/${a.ex.reduce((n, e) => n + e.sets.length, 0)} sets</small></div></div>`;
  const wu = /^Legs/.test(w.kind) ? WARMUP.lower : WARMUP.upper;
  if (wu) h += `<a class="btn wide alt wu" href="${wu}" target="_blank" rel="noopener">Warm-up</a>`;
  a.ex.forEach((e, ei) => {
    const p = w.ex[ei];
    const last = lastLogFor(e.name);
    const [, hi] = repRange(p.reps);
    let hint = '';
    if (last) {
      hint = 'Last: ' + last.ex.sets.map(s => `${fmt(s.w)}×${s.r}`).join(' · ');
      if (!isNaN(hi) && hi && !/sec|max/.test(p.reps) && last.ex.sets.length >= Math.min(p.sets, 2) && last.ex.sets.every(s => s.r >= hi))
        hint += ` <b class="up">↑ add weight</b>`;
    }
    h += `<section class="card" data-e="${ei}">
      <div class="exh"><div class="eh"><h2>${ei + 1}. ${esc(exName(e.name))}</h2>${VIDEO[e.name] ? `<a class="vid" href="${VIDEO[e.name]}" target="_blank" rel="noopener" aria-label="Technique video"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></a>` : ''}</div>
        <div class="chips"><span>${p.sets}×${esc(p.reps)}</span><span>${p.rest >= 60 ? p.rest / 60 + ' min' : p.rest + ' sec'}</span>${p.rir == null ? '' : `<span>RIR ${p.rir}</span>`}</div></div>
      ${hint ? `<div class="last">${hint}</div>` : ''}
      ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
      ${p.warm ? `<div class="warm" id="warm${ei}"></div>` : ''}
      <div class="sets">${e.sets.map((s, si) => setRow(ei, si, s)).join('')}</div>
      <button class="link" data-a="addset" data-e="${ei}">+ set</button>
      ${e.sets.length > 1 ? `<button class="link dim" data-a="delset" data-e="${ei}">− set</button>` : ''}
    </section>`;
  });
  h += `<button class="big fin" data-a="finish">Finish</button>
        <button class="link dim center" data-a="cancel">Cancel</button>`;
  return h;
}
function setRow(ei, si, s) {
  return `<div class="set ${s.done ? 'ok' : ''}" data-s="${si}">
    <span class="n">${si + 1}</span>
    <div class="num"><button data-a="step" data-d="-1" tabindex="-1">−</button><input data-k="w" inputmode="decimal" placeholder="kg" value="${esc(s.w)}"><button data-a="step" data-d="1" tabindex="-1">+</button></div>
    <div class="num r"><button data-a="rstep" data-d="-1" tabindex="-1">−</button><input data-k="r" inputmode="numeric" placeholder="reps" value="${esc(s.r)}"><button data-a="rstep" data-d="1" tabindex="-1">+</button></div>
    <button class="chk" data-a="done" aria-label="Done">✓</button></div>`;
}
function updateWarm(ei) {
  const el = $('#warm' + ei); if (!el) return;
  const w = num(S.active.ex[ei].sets[0].w);
  el.innerHTML = w > 0
    ? `<b>Warm-up</b> ${fmt(r25(w * .4))}×8-10 · ${fmt(r25(w * .7))}×4-5 · ${fmt(r25(w * .9))}×2`
    : '';
}

const DAY_LABELS = { 1: 'Back, biceps', 2: 'Chest, shoulders, triceps', 3: 'Legs' };
function dayLabel(l) {
  if (/^l1/.test(l.wid)) return 'Deload: back, chest, arms';
  if (/^l3/.test(l.wid)) return 'Deload: legs, shoulders';
  const m = /d(\d)$/.exec(l.wid || '');
  return (m && DAY_LABELS[m[1]]) || l.title;
}
function vHistory() {
  if (!S.logs.length) return `<h1>History</h1><p class="empty">Empty</p>`;
  return `<h1>History</h1>` + S.logs.slice().reverse().map(l => {
    return `<details class="card"><summary><b>${esc(dayLabel(l))}</b><small>${dLong(l.date)}</small></summary>
      ${l.ex.map(e => `<div class="hx"><b>${esc(exName(e.name))}</b><span>${e.sets.map(s => `${fmt(s.w)}×${s.r}`).join(' · ')}</span></div>`).join('')}
      <button class="link dim" data-a="dellog" data-id="${l.id}">Delete</button></details>`;
  }).join('');
}

function exStats(name) {
  const pts = [];
  S.logs.forEach(l => {
    const e = l.ex.find(x => x.name === name); if (!e) return;
    const best = e.sets.reduce((b, s) => (e1rm(s.w, s.r) > e1rm(b.w, b.r) ? s : b), e.sets[0]);
    pts.push({ d: l.date, w: Math.max(...e.sets.map(s => s.w)), e: e1rm(best.w, best.r), sets: e.sets });
  });
  return pts;
}
function vProgress() {
  const names = [...new Set(S.logs.flatMap(l => l.ex.map(e => e.name)))];
  const items = names.map(n => ({ n, p: exStats(n) })).sort((a, b) => b.p[b.p.length - 1].d.localeCompare(a.p[a.p.length - 1].d));
  const bw = S.body.slice(-30);
  let h = `<h1>Progress</h1>
  <section class="card"><h2>Body weight</h2>
    <div class="bw"><input id="bwIn" inputmode="decimal" placeholder="kg"><button class="btn" data-a="bw">Log</button></div>
    ${bw.length > 1 ? chart(bw.map(b => ({ d: b.d, v: b.v })), 'kg') : ''}
    ${bw.length ? `<div class="last"><b>${fmt(bw[bw.length - 1].v)} kg</b> · ${dShort(bw[bw.length - 1].d)}</div>` : ''}
  </section>`;
  if (!items.length) return h + `<p class="empty">Empty</p>`;
  const rowOf = ({ n, p }) => {
    const f = p[0], l = p[p.length - 1], diff = l.w - f.w;
    return `<button class="row ex" data-a="openex" data-n="${esc(n)}"><span class="t">${esc(exName(n))}</span><span class="v"><b>${fmt(l.w)} kg</b>${p.length > 1 ? `<i class="${diff >= 0 ? 'pos' : 'neg'}">${signed(diff)}</i>` : ''}</span></button>`;
  };
  [...GROUPS, 'Другое'].forEach(g => {
    const list = items.filter(it => groupOf(it.n) === g);
    if (list.length) h += `<h3>${GROUP_EN[g] || g}</h3>` + list.map(rowOf).join('');
  });
  return h;
}
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
function vEx() {
  const p = exStats(exSel);
  const bestW = Math.max(...p.map(x => x.w)), bestE = Math.max(...p.map(x => x.e));
  return `<button class="link back" data-a="back">← Back</button><h1>${esc(exName(exSel))}</h1>
  <div class="stats"><div><b>${fmt(bestW)}</b><span>max, kg</span></div><div><b>${fmt(bestE)}</b><span>1RM, kg</span></div><div><b>${p.length}</b><span>sessions</span></div></div>
  <section class="card"><h2>Weight</h2>${p.length > 1 ? chart(p.map(x => ({ d: x.d, v: x.w })), 'kg') : ''}</section>
  <section class="card"><h2>1RM</h2>${p.length > 1 ? chart(p.map(x => ({ d: x.d, v: x.e })), 'kg') : ''}</section>
  <h3>Log</h3>${p.slice().reverse().map(x => `<div class="hx"><b>${dShort(x.d)}</b><span>${x.sets.map(s => `${fmt(s.w)}×${s.r}`).join(' · ')}</span></div>`).join('')}`;
}
function chart(pts, unit) {
  const W = 340, H = 150, pl = 34, pr = 8, pt = 10, pb = 22;
  const vs = pts.map(p => p.v), mn = Math.min(...vs), mx = Math.max(...vs);
  const lo = mn === mx ? mn - 1 : mn - (mx - mn) * .1, hi = mn === mx ? mx + 1 : mx + (mx - mn) * .1;
  const x = i => pl + (pts.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (pts.length - 1));
  const y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - pb} L${x(0).toFixed(1)},${H - pb} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Chart">
    <line x1="${pl}" x2="${W - pr}" y1="${y(hi - (hi - lo) * .05)}" y2="${y(hi - (hi - lo) * .05)}" class="g"/><line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" class="g"/>
    <text x="${pl - 4}" y="${y(mx) + 4}" class="ax" text-anchor="end">${fmt(mx)}</text><text x="${pl - 4}" y="${y(mn) + 4}" class="ax" text-anchor="end">${fmt(mn)}</text>
    <path d="${area}" class="ar"/><path d="${line}" class="ln"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="3.5" class="pt"/>`).join('')}
    <text x="${x(0)}" y="${H - 6}" class="ax" text-anchor="${pts.length > 1 ? 'start' : 'middle'}">${dShort(pts[0].d)}</text>
    ${pts.length > 1 ? `<text x="${x(pts.length - 1)}" y="${H - 6}" class="ax" text-anchor="end">${dShort(pts[pts.length - 1].d)}</text>` : ''}</svg>`;
}

function vMore() {
  return `<section class="card"><h2>Weight step</h2><div class="seg">${[1.25, 2.5, 5].map(v => `<button class="${S.step === v ? 'on' : ''}" data-a="stepset" data-v="${v}">${fmt(v)}</button>`).join('')}</div></section>
  <section class="card"><h2>Timer</h2><div class="seg t">${[30, 60, 90, 120, 180, 240].map(s => `<button data-a="tset" data-s="${s}">${mmss(s)}</button>`).join('')}</div></section>
  <section class="card"><h2>Data</h2>
    <button class="btn wide" data-a="export">Save backup</button>
    <label class="btn wide alt">Restore<input type="file" id="imp" accept="application/json,.json" hidden></label>
    <button class="btn wide danger" data-a="wipe">Erase all</button></section>`;
}

function vSheet() {
  if (sheet.type === 'summary') {
    const l = sheet.log;
    return `<div class="panel"><h2>Done</h2>
      <div class="stats"><div><b>${l.dur}</b><span>min</span></div><div><b>${Math.round(sheet.volume).toLocaleString('en-US')}</b><span>kg</span></div><div><b>${l.ex.reduce((n, e) => n + e.sets.length, 0)}</b><span>sets</span></div></div>
      ${sheet.prs.length ? `<div class="prs"><b>New records</b>${sheet.prs.map(n => `<div>${esc(exName(n))}</div>`).join('')}</div>` : ''}
      <button class="big" data-a="export">Send backup</button>
      <button class="big alt" data-a="closesheet">Close</button></div>`;
  }
  if (sheet.type === 'timer') {
    return `<div class="panel"><h2>Timer</h2><div class="seg t grid">${[30, 60, 90, 120, 180, 240, 300].map(s => `<button data-a="tstart" data-s="${s}">${mmss(s)}</button>`).join('')}</div>
      <button class="big alt" data-a="closesheet">Close</button></div>`;
  }
  return '';
}

/* ---------- события ---------- */
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return;
  unlockAudio();
  const a = b.dataset.a;
  const card = b.closest('.card[data-e]'), ei = card ? +card.dataset.e : null;
  const row = b.closest('.set'), si = row ? +row.dataset.s : null;
  const A = S.active;

  switch (a) {
    case 'start': startWorkout(b.dataset.id); return;
    case 'resume': view = 'workout'; lockScreen(); render(); return;
    case 'pick': S.pos = +b.dataset.i; save(); render(); return;
    case 'step': case 'rstep': {
      const s = A.ex[ei].sets[si], inp = row.querySelector(`[data-k="${a === 'step' ? 'w' : 'r'}"]`), d = +b.dataset.d;
      const cur = num(inp.value), step = a === 'step' ? S.step : 1;
      const nv = Math.max(0, (isNaN(cur) ? (a === 'step' ? 0 : 0) : cur) + d * step);
      s[a === 'step' ? 'w' : 'r'] = a === 'step' ? String(nv) : String(nv);
      inp.value = s[a === 'step' ? 'w' : 'r']; save(); if (si === 0) updateWarm(ei); return;
    }
    case 'done': {
      const s = A.ex[ei].sets[si];
      if (s.done) { s.done = false; row.classList.remove('ok'); save(); return; }
      const inp = row.querySelector('[data-k="r"]');
      if (isNaN(num(s.r))) { inp.focus(); row.classList.add('shake'); setTimeout(() => row.classList.remove('shake'), 400); return; }
      if (s.w === '') s.w = '0';
      s.done = true; row.classList.add('ok'); save();
      // следующий подход: подставить вес и повторы из только что выполненного
      const nx = A.ex[ei].sets[si + 1];
      if (nx && !nx.done && nx.w === '') { nx.w = s.w; const ni = row.nextElementSibling; if (ni) ni.querySelector('[data-k="w"]').value = s.w; }
      const w = ALL_WORKOUTS.find(x => x.id === A.wid), p = w.ex[ei];
      const lastSet = ei === A.ex.length - 1 && si === A.ex[ei].sets.length - 1;
      if (!lastSet) startTimer(p.rest); else stopTimer();
      return;
    }
    case 'addset': { const ss = A.ex[ei].sets, l = ss[ss.length - 1]; ss.push({ w: l.w, r: l.r, done: false }); save(); keepScroll(); return; }
    case 'delset': { const ss = A.ex[ei].sets; if (ss.length > 1) ss.pop(); save(); keepScroll(); return; }
    case 'finish': finishWorkout(); return;
    case 'cancel': if (confirm('Cancel workout?')) { S.active = null; save(); stopTimer(); view = 'home'; render(); } return;
    case 'closesheet': sheet = null; render(); return;
    case 'timersheet': sheet = { type: 'timer' }; render(); return;
    case 'tstart': sheet = null; startTimer(+b.dataset.s); render(); return;
    case 'tset': startTimer(+b.dataset.s); return;
    case 'tadd': if (timer) { timer.end += +b.dataset.s * 1000; timer.total += +b.dataset.s; timer.fired = false; renderTimer(); } return;
    case 'tstop': stopTimer(); return;
    case 'openex': exSel = b.dataset.n; view = 'ex'; render(); $('#app').scrollTop = 0; return;
    case 'back': view = 'progress'; render(); return;
    case 'home': view = 'home'; render(); $('#app').scrollTop = 0; return;
    case 'dellog': if (confirm('Delete entry?')) { S.logs = S.logs.filter(l => l.id !== b.dataset.id); save(); render(); } return;
    case 'bw': { const v = num($('#bwIn').value); if (v > 20 && v < 400) { S.body.push({ d: new Date().toISOString(), v }); save(); render(); toast('Saved'); } else toast('Enter weight in kg'); return; }
    case 'stepset': S.step = +b.dataset.v; save(); render(); return;
    case 'export': exportData(); return;
    case 'wipe': if (confirm('Erase all data?') && confirm('Really erase?')) { S = { pos: 0, cycle: 1, logs: [], active: null, body: [], step: 2.5 }; save(); stopTimer(); view = 'home'; render(); } return;
  }
});
function keepScroll() { const y = $('#app').scrollTop; render(); $('#app').scrollTop = y; }

document.addEventListener('input', ev => {
  const inp = ev.target.closest('.set input'); if (!inp || !S.active) return;
  const ei = +inp.closest('.card').dataset.e, si = +inp.closest('.set').dataset.s;
  S.active.ex[ei].sets[si][inp.dataset.k] = inp.value; save();
  if (si === 0 && inp.dataset.k === 'w') updateWarm(ei);
});
document.addEventListener('focusin', ev => { if (ev.target.matches('.set input')) setTimeout(() => ev.target.select && ev.target.select(), 0); });
document.addEventListener('change', ev => {
  if (ev.target.id !== 'imp') return;
  const f = ev.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!d || !Array.isArray(d.logs)) throw 0;
      if (!confirm(`Replace data with backup (${d.logs.length} workouts)?`)) return;
      S = Object.assign({ pos: 0, cycle: 1, active: null, body: [], step: 2.5 }, d); save(); render(); toast('Restored');
    } catch (e) { alert('Could not read file'); }
  };
  rd.readAsText(f); ev.target.value = '';
});

async function exportData() {
  const name = `workouts-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Workout backup' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
  view = b.dataset.v; render(); $('#app').scrollTop = 0;
}));
$('#tBtn').addEventListener('click', () => { unlockAudio(); sheet = { type: 'timer' }; render(); });

render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
