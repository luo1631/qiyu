import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group, MathUtils, Mesh, MeshStandardMaterial,
  Points, ShaderMaterial, TubeGeometry, Vector2, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FloraGeometry } from '../scene/flora-geometry';
import { Sculpture } from '../scene/sculpture';
import { islandPoint, lakeLevel } from './terrain';

const stations = [
  [-1.24, .014, .339], [-1.12, .140, .299], [-.91, .264, .252], [-.66, .370, .235], [-.32, .443, .221],
  [.05, .468, .216], [.43, .439, .225], [.75, .380, .249], [1.02, .292, .284], [1.14, .216, .294],
] as const;
const sheer = new CatmullRomCurve3(stations.map(([z, beam, y]) => new Vector3(beam, y, z)), false, 'centripetal');
const bands = [0, .235, .46, .68, .855, 1];
const bevel = [0, .15, .48, .82, .95, 1];
const outside = ['#3d524b', '#486760', '#577c72', '#689184', '#7d9d8c'].map(value => new Color(value));
const inside = ['#76583f', '#8a694a', '#9d7b55', '#ac8b64', '#b69166'].map(value => new Color(value));

function section(t: number, h: number, side: number, inside = false) {
  const rail = sheer.getPoint(MathUtils.clamp(t, 0, 1));
  const bow = 1 - MathUtils.smoothstep(t, 0, .37);
  const stern = MathUtils.smoothstep(t, .79, 1);
  const bottom = -.122 + .154 * bow + .079 * stern;
  const keel = Math.min(rail.x, .032 + .100 * stern);
  const flare = Math.sin(h * Math.PI * .5) ** .78;
  const thickness = inside ? .027 : 0;
  const x = Math.max(.003, MathUtils.lerp(keel, rail.x, flare) - thickness * flare);
  return new Vector3(x * side, MathUtils.lerp(bottom + thickness * .83, rail.y - thickness * .27, h ** .91),
    rail.z + (.142 * bow - .058 * stern) * (1 - h) ** 1.55);
}

function paintedSurface(positions: number[], colors: number[], indices: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makePlanks(interior: boolean) {
  const positions: number[] = [], colors: number[] = [], triangles: number[] = [];
  const length = 37, pigment = new Color();
  for (const side of [-1, 1]) {
    for (let band = 0; band < bands.length - 1; band++) {
      const start = positions.length / 3;
      for (let row = 0; row <= length; row++) {
        const t = row / length;
        for (const [column, v] of bevel.entries()) {
          const h = MathUtils.lerp(bands[band], bands[band + 1], v);
          const point = section(t, h, side, interior);
          const lap = Math.sin(Math.PI * v) * (1 - .48 * v) * .010;
          point.x += side * lap * (interior ? -.50 : 1) * MathUtils.smoothstep(t, 0, .09);
          positions.push(point.x, point.y, point.z);
          const seam = .79 + .20 * MathUtils.smoothstep(v, 0, .18) - .13 * MathUtils.smoothstep(v, .86, 1);
          const grain = .96 + .055 * Math.sin(t * 32 + band * 2.3 + v * 2 + side) + .054 * Math.sin(t * 8 - side);
          pigment.copy((interior ? inside : outside)[band]).multiplyScalar(seam * grain);
          colors.push(pigment.r, pigment.g, pigment.b);
          if (row === length || column === bevel.length - 1) continue;
          const a = start + row * bevel.length + column, b = a + bevel.length;
          if ((side > 0) !== interior) triangles.push(a, a + 1, b, a + 1, b + 1, b);
          else triangles.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
  }
  return paintedSurface(positions, colors, triangles);
}

function transom(interior: boolean) {
  const positions: number[] = [], colors: number[] = [], triangles: number[] = [];
  const pigment = new Color();
  for (const [row, height] of bands.entries()) {
    const point = section(1, height, 1, interior);
    positions.push(-point.x, point.y, point.z - (interior ? .020 : 0),
      point.x, point.y, point.z - (interior ? .020 : 0));
    pigment.copy((interior ? inside : outside)[Math.min(row, outside.length - 1)]).multiplyScalar(.89);
    colors.push(pigment.r, pigment.g, pigment.b, pigment.r, pigment.g, pigment.b);
    if (row === bands.length - 1) continue;
    const i = row * 2;
    if (interior) triangles.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    else triangles.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  return paintedSurface(positions, colors, triangles);
}

function buildHull() {
  const hull = new Sculpture();
  for (const interior of [false, true]) {
    hull.add(makePlanks(interior), '#ffffff');
    hull.add(transom(interior), '#ffffff');
  }

  const curves = new FloraGeometry(), oak = new Color('#c29568'), rib = new Color('#a67955');
  for (const side of [-1, 1]) {
    const rail = Array.from({ length: 24 }, (_, i) => {
      const p = section(i / 23, 1, side);
      return [p.x, p.y + .006, p.z, .026 - (i === 0 ? .007 : 0)] as [number, number, number, number];
    });
    curves.stem(rail, oak, 9, 61);
    for (const t of [.29, .45, .61, .795]) {
      curves.stem(Array.from({ length: 6 }, (_, i) => {
        const p = section(t, .30 + .64 * i / 5, side, true);
        return [p.x - side * .012, p.y + .009, p.z, .014];
      }), rib, 6, 8);
    }
  }
  const stern = section(1, 1, 1);
  curves.stem([[-stern.x, stern.y + .006, stern.z, .025], [0, stern.y + .012, stern.z, .025],
    [stern.x, stern.y + .006, stern.z, .025]], oak, 9, 8);
  hull.add(curves.build('弯曲船缘与肋木'), '#ffffff');

  for (const [z, width, color] of [[-.57, .632, '#a87951'], [.07, .826, '#bb8e60'], [.61, .677, '#ad815a']] as const) {
    hull.add(new RoundedBoxGeometry(width, .041, .178, 2, .012), color, [0, .158, z]);
  }
  for (const offset of [-.102, 0, .102]) {
    hull.add(new RoundedBoxGeometry(.094, .029, 1.37 - Math.abs(offset) * 1.45, 2, .009),
      offset === 0 ? '#b18a5e' : '#a47b54', [offset, .022, .047]);
  }
  hull.line([[-.215, .191, -.77], [-.151, .185, -.32], [-.072, .187, .16], [.025, .198, .58]], .016, '#c8aa7b', 11);
  hull.oval([.016, .198, .610], [.063, .012, .181], '#d1aa73', [0, .162, 0], 16, 8);
  hull.oval([.308, .259, .765], [.033, .019, .052], '#5f5143', [0, -.24, 0], 12, 8);
  hull.line([[.292, .263, .73], [.313, .289, .755], [.323, .267, .79]], .010, '#aa8b64', 7);
  return hull.mesh('青灰搭接船板、木座与桨', new MeshStandardMaterial({ vertexColors: true, roughness: .83 }));
}

function makeMooring(start: Vector3, end: Vector3) {
  const middle = start.clone().lerp(end, .5);
  middle.y -= .068;
  const sections = 13, sides = 5;
  const curve = new CatmullRomCurve3([start, middle, end]);
  const geometry = new TubeGeometry(curve, sections, .011, sides, false);
  const position = geometry.getAttribute('position');
  const rest = position.array.slice();
  const material = new MeshStandardMaterial({ color: '#c9b18b', roughness: 1 });
  const mesh = new Mesh(geometry, material);
  mesh.name = '连接舟与泊位的系缆';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return {
    mesh,
    fit(next: Vector3) {
      const dx = next.x - end.x, dy = next.y - end.y, dz = next.z - end.z;
      for (let row = 0; row <= sections; row++) {
        const t = row / sections;
        for (let i = 0; i <= sides; i++) {
          const j = row * (sides + 1) + i;
          position.setXYZ(j, rest[j * 3] + t * dx, rest[j * 3 + 1] + t * dy, rest[j * 3 + 2] + t * dz);
        }
      }
      position.needsUpdate = true;
    },
  };
}

function makeBoatGlints() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -.17, .57, -.64, .29, .38, -.17, -.25, .48, .35, .18, .47, .78, .035, .70, .08,
  ], 3));
  geometry.setAttribute('seed', new Float32BufferAttribute([.13, .29, .54, .75, .91], 1));
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { clock: { value: 0 }, pixels: { value: 35 } },
    vertexShader: `
      attribute float seed;
      uniform float clock, pixels;
      varying float pulse;
      void main() {
        pulse = .56 + .44 * pow(.5 + .5 * sin(clock * 2.2 + seed * 9.), 2.);
        vec3 p = position + vec3(sin(clock * 1.2 + seed * 12.) * .04, sin(clock * 1.6 + seed * 8.) * .045, 0.);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
        gl_PointSize = clamp((.54 + seed * .19) * pixels, 9., 90.);
      }
    `,
    fragmentShader: `
      varying float pulse;
      void main() {
        vec2 p = abs(gl_PointCoord * 2. - 1.);
        float d = length(p);
        float halo = pow(max(0., 1. - d), 2.6) * .83;
        float rays = max(0., 1. - (pow(p.x, .6) + pow(p.y * .72, .6)) * 1.92);
        float core = 1. - smoothstep(.07, .18, d);
        gl_FragColor = vec4(vec3(.94, .99, 1.), min(1., halo + rays + core) * pulse);
        #include <colorspace_fragment>
      }
    `,
  });
  const glints = new Points(geometry, material);
  glints.name = '木舟上方的白色微光';
  glints.renderOrder = 6;
  return glints;
}

export function makeSkiff(tie: Vector3) {
  const root = new Group(), boat = new Group();
  root.name = '栈桥边的青灰木舟';
  const anchor = islandPoint(-2.02, 1.004);
  const heading = -1.035;
  const contact = new Vector2();
  const knot = new Vector3(.315, .275, .761), end = new Vector3();

  const hull = buildHull(), glints = makeBoatGlints();
  boat.add(hull, glints);
  boat.position.set(anchor.x, lakeLevel + .037, anchor.y);
  boat.rotation.y = heading;
  root.add(boat);
  const rope = makeMooring(tie, boat.localToWorld(knot.clone()));
  root.add(rope.mesh);

  return {
    root, hull, contact, heading,
    update(time: number, available = false, pixelScale = 35) {
      const drift = Math.sin(time * .62);
      boat.position.set(anchor.x + drift * .024, lakeLevel + .037 + Math.sin(time * 1.37) * .018, anchor.y + drift * .014);
      boat.rotation.set(.022 * Math.sin(time * 1.28), heading + drift * .014, .033 * Math.sin(time * 1.49 + .3), 'YXZ');
      contact.set(boat.position.x, boat.position.z);
      rope.fit(boat.localToWorld(end.copy(knot)));
      glints.visible = available;
      glints.material.uniforms.clock.value = time;
      glints.material.uniforms.pixels.value = pixelScale;
    },
  };
}
