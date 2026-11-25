"""The daydreamer, drawn in boat coordinates (140 × 220).

Keep these vector layers as the source of truth. generate_art.py exports both
the assembled illustration and the layers used by the lightweight Pixi rig.
"""

DEFS = '''<defs>
  <linearGradient id="c-skin" x1=".2" y1="0" x2=".85" y2="1">
    <stop stop-color="#ffe2c7"/><stop offset="1" stop-color="#f1c9ab"/>
  </linearGradient>
  <linearGradient id="c-hair" x1=".2" y1="0" x2=".8" y2="1">
    <stop stop-color="#d4ded1"/><stop offset=".6" stop-color="#c6d2c3"/><stop offset="1" stop-color="#afc0ad"/>
  </linearGradient>
  <linearGradient id="c-shirt" x1="0" y1="0" x2=".85" y2="1">
    <stop stop-color="#f4f3df"/><stop offset=".65" stop-color="#e7ebd2"/><stop offset="1" stop-color="#cfd7bc"/>
  </linearGradient>
  <linearGradient id="c-shorts" x1=".1" y1="0" x2=".9" y2="1">
    <stop stop-color="#a7aaa8"/><stop offset=".55" stop-color="#8f9593"/><stop offset="1" stop-color="#787f7d"/>
  </linearGradient>
</defs>'''

# Extended legs are deliberately a little different: one ankle is lower, and
# the feet fall outward. No bent knee, crossed calf, or trouser-shaped skin.
BODY = '''
  <g stroke="#536056" stroke-width="1.25">
    <path d="M57 144C56 157 56 168 55 179L53 186Q50 190 53 194C56 196 61 195 62 193Q63 191 60 187L62 177C65 165 67 155 67 147Z" fill="url(#c-skin)"/>
    <path d="M74 146C75 159 76 168 78 179L79 188Q78 193 82 195C85 197 91 195 91 192Q90 189 86 187L86 176C85 164 84 154 84 146Z" fill="url(#c-skin)"/>
    <path d="M64 150Q64 166 60 179L59 185 61 188Q59 178 63 166L67 150ZM80 149Q79 167 82 178L83 187 86 190 86 177 84 150Z" fill="#dcae92" stroke="none" opacity=".4"/>
    <path d="M57 158Q56.5 166 57 170M77 159l2 10" fill="none" stroke="#fff0d6" stroke-width="1.4"/>
    <path d="M57 173l2 .5M80 175l2-.5M54 191q2 2 5 1M84 192l3 .2" fill="none" stroke="#bc977f" stroke-width=".65"/>
    <path d="M54 194v-1.4M56 194.5v-1.3M88 194l-.7-1.2" fill="none" stroke="#be9d86" stroke-width=".5"/>
  </g>
  <!-- Soft grey cotton shorts: loose legs, a visible crotch, quiet seams. -->
  <path d="M54 132Q69 128 86 132L89 154Q82 158 73 155L70 146 68 155Q59 157 51 153Z" fill="url(#c-shorts)" stroke="#4f5953" stroke-width="1.5"/>
  <path d="M57 138 54 151Q59 154 66 153L69 143 72 144 75 154Q81 155 86 153L84 139" fill="none" stroke="#c2c5be" stroke-width=".85"/>
  <path d="M70 138v8M57 139l-1 5M81 137q-1 6 4 9" fill="none" stroke="#707b75" stroke-width=".85"/>
  <path d="M52 152q8 3 15 1M74 154q8 2 14-1" fill="none" stroke="#6b7570" stroke-width=".9"/>
  <!-- Elbows open out; the hands disappear naturally under the hair. -->
  <path d="M49 111C37 113 27 108 26 100L27 85Q28 79 34 80L48 86 46 94 37 90 37 98 53 98Z" fill="url(#c-skin)" stroke="#4a574c" stroke-width="1.6"/>
  <path d="M91 105C106 110 117 102 116 92L112 77Q110 71 104 74L93 82 97 90 104 84 106 94 88 95Z" fill="url(#c-skin)" stroke="#4a574c" stroke-width="1.6"/>
  <path d="M28 95q-2 10 8 12M112 86q4 12-5 15" fill="none" stroke="#fff0d5" stroke-width="1.25"/>
  <path d="m37 90-3-2m70-4 3-3" fill="none" stroke="#c59c82" stroke-width=".8"/>
  <!-- A roomy tee rests on the torso instead of hugging it. -->
  <path d="M54 97Q46 96 39 103L42 117 51 115 49 137Q68 146 91 138L86 113 99 109 94 95Q87 94 80 97Z" fill="url(#c-shirt)" stroke="#465448" stroke-width="1.65"/>
  <path d="M44 105 48 113 52 111 55 119 52 135Q56 139 63 139L56 135 58 116ZM88 107 82 117 86 136 90 137 86 113 96 109Z" fill="#aebca2" opacity=".36"/>
  <path d="M52 113q4 6 3 12M84 113l-3 9M62 130l-2 7M76 127q1 7 5 10" fill="none" stroke="#abb99d" stroke-width=".85"/>
  <path d="M53 136Q69 142 87 137M42 109l8 4M90 109l6-2" fill="none" stroke="#faf8e4" stroke-width="1.1"/>
  <path d="M57 97 58 105Q69 114 82 103L80 95Z" fill="url(#c-skin)" stroke="#69705a" stroke-width="1"/>
  <path d="M58 98q9 8 22 1l1 4q-9 7-21 1Z" fill="#cc9d8b" opacity=".6" stroke="none"/>
  <path d="M56 104Q68 116 84 103" fill="none" stroke="#a5b296" stroke-width="2.6"/>
  <path d="M56 103Q68 114 83 102" fill="none" stroke="#f9f6e2" stroke-width="1.4"/>
  <path d="m67 108 3 .5m6-1 3-1" fill="none" stroke="#b9967d" stroke-width=".7"/>
'''

EAR_LEFT = '''
  <path d="M42 67Q32 57 31 38Q31 34 35 35C45 36 54 43 59 51Z" fill="url(#c-hair)" stroke="#3d4e41" stroke-width="1.9"/>
  <path d="M35 41Q37 53 43 59L52 50Q45 43 35 41Z" fill="#94aaa0"/>
  <path d="m38 49 3-3 2 5 4-2 1 6 5-1-8 9Z" fill="#e5ebd8"/>
  <path d="M34 38q5 0 10 3" fill="none" stroke="#eff2e4" stroke-width="1"/>
'''

EAR_RIGHT = '''
  <path d="M80 51C83 40 88 31 94 27Q97 26 99 30L107 52 99 62Z" fill="url(#c-hair)" stroke="#3d4e41" stroke-width="1.9"/>
  <path d="M94 32 85 49 101 52Z" fill="#8ea298"/>
  <path d="m90 47 4-7 1 5 4-3 1 6 4 1-4 7Z" fill="#e4ebd8"/>
  <path d="m96 31 4 9" fill="none" stroke="#f0f2e4" stroke-width="1"/>
'''

HEAD = '''
  <!-- A single flowing back silhouette; fewer, larger tufts read at 30 px. -->
  <path d="M39 62C42 46 62 40 79 45Q100 44 105 67C111 78 109 87 115 90Q109 92 105 88L108 103Q102 103 99 99L99 113Q91 112 87 107L81 114Q72 112 68 107Q57 114 49 111L50 103 41 109 43 96 34 100Q38 89 35 79Q31 68 39 62Z" fill="#b7c7b3" stroke="#3d4e41" stroke-width="1.85"/>
  <path d="M40 78Q39 91 44 98L43 104 49 100 49 105Q59 108 68 102L81 108 88 103 94 108 94 98Q105 97 104 83L99 73Z" fill="#91a98f" opacity=".38"/>
  <path d="M43 87q-1 10 4 13M52 97q4 8 12 7M93 90q3 9 0 14" fill="none" stroke="#dce5ce" stroke-width="1.25"/>
  <!-- The face is broad and quiet. Bangs cover the eyes, not the whole face. -->
  <path d="M46 68Q49 55 70 55C89 54 102 66 102 81L99 91Q94 104 78 107C61 110 49 101 45 91Q42 81 46 68Z" fill="url(#c-skin)" stroke="#3d4e41" stroke-width="1.7"/>
  <path d="M47 87Q49 101 67 104M98 83q0 10-7 15" fill="none" stroke="#dfb596" stroke-width=".8" opacity=".7"/>
  <ellipse cx="56" cy="92" rx="5" ry="1.6" fill="#df9d8d" opacity=".23"/>
  <ellipse cx="91" cy="91" rx="4.2" ry="1.5" fill="#df9d8d" opacity=".2"/>
  <path d="M77 99q3-2.5 6-1.6" fill="none" stroke="#56604e" stroke-width="1.05"/>
  <!-- A tiny meadow stem in the corner of the mouth, no smoke or effects. -->
  <path d="m82 98 11-1" fill="none" stroke="#617459" stroke-width=".9"/>
  <path d="M89 97q1-4 4-4-1 3-4 4" fill="#9eae7f" stroke="#768866" stroke-width=".45"/>
  <!-- Broad, asymmetric bangs and rounded side locks follow the reference. -->
  <path d="M37 63C39 48 53 43 68 43C85 40 97 47 106 56Q110 60 116 61L105 65 112 72Q106 74 101 70C104 80 102 87 99 90Q93 86 92 77L90 68Q87 72 81 69L76 65C78 74 75 82 71 87L69 77Q65 87 59 90L57 80Q55 91 53 95L56 101Q43 99 39 89C34 78 34 70 37 63Z" fill="url(#c-hair)" stroke="#3d4e41" stroke-width="1.85"/>
  <!-- Big graphic highlights survive downsampling; fine strands stay sparse. -->
  <path d="M45 61Q52 52 65 52L63 58 58 57 53 62 50 59 45 65Z" fill="#f5f6e9" opacity=".92"/>
  <path d="M76 48Q90 47 99 55" fill="none" stroke="#f5f6e9" stroke-width="1.7"/>
  <path d="M79 51q10 0 15 4" fill="none" stroke="#eaf0df" stroke-width=".9"/>
  <path d="M66 47C77 46 79 57 76 65M43 72q-2 12 4 18M59 67q2 10-1 14M94 59q7 8 7 18" fill="none" stroke="#8fa88e" stroke-width="1.05"/>
  <path d="M40 65 39 68M49 78q-1 5 1 8M84 58l4 4" fill="none" stroke="#e4ebd7" stroke-width="1.2"/>
  <!-- Two warm ivory barrettes: recognisable even in the small pond sprite. -->
  <g transform="rotate(-24 40 64)" stroke="#465044" stroke-width="1.1">
    <rect x="35" y="59" width="10" height="3.8" rx=".65" fill="#d0b58c"/>
    <rect x="34" y="65" width="10" height="3.8" rx=".65" fill="#d0b58c"/>
    <path d="M38 59.5h4v2.8h-4ZM37 65.5h4v2.8h-4Z" fill="#f8ecd2" stroke="none"/>
  </g>
'''

LOWER_BODY, UPPER_BODY = BODY.split('  <!-- Elbows open out;', 1)
UPPER_BODY = '  <!-- Elbows open out;' + UPPER_BODY
LAYERS = {'character-legs': LOWER_BODY, 'character-body': UPPER_BODY, 'character-ear-left': EAR_LEFT,
          'character-ear-right': EAR_RIGHT, 'character-head': HEAD}


def svg(content, title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="140" height="220" viewBox="0 0 140 220">
<title>{title}</title>{DEFS}
<g stroke-linecap="round" stroke-linejoin="round">{content}</g></svg>\n'''


def export_character(out, boat_shell):
    """Preserve the boat artwork, inserting the static pose before its oar."""
    for name, content in LAYERS.items():
        (out / f'{name}.svg').write_text(svg(content, name), encoding='utf-8')
    (out / 'boat-hull.svg').write_text(boat_shell, encoding='utf-8')
    character = f'<g transform="rotate(-6 70 110)">{BODY}{EAR_LEFT}{EAR_RIGHT}{HEAD}</g>'
    assembled = boat_shell.replace('</defs>', '</defs>' + DEFS, 1)
    assembled = assembled.replace('<!-- CHARACTER -->', character)
    (out / 'boat.svg').write_text(assembled, encoding='utf-8')
