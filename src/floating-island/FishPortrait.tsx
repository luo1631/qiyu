import { useLayoutEffect, useRef } from 'react';
import type { FishForm, FishSpecies } from './fishing-catalog';

type Shape = { body: string; dorsal: string; eye: [number, number]; hue: number };
const tail = 'M214 61 Q240 46 260 46 Q252 61 247 64 Q255 71 260 87 Q235 84 214 73 Z';
const shapes: Record<FishForm, Shape> = {
  silver: {
    body: 'M29 66 Q38 49 69 47 C107 34 164 46 188 54 L218 61 L218 72 C163 78 130 91 79 84 Q39 80 29 66 Z',
    dorsal: 'M103 46 Q115 36 125 27 Q139 26 159 48 Z', eye: [48, 60], hue: 166,
  },
  carp: {
    body: 'M30 66 Q37 50 66 43 C107 21 156 40 182 53 Q200 61 218 62 L218 75 Q192 76 166 88 Q119 108 78 91 Q41 83 30 66 Z',
    dorsal: 'M81 37 Q106 14 115 22 L172 48 Z', eye: [51, 59], hue: 48,
  },
  perch: {
    body: 'M28 65 Q31 54 55 51 C93 23 145 37 173 49 Q194 59 218 61 L218 73 Q196 75 172 84 C122 107 62 94 28 71 Z',
    dorsal: 'M64 45 L80 27 L86 32 L96 18 L104 29 L115 20 L125 32 L135 27 L146 38 L157 34 L176 51 Z', eye: [48, 61], hue: 82,
  },
  trout: {
    body: 'M26 65 Q31 54 58 51 C91 36 118 39 145 44 Q194 58 218 61 L218 73 Q189 73 160 83 Q94 99 62 85 Q37 82 27 72 Z',
    dorsal: 'M96 43 Q108 24 118 26 L151 46 Z M169 51 Q179 39 188 54 Z', eye: [48, 60], hue: 34,
  },
  eel: {
    body: 'M27 66 Q37 54 68 57 C110 60 134 38 167 45 C201 52 221 77 260 62 C246 86 214 86 180 69 C151 55 126 76 89 79 Q48 84 29 73 Z',
    dorsal: 'M72 58 C114 58 133 33 166 41 C201 46 226 74 260 62 C223 78 203 51 165 47 C138 43 104 63 72 58 Z', eye: [44, 65], hue: 100,
  },
  catfish: {
    body: 'M28 66 Q29 49 74 48 C110 39 133 48 171 56 Q193 61 218 60 L218 74 Q183 74 158 80 C100 99 54 86 33 76 Z',
    dorsal: 'M88 47 Q96 24 108 24 L134 50 Z M156 53 Q166 43 178 58 Z', eye: [48, 60], hue: 188,
  },
  pike: {
    body: 'M20 64 Q36 63 56 55 C98 46 136 50 173 55 Q197 57 218 61 L218 74 Q188 76 161 81 Q92 89 57 73 L25 72 Z',
    dorsal: 'M147 54 Q162 32 175 37 Q191 41 205 60 Z', eye: [62, 60], hue: 72,
  },
  sturgeon: {
    body: 'M19 69 Q44 57 60 54 L78 44 C126 36 159 47 184 54 L219 61 Q240 59 260 39 Q265 58 245 66 Q256 72 257 83 Q236 81 219 73 Q193 74 169 79 Q101 94 59 80 L29 75 Z',
    dorsal: 'M161 52 Q174 31 180 32 Q190 38 205 59 Z', eye: [55, 63], hue: 175,
  },
  flat: {
    body: 'M37 64 C64 34 108 26 149 39 Q189 50 216 61 L216 73 C185 94 132 103 95 98 Q50 87 37 64 Z',
    dorsal: 'M42 59 C73 28 114 20 153 34 Q185 44 216 61 Q149 42 104 46 Q72 48 42 59 Z', eye: [57, 58], hue: 31,
  },
  shark: {
    body: 'M23 64 C42 47 93 40 128 46 Q178 54 215 60 Q237 44 248 29 C254 44 249 56 237 65 Q251 75 251 91 Q231 83 215 72 C169 70 145 86 99 87 Q59 90 23 67 Z',
    dorsal: 'M101 44 Q117 23 119 12 Q138 21 145 48 Z M174 55 Q184 43 190 43 L202 59 Z', eye: [46, 57], hue: 203,
  },
  angler: {
    body: 'M30 66 Q39 39 82 37 C126 26 170 48 190 62 L219 65 L220 75 Q195 77 176 91 C129 123 64 113 38 97 Q24 82 30 66 Z',
    dorsal: 'M121 39 Q137 21 149 23 Q155 34 166 48 Z M140 91 Q169 118 179 109 L173 88 Z', eye: [65, 57], hue: 198,
  },
  fangtooth: {
    body: 'M30 66 L44 51 Q63 34 99 36 C145 37 166 49 190 60 L218 63 L218 74 Q190 78 168 95 Q121 112 68 100 Q26 93 30 66 Z',
    dorsal: 'M110 38 Q123 24 134 28 L158 46 Z M144 87 Q156 105 169 101 L166 86 Z', eye: [63, 56], hue: 205,
  },
  dragon: {
    body: 'M22 67 Q27 50 68 51 C109 55 149 67 194 63 L220 63 L220 72 C169 75 119 65 79 75 Q47 88 27 80 L21 74 Z',
    dorsal: 'M151 63 Q171 34 179 30 Q182 45 197 63 Z M165 73 Q178 88 192 83 L192 70 Z', eye: [48, 59], hue: 199,
  },
  lantern: {
    body: 'M32 69 C42 44 76 43 97 45 Q147 46 183 57 Q199 62 218 62 L218 74 Q188 73 161 85 Q109 100 64 86 Q37 82 32 69 Z',
    dorsal: 'M106 46 Q114 25 126 29 L151 50 Z M171 53 Q185 42 194 58 Z', eye: [56, 58], hue: 198,
  },
  hatchet: {
    body: 'M48 61 Q53 40 83 30 Q113 25 131 39 L165 55 L218 62 L218 73 L161 79 Q125 93 106 110 Q83 105 77 90 Q53 85 48 61 Z',
    dorsal: 'M112 36 Q130 17 137 22 L153 51 Z M146 85 Q152 104 163 100 L171 76 Z', eye: [67, 47], hue: 164,
  },
  ray: {
    body: 'M46 69 Q52 61 43 56 Q61 47 78 48 Q106 31 123 14 Q136 24 134 42 Q162 51 181 60 C214 62 245 48 266 43 Q250 55 183 68 Q151 80 131 92 Q120 111 110 114 Q100 92 73 78 Q55 76 46 69 Z',
    dorsal: 'M165 61 Q176 45 185 51 L179 65 Z', eye: [61, 58], hue: 185,
  },
  billfish: {
    body: 'M12 66 Q48 60 68 55 Q105 35 146 48 Q192 59 216 62 L216 73 Q183 76 158 84 Q103 93 60 70 Z',
    dorsal: 'M85 47 Q101 21 110 15 Q117 31 143 48 Z M166 53 Q179 41 192 58 Z', eye: [77, 59], hue: 190,
  },
  puffer: {
    body: 'M47 67 Q46 39 89 35 C132 22 154 49 184 57 Q200 63 216 62 L216 75 Q191 77 173 85 C145 105 104 110 71 90 Q54 83 47 67 Z',
    dorsal: 'M140 45 Q152 25 166 33 L175 55 Z M96 70 Q109 89 125 85 L111 68 Z', eye: [68, 56], hue: 80,
  },
};

function drawFish(ink: CanvasRenderingContext2D, fish: FishSpecies, silhouette: boolean) {
  const form = shapes[fish.form];
  const seed = Array.from(fish.id).reduce((sum, char) => Math.imul(31, sum) + char.charCodeAt(0), 1) >>> 0;
  const hue = form.hue + (seed % 41 - 20);
  const outline = `hsla(${hue}, 29%, 20%, .83)`;
  const body = new Path2D(form.body);
  const separateTail = !['eel', 'sturgeon', 'shark', 'ray'].includes(fish.form);
  const lowerFin = ['eel', 'ray', 'dragon', 'hatchet', 'puffer'].includes(fish.form) ? '' : fish.form === 'shark'
    ? 'M108 73 Q113 96 144 109 Q143 86 132 71 Z' : 'M87 72 Q91 87 123 97 Q119 82 109 73 Z';
  const lure = fish.form === 'angler' ? new Path2D('M91 42 C91 24 75 12 61 21 Q54 24 54 31') : null;
  const smoothSkin = fish.form === 'angler' || fish.form === 'ray' || fish.form === 'puffer';

  ink.setTransform(2, 0, 0, 2, 4, 8);
  ink.clearRect(-8, -8, 300, 140);
  ink.lineJoin = 'round';
  ink.lineCap = 'round';
  ink.strokeStyle = outline;
  ink.lineWidth = 1.35;
  const fins = new Path2D(form.dorsal + (separateTail ? ` ${tail}` : '') + (lowerFin ? ` ${lowerFin}` : ''));
  if (silhouette) {
    ink.fillStyle = '#587c7655';
    ink.fill(fins);
    ink.fill(body);
    if (lure) { ink.strokeStyle = '#587c766e'; ink.stroke(lure); }
    return;
  }

  const finTone = ink.createLinearGradient(0, 22, 0, 104);
  finTone.addColorStop(0, `hsl(${hue + 12}, 32%, 48%)`);
  finTone.addColorStop(.67, `hsl(${hue}, 31%, 68%)`);
  finTone.addColorStop(1, `hsl(${hue - 18}, 43%, 54%)`);
  ink.fillStyle = finTone;
  ink.fill(fins);
  ink.stroke(fins);
  ink.save();
  ink.clip(fins);
  ink.strokeStyle = '#1f3c3b65';
  ink.lineWidth = .7;
  for (let ray = 0; ray < 12; ray++) {
    ink.beginPath();
    ink.moveTo(109 + ray * 2, 54);
    ink.lineTo(79 + 8 * ray, 15);
    ink.moveTo(218, 65);
    ink.lineTo(270, 38 + ray * 5);
    ink.stroke();
  }
  ink.restore();

  const bodyTone = ink.createLinearGradient(0, 35, 0, 99);
  const dark = fish.id === 'blackdevil' || fish.form === 'fangtooth';
  bodyTone.addColorStop(0, `hsl(${hue}, 30%, ${dark ? 18 : 31}%)`);
  bodyTone.addColorStop(.49, `hsl(${hue - 8}, ${fish.form === 'trout' ? 46 : 33}%, ${dark ? 31 : 63}%)`);
  bodyTone.addColorStop(.69, `hsl(${hue - 13}, 31%, ${dark ? 40 : 77}%)`);
  bodyTone.addColorStop(1, dark ? '#818996' : 'hsl(41, 40%, 89%)');
  ink.fillStyle = bodyTone;
  ink.fill(body);
  ink.stroke(body);
  ink.save();
  ink.clip(body);
  ink.lineWidth = .8;
  ink.strokeStyle = `hsla(${hue}, 27%, 30%, .27)`;
  for (let row = 0; !smoothSkin && row < 9; row++) {
    for (let column = 0; column < 25; column++) {
      const x = 67 + column * 6 + (row % 2) * 3, y = 41 + row * 6.2;
      ink.beginPath();
      ink.moveTo(x, y - 3);
      ink.quadraticCurveTo(x + 5.2, y, x, y + 3);
      ink.stroke();
    }
  }
  if (fish.form === 'perch' || fish.id === 'atlantic-mackerel') {
    ink.fillStyle = `hsla(${hue + 13}, 36%, 22%, .31)`;
    for (let index = 0; index < 7; index++) {
      const x = 79 + index * 18, y = 67 + 7 * Math.sin(index * 1.65);
      ink.fill(new Path2D(`M${x} 31 q15 12 6 ${y - 31} q-8 -11 -12 -38 Z`));
    }
  } else if (fish.form === 'sturgeon') {
    ink.fillStyle = `hsla(${hue}, 25%, 89%, .57)`;
    for (let index = 0; index < 11; index++) {
      const x = 71 + index * 12.4;
      const y = 68 - 7 * Math.sin(index * .25);
      ink.fill(new Path2D(`M${x} ${y} l4 -2.8 l4 2.3 l-4 3.2 Z`));
    }
  } else if (fish.form === 'trout' || fish.form === 'eel' || fish.form === 'flat' || fish.form === 'puffer') {
    for (let index = 0; index < 38; index++) {
      const x = 73 + ((index * 57 + seed) % 131), y = 38 + ((index * 13 + seed % 23) % 37);
      ink.fillStyle = index % 6 === 0 ? '#f2d8a394' : `hsla(${hue + 8}, 36%, 24%, .48)`;
      ink.beginPath();
      ink.ellipse(x, y, (index % 4) * .55 + .9, 1.25, index, 0, Math.PI * 2);
      ink.fill();
    }
  }
  ink.strokeStyle = '#f8f0dca4';
  ink.beginPath();
  ink.moveTo(62, 65);
  ink.quadraticCurveTo(121, 54, 219, 69);
  ink.stroke();
  if (fish.form === 'lantern' || fish.form === 'hatchet' || fish.id === 'viperfish') {
    for (let index = 0; index < 15; index++) {
      const x = 58 + index * 10, y = 73 + Math.sin(index * .39) * 8;
      ink.fillStyle = '#194954ba';
      ink.fill(new Path2D(`M${x - 2.1} ${y}a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0 -4.2 0`));
      ink.fillStyle = '#e4f6ba';
      ink.beginPath();
      ink.arc(x, y, 1.25, 0, Math.PI * 2);
      ink.fill();
    }
  }
  ink.restore();

  ink.strokeStyle = outline;
  ink.lineWidth = 1.05;
  if (fish.form === 'shark') {
    for (let gill = 0; gill < 5; gill++) ink.stroke(new Path2D(`M${67 + gill * 4} 55 q7 8 5 17`));
  } else if (fish.form === 'angler' || fish.form === 'fangtooth' || fish.form === 'dragon') {
    ink.fillStyle = outline;
    ink.fill(new Path2D('M29 71 Q53 62 79 68 L88 74 Q58 72 32 78 Z'));
    ink.fillStyle = '#f4e4bc';
    for (const [x, y, length] of [[35, 72, 9], [43, 70, 12], [51, 69, 8], [60, 70, 5]]) {
      ink.fill(new Path2D(`M${x} ${y} l4 0 l-2 ${length} Z`));
    }
  } else if (fish.form !== 'ray') {
    ink.stroke(new Path2D(`M${form.eye[0] + 13} ${form.eye[1] - 10} q19 16 -2 30 M28 68 q15 4 23 0`));
  }
  if (lure) {
    ink.strokeStyle = dark ? '#54646e' : outline;
    ink.lineWidth = 2;
    ink.stroke(lure);
    ink.save();
    if (dark) { ink.shadowBlur = 11; ink.shadowColor = '#b9f7b4'; }
    ink.fillStyle = dark ? '#f4f9bd' : '#cabc92';
    ink.beginPath();
    ink.ellipse(54, 32, 4, 3, -.2, 0, Math.PI * 2);
    ink.fill();
    ink.restore();
    ink.strokeStyle = outline;
  }
  if (fish.form === 'catfish') {
    ink.stroke(new Path2D('M38 65 Q22 61 10 53 M36 72 Q15 78 10 85 M43 74 Q31 83 21 86'));
  } else if (fish.form === 'sturgeon') {
    ink.stroke(new Path2D('M36 75 q-.4 4 -3 7 M41 76 q-.3 5 -2 8 M46 77 q0 4 -2 7'));
  }
  const [ex, ey] = form.eye;
  for (const [radius, color] of [[4.5, '#ccb579'], [2.75, '#263635'], [.98, '#fff5db']] as const) {
    ink.fillStyle = color;
    ink.beginPath();
    ink.arc(ex - (radius < 1 ? .75 : 0), ey - (radius < 1 ? .73 : 0), radius, 0, Math.PI * 2);
    ink.fill();
  }
  if (fish.form === 'flat') {
    ink.fillStyle = '#263635';
    ink.beginPath();
    ink.arc(ex + 9, ey - 5, 2.6, 0, Math.PI * 2);
    ink.fill();
  }
}

export function FishPortrait({ fish, silhouette = false }: { fish: FishSpecies; silhouette?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context) drawFish(context, fish, silhouette);
  }, [fish, silhouette]);
  return <canvas ref={canvas} className="fish-portrait" width={568} height={248} aria-hidden="true" />;
}
