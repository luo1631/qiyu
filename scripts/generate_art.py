"""Editable, deterministic illustration sources. No build-time asset generation required."""
from pathlib import Path
import random

OUT = Path(__file__).resolve().parents[1] / 'public' / 'art'
OUT.mkdir(exist_ok=True)
random.seed(1631)
DEFS = '''<defs>
<linearGradient id="sand" x2="0.3" y2="1"><stop stop-color="#f6e9c5"/><stop offset="1" stop-color="#d8c9a0"/></linearGradient>
<linearGradient id="grass" x2=".8" y2="1"><stop stop-color="#cad7a4"/><stop offset="1" stop-color="#a9c592"/></linearGradient>
<linearGradient id="leaf" x2=".5" y2="1"><stop stop-color="#8fb998"/><stop offset="1" stop-color="#689a80"/></linearGradient>
<linearGradient id="wood" x2="1" y2="1"><stop stop-color="#dfc093"/><stop offset="1" stop-color="#af885e"/></linearGradient>
<linearGradient id="roof" x2="0.7" y2="1"><stop stop-color="#dda578"/><stop offset="1" stop-color="#b77556"/></linearGradient>
<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".065"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter>
</defs>'''

def path(d, fill='none', stroke='#617a63', sw=1.8, extra=''):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'

def ground():
    return '''<ellipse cx="182" cy="244" rx="150" ry="49" fill="#719f92" opacity=".10"/>
<ellipse cx="178" cy="242" rx="145" ry="47" fill="none" stroke="#eff8e7" stroke-width="2" opacity=".65"/>
<path d="M42 209C37 186 61 166 91 164 101 139 143 146 165 142 194 128 230 142 245 155 280 150 314 169 320 193 339 209 311 235 286 241 258 261 217 258 195 266 168 276 138 261 107 259 79 257 46 241 42 209Z" fill="#b6ac84" stroke="#a9b799" stroke-width="1.5"/>
<path d="M40 201C35 179 62 158 92 158 105 134 143 139 164 135 195 123 232 135 247 149 280 143 316 165 320 188 337 205 308 228 282 232 250 250 218 250 193 258 167 265 139 253 109 251 78 249 44 230 40 201Z" fill="url(#sand)" stroke="#b8b79a" stroke-width="1.5"/>
<path d="M54 193C60 176 76 170 103 170 118 145 145 152 170 148 198 138 226 149 242 161 272 157 301 173 302 192 309 206 282 217 264 223 232 241 209 230 184 242 161 247 140 236 116 238 88 232 57 220 54 193Z" fill="url(#grass)" stroke="#abbf93" stroke-width="1"/>
<path d="M66 225Q100 244 129 244M202 251Q241 247 262 240M285 233L303 223" stroke="#f6edcf" fill="none" stroke-width="3" stroke-linecap="round"/>
<path d="M129 214Q162 197 189 190T256 187" fill="none" stroke="#ddd4ad" stroke-width="18" opacity=".85" stroke-linecap="round"/>
'''

def tuft(x,y,s=1):
    return f'<g transform="translate({x} {y}) scale({s})">'+path('M-7 1Q-12-10-9-15M-3 0Q-5-15 0-22M1 0Q5-15 9-17M5 0Q12-7 13-6',stroke='#7c9b72',sw=1.4)+'</g>'

def rock(x,y,s=1):
    return f'<g transform="translate({x} {y}) scale({s})">'+path('M-16 0-11-11 1-16 12-10 18 1 8 7-8 6Z','#b4beb0','#94a698',1)+path('M-11-11 1-5 12-10M1-5 8 7',stroke='#d9dece',sw=1)+'</g>'

def tree(x,y,s=1):
    return f'<g transform="translate({x} {y}) scale({s})"><ellipse cy="5" rx="44" ry="15" fill="#6c906e" opacity=".18"/>'+path('M-5 0-2-82 6-83 8 1Z','#9b8b62','#7c805c',2)+path('M1-45-23-67M4-32 23-65',stroke='#8a805b',sw=4)+path('M-44-65C-61-75-57-96-43-102-49-121-31-136-14-130-7-148 16-146 26-130 48-136 66-115 54-97 67-76 49-58 31-61 15-47-3-53-13-59-24-51-43-52-44-65Z','url(#leaf)','#688e72',1.6)+path('M-43-103Q-29-117-12-108M-4-128Q17-132 28-117M20-68Q42-67 49-83',stroke='#bdd0a9',sw=3)+path('M-47-85Q-34-73-21-78M-6-65Q7-72 6-84M19-104Q33-94 45-102',stroke='#5c8f74',sw=2)+'</g>'

def dock(x,y,angle=0):
    return f'<g transform="translate({x} {y}) rotate({angle})">'+path('M-22-9 20-9 23 64-21 68Z','url(#wood)','#a08a66',1.5)+''.join(path(f'M-21 {n} 21 {n-2}',stroke='#a88d68',sw=1) for n in range(0,65,10))+path('M-20 5V74M22 0V70',stroke='#8e805d',sw=4)+path('M-21 0V-10M22-4V-14',stroke='#867553',sw=5)+'</g>'

def decorations():
    return ''.join(tuft(x,y,s) for x,y,s in [(76,200,.7),(112,233,.7),(277,203,.8),(240,228,.6),(107,177,.5),(288,181,.5)])+rock(72,215,.5)+rock(272,226,.4)

def github():
    return tree(124,172,1.05)+tree(228,153,.67)+'''
<g transform="translate(188 181)">
<path d="M-37-9 11-19 37-1-9 10Z" fill="#bd9f72" stroke="#8c8460" stroke-width="1.5"/>
<path d="M-29 0V25M26 2V27M-8 10V34" stroke="#948360" stroke-width="4"/>
<path d="M-20-36 13-39 18-13-15-9Z" fill="#526e66" stroke="#4f655c" stroke-width="2"/>
<path d="M-16-32 9-34 13-17-12-14Z" fill="#cad8bd"/>
<path d="m-7-28-5 6 6 3M3-29 9-25 4-20" fill="none" stroke="#6e8f7c" stroke-width="1.5"/>
<path d="m-15-9 33-4 8 7-35 5Z" fill="#9ba99b" stroke="#657c70" stroke-width="1.2"/>
<path d="M-38 2-32 6-34 24-43 19Z" fill="#ba9468" stroke="#8c8460"/>
</g>
<g transform="translate(273 167)"><path d="M0 26V-29" stroke="#9d8a61" stroke-width="4"/><path d="M1-28Q20-37 33-24L30 0Q17-11 1-4Z" fill="#e6d5a3" stroke="#ab9e75" stroke-width="1.2"/><path d="m11-21-5 5 5 4M21-23 26-18 21-13" fill="none" stroke="#79927d" stroke-width="1.5"/></g>'''+dock(181,234,-12)

def projects():
    return tree(273,168,.84)+'''
<g transform="translate(164 173)">
<path d="M-58-48 4-67 57-29 56 29-5 51-58 23Z" fill="#f1dfb7" stroke="#a9946b" stroke-width="1.8"/>
<path d="M-5-25 56-29 56 29-5 51Z" fill="#d4c49d"/>
<path d="M-69-47-8-99 64-44 59-28-8-76-58-34Z" fill="url(#roof)" stroke="#9b7e5b" stroke-width="2"/>
<path d="M-8-99 43-111 104-61 64-44Z" fill="#c58f68" stroke="#9b7e5b" stroke-width="2"/>
<path d="M11-94 68-49M29-100 86-56M-56-48-8-86 47-43" fill="none" stroke="#e8b68a" stroke-width="2"/>
<path d="M-39 29V-13L-15-5V40Z" fill="#a6ad88" stroke="#9a916b" stroke-width="2"/>
<path d="M-34-6-22-2V14L-34 9Z" fill="#d9e4c6"/><circle cx="-21" cy="21" r="1.5" fill="#7a775b"/>
<path d="M7-11 36-20V9L7 18Z" fill="#88a4a0" stroke="#9b8f6b" stroke-width="3"/>
<path d="M21-15V14M8 3 35-5" stroke="#d6d8b6" stroke-width="2"/>
<path d="M-43 33-13 43-7 48-37 39Z" fill="#c0af86"/>
<path d="M47-93V-121L64-125V-82" fill="#e8d8b5" stroke="#ac9673" stroke-width="1.5"/>
<path d="M44-121 61-128 67-124 49-117Z" fill="#c0b38f"/>
</g>
<g transform="translate(80 194)"><path d="M-17-8 16-12 18 13-15 18Z" fill="#bb9b71" stroke="#9d916a"/><path d="M-13-6V12M-3-8V15M7-10V13" stroke="#dbc093"/><path d="M-11-8Q-20-38-10-35L-2-16Q-4-47 6-39L8-13Q22-40 21-25L14-11" fill="#83a781" stroke="#709371" stroke-width="1.3"/></g>
'''+dock(108,231,27)

def about():
    return tree(118,154,1.12)+'''
<g transform="translate(211 185) rotate(-9)">
<path d="M-44-13 26-15 42-2-28 2Z" fill="#c8aa7c" stroke="#9c8c67" stroke-width="1.4"/>
<path d="M-37-33 29-33 28-17-38-15Z" fill="#d9bb8c" stroke="#9c8c67" stroke-width="1.4"/>
<path d="M-39-11V15M32-3V21M-35-35V-4M25-34V-8" stroke="#8a8260" stroke-width="4"/>
<path d="M-31-26H23M-24-5H32" stroke="#a3926c" stroke-width="1"/>
<path d="M-9-16 3-21 15-18 13-7 1-9-10-6Z" fill="#f5edd3" stroke="#adac87"/>
<path d="M3-21 1-9M6-17 12-16M-6-14-1-16" stroke="#b6b99a" fill="none"/>
</g>
<path d="M262 161Q265 184 258 204" fill="none" stroke="#86a580" stroke-width="2"/>
<path d="M261 184Q238 184 242 170 255 165 261 184M261 176Q279 173 280 159 265 160 261 176" fill="#92b28b" stroke="#7d9d7a"/>
<g transform="translate(263 148)"><path d="M0 10Q-21-6-8-9 0-25 7-10 26-5 11 5Z" fill="#e7ceaa" stroke="#b7aa83"/><circle cy="-2" r="4" fill="#c8b177"/></g>
'''+rock(80,213,.8)+dock(240,220,-33)

def email():
    return tree(253,161,.8)+'''
<g transform="translate(154 172)">
<path d="M-7-10V44L3 48V-8" fill="#bca173" stroke="#92855f" stroke-width="2"/>
<path d="M-39-12V-51Q-38-79-9-77L31-64Q46-59 46-36V4Z" fill="#a9bbaa" stroke="#728e7c" stroke-width="2"/>
<path d="M-39-51Q-16-76-8-46V-2L-39-12Z" fill="#739784" stroke="#657e6d" stroke-width="2"/>
<path d="M-33-45-15-40V-32L-33-36Z" fill="#4f7265"/>
<path d="M9-46V-82H30V-68H14" fill="#ce9c79" stroke="#9c8462" stroke-width="2.5"/>
<circle cx="11" cy="-42" r="3" fill="#cbb78e"/>
<path d="M-32-31-12-25-14 4-35-4Z" fill="#f4e9ce" stroke="#c5ba96"/>
<path d="m-33-29 9 16 12-10" fill="none" stroke="#bcae89"/>
</g>
<g transform="translate(212 209) rotate(12)"><path d="M-24-12 16-17 24 8-16 14Z" fill="#eee3c8" stroke="#baae8a"/><path d="m-24-12 25 12 15-17M1 0-16 14M1 0 24 8" fill="none" stroke="#c3b594"/><path d="M-15-19 23-18 23-7" fill="#e1d5b6" stroke="#baae8a"/></g>
'''+tuft(89,186,1.5)+dock(102,227,33)

for name, content in [('github',github()),('projects',projects()),('about',about()),('email',email())]:
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="360" height="320" viewBox="0 0 360 320">{DEFS}<g filter="url(#paper)">{ground()}{content}{decorations()}</g></svg>'
    (OUT/f'{name}.svg').write_text(svg)

BOAT='''<svg xmlns="http://www.w3.org/2000/svg" width="140" height="220" viewBox="0 0 140 220">
<title>A quiet afternoon on the pond</title>
<desc>A sage-haired, cat-eared daydreamer rests with hands behind their head in a small wooden boat.</desc>
<defs>
  <linearGradient id="hull" gradientUnits="userSpaceOnUse" x1="30" y1="45" x2="108" y2="177">
    <stop stop-color="#e0bf8d"/><stop offset=".43" stop-color="#be9768"/><stop offset="1" stop-color="#927552"/>
  </linearGradient>
  <linearGradient id="deck" gradientUnits="userSpaceOnUse" x1="39" y1="51" x2="101" y2="183">
    <stop stop-color="#edcf9f"/><stop offset=".5" stop-color="#dabc8b"/><stop offset="1" stop-color="#c9a574"/>
  </linearGradient>
  <linearGradient id="paddle" gradientUnits="userSpaceOnUse" x1="119" y1="157" x2="137" y2="192">
    <stop stop-color="#e7c595"/><stop offset=".55" stop-color="#cfaa78"/><stop offset="1" stop-color="#b89161"/>
  </linearGradient>
  <pattern id="linen" width="3" height="3" patternUnits="userSpaceOnUse">
    <path d="M0 .5H3M.5 0V3" stroke="#b8bda0" stroke-width=".3" opacity=".25"/>
  </pattern>
  <clipPath id="deck-clip">
    <path d="M70 23C99 49 105 96 100 146 96 171 85 191 71 200 54 191 41 170 39 146 32 94 42 47 70 23Z"/>
  </clipPath>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
  <!-- Water-tinted underside and a thin wet edge. -->
  <ellipse cx="74" cy="126" rx="39" ry="82" fill="#4e7e70" opacity=".09"/>
  <path d="M72 16C111 46 117 103 109 152 103 184 87 204 72 213 53 207 35 185 30 153 23 105 32 49 72 16Z" fill="#6a9581" opacity=".1"/>
  <path d="M70 13C107 40 116 95 109 149 106 177 91 200 71 211 47 202 33 177 30 148 23 89 35 41 70 13Z" fill="url(#hull)" stroke="#817357" stroke-width="1.8"/>
  <path d="M71 205Q99 184 106 143" fill="none" stroke="#776d53" stroke-width="2.1" opacity=".45"/>
  <path d="M70 20C100 46 107 94 102 146 98 171 86 192 71 201 54 192 40 170 37 146 30 94 41 46 70 20Z" fill="url(#deck)" stroke="#efcf9e" stroke-width="2.4"/>
  <path d="M67 23C41 50 34 96 39 145 43 171 54 188 69 199" fill="none" stroke="#fff0c8" stroke-width="1.3" opacity=".72"/>
  <path d="M75 26Q105 65 103 125" fill="none" stroke="#9e805a" stroke-width="1.1" opacity=".63"/>
  <!-- Uneven plank grain stays inside the hull. -->
  <g clip-path="url(#deck-clip)" fill="none">
    <path d="M54 38Q43 82 48 124T54 183M70 24Q68 79 71 124T70 203M84 40Q98 87 91 129T86 183" stroke="#ae8c60" stroke-width=".85" opacity=".7"/>
    <path d="M58 37Q52 58 54 76M43 108Q46 117 45 133M57 149Q59 161 58 172M78 30Q86 43 88 54M91 148Q86 166 89 175M64 187 65 196M75 177Q79 186 77 193" stroke="#f4deb4" stroke-width=".85" opacity=".75"/>
    <path d="M61 31Q57 42 59 49M42 145 46 157M80 180Q84 184 82 190" stroke="#a88b62" stroke-width=".7" opacity=".5"/>
    <ellipse cx="52" cy="154" rx="1.7" ry="4.5" stroke="#aa8c62" stroke-width=".6" opacity=".6"/>
    <path d="M51 152q2 2 1 4M83 183q-2 4 0 7" stroke="#bba074" stroke-width=".55"/>
  </g>
  <path d="M40 164 98 163 96 176 45 177Z" fill="#8c7959" opacity=".2"/>
  <path d="M41 161 99 161 96 172 45 173Z" fill="#c6a473" stroke="#a08761" stroke-width="1"/>
  <path d="M45 163H95M47 169 94 168" fill="none" stroke="#e8c591" stroke-width=".75"/>
  <path d="M40 78 101 78 102 89 39 90Z" fill="#9c825c" opacity=".25"/>
  <path d="M39 76 101 76 103 86 38 87Z" fill="#ceb080" stroke="#a48a60" stroke-width="1"/>
  <path d="M42 79 99 78" stroke="#f1d3a1" stroke-width=".8"/>
  <!-- A small rope loop and rim lashings add scale without visual clutter. -->
  <ellipse cx="70" cy="31" rx="3.5" ry="2" fill="#9c825a" stroke="#e2c699" stroke-width=".8"/>
  <path d="M69 30q-6-4-5-7 2-2 5 1 5 3 3 6M67 25q-1-3 1-4" fill="none" stroke="#d9c8a0" stroke-width="1.3"/>
  <path d="m32 126 7 2m-7 2 7 2m-7 2 7 2M101 129l7-2m-7 6 6-2" fill="none" stroke="#ead4a6" stroke-width="1.05"/>
  <circle cx="43" cy="166" r="1" fill="#918563"/><circle cx="96" cy="165" r="1" fill="#918563"/>

  <!-- The pillow follows the weight of the head, with soft linen seams. -->
  <path d="M44 59Q66 49 94 60L98 94Q72 105 42 92Z" fill="#826f51" opacity=".13"/>
  <path d="M44 56Q66 46 92 58L96 90Q71 101 42 88Z" fill="#ede7ce" stroke="#b3b491" stroke-width="1"/>
  <path d="M45 58Q65 50 90 60L93 87Q70 96 45 86Z" fill="url(#linen)"/>
  <path d="M47 60Q65 52 88 61M46 85Q68 94 91 86" fill="none" stroke="#fff6df" stroke-width="1.2"/>
  <path d="M46 62 45 80M91 64 93 81" fill="none" stroke="#c5c8a8" stroke-width=".65" stroke-dasharray="1.2 2"/>
  <path d="M45 59 48 63M90 60 87 64M45 86 49 83M92 86 88 84" fill="none" stroke="#c5c8aa" stroke-width=".75"/>

  <!-- CHARACTER -->

  <!-- A resting oar: fine grain, a rounded blade, a small rope keeper. -->
  <path d="m100 99 6-4 24 72-6 3Z" fill="#887953" opacity=".18" transform="translate(2 3)"/>
  <path d="m98 98 7-4 25 71-7 3Z" fill="#b4996b" stroke="#8d805b" stroke-width="1"/>
  <path d="m101 100 23 63" stroke="#ead0a0" stroke-width=".9"/>
  <path d="M120 157Q129 155 133 170L137 191Q139 199 132 200 126 200 124 192L119 174Q116 161 120 157Z" fill="url(#paddle)" stroke="#9d8962" stroke-width="1.1"/>
  <path d="M121 162Q121 176 131 195" fill="none" stroke="#f4dbad" stroke-width="1.1"/>
  <path d="M125 164Q124 174 130 184M130 188l2 5" fill="none" stroke="#a98d60" stroke-width=".65" opacity=".65"/>
  <path d="M120 166 131 164M121 169 132 167" fill="none" stroke="#b19567" stroke-width=".7"/>
  <path d="M105 118q-6-2-5-6 2-3 6 1m-6 1 7-1" fill="none" stroke="#e3d2a6" stroke-width="1"/>
</g>
</svg>
'''
from character_art import export_character
export_character(OUT, BOAT)

LILY='''<svg xmlns="http://www.w3.org/2000/svg" width="140" height="95" viewBox="0 0 140 95"><ellipse cx="68" cy="56" rx="57" ry="26" fill="none" stroke="#eff7e3" opacity=".65"/><path d="M66 51 28 33C39 13 82 15 94 33 112 54 74 67 48 56Z" fill="#91b89a" stroke="#7fa78b"/><path d="M66 51 82 29M66 51 41 25M66 51 92 46" stroke="#acc5a1" fill="none"/><path d="M99 70 81 61C91 46 121 47 128 61 129 75 108 81 90 75Z" fill="#a8c39f" stroke="#8caf90"/><path d="M42 40Q17 29 25 17 39 20 42 32 39 10 51 8 61 20 51 33 67 18 74 29 66 45 42 40Z" fill="#eee8cd" stroke="#c6c7a3"/><path d="M37 33Q44 20 51 33L52 41 41 42Z" fill="#e3d8b4"/><ellipse cx="46" cy="39" rx="7" ry="3" fill="#c6b273"/></svg>'''
(OUT/'lily.svg').write_text(LILY)
print('Created scene illustrations and layered daydreamer assets.')
