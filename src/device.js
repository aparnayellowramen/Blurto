// Alerts and device features (FR-10): Web Audio tones, vibration, wake lock.
// Every call is best effort: unsupported or blocked features fail silently.

let ctx = null;

/** Browsers only allow audio after a user gesture; call this from a tap. */
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

function tone(freq, at, dur, gain = 0.25) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function play(notes) {
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    notes.forEach(([f, at, dur, g]) => tone(f, at, dur, g));
  } catch { /* ignore */ }
}

export const sounds = {
  /** Phase over: a rising three-note chime. */
  end: () => play([[523.25, 0, 0.35], [659.25, 0.15, 0.35], [783.99, 0.3, 0.6]]),
  /** 30 seconds left: two short beeps. */
  warn: () => play([[880, 0, 0.12, 0.2], [880, 0.2, 0.12, 0.2]]),
  /** Get-ready countdown. */
  tick: () => play([[660, 0, 0.08, 0.15]]),
  /** Speaking starts. */
  go: () => play([[987.77, 0, 0.25, 0.25]]),
};

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

let lock = null;
let wantLock = false;

/** Keep the screen on while someone is speaking (where supported). */
export async function keepAwake(on) {
  wantLock = on;
  if (!on) {
    const l = lock;
    lock = null;
    try { await l?.release(); } catch { /* ignore */ }
    return;
  }
  if (lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
    if (!wantLock) keepAwake(false);
  } catch { lock = null; }
}

// The browser drops the lock when the page is hidden; take it back on return.
document.addEventListener('visibilitychange', () => {
  if (wantLock && document.visibilityState === 'visible') keepAwake(true);
});
