import { FRAMEWORKS, DEFAULT_FRAMEWORK, getFramework } from './frameworks.js';
import { reconcileQueue, takeNext, shuffle } from './queue.js';
import * as T from './timer.js';
import { store } from './storage.js';
import { sounds, vibrate, unlockAudio, keepAwake } from './device.js';
import { mascot } from './mascot.js';

// ---- Config ---------------------------------------------------------------
// ?speed=60 runs every timer 60x faster, for testing a whole session quickly.
const SPEED = Math.max(1, Number(new URLSearchParams(location.search).get('speed')) || 1);
const MIN = 60_000 / SPEED;
const SEC = 1_000 / SPEED;
const LEARN_MS = 20 * MIN;
const SPEAK_MS = 2 * MIN;
const READY_MS = 10_000; // the get-ready countdown is never sped up past 10 s / SPEED
const READY = Math.max(3_000, READY_MS / SPEED);
const WARN_MS = 30 * SEC;
const RING = 2 * Math.PI * 54;

// Milestones per phase: [ms left, screen-reader message, sound]
const MARKS = {
  learn: [[10 * MIN, '10 minutes left'], [5 * MIN, '5 minutes left'], [MIN, '1 minute left']],
  speak: [[MIN, '1 minute left'], [WARN_MS, '30 seconds left. Start wrapping up.', 'warn']],
  handoff: [[3000, null, 'tick'], [2000, null, 'tick'], [1000, null, 'tick']],
};
const TIMED = new Set(['learn', 'handoff', 'speak']);
const PHASES = new Set(['draw', 'learn', 'handoff', 'speak', 'done']);

const KEY = { queue: 'blurto.queue.v1', fw: 'blurto.frameworks.v1', session: 'blurto.session.v1', count: 'blurto.count.v1' };

// ---- State ----------------------------------------------------------------
const topics = new Map(); // id -> { name, category }
let allIds = [];
let queueState = { queue: [], used: [] };
let fwDefaults = {};      // learner slot (0-3) -> framework id, remembered across sessions
let session = null;
let justRevealed = false;
let tickHandle = null;

const $app = document.getElementById('app');
const $top = document.getElementById('top');
const $announcer = document.getElementById('announcer');

// ---- Helpers --------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const who = (slot) => (session.count === 1 ? 'You' : `Learner ${slot + 1}`);
const topicOf = (L) => topics.get(L.topicId);
const saveQueue = () => store.set(KEY.queue, queueState);
const saveSession = () => (session ? store.set(KEY.session, session) : store.remove(KEY.session));
const minutes = (ms) => Math.round(ms / 60_000 * SPEED);

function announce(msg) {
  $announcer.textContent = '';
  requestAnimationFrame(() => { $announcer.textContent = msg; });
}

function newSession(count) {
  return {
    count,
    learners: Array.from({ length: count }, (_, slot) => ({
      slot,
      topicId: null,
      framework: FRAMEWORKS.some((f) => f.id === fwDefaults[slot]) ? fwDefaults[slot] : DEFAULT_FRAMEWORK,
    })),
    phase: 'draw',
    drawIndex: 0,
    order: shuffle([...Array(count).keys()]), // speaking order is random each session
    turn: 0,
    timer: null,
    marks: [],
  };
}

function isValidSession(s) {
  if (!s || typeof s !== 'object' || !PHASES.has(s.phase)) return false;
  if (!Number.isInteger(s.count) || s.count < 1 || s.count > 4) return false;
  if (!Array.isArray(s.learners) || s.learners.length !== s.count) return false;
  if (!Array.isArray(s.order) || s.order.length !== s.count) return false;
  if (TIMED.has(s.phase) && !(s.timer && Number.isFinite(s.timer.endsAt))) return false;
  const drawn = s.phase === 'draw' ? s.learners.slice(0, s.drawIndex) : s.learners;
  return drawn.every((L) => topics.has(L.topicId));
}

// ---- Views ----------------------------------------------------------------
function timerBlock() {
  return `<div class="timer" id="timer">
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle class="ring-track" cx="60" cy="60" r="54"/>
      <circle class="ring-progress" id="ring" cx="60" cy="60" r="54" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/>
    </svg>
    <div class="time-wrap"><span class="time" id="time" role="timer"></span><span class="timer-status" id="timer-status"></span></div>
  </div>`;
}

function topicCard(L, { reveal = false, framework = false } = {}) {
  const t = topicOf(L);
  return `<div class="topic-card${reveal ? ' reveal' : ''}">
    <span class="cat">${esc(t.category)}</span>
    <p class="topic">${esc(t.name)}</p>
    ${framework ? `<p class="fw-line">${esc(getFramework(L.framework).name)}</p>` : ''}
  </div>`;
}

function viewSetup() {
  const left = queueState.queue.length;
  if (left === 0) {
    return `<section class="screen center">
      ${mascot('cheer', 'big')}
      <h1 tabindex="-1" data-focus>You've used every topic</h1>
      <p class="lede">All ${allIds.length.toLocaleString()} topics have come up on this device. That's a lot of blurting.</p>
      <p class="hint">New topics show up here when the topic list grows. You can also start over, and topics you've seen can come up again.</p>
      <div class="actions"><button class="btn" data-action="reset-topics">Start over with all topics</button></div>
    </section>`;
  }
  const saved = Number(store.get(KEY.count)) || 1;
  const selected = Math.min(Math.max(1, saved), 4, left);
  return `<section class="screen">
    <div class="hero">
      ${mascot('idle', 'big')}
      <h1 tabindex="-1" data-focus>Learn it in 20.<br>Explain it in 2.</h1>
      <p class="lede">Draw a random concept, research it for ${minutes(LEARN_MS)} minutes, then explain it out loud in ${minutes(SPEAK_MS)}.</p>
    </div>
    <fieldset class="count">
      <legend>How many learners?</legend>
      <div class="count-grid">
        ${[1, 2, 3, 4].map((n) => `<div class="tile">
          <input type="radio" name="count" id="count-${n}" value="${n}"${n === selected ? ' checked' : ''}${n > left ? ' disabled' : ''}>
          <label for="count-${n}"><span class="n">${n}</span><span class="sub">${n === 1 ? 'solo' : 'people'}</span></label>
        </div>`).join('')}
      </div>
      <p class="hint" id="duration">${durationHint(selected)}</p>
    </fieldset>
    <div class="actions"><button class="btn" data-action="start">Start session</button></div>
  </section>`;
}

function durationHint(n) {
  const total = minutes(LEARN_MS) + n * minutes(SPEAK_MS);
  return n === 1
    ? `About ${total} minutes. ${queueState.queue.length.toLocaleString()} topics left on this device.`
    : `About ${total} minutes, passing one phone around. ${queueState.queue.length.toLocaleString()} topics left.`;
}

function viewDraw() {
  const i = session.drawIndex;
  const L = session.learners[i];
  const eyebrow = session.count === 1 ? 'Solo session' : `Learner ${i + 1} of ${session.count}`;
  if (L.topicId == null) {
    return `<section class="screen center">
      <p class="eyebrow">${eyebrow}</p>
      <h1 tabindex="-1" data-focus>${session.count === 1 ? 'Draw your topic' : `Learner ${i + 1}, draw your topic`}</h1>
      ${mascot('curious', 'big')}
      <p class="lede">One tap, one topic. No skips, and no repeats.</p>
      <div class="actions"><button class="btn" data-action="generate">Generate topic</button></div>
    </section>`;
  }
  const last = i === session.count - 1;
  return `<section class="screen">
    <p class="eyebrow">${eyebrow}</p>
    <h1 tabindex="-1" data-focus class="sr-only">Your topic: ${esc(topicOf(L).name)}</h1>
    ${topicCard(L, { reveal: justRevealed })}
    <fieldset class="fw-list">
      <legend>Pick a framework</legend>
      ${FRAMEWORKS.map((f) => `<div class="fw">
        <input type="radio" name="fw" id="fw-${f.id}" value="${f.id}"${f.id === L.framework ? ' checked' : ''}>
        <label for="fw-${f.id}">
          <span class="fw-name">${esc(f.name)}</span>
          <span class="fw-steps">${f.steps.map(esc).join(' → ')}</span>
          <span class="fw-best">Best for: ${esc(f.bestFor)}</span>
        </label>
      </div>`).join('')}
    </fieldset>
    <div class="actions"><button class="btn" data-action="confirm">${last ? `Start learning · ${minutes(LEARN_MS)}:00` : `Next: Learner ${i + 2}`}</button></div>
  </section>`;
}

function stepsList(fw, cls = 'steps') {
  return `<ol class="${cls}">${fw.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
}

function viewLearn() {
  return `<section class="screen">
    <div class="phase-head"><span class="badge">Learn</span>${mascot('curious', 'small')}</div>
    <h1 tabindex="-1" data-focus>${session.count === 1 ? 'Research your topic' : 'Everyone, research your topic'}</h1>
    ${timerBlock()}
    <ul class="cards">
      ${session.learners.map((L) => {
        const t = topicOf(L);
        const fw = getFramework(L.framework);
        return `<li class="card">
          <p class="card-who">${esc(who(L.slot))} · ${esc(fw.name)}</p>
          <p class="card-topic">${esc(t.name)}</p>
          <p class="card-cat">${esc(t.category)}</p>
          ${stepsList(fw)}
        </li>`;
      }).join('')}
    </ul>
    <div class="actions">
      <button class="btn secondary" data-action="toggle-pause" id="pause-btn">Pause</button>
      <button class="btn secondary" data-action="end-early">End early</button>
    </div>
  </section>`;
}

function viewHandoff() {
  const slot = session.order[session.turn];
  const L = session.learners[slot];
  return `<section class="screen center">
    <p class="eyebrow">${session.count === 1 ? 'Get ready' : `Speaker ${session.turn + 1} of ${session.count}`}</p>
    <h1 tabindex="-1" data-focus>${session.count === 1 ? "You're up" : `Learner ${slot + 1}, you're up`}</h1>
    ${session.count > 1 ? `<p class="lede">Pass the phone to Learner ${slot + 1}.</p>` : ''}
    ${topicCard(L, { framework: true })}
    <p class="ready">Starting in <span class="count-big" id="time">10</span></p>
    <div class="actions"><button class="btn" data-action="start-now">Start speaking now</button></div>
  </section>`;
}

function viewSpeak() {
  const slot = session.order[session.turn];
  const L = session.learners[slot];
  const fw = getFramework(L.framework);
  return `<section class="screen">
    <div class="phase-head">
      <div class="phase-label"><span class="badge">Speak</span><p class="eyebrow">${esc(who(slot))} · ${esc(fw.name)}</p></div>
      ${mascot('speak', 'small')}
    </div>
    <h1 tabindex="-1" data-focus class="speak-topic">${esc(topicOf(L).name)}</h1>
    ${timerBlock()}
    ${stepsList(fw, 'prompts')}
    <div class="actions">
      <button class="btn secondary" data-action="toggle-pause" id="pause-btn">Pause</button>
      <button class="btn secondary" data-action="end-early">Finish</button>
    </div>
  </section>`;
}

function viewDone() {
  const n = session.count;
  return `<section class="screen center">
    ${mascot('cheer', 'big')}
    <h1 tabindex="-1" data-focus>Nice blurting!</h1>
    <p class="lede">${n === 1 ? 'You learned a new concept and explained it out loud.' : `${n} learners, ${n} new concepts, all explained out loud.`}</p>
    <div class="actions"><button class="btn" data-action="new-session">New session</button></div>
  </section>`;
}

const VIEWS = { setup: viewSetup, draw: viewDraw, learn: viewLearn, handoff: viewHandoff, speak: viewSpeak, done: viewDone };

function render() {
  const phase = session?.phase ?? 'setup';
  document.body.className = `phase-${phase}`;
  const inSession = phase !== 'setup' && phase !== 'done';
  $top.innerHTML = `<span class="logo" role="img" aria-label="Blurto">Blurt${mascot('logo')}</span>
    ${inSession ? '<button class="link-btn" data-action="quit">Quit</button>' : ''}`;
  $app.innerHTML = VIEWS[phase]();
  justRevealed = false;
  if (TIMED.has(phase)) {
    updateTimer();
    if (!tickHandle) tickHandle = setInterval(tick, 200);
  } else {
    clearInterval(tickHandle);
    tickHandle = null;
  }
  keepAwake(phase === 'handoff' || phase === 'speak');
  $app.querySelector('[data-focus]')?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---- Timers ---------------------------------------------------------------
function updateTimer(now = Date.now()) {
  const t = session?.timer;
  const $time = document.getElementById('time');
  if (!t || !$time) return;
  const rem = T.remaining(t, now);
  if (session.phase === 'handoff') {
    $time.textContent = String(Math.max(1, Math.ceil(rem / 1000)));
    return;
  }
  const text = T.format(rem);
  if ($time.textContent !== text) $time.textContent = text;
  const $ring = document.getElementById('ring');
  $ring.style.strokeDashoffset = String(RING * (rem / t.duration));
  $ring.style.opacity = t.duration - rem < 250 ? '0' : '1'; // no round-cap dot before time starts moving
  const paused = t.paused != null;
  const warning = session.phase === 'speak' && rem <= WARN_MS;
  const $timer = document.getElementById('timer');
  $timer.classList.toggle('paused', paused);
  $timer.classList.toggle('warning', warning);
  document.getElementById('timer-status').textContent = paused ? 'Paused' : warning ? 'Wrap up' : '';
  const $pause = document.getElementById('pause-btn');
  if ($pause) $pause.textContent = paused ? 'Resume' : 'Pause';
}

function checkMarks(now) {
  const t = session.timer;
  const rem = T.remaining(t, now);
  if (t.paused != null || rem <= 0) return;
  const crossed = (MARKS[session.phase] ?? []).filter(([ms]) => rem <= ms && !session.marks.includes(ms));
  if (!crossed.length) return;
  crossed.forEach(([ms]) => session.marks.push(ms));
  saveSession();
  const [, msg, sound] = crossed[crossed.length - 1]; // after a long sleep, only the latest one
  if (msg) announce(msg);
  if (sound === 'warn') { sounds.warn(); vibrate([120, 80, 120]); }
  if (sound === 'tick') sounds.tick();
}

function tick() {
  if (!session?.timer || !TIMED.has(session.phase)) return;
  const now = Date.now();
  checkMarks(now);
  if (T.isDone(session.timer, now)) finishPhase();
  else updateTimer(now);
}

function toHandoff(turn) {
  session.phase = 'handoff';
  session.turn = turn;
  session.timer = T.start(READY, Date.now());
  session.marks = [];
}

function finishPhase() {
  const now = Date.now();
  let message = '';
  if (session.phase === 'learn') {
    sounds.end();
    vibrate([300, 120, 300]);
    toHandoff(0);
    message = "Learning time's up.";
  } else if (session.phase === 'handoff') {
    sounds.go();
    vibrate(80);
    session.phase = 'speak';
    session.timer = T.start(SPEAK_MS, now);
    session.marks = [];
    message = `Speak for ${minutes(SPEAK_MS)} minutes.`;
  } else if (session.phase === 'speak') {
    sounds.end();
    vibrate([300, 120, 300]);
    if (session.turn + 1 < session.count) {
      toHandoff(session.turn + 1);
      message = "Time's up.";
    } else {
      session.phase = 'done';
      session.timer = null;
      message = "Time's up. Session complete.";
    }
  }
  saveSession();
  render();
  if (message) announce(message);
}

// ---- Actions --------------------------------------------------------------
const actions = {
  start() {
    const n = Number(document.querySelector('input[name="count"]:checked')?.value) || 1;
    if (n > queueState.queue.length) return;
    store.set(KEY.count, n);
    session = newSession(n);
    saveSession();
    render();
  },
  generate() {
    const L = session.learners[session.drawIndex];
    if (L.topicId != null) return;
    const id = takeNext(queueState);
    saveQueue(); // saved before showing it, so a reload can't be used to skip
    if (id == null) { session = null; saveSession(); render(); return; }
    L.topicId = id;
    justRevealed = true;
    saveSession();
    render();
    announce(`${topicOf(L).category}.`);
  },
  confirm() {
    const L = session.learners[session.drawIndex];
    if (L.topicId == null) return;
    L.framework = document.querySelector('input[name="fw"]:checked')?.value ?? L.framework;
    fwDefaults[L.slot] = L.framework;
    store.set(KEY.fw, fwDefaults);
    if (session.drawIndex < session.count - 1) {
      session.drawIndex++;
    } else {
      session.phase = 'learn';
      session.timer = T.start(LEARN_MS, Date.now());
      session.marks = [];
    }
    saveSession();
    render();
  },
  'toggle-pause'() {
    const now = Date.now();
    const paused = session.timer.paused != null;
    session.timer = paused ? T.resume(session.timer, now) : T.pause(session.timer, now);
    saveSession();
    updateTimer(now);
    announce(paused ? 'Resumed' : 'Paused');
  },
  'end-early'() {
    if (session.phase === 'learn' && !confirm('End learning now and move on to speaking?')) return;
    finishPhase();
  },
  'start-now'() {
    finishPhase();
  },
  quit() {
    if (!confirm('Quit this session? Topics already drawn stay used.')) return;
    session = null;
    saveSession();
    render();
  },
  'new-session'() {
    session = null;
    saveSession();
    render();
  },
  'reset-topics'() {
    if (!confirm(`Start over with all ${allIds.length.toLocaleString()} topics? Topics you've already seen can come up again.`)) return;
    queueState = reconcileQueue(null, allIds);
    saveQueue();
    render();
  },
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  unlockAudio();
  actions[btn.dataset.action]?.();
});

document.addEventListener('change', (e) => {
  if (e.target.name === 'count') {
    document.getElementById('duration').textContent = durationHint(Number(e.target.value));
  } else if (e.target.name === 'fw' && session?.phase === 'draw') {
    const L = session.learners[session.drawIndex];
    L.framework = e.target.value;
    fwDefaults[L.slot] = L.framework;
    store.set(KEY.fw, fwDefaults);
    saveSession();
  }
});

// Catch up at once when the phone wakes or the tab comes back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick();
});

// ---- Start ----------------------------------------------------------------
async function init() {
  try {
    const res = await fetch('data/topics.json');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    for (const [id, ci, name] of data.topics) topics.set(id, { name, category: data.categories[ci] });
    allIds = data.topics.map(([id]) => id);
  } catch {
    $app.innerHTML = `<section class="screen center"><h1 tabindex="-1">Couldn't load topics</h1>
      <p class="lede">Check your connection and reload. If you opened the file directly, run <code>npm start</code> instead.</p></section>`;
    return;
  }
  queueState = reconcileQueue(store.get(KEY.queue), allIds);
  saveQueue();
  const fw = store.get(KEY.fw);
  fwDefaults = fw && typeof fw === 'object' ? fw : {};
  const saved = store.get(KEY.session);
  session = isValidSession(saved) ? saved : null;
  if (!session) store.remove(KEY.session);
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
