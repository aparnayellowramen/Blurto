import { FRAMEWORKS, DEFAULT_FRAMEWORK, getFramework } from './frameworks.js';
import { reconcileQueue, takeNext, shuffle } from './queue.js';
import * as T from './timer.js';
import { store } from './storage.js';
import { sounds, vibrate, unlockAudio, keepAwake } from './device.js';
import { mascot } from './mascot.js';

// The 3D monster loads in the background. Until it's ready, or if the device
// can't run WebGL, the flat SVG monster shows instead.
const monster3d = import('./monster3d.js')
  .then((m) => (m.supported() ? m : null))
  .catch(() => null);
// Floating fluff puffs behind every screen (3D only).
monster3d.then((m) => { try { m?.background(); } catch { /* no background */ } });
const upgradeMonsters = (...roots) => monster3d.then((m) => {
  if (!m) return;
  try { roots.forEach((r) => m.upgrade(r)); } catch { /* keep the SVG */ }
});

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

const KEY = { queue: 'blurto.queue.v1', fw: 'blurto.frameworks.v1', session: 'blurto.session.v1', count: 'blurto.count.v1', pending: 'blurto.pending.v1' };

// ---- State ----------------------------------------------------------------
const topics = new Map(); // id -> { name, category }
let allIds = [];
let queueState = { queue: [], used: [] };
// Topics drawn but given back by going Back (or quitting) before learning started.
// They come up again on the next draw, so Back can't be used to skip a topic.
let pending = [];
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
const savePending = () => store.set(KEY.pending, pending);
const topicsLeft = () => queueState.queue.length + pending.length;

/** The next topic: one given back earlier if there is one, else a fresh one. */
function drawTopic() {
  if (pending.length) { const id = pending.shift(); savePending(); return id; }
  const id = takeNext(queueState);
  saveQueue(); // saved before showing it, so a reload can't be used to skip
  return id;
}

/** Hand the session's drawn topics back, to come up again on the next draws. */
function keepDrawnTopics() {
  const drawn = session.learners.map((L) => L.topicId).filter((id) => id != null);
  pending = [...drawn, ...pending.filter((id) => !drawn.includes(id))];
  savePending();
}

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
  const left = topicsLeft();
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
  const total = allIds.length;
  const categories = new Set([...topics.values()].map((t) => t.category)).size;
  return `<section class="screen soft">
    <div class="soft-copy">
      <h1 tabindex="-1" data-focus class="puffy">Learn it in ${minutes(LEARN_MS)}.<br>Explain it in ${minutes(SPEAK_MS)}.</h1>
      <p class="soft-lede">Draw a random concept, research it for ${minutes(LEARN_MS)} minutes, then explain it <em>out loud</em> in ${minutes(SPEAK_MS)}.</p>
      <div class="soft-rule" aria-hidden="true"></div>
      <fieldset class="count glass">
        <legend>How many learners?</legend>
        <div class="count-row">
          <div class="count-pills">
            ${[1, 2, 3, 4].map((n) => `<span class="pill-opt">
              <input type="radio" name="count" id="count-${n}" value="${n}"${n === selected ? ' checked' : ''}${n > left ? ' disabled' : ''}>
              <label for="count-${n}"><span class="sr-only">${n === 1 ? '1 learner' : `${n} learners`}</span><span aria-hidden="true">${n}</span></label>
            </span>`).join('')}
          </div>
          <span class="avatars" id="avatars" aria-hidden="true">${avatars(selected)}</span>
        </div>
        <p class="hint" id="duration">${durationHint(selected)}</p>
      </fieldset>
      <div class="soft-actions">
        <button class="btn pill" data-action="start">Start session <span aria-hidden="true">→</span></button>
        <button class="btn round" data-action="replay-intro" aria-label="Play the intro again">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>
        </button>
      </div>
    </div>
    <div class="stage" aria-hidden="true">
      ${orbits()}
      ${mascot('hero', 'hero')}
      <div class="stat-card glass">
        <span class="stat-label">Topics left</span>
        <strong>${left.toLocaleString()}</strong>
        <span class="stat-bar"><i style="width:${Math.round((left / total) * 100)}%"></i></span>
      </div>
      <span class="bead bead-star">★</span>
      <span class="bead bead-heart">♥</span>
    </div>
    <ul class="stats glass">
      <li>${ICON.heart}<span><strong>${total.toLocaleString()}</strong> topics</span></li>
      <li>${ICON.star}<span><strong>${categories}</strong> categories</span></li>
      <li>${ICON.planet}<span><strong>${FRAMEWORKS.length}</strong> frameworks</span></li>
    </ul>
  </section>`;
}

// Little monsters, one per learner, in the reference's pink / lilac / orange / mint.
function avatars(n) {
  return Array.from({ length: n }, (_, i) => `<span class="avatar av-${i}">${mascot('idle', 'flat')}</span>`).join('');
}

// Dashed orbit rings around the stage, with the session's four beats on them.
function orbits() {
  const cx = 200; const cy = 214; const rx = 186; const ry = 150;
  const label = (deg, text) => {
    const a = (deg * Math.PI) / 180;
    const x = cx + rx * Math.cos(a); const y = cy + ry * Math.sin(a);
    let tilt = (Math.atan2(ry * Math.cos(a), -rx * Math.sin(a)) * 180) / Math.PI;
    if (tilt > 90) tilt -= 180; if (tilt < -90) tilt += 180;
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${tilt.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" text-anchor="middle" dominant-baseline="middle">${text}</text>`;
  };
  const ring = `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
  return `<svg class="orbits" viewBox="0 0 400 400">
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" class="orbit"/>
    <ellipse cx="${cx}" cy="${cy + 6}" rx="${rx - 34}" ry="${ry - 30}" class="orbit faint"/>
    <g class="orbit-words">${label(-140, 'LEARN')}${label(-62, 'RESEARCH')}${label(162, 'EXPLAIN')}${label(18, 'BLURT')}</g>
    <circle r="6" class="orbit-dot"><animateMotion dur="26s" repeatCount="indefinite" path="${ring}"/></circle>
    <circle r="4" class="orbit-dot pink"><animateMotion dur="26s" begin="-13s" repeatCount="indefinite" path="${ring}"/></circle>
  </svg>`;
}

const ICON = {
  heart: '<svg class="stat-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.7C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4z" fill="#F27BB6"/></svg>',
  star: '<svg class="stat-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.7l-5.6 3.1 1.3-6.2L3 9.3l6.3-.7z" fill="#F6A04D" stroke="#F6A04D" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  planet: '<svg class="stat-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#A98BEA"/><ellipse cx="12" cy="12" rx="10.5" ry="3.6" fill="none" stroke="#7E5FD6" stroke-width="1.6" transform="rotate(-20 12 12)"/></svg>',
};

function durationHint(n) {
  const total = minutes(LEARN_MS) + n * minutes(SPEAK_MS);
  return n === 1
    ? `About ${total} minutes. ${topicsLeft().toLocaleString()} topics left on this device.`
    : `About ${total} minutes, passing one phone around. ${topicsLeft().toLocaleString()} topics left.`;
}

function viewDraw() {
  const i = session.drawIndex;
  const L = session.learners[i];
  const eyebrow = session.count === 1 ? 'Solo session' : `Learner ${i + 1} of ${session.count}`;
  const back = `<button class="back-btn" data-action="back">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${i > 0 ? `Learner ${i}` : 'Back'}
    </button>`;
  if (L.topicId == null) {
    return `<section class="screen center">
      ${back}
      <p class="eyebrow">${eyebrow}</p>
      <h1 tabindex="-1" data-focus>${session.count === 1 ? 'Draw your topic' : `Learner ${i + 1}, draw your topic`}</h1>
      ${mascot('curious', 'big')}
      <p class="lede">One tap, one topic. No skips, and no repeats.</p>
      <div class="actions"><button class="btn" data-action="generate">Generate topic</button></div>
    </section>`;
  }
  const last = i === session.count - 1;
  return `<section class="screen">
    ${back}
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
  upgradeMonsters($top, $app);
  if (prefersReducedMotion()) $app.querySelector('.orbits')?.pauseAnimations();
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
    if (n > topicsLeft()) return;
    store.set(KEY.count, n);
    session = newSession(n);
    saveSession();
    render();
  },
  generate() {
    const L = session.learners[session.drawIndex];
    if (L.topicId != null) return;
    const id = drawTopic();
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
  back() {
    if (session?.phase !== 'draw') return;
    if (session.drawIndex > 0) {
      session.drawIndex--; // the previous learner keeps their topic and can change framework
    } else {
      keepDrawnTopics();
      session = null;
    }
    saveSession();
    render();
  },
  quit() {
    const drawing = session.phase === 'draw';
    if (!confirm(drawing ? 'Quit this session?' : 'Quit this session? Topics already drawn stay used.')) return;
    if (drawing) keepDrawnTopics(); // nothing learned yet, so the topics come up again
    session = null;
    saveSession();
    render();
  },
  'new-session'() {
    session = null;
    saveSession();
    render();
  },
  'replay-intro'() {
    playIntro();
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

// Escape goes back from the topic screens, like the Back button.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && session?.phase === 'draw' && !document.querySelector('.intro')) actions.back();
});

document.addEventListener('change', (e) => {
  if (e.target.name === 'count') {
    document.getElementById('duration').textContent = durationHint(Number(e.target.value));
    document.getElementById('avatars').innerHTML = avatars(Number(e.target.value));
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

// ---- Opening intro ------------------------------------------------------------
// The big monster jumps three times; on the third jump the page scrolls down
// to the learner picker (styles.css, "Opening intro"). A tap skips it. The hop
// length must match JUMP.period in monster3d.js and the .72s in styles.css.
const HOP_MS = 720;
const SLIDE_AT_MS = HOP_MS * 2.3; // as the third jump takes off
const SCROLL_MS = 1400;           // longest picker transition, incl. its cascade

function prefersReducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function playIntro() {
  if (prefersReducedMotion() || document.querySelector('.intro')) return;
  const el = document.createElement('div');
  el.className = 'intro';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = mascot('jump');
  document.body.append(el);
  const html = document.documentElement;
  html.classList.add('intro-on'); // the picker waits one screen below
  let gone = false;
  const leave = () => {
    if (gone) return;
    gone = true;
    document.removeEventListener('keydown', leave);
    html.classList.add('intro-out');
    requestAnimationFrame(() => {
      el.classList.add('leaving');
      html.classList.remove('intro-on');
    });
    setTimeout(() => { el.remove(); html.classList.remove('intro-out'); }, SCROLL_MS);
  };
  el.addEventListener('click', leave);
  document.addEventListener('keydown', leave);
  // Give the 3D monster a moment to load so the jumps and the slide stay in step;
  // if it's slow (or unsupported) the flat monster jumps instead.
  Promise.race([monster3d, new Promise((r) => setTimeout(() => r(null), 1200))]).then((m) => {
    if (gone) return;
    if (m) { try { m.upgrade(el); } catch { /* keep the SVG */ } }
    el.classList.add('go');
    setTimeout(leave, SLIDE_AT_MS);
  });
}

// ---- Start ----------------------------------------------------------------
async function init() {
  // The intro plays on every open, unless a session is in progress.
  if (!store.get(KEY.session)) playIntro();
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
  const savedPending = store.get(KEY.pending);
  pending = Array.isArray(savedPending) ? [...new Set(savedPending.filter((id) => topics.has(id)))] : [];
  const saved = store.get(KEY.session);
  session = isValidSession(saved) ? saved : null;
  if (!session) store.remove(KEY.session);
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
