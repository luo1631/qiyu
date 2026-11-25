import { BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, MathUtils, MeshStandardMaterial } from 'three';
import type { Sculpture } from './PondCreatures';
import { seededRandom } from './pond-life';
import { softenVegetation } from './vegetation-material';

type Point = [number, number, number];
type Bloom = { at: Point; scale: number; seed: number; low: boolean; pale?: boolean; bud?: boolean };
const throat = new Color('#f4dcaf'), lightPink = new Color('#f1bac3'), pale = new Color('#fff0d0');
const rose = new Color('#dd8a9f'), edgePink = new Color('#b95071'), edgePale = new Color('#dd98a2');

function lotusPetal(length: number, width: number, rise: number, phase: number, pigment: number, low: boolean, ivory: boolean) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const rows = low ? 6 : 10, columns = low ? 4 : 6, color = new Color(), middle = new Color();
  middle.copy(ivory ? pale : rose).lerp(ivory ? lightPink : pale, pigment * (ivory ? .35 : .69));
  for (let row = 0; row <= rows; row++) {
    const t = .5 - .5 * Math.cos(Math.PI * row / rows);
    const span = Math.max(.001, Math.sin(Math.PI * t ** .94) ** .70 * width * (.70 + .49 * t));
    const channel = Math.sin(t * Math.PI);
    for (let column = 0; column <= columns; column++) {
      const side = column / columns * 2 - 1;
      const feather = .86 + .14 * Math.sin(2.8 * t + phase + side * .98);
      const shoulder = span * side * feather;
      const twist = Math.sin(phase * 2.6) * span * .19 * t;
      const cup = (.030 + .055 * t) * side * side * channel;
      const curl = (.015 + .008 * Math.cos(phase)) * t ** 7;
      const fold = .0024 * Math.sin(side * 9 + t * 8 + phase) * channel * side ** 2;
      const y = rise * (.51 * t + .49 * t * t) + cup + fold - curl;
      const z = -length * (t * (1.14 - .14 * t)) + span * .23 * side ** 2 + curl * .29;
      positions.push(shoulder + twist, y, z);
      const fade = MathUtils.smoothstep(t, .07, .68);
      const rim = MathUtils.smoothstep(t, .48, .99) * (.20 + .49 * side ** 4);
      const veins = .052 * Math.sin(10.6 * side + 4.0 * t + phase) ** 16 * channel;
      color.copy(throat).lerp(middle, fade).lerp(ivory ? edgePale : edgePink, rim).multiplyScalar(1 - veins);
      colors.push(color.r, color.g, color.b);
      if (row === rows || column === columns) continue;
      const i = row * (columns + 1) + column;
      indices.push(i,i+1,i+columns+1, i+1,i+columns+2,i+columns+1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addStamens(bloom: Sculpture, at: Point, scale: number, seed: number, low: boolean) {
  const [x,y,z] = at, rng = seededRandom(seed+37);
  const pod = new CylinderGeometry(.039*scale,.022*scale,.034*scale,low ? 8 : 14);
  bloom.add(pod,'#c3aa57',[x,y+.079*scale,z]);
  for (const [u,v] of [[0,0],[-.016,.012],[.018,.009],[.009,-.021],[-.014,-.015]]) {
    bloom.oval([x+u*scale,y+.096*scale,z+v*scale],[.0041*scale,.0034*scale,.0041*scale],'#947b42',undefined,5,3);
  }
  const positions: number[] = [], indices: number[] = [];
  const count = low ? 14 : 24;
  for (let i = 0; i < count; i++) {
    const a = i * Math.PI * 2 / count + rng()*.14;
    const dx = Math.cos(a), dz = Math.sin(a), radius = (.040 + .016*rng())*scale;
    const height = (.077 + .023*rng())*scale, width = (.0018 + .0016*rng())*scale;
    const o = i*5;
    positions.push(dx*radius,0,dz*radius,
      dx*radius*1.32-dz*width,height*.62,dz*radius*1.32+dx*width,
      dx*radius*1.32+dz*width,height*.62,dz*radius*1.32-dx*width,
      dx*radius*1.42-dz*width*.68,height,dz*radius*1.42+dx*width*.68,
      dx*radius*1.42+dz*width*.68,height,dz*radius*1.42-dx*width*.68);
    indices.push(o,o+1,o+2,o+1,o+3,o+2,o+2,o+3,o+4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  bloom.add(geometry,'#f2c86f',[x,y+.016*scale,z]);
}

export function addLotusBloom(bloom: Sculpture, { at, scale, seed, low, pale: ivory = false, bud = false }: Bloom) {
  const random = seededRandom(seed), [x,y,z] = at;
  if (bud) {
    bloom.oval([x,y+.050*scale,z],[.046*scale,.102*scale,.046*scale],ivory?'#ecd8b9':'#cf8999',[.13,0,-.12],12,10);
    for (let k = 0; k < 7; k++) {
      const a = k*2*Math.PI/7 + seed*.23;
      const petal = lotusPetal(.046,.027,.158,a,.18+.49*random(),low,ivory);
      bloom.add(petal,'#ffffff',[x+.012*scale*Math.sin(a),y-.050*scale,z+.012*scale*Math.cos(a)],
        [scale,scale,scale],[.085,a,-.082]);
    }
    return;
  }
  const profile = [[9,.255,.071,.102,.019],[8,.216,.061,.158,.016],[7,.145,.048,.170,.009],[5,.087,.035,.140,.009]];
  const upright = random() * .19;
  for (const [layer,[count,length,width,rise,ring]] of profile.entries()) {
    for (let k = 0; k < count; k++) {
      const a = k * (2*Math.PI/count) + layer*.40 + (random()-.5)*.26 + seed*.27;
      const reach = length * (.91+.17*random()) * (1-upright*.23);
      const tip = rise * (.86+.32*random() + upright);
      const petal = lotusPetal(reach,width*(.85+.25*random()),tip,a,layer*.18+random()*.29,low,ivory);
      bloom.add(petal,'#ffffff',[x-Math.sin(a)*ring*scale,y+(layer*.016+random()*.013)*scale,z-Math.cos(a)*ring*scale],
        [scale,scale,scale],[(random()-.5)*.21,a,(random()-.5)*.26]);
    }
  }
  addStamens(bloom,[x,y+.017*scale,z],scale,seed,low);
}

export function bloomMaterial() {
  return softenVegetation(new MeshStandardMaterial({ vertexColors: true, side: DoubleSide }), false, true);
}
