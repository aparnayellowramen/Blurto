// The Blurt o monster: a fluffy pastel egg with soft yellow horns, arms and
// feet, dot eyes, rosy cheeks and a round open mouth (the "o" in the logo).
// Colours are SVG attributes, so the same markup works as a standalone icon.
// Front-view moods: idle, curious (learning), speak (mouth wide), cheer, logo,
// and jump (the opening intro: three hops).

const OUT = '#9A5544';      // warm brown sketch outline
const FUR_TOP = '#F8FBFF';
const FUR_BOT = '#CDE2F6';
const HORN = '#F8D648';
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
