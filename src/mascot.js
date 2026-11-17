// The Blurt o monster. Its round open mouth is the "o" in the logo.
// Moods: idle, curious (learning), speak (mouth wide), cheer (session done), logo.

export function mascot(mood = 'idle', size = '') {
  return `<svg class="mascot m-${mood} ${size}" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <g class="m-body">
    <ellipse class="m-arm m-arm-l" cx="19" cy="76" rx="8" ry="14"/>
    <ellipse class="m-arm m-arm-r" cx="101" cy="76" rx="8" ry="14"/>
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
    </g>
  </g>
</svg>`;
}
