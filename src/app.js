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

// ---- Shared page pieces -------------------------------------------------------
// Every page uses the same soft layout: words and controls on the left, a
// "stage" on the right (monster on its glass platform, or the timer) inside
// dashed orbit rings, and a glass bar under the stage. Phones stack them,
// stage first.

const BEATS = ['LEARN', 'RESEARCH', 'EXPLAIN', 'BLURT'];
const ORBIT = { cx: 200, cy: 214, rx: 186, ry: 150 };

function orbitWords(words) {
  const { cx, cy, rx, ry } = ORBIT;
  const angles = words.length >= 4 ? [-140, -62, 162, 18] : [-140, -50, 162];
  return words.slice(0, 4).map((w, i) => {
    const a = (angles[i] * Math.PI) / 180;
    const x = (cx + rx * Math.cos(a)).toFixed(1);
    const y = (cy + ry * Math.sin(a)).toFixed(1);
    let tilt = (Math.atan2(ry * Math.cos(a), -rx * Math.sin(a)) * 180) / Math.PI;
    if (tilt > 90) tilt -= 180; if (tilt < -90) tilt += 180;
    const text = esc(String(w).toUpperCase());
    return `<text x="${x}" y="${y}" transform="rotate(${tilt.toFixed(1)} ${x} ${y})" text-anchor="middle" dominant-baseline="middle"${text.length > 11 ? ' class="long"' : ''}>${text}</text>`;
  }).join('');
}

// Dashed orbit rings, with words on them and two dots slowly circling.
function orbits(words = BEATS) {
  const { cx, cy, rx, ry } = ORBIT;
  const ring = `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
  return `<svg class="orbits" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" class="orbit"/>
    <ellipse cx="${cx}" cy="${cy + 6}" rx="${rx - 34}" ry="${ry - 30}" class="orbit faint"/>
    <g class="orbit-words">${orbitWords(words)}</g>
    <circle r="6" class="orbit-dot"><animateMotion dur="26s" repeatCount="indefinite" path="${ring}"/></circle>
    <circle r="4" class="orbit-dot pink"><animateMotion dur="26s" begin="-13s" repeatCount="indefinite" path="${ring}"/></circle>
  </svg>`;
}

const BEADS = '<span class="bead bead-star" aria-hidden="true">★</span><span class="bead bead-heart" aria-hidden="true">♥</span>';

/** The right-hand stage. `inner` is the monster or the timer. */
function stage(inner, { words, card = '', cls = '' } = {}) {
  return `<div class="stage ${cls}">${orbits(words)}${inner}${card}${BEADS}</div>`;
}

function statCard(label, value, { bar = null, id = '' } = {}) {
  return `<div class="stat-card glass" aria-hidden="true">
    <span class="stat-label">${esc(label)}</span>
    <strong${id ? ` id="${id}"` : ''}>${esc(value)}</strong>
    ${bar == null ? '' : `<span class="stat-bar"><i style="width:${Math.round(bar * 100)}%"></i></span>`}
  </div>`;
}

const topicsLeftCard = () => statCard('Topics left', topicsLeft().toLocaleString(), { bar: topicsLeft() / Math.max(1, allIds.length) });

/** A glass bar of [icon, value, label] items. */
function statsBar(items) {
  return `<ul class="stats glass" style="--cols:${items.length}">
    ${items.map(([icon, value, label]) => `<li>${ICON[icon]}<span><strong>${esc(value)}</strong> ${esc(label)}</span></li>`).join('')}
  </ul>`;
}

/** Who has drawn a topic so far (multi-learner sessions). */
function learnersBar() {
  if (session.count === 1) {
    return statsBar([['heart', topicsLeft().toLocaleString(), 'topics left'], ['star', FRAMEWORKS.length, 'frameworks'], ['planet', `${minutes(LEARN_MS)} min`, 'to learn']]);
  }
  return `<ul class="stats glass learners" style="--cols:${session.count}">
    ${session.learners.map((L, i) => {
      const now = i === session.drawIndex && session.phase === 'draw';
      const state = L.topicId != null ? (now ? 'drawn' : 'ready') : now ? 'drawing' : 'waiting';
      return `<li class="${now ? 'now' : ''} ${L.topicId != null ? 'done' : ''}">
        <span class="avatar av-${i}" aria-hidden="true">${mascot('idle', 'flat')}</span>
        <span><strong>Learner ${i + 1}</strong> ${state}</span>
      </li>`;
    }).join('')}
  </ul>`;
}

function chip(text, badge = false) {
  return `<span class="chip${badge ? ' badge' : ''}">${esc(text)}</span>`;
}

const ICON = {
  heart: '<svg class="stat-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.7C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4z" fill="#F27BB6"/></svg>',
  star: '<svg class="stat-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.7l-5.6 3.1 1.3-6.2L3 9.3l6.3-.7z" fill="#F6A04D" stroke="#F6A04D" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  planet: '<svg class="stat-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="#A98BEA"/><ellipse cx="12" cy="12" rx="10.5" ry="3.6" fill="none" stroke="#7E5FD6" stroke-width="1.6" transform="rotate(-20 12 12)"/></svg>',
};

const ARROW = '<span aria-hidden="true">→</span>';

// ---- Pages --------------------------------------------------------------------
function viewSetup() {
  const left = topicsLeft();
  if (left === 0) {
    return `<section class="screen soft">
      <div class="soft-copy">
        <h1 tabindex="-1" data-focus class="puffy">You've used<br>every topic</h1>
        <p class="soft-lede">All ${allIds.length.toLocaleString()} topics have come up on this device. That's a <em>lot</em> of blurting.</p>
        <p class="hint">New topics show up here when the topic list grows. You can also start over, and topics you've seen can come up again.</p>
        <div class="actions soft-actions"><button class="btn pill" data-action="reset-topics">Start over with all topics</button></div>
      </div>
      ${stage(mascot('cheer', 'hero'))}
      ${statsBar([['heart', allIds.length.toLocaleString(), 'topics explored'], ['star', 0, 'left'], ['planet', FRAMEWORKS.length, 'frameworks']])}
    </section>`;
  }
  const saved = Number(store.get(KEY.count)) || 1;
  const selected = Math.min(Math.max(1, saved), 4, left);
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
        <button class="btn pill" data-action="start">Start session ${ARROW}</button>
        <button class="btn round" data-action="replay-intro" aria-label="Play the intro again">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>
        </button>
      </div>
    </div>
    ${stage(mascot('hero', 'hero'), { card: topicsLeftCard() })}
    ${statsBar([['heart', allIds.length.toLocaleString(), 'topics'], ['star', categories, 'categories'], ['planet', FRAMEWORKS.length, 'frameworks']])}
  </section>`;
}

// Little monsters, one per learner, in pink / lilac / orange / mint.
function avatars(n) {
  return Array.from({ length: n }, (_, i) => `<span class="avatar av-${i}">${mascot('idle', 'flat')}</span>`).join('');
}

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
  const top = `<div class="soft-top">${back}${chip(eyebrow)}</div>`;
  if (L.topicId == null) {
    return `<section class="screen soft">
      <div class="soft-copy">
        ${top}
        <h1 tabindex="-1" data-focus class="puffy">${session.count === 1 ? 'Draw your<br>topic' : `Learner ${i + 1},<br>draw your topic`}</h1>
        <p class="soft-lede">One tap, one topic. <em>No skips</em>, and no repeats.</p>
        <div class="actions soft-actions"><button class="btn pill" data-action="generate">Generate topic ${ARROW}</button></div>
      </div>
      ${stage(mascot('curious', 'hero'), { card: topicsLeftCard() })}
      ${learnersBar()}
    </section>`;
  }
  const last = i === session.count - 1;
  const fw = getFramework(L.framework);
  return `<section class="screen soft">
    <div class="soft-copy">
      ${top}
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
      <div class="actions soft-actions"><button class="btn pill" data-action="confirm">${last ? `Start learning · ${minutes(LEARN_MS)}:00` : `Next: Learner ${i + 2}`} ${ARROW}</button></div>
    </div>
    ${stage(mascot('cheer', 'hero'), { words: fw.steps, cls: 'compact', card: statCard('Framework', fw.name, { id: 'fw-card' }) })}
    ${learnersBar()}
  </section>`;
}

function stepsList(fw, cls = 'steps') {
  return `<ol class="${cls}">${fw.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
}

function viewLearn() {
  const solo = session.count === 1;
  const fw = getFramework(session.learners[0].framework);
  return `<section class="screen soft">
    <div class="soft-copy">
      <div class="soft-top">${chip('Learn', true)}${chip(`${minutes(LEARN_MS)} minutes`)}</div>
      <h1 tabindex="-1" data-focus class="puffy sm">${solo ? 'Research<br>your topic' : 'Everyone,<br>research your topic'}</h1>
      <ul class="cards">
        ${session.learners.map((L) => {
          const t = topicOf(L);
          const f = getFramework(L.framework);
          return `<li class="card">
            <p class="card-who">${esc(who(L.slot))} · ${esc(f.name)}</p>
            <p class="card-topic">${esc(t.name)}</p>
            <p class="card-cat">${esc(t.category)}</p>
            ${stepsList(f)}
          </li>`;
        }).join('')}
      </ul>
      <div class="actions soft-actions">
        <button class="btn secondary" data-action="toggle-pause" id="pause-btn">Pause</button>
        <button class="btn secondary" data-action="end-early">End early</button>
      </div>
    </div>
    ${stage(`${timerBlock()}${mascot('curious', 'peek')}`, { words: solo ? fw.steps : BEATS, cls: 'timer-stage' })}
    ${statsBar([['heart', session.count, solo ? 'learner' : 'learners'], ['star', `${minutes(LEARN_MS)} min`, 'to learn'], ['planet', `${minutes(SPEAK_MS)} min`, solo ? 'to speak' : 'each to speak']])}
  </section>`;
}

function viewHandoff() {
  const slot = session.order[session.turn];
  const L = session.learners[slot];
  const fw = getFramework(L.framework);
  return `<section class="screen soft">
    <div class="soft-copy">
      <div class="soft-top">${chip(session.count === 1 ? 'Get ready' : `Speaker ${session.turn + 1} of ${session.count}`, true)}</div>
      <h1 tabindex="-1" data-focus class="puffy">${session.count === 1 ? "You're up" : `Learner ${slot + 1},<br>you're up`}</h1>
      ${session.count > 1 ? `<p class="soft-lede">Pass the phone to <em>Learner ${slot + 1}</em>.</p>` : ''}
      ${topicCard(L, { framework: true })}
      <div class="actions soft-actions"><button class="btn pill" data-action="start-now">Start speaking now ${ARROW}</button></div>
    </div>
    ${stage(`<p class="ready"><span class="count-big" id="time">10</span><span>Starting in</span></p>${mascot('idle', 'peek')}`, { words: fw.steps, cls: 'timer-stage' })}
    ${statsBar([['heart', `${session.turn + 1}/${session.count}`, 'speaker'], ['star', fw.steps.length, 'steps'], ['planet', `${minutes(SPEAK_MS)} min`, 'to speak']])}
  </section>`;
}

function viewSpeak() {
  const slot = session.order[session.turn];
  const L = session.learners[slot];
  const fw = getFramework(L.framework);
  return `<section class="screen soft">
    <div class="soft-copy">
      <div class="soft-top">${chip('Speak', true)}${chip(`${who(slot)} · ${fw.name}`)}</div>
      <h1 tabindex="-1" data-focus class="puffy sm speak-topic">${esc(topicOf(L).name)}</h1>
      ${stepsList(fw, 'prompts')}
      <div class="actions soft-actions">
        <button class="btn secondary" data-action="toggle-pause" id="pause-btn">Pause</button>
        <button class="btn secondary" data-action="end-early">Finish</button>
      </div>
    </div>
    ${stage(`${timerBlock()}${mascot('speak', 'peek')}`, { words: fw.steps, cls: 'timer-stage' })}
    ${statsBar([['heart', `${session.turn + 1}/${session.count}`, 'speaker'], ['star', fw.steps.length, 'steps'], ['planet', topicOf(L).category, '']])}
  </section>`;
}

function viewDone() {
  const n = session.count;
  return `<section class="screen soft">
    <div class="soft-copy">
      <h1 tabindex="-1" data-focus class="puffy">Nice<br>blurting!</h1>
      <p class="soft-lede">${n === 1 ? 'You learned a new concept and explained it <em>out loud</em>.' : `${n} learners, ${n} new concepts, all explained <em>out loud</em>.`}</p>
      <div class="actions soft-actions"><button class="btn pill" data-action="new-session">New session ${ARROW}</button></div>
    </div>
    ${stage(mascot('cheer', 'hero'), { card: topicsLeftCard() })}
    ${statsBar([['heart', n, n === 1 ? 'concept explained' : 'concepts explained'], ['star', `${minutes(LEARN_MS) + n * minutes(SPEAK_MS)} min`, 'well spent'], ['planet', topicsLeft().toLocaleString(), 'topics left']])}
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
    // The stage shows the chosen framework: its steps on the orbit, its name on the card.
    const fw = getFramework(L.framework);
    const words = $app.querySelector('.orbit-words');
    if (words) words.innerHTML = orbitWords(fw.steps);
    const card = document.getElementById('fw-card');
    if (card) card.textContent = fw.name;
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
