// The Blurt o monster: a fluffy pastel egg with soft yellow horns, arms and
// feet, dot eyes, rosy cheeks and a round open mouth (the "o" in the logo).
// Colours are SVG attributes, so the same markup works as a standalone icon.
// Front-view moods: idle, curious (learning), speak (mouth wide), cheer, logo.

const OUT = '#9A5544';      // warm brown sketch outline
const FUR_TOP = '#F8FBFF';
const FUR_BOT = '#CDE2F6';
const HORN = '#F8D648';
const HORN_D = '#E3B52C';
const EYE = '#4A2A24';
const CHEEK = '#FF9AAE';
const MOUTH = '#5A2A22';
const TONGUE = '#FF8FA3';
const RAINBOW = ['#FFB3CB', '#9FE7D3', '#FFE48C', '#C7B6FF']; // soft patches in the fur

let uid = 0;
const n1 = (v) => v.toFixed(1);

/** A fluffy, slightly egg-shaped outline: an ellipse with scalloped tufts. */
function fluff(cx, cy, rx, ry, tufts, depth, seed) {
  const at = (a, s = 1) => {
    const widen = 1 + 0.09 * Math.sin(a); // fuller at the bottom
    return [cx + rx * s * Math.cos(a) * widen, cy + ry * s * Math.sin(a)];
  };
  let d = '';
  for (let i = 0; i < tufts; i++) {
    const a0 = -Math.PI / 2 + (i / tufts) * 2 * Math.PI;
    const a1 = a0 + (2 * Math.PI) / tufts;
    const bulge = 1 + depth * (0.7 + 0.6 * Math.abs(Math.sin(i * 12.9898 + seed)));
    const [x0, y0] = at(a0);
    const [mx, my] = at((a0 + a1) / 2, bulge);
    const [x1, y1] = at(a1);
    if (i === 0) d += `M${n1(x0)} ${n1(y0)}`;
    d += ` Q${n1(mx)} ${n1(my)} ${n1(x1)} ${n1(y1)}`;
  }
  return `${d} Z`;
}

const FRONT_BODY = fluff(60, 66, 33, 41, 34, 0.07, 3);
const SIDE_BODY = fluff(114, 106, 45, 50, 38, 0.06, 7);

function furDefs(id, body) {
  // Soft watercolour washes: each rainbow colour fades out to nothing at its edge.
  const washes = RAINBOW.map((c, i) => `<radialGradient id="${id}w${i}"><stop offset="0" stop-color="${c}" stop-opacity=".9"/><stop offset=".6" stop-color="${c}" stop-opacity=".5"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('');
  return `<defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FUR_TOP}"/><stop offset="1" stop-color="${FUR_BOT}"/></linearGradient>
    ${washes}
    <clipPath id="${id}c"><path d="${body}"/></clipPath>
  </defs>`;
}

function furBody(id, body, patches, ticks) {
  return `<path class="ink" d="${body}" fill="url(#${id}g)" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <g clip-path="url(#${id}c)">${patches.map(([cx, cy, rx, ry, c, o]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}w${RAINBOW.indexOf(c)})" opacity="${o}"/>`).join('')}</g>
    <g class="ink-line" fill="none" stroke="${OUT}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ticks.map((t) => `<path d="${t}"/>`).join('')}</g>`;
}

export function mascot(mood = 'idle', size = '') {
  const id = `bm${++uid}`;
  const patches = [
    [28, 84, 18, 30, RAINBOW[0], 0.8], [32, 50, 16, 20, RAINBOW[1], 0.8],
    [90, 48, 16, 20, RAINBOW[2], 0.85], [92, 86, 18, 28, RAINBOW[3], 0.75],
  ];
  const ticks = ['M37 92 l2 -3 l2 3', 'M79 94 l2 -3 l2 3', 'M57 100 l2 -2.6 l2 2.6', 'M55 27 q4 -5 8 -1'];
  return `<svg class="mascot m-${mood} ${size}" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  ${furDefs(id, FRONT_BODY)}
  <g class="m-body">
    <ellipse class="m-arm m-arm-l" cx="25" cy="74" rx="8.5" ry="17" fill="${HORN}" stroke="${OUT}" stroke-width="1.8"/>
    <ellipse class="m-arm m-arm-r" cx="95" cy="74" rx="8.5" ry="17" fill="${HORN}" stroke="${OUT}" stroke-width="1.8"/>
    <ellipse cx="47" cy="106" rx="9" ry="6" fill="${HORN}" stroke="${OUT}" stroke-width="1.8"/>
    <ellipse cx="73" cy="106" rx="9" ry="6" fill="${HORN}" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M39 36 C33 28 30 18 33 8 C41 13 47 21 50 30 Z" fill="${HORN}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M81 36 C87 28 90 18 87 8 C79 13 73 21 70 30 Z" fill="${HORN}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    ${furBody(id, FRONT_BODY, patches, ticks)}
    <g class="m-eye m-pupils">
      <circle cx="48" cy="58" r="5.2" fill="${EYE}"/><circle cx="72" cy="58" r="5.2" fill="${EYE}"/>
      <circle cx="49.8" cy="56.2" r="1.6" fill="#FFFFFF"/><circle cx="73.8" cy="56.2" r="1.6" fill="#FFFFFF"/>
    </g>
    <path class="m-happy" display="none" d="M42.5 59 Q48 52.5 53.5 59 M66.5 59 Q72 52.5 77.5 59" fill="none" stroke="${EYE}" stroke-width="2.8" stroke-linecap="round"/>
    <ellipse class="m-cheek" cx="39" cy="67" rx="6" ry="4" fill="${CHEEK}" opacity=".75"/>
    <ellipse class="m-cheek" cx="81" cy="67" rx="6" ry="4" fill="${CHEEK}" opacity=".75"/>
    <g class="m-mouth">
      <circle cx="60" cy="73" r="6.5" fill="${MOUTH}" stroke="${OUT}" stroke-width="1.4"/>
      <ellipse cx="60" cy="76.4" rx="3.5" ry="1.9" fill="${TONGUE}"/>
    </g>
  </g>
</svg>`;
}

// ---- Landing-page scene ----------------------------------------------------
// Timed to the reference recording: a ~4 s loop of quick vignettes with ghosted
// cuts. Study (laptop + glasses) → celebrate (party hat + cake) → zoom (wings +
// speed lines) → a long trot (eyes shut) → a moment of line art → trot with eyes
// open → back to study. The monster is drawn side-on and outlined.
// One rig is reused; each scene poses it with CSS (see .side-scene in styles.css).

function leg(id, x, near) {
  return `<g class="q-leg q-${id}" style="transform-origin:${x}px 146px">
    <rect class="ink" x="${x - 7}" y="138" width="14" height="30" rx="7" fill="${near ? HORN : HORN_D}" stroke="${OUT}" stroke-width="1.8"/>
  </g>`;
}

function rig({ glasses = false, top = '', back = '' } = {}) {
  const id = `bs${++uid}`;
  const patches = [
    [80, 118, 22, 34, RAINBOW[0], 0.8], [88, 74, 20, 22, RAINBOW[1], 0.8],
    [128, 64, 18, 16, RAINBOW[2], 0.85], [112, 150, 30, 16, RAINBOW[3], 0.75],
  ];
  const ticks = ['M86 100 l2.5 -3.5 l2.5 3.5', 'M100 134 l2 -3 l2 3', 'M128 130 l2 -3 l2 3', 'M108 58 q3.5 -6 8 -1.5'];
  const specs = glasses
    ? `<g class="specs"><circle class="ink" cx="141" cy="90" r="9" fill="#FFFFFF" fill-opacity=".25" stroke="${OUT}" stroke-width="2"/>
       <path class="ink-line" d="M132.2 88 L114 84 M149.8 91 L154 93" fill="none" stroke="${OUT}" stroke-width="2" stroke-linecap="round"/></g>`
    : '';
  return `
  ${furDefs(id, SIDE_BODY)}
  ${leg('b', 104, false)}${leg('f', 128, true)}
  <g class="s-bob">
    ${back}
    <g class="s-arm s-arm-b"><ellipse class="ink" cx="98" cy="112" rx="8" ry="16" fill="${HORN_D}" stroke="${OUT}" stroke-width="1.8"/></g>
    <path class="ink" d="M100 64 C95 54 93 44 96 35 C103 40 108 49 110 58 Z" fill="${HORN_D}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path class="ink" d="M122 60 C124 49 129 40 138 35 C139 45 136 54 132 63 Z" fill="${HORN}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    ${furBody(id, SIDE_BODY, patches, ticks)}
    <g class="e-open"><circle class="ink" cx="141" cy="90" r="5.2" fill="${EYE}"/><circle cx="142.8" cy="88.2" r="1.5" fill="#FFFFFF"/></g>
    <path class="e-happy ink-line" d="M135.5 91 Q141 84.8 146.5 91" fill="none" stroke="${EYE}" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse cx="145" cy="104" rx="4.6" ry="3.4" fill="${CHEEK}" opacity=".75"/>
    <circle class="ink" cx="151" cy="112" r="5.8" fill="${MOUTH}" stroke="${OUT}" stroke-width="1.4"/>
    <ellipse cx="151" cy="115" rx="3" ry="1.6" fill="${TONGUE}"/>
    ${specs}
    <g class="s-arm s-arm-f"><ellipse class="ink" cx="130" cy="118" rx="7.5" ry="15" fill="${HORN}" stroke="${OUT}" stroke-width="1.8"/></g>
    ${top}
  </g>`;
}

const LAPTOP = `<g class="laptop">
  <path class="ink" d="M136 168 L190 168 L200 159 L148 159 Z" fill="#C9D2FF" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M146 165 L189 165 M152 162 L194 162" stroke="#8C9AE8" stroke-width="1.6" stroke-dasharray="3 2.5"/>
  <path class="ink" d="M188 168 L200 159 L208 112 L194 122 Z" fill="#A9B8FF" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
</g>`;

const HAT = `<g transform="rotate(14 120 58)">
  <path class="ink" d="M106 60 L120 24 L134 60 Z" fill="#FF9DB5" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M110.6 48 L129.4 48 L131.3 53 L108.7 53 Z M115.1 36 L124.9 36 L126.5 40 L113.5 40 Z" fill="#FFFFFF"/>
  <circle class="ink" cx="120" cy="22" r="4.5" fill="#9FE7D3" stroke="${OUT}" stroke-width="1.6"/>
</g>`;

const CAKE = `<g class="cake">
  <ellipse class="ink" cx="200" cy="168" rx="30" ry="5" fill="#FFFFFF" stroke="${OUT}" stroke-width="1.8"/>
  <rect class="ink" x="178" y="137" width="44" height="29" rx="5" fill="#FFE08A" stroke="${OUT}" stroke-width="1.8"/>
  <path d="M178 151 L222 151" stroke="#F5B82E" stroke-width="2"/>
  <path class="ink" d="M178 143 C178 135 222 135 222 143 L222 145 C218 151 214 143 210 148 C206 153 202 144 198 149 C194 154 190 144 186 149 C182 153 180 146 178 148 Z" fill="#FF9DB5" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
  <rect class="ink" x="189" y="123" width="4" height="14" rx="1.5" fill="#8FB4FF" stroke="${OUT}" stroke-width="1.2"/>
  <rect class="ink" x="198" y="123" width="4" height="14" rx="1.5" fill="#FF8FA3" stroke="${OUT}" stroke-width="1.2"/>
  <rect class="ink" x="207" y="123" width="4" height="14" rx="1.5" fill="#9FE7D3" stroke="${OUT}" stroke-width="1.2"/>
  <ellipse class="s-flame" cx="191" cy="118" rx="2.4" ry="4" fill="#FF9F43"/>
  <ellipse class="s-flame" cx="200" cy="118" rx="2.4" ry="4" fill="#FF9F43"/>
  <ellipse class="s-flame" cx="209" cy="118" rx="2.4" ry="4" fill="#FF9F43"/>
</g>`;

const WING = `<g class="s-wing">
  <path class="ink" d="M92 84 C80 64 58 58 40 66 C50 70 52 76 54 81 C44 84 40 90 38 96 C58 102 82 98 92 84 Z" fill="#FFFFFF" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M54 81 C66 83 78 83 88 81 M52 91 C64 93 78 91 86 88" fill="none" stroke="#D6DEFA" stroke-width="1.8"/>
</g>`;

const SPEED = `<g class="s-speed" fill="none" stroke-linecap="round">
  <path d="M12 94 L44 94" stroke="#8C9AE8" stroke-width="2.4"/>
  <path d="M22 104 L52 104" stroke="#B9C3F5" stroke-width="2.4"/>
  <path d="M8 114 L40 114" stroke="#8C9AE8" stroke-width="2.4"/>
</g>`;

const MIC = `<g class="mic">
  <path class="ink-line" d="M147 131 L154 120" stroke="#2A2A33" stroke-width="5" stroke-linecap="round"/>
  <path d="M151.3 124.3 L155.6 127" stroke="#E8C35A" stroke-width="2.4" stroke-linecap="round"/>
  <circle class="ink" cx="156.5" cy="116.5" r="5.8" fill="#55555F" stroke="${OUT}" stroke-width="1.4"/>
  <path d="M152.5 115 h8 M152.8 118 h7.4" stroke="#2A2A33" stroke-width=".9" opacity=".6"/>
</g>`;

const WAVES = `<g class="s-waves" fill="none" stroke="#8C9AE8" stroke-width="2.2" stroke-linecap="round">
  <path d="M166 106 q5 7 0 14"/><path d="M172 102 q7 11 0 22"/><path d="M178 98 q9 15 0 30"/>
</g>`;

const shadow = (cx, rx) => `<ellipse class="s-shadow" cx="${cx}" cy="170" rx="${rx}" ry="6.5"/>`;

export function trotter() {
  return `<svg class="side-scene" viewBox="0 0 240 200" aria-hidden="true" focusable="false">
  <g class="sc sc-study">
    ${shadow(124, 66)}
    <g transform="translate(-12 0)"><g class="s-type-body">${rig({ glasses: true })}</g></g>
    ${LAPTOP}
  </g>
  <g class="sc sc-party">
    ${shadow(134, 76)}
    <g transform="translate(-26 0)"><g class="s-sit">${rig({ top: HAT })}</g></g>
    ${CAKE}
  </g>
  <g class="sc sc-mic">
    ${shadow(120, 54)}
    <g transform="translate(-6 0)"><g class="s-talk">${rig({ top: MIC })}</g>${WAVES}</g>
  </g>
  <g class="sc sc-fly">
    ${shadow(120, 50)}
    ${SPEED}
    <g transform="translate(8 -18) rotate(-6 116 106)"><g class="s-float">${rig({ back: WING })}</g></g>
  </g>
  <g class="sc sc-trot">
    ${shadow(118, 52)}
    <g class="s-color">${rig()}</g>
    <g class="s-lines">${rig()}</g>
  </g>
</svg>`;
}

// The loop, step by step: [scene, ms on screen, extra classes on that scene].
// Scene changes are quick ghosted cuts; the outgoing pose drifts as it fades.
const STEPS = [
  ['study', 380, ''],
  ['party', 400, ''],
  ['mic', 520, ''],
  ['fly', 420, ''],
  ['trot', 1700, 'shut'],
  ['trot', 420, 'shut sketch'],
  ['trot', 700, ''],
];
const EXIT = { study: 'exit-right', party: 'exit-right', mic: 'exit-right', fly: 'exit-left', trot: 'exit-left' };

/** Runs the landing-scene loop until the SVG leaves the page. */
export function playScene(svg) {
  if (!svg) return;
  const scene = (name) => svg.querySelector(`.sc-${name}`);
  let reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
  if (reduce) { scene('trot').classList.add('on'); return; }
  const later = (fn, ms) => setTimeout(() => { if (svg.isConnected) fn(); }, ms);
  let i = 0;
  const next = () => {
    const [name, ms, mods] = STEPS[i];
    const el = scene(name);
    const prev = svg.querySelector('.sc.on');
    if (prev && prev !== el) {
      const exit = EXIT[prev.dataset.name];
      prev.classList.remove('on', 'shut', 'sketch');
      prev.classList.add('off', exit);
      later(() => prev.classList.remove('off', exit), 220);
    }
    el.dataset.name = name;
    el.classList.remove('shut', 'sketch');
    if (mods) el.classList.add(...mods.split(' '));
    el.classList.add('on');
    i = (i + 1) % STEPS.length;
    later(next, ms);
  };
  next();
}
