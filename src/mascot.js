// The Blurt o monster. Its round open mouth is the "o" in the logo.
// Moods: idle, curious (learning), speak (mouth wide), cheer (session done), logo.

const ARM_L = '<ellipse class="m-arm m-arm-l" cx="19" cy="76" rx="8" ry="14"/>';
const ARM_R = '<ellipse class="m-arm m-arm-r" cx="101" cy="76" rx="8" ry="14"/>';

// Horns, body, face. Shared by the still mascot and the trotting one.
const BODY = `
    <path class="m-horn" d="M36 31 C32 22 30 15 31 8 C38 13 44 19 48 26 Z"/>
    <path class="m-horn" d="M84 31 C88 22 90 15 89 8 C82 13 76 19 72 26 Z"/>
    <path class="m-skin" d="M60 19 C89 19 104 40 104 68 C104 95 86 109 60 109 C34 109 16 95 16 68 C16 40 31 19 60 19 Z"/>
    <ellipse class="m-belly" cx="60" cy="88" rx="27" ry="17"/>
    <g class="m-eyes">
      <circle class="m-eye" cx="44" cy="52" r="10"/>
      <circle class="m-eye" cx="76" cy="52" r="10"/>
      <g class="m-pupils"><circle cx="46" cy="54" r="5"/><circle cx="78" cy="54" r="5"/><circle class="m-glint" cx="48" cy="51.5" r="1.6"/><circle class="m-glint" cx="80" cy="51.5" r="1.6"/></g>
      <path class="m-happy" d="M36 55 Q44 44 52 55 M68 55 Q76 44 84 55"/>
    </g>
    <circle class="m-cheek" cx="29" cy="69" r="6"/>
    <circle class="m-cheek" cx="91" cy="69" r="6"/>
    <g class="m-mouth">
      <circle class="m-mouth-o" cx="60" cy="79" r="13"/>
      <ellipse class="m-tongue" cx="60" cy="86" rx="7" ry="3.6"/>
      <path class="m-tooth" d="M53.5 68.3 L56.5 73.5 L59.5 66.9 Z"/>
    </g>`;

export function mascot(mood = 'idle', size = '') {
  return `<svg class="mascot m-${mood} ${size}" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <g class="m-body">${ARM_L}${ARM_R}${BODY}
  </g>
</svg>`;
}

// ---- Landing-page scene ----------------------------------------------------
// A side-view monster runs a 10 s loop of short vignettes that dissolve into
// each other: study (laptop + glasses) → celebrate (party hat + cake) →
// zoom (wings + speed lines) → trot (walk cycle, with a quick line-art flash).
// One rig is reused; each scene poses it with CSS (see .side-scene in styles.css).

function rig({ eyes = 'open', glasses = false, front = '', back = '' } = {}) {
  const eye = eyes === 'happy'
    ? '<path class="line" d="M140 93 Q148 84 156 93" fill="none" stroke="#1B1030" stroke-width="3.5" stroke-linecap="round"/>'
    : `<circle class="ink eye" cx="148" cy="91" r="9"/>
       <g class="s-pupil"><circle class="pupil" cx="151.5" cy="92" r="4.6"/><circle class="glint" cx="153.4" cy="89.6" r="1.5"/></g>`;
  const specs = glasses
    ? '<g class="line" fill="none" stroke="#1B1030" stroke-width="2.6"><circle cx="149" cy="91" r="12"/><path d="M137 89 L116 85 M161 91 L167 93"/></g>'
    : '';
  return `
  <g class="s-leg s-leg-b"><rect class="ink far" x="93" y="136" width="14" height="34" rx="7"/><ellipse class="ink foot-far" cx="104" cy="170" rx="10" ry="6.5"/></g>
  <g class="s-leg s-leg-f"><rect class="ink skin" x="127" y="136" width="14" height="34" rx="7"/><ellipse class="ink foot" cx="138" cy="170" rx="10" ry="6.5"/></g>
  <g class="s-bob">
    ${back}
    <path class="ink far" d="M100 62 C95 48 94 40 97 30 C106 37 113 47 116 59 Z"/>
    <path class="ink skin" d="M128 62 C130 48 138 40 148 35 C149 46 146 56 141 64 Z"/>
    <g class="s-arm s-arm-b"><ellipse class="ink far" cx="104" cy="128" rx="7" ry="13"/></g>
    <path class="ink skin" d="M68 112 C68 74 94 56 122 56 C154 56 172 80 172 110 C172 140 150 158 120 158 C88 158 68 142 68 112 Z"/>
    <ellipse class="ink belly" cx="130" cy="138" rx="26" ry="15"/>
    ${eye}
    <circle class="cheek" cx="146" cy="110" r="6"/>
    <g class="s-mouth">
      <circle class="line mouth" cx="162" cy="119" r="8.5"/>
      <ellipse class="tongue" cx="162" cy="124" rx="4.6" ry="2.4"/>
      <path class="tooth" d="M158 111.6 L160 115.6 L162 110.6 Z"/>
    </g>
    ${specs}
    <g class="s-arm s-arm-f"><ellipse class="ink skin" cx="122" cy="129" rx="7" ry="13"/></g>
    ${front}
  </g>`;
}

const LAPTOP = `
  <path class="ink" d="M108 176 L166 176 L180 162 L124 162 Z" fill="#C9D2FF"/>
  <path d="M116 172 L164 172 M122 167 L170 167" stroke="#8C9AE8" stroke-width="2" stroke-dasharray="4 3"/>
  <path class="ink" d="M164 176 L180 162 L190 110 L174 122 Z" fill="#9FB0FF"/>
  <circle cx="178" cy="142" r="3" fill="#FFFFFF" opacity=".7"/>`;

const HAT = `<g transform="rotate(16 124 60)">
    <path class="ink" d="M108 62 L124 18 L140 62 Z" fill="#7BD8C4"/>
    <path d="M113.5 47 L134.5 47 L136.7 53 L111.3 53 Z M118.6 33 L129.4 33 L131.2 38 L116.8 38 Z" fill="#FFFFFF" opacity=".85"/>
    <circle class="ink" cx="124" cy="16" r="5" fill="#FFC94D"/>
  </g>`;

const flame = (x) => `<ellipse class="s-flame" cx="${x}" cy="125" rx="2.6" ry="4.4" fill="#FF9F43"/>`;
const CAKE = `
  <ellipse class="ink" cx="186" cy="176" rx="32" ry="5" fill="#FFFFFF"/>
  <rect class="ink" x="163" y="146" width="46" height="28" rx="5" fill="#FFE08A"/>
  <path d="M163 158 L209 158" stroke="#F5B82E" stroke-width="2"/>
  <path class="ink" d="M163 150 C163 142 209 142 209 150 L209 152 C205 158 201 150 197 155 C193 160 189 151 185 156 C181 161 177 151 173 156 C169 160 166 152 163 154 Z" fill="#FF9DB5"/>
  <rect x="175" y="130" width="4" height="15" rx="1.5" fill="#5B8CFF"/>
  <rect x="184" y="130" width="4" height="15" rx="1.5" fill="#FF5E7E"/>
  <rect x="193" y="130" width="4" height="15" rx="1.5" fill="#3FCFC2"/>
  ${flame(177)}${flame(186)}${flame(195)}`;

const WING = `<g class="s-wing">
    <path class="line wing" d="M100 74 C88 52 64 46 46 54 C56 60 58 66 60 72 C50 74 46 80 44 86 C62 92 86 90 100 74 Z" fill="#FFFFFF"/>
    <path d="M60 72 C72 74 84 74 96 72 M58 82 C70 84 84 82 94 78" fill="none" stroke="#C9D2FF" stroke-width="2"/>
  </g>`;

const SPEED = `<g class="s-speed" fill="none" stroke="#8C9AE8" stroke-width="3" stroke-linecap="round">
    <path d="M14 92 L46 92"/><path d="M24 104 L58 104"/><path d="M10 116 L40 116"/>
  </g>`;

// Scene order and how long each stays on screen (ms).
const SCENES = [['study', 2600], ['party', 2600], ['fly', 2600], ['trot', 5200]];

/** Runs the landing-scene loop until the SVG leaves the page. */
export function playScene(svg) {
  if (!svg) return;
  const scene = (name) => svg.querySelector(`.sc-${name}`);
  let reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
  if (reduce) { scene('party').classList.add('on'); return; }
  const later = (fn, ms) => setTimeout(() => { if (svg.isConnected) fn(); }, ms);
  let i = 0;
  const next = () => {
    const [name, ms] = SCENES[i];
    const el = scene(name);
    const prev = svg.querySelector('.sc.on');
    if (prev && prev !== el) {
      prev.classList.replace('on', 'off'); // keeps moving while it fades out
      later(() => prev.classList.remove('off'), 700);
    }
    el.classList.add('on');
    if (name === 'trot') {
      later(() => el.classList.add('sketch'), ms * 0.48);
      later(() => el.classList.remove('sketch'), ms * 0.48 + 900);
    }
    i = (i + 1) % SCENES.length;
    later(next, ms);
  };
  next();
}

export function trotter() {
  return `<svg class="side-scene" viewBox="0 0 240 200" aria-hidden="true" focusable="false">
  <g class="sc sc-study">
    <ellipse class="s-shadow" cx="118" cy="178" rx="74" ry="6"/>
    <g transform="translate(-18 12)">${rig({ glasses: true })}</g>
    ${LAPTOP}
  </g>
  <g class="sc sc-party">
    <ellipse class="s-shadow" cx="128" cy="178" rx="84" ry="6"/>
    <g transform="translate(-30 12)"><g class="s-hop">${rig({ eyes: 'happy', front: HAT })}</g></g>
    ${CAKE}
  </g>
  <g class="sc sc-fly">
    <ellipse class="s-shadow s-shadow-fly" cx="122" cy="180" rx="40" ry="5"/>
    ${SPEED}
    <g class="s-float"><g transform="translate(6 -20) rotate(-8 120 110)">${rig({ back: WING })}</g></g>
  </g>
  <g class="sc sc-trot">
    <ellipse class="s-shadow s-shadow-trot" cx="122" cy="178" rx="52" ry="6"/>
    <g class="s-color">${rig({ eyes: 'happy' })}</g>
    <g class="s-lines">${rig({ eyes: 'happy' })}</g>
  </g>
</svg>`;
}
