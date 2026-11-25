import { BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, FrontSide, Group, InstancedMesh, LinearFilter, MathUtils,
  Mesh, MeshStandardMaterial, Object3D, RedFormat, Vector3 } from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { skyNoiseGLSL } from './PondAtmosphere';
import type { makePondAtmosphere } from './PondAtmosphere';
import { makeFoothillTree } from './foothill-trees';
import { seededRandom } from './pond-life';

const ridges = [
  { name: 'WoodedFoothills', radius: 45, width: 27, height: 5.9, seed: 8, foot: '#768b6d', crest: '#648066' },
  { name: 'ValleyRidge', radius: 91, width: 49, height: 15.2, seed: 23, foot: '#6b8386', crest: '#75919c' },
  { name: 'DistantMountains', radius: 172, width: 83, height: 31, seed: 51, foot: '#849ba7', crest: '#98adc1' },
] as const;

// From the meadow into the lee of the ridge. Both feet meet the far ground;
// the continuous ring lets the same landscape frame the boat in every direction.
const slope = [
  [-1, 0], [-.84, .025], [-.68, .11], [-.53, .20], [-.39, .34], [-.26, .53], [-.13, .78],
  [0, 1], [.18, .80], [.35, .56], [.52, .31], [.70, .13], [.86, .04], [1, 0],
] as const;

type Ridge = typeof ridges[number];
const noise = new ImprovedNoise();
const columns = 256;
const forestTone = new Color('#566f54');

function crestAt(angle: number, ridge: Ridge) {
  const x = Math.cos(angle), z = Math.sin(angle);
  const broad = noise.noise(1.9 * x, 1.9 * z, ridge.seed + .4);
  const spur = noise.noise(4.7 * x, 4.7 * z, ridge.seed + .7);
  const crown = noise.noise(10.2 * x, 10.2 * z, ridge.seed + .9);
  const cut = Math.abs(noise.noise(x*8.4+1.4,z*8.4+7.3,ridge.seed+.61))-.28;
  const crags = noise.noise(21 * x + 4.3, 21 * z - 3.7, ridge.seed * .33);
  const rise = ridge.height * Math.max(.36, .88 + broad * .78 + spur * .43 + crown * .20 - cut * .23 + crags * .082);
  const radius = ridge.radius + ridge.width * (.41 * broad + .24 * spur);
  return { x, z, rise, radius, spur };
}

function slopePoint(column: ReturnType<typeof crestAt>, ridge: Ridge, depth: number, elevation: number) {
  // Bury the foothill's front edge beyond the planted banks in every direction.
  const radius = ridge === ridges[0] && depth < 0
    ? MathUtils.lerp(24, column.radius, 1 + depth)
    : column.radius + ridge.width * depth;
  const x = column.x * radius, z = column.z * radius;
  const stone = noise.noise(x * .14, z * .14, ridge.seed * .37);
  const contour = noise.noise(x * .049, z * .049, ridge.seed * .83);
  const finger = noise.noise(column.x * 12.4 + elevation * 2.1, column.z * 12.4 - elevation * .8, ridge.seed * .64);
  const gully = Math.abs(noise.noise(column.x * 18.6 + depth * 1.32, column.z * 18.6 - depth * .52, ridge.seed));
  const folds = (stone * .26 + finger * .57 - .22 * Math.exp(-gully * 8)) * elevation * (1 - elevation) * ridge.height;
  const y = .17 + elevation * (column.rise + contour * ridge.height * .17) + folds;
  return { x, y, z, stone, contour };
}

function treeSilhouette(evergreen: boolean) {
  const rings = evergreen
    ? [[0,.075],[.22,.080],[.32,.450],[.46,.347],[.63,.255],[.77,.132],[1,.006]]
    : [[0,.058],[.27,.076],[.43,.480],[.56,.566],[.81,.452],[1,.008]];
  const sides = 6, positions: number[] = [], indices: number[] = [], colors: number[] = [];
  const foliage = new Color(evergreen ? '#dce6d9' : '#f4ead9'), stem = new Color('#776d59'), tint = new Color();
  for (let row = 0; row < rings.length; row++) {
    const [y, width] = rings[row];
    for (let k = 0; k < sides; k++) {
      const angle = k * Math.PI * 2 / sides;
      const ripple = MathUtils.smoothstep(y, .23, .38);
      const lobes = .17*Math.sin(angle*3 + y*5.9) + .092*Math.sin(angle*5 - y*8.2);
      const radius = width * (1 + ripple * lobes * (evergreen ? .88 : 1.48));
      positions.push(Math.cos(angle) * radius + .063 * y ** 2.2, y + .05 * Math.sin(angle * 2.0 + y * 8) * ripple * (1 - y),
        Math.sin(angle) * radius - .047 * y ** 1.4);
      tint.copy(stem).lerp(foliage, MathUtils.smoothstep(y, .17, .32));
      tint.multiplyScalar(.81 + .19 * y + .074 * Math.cos(y * (evergreen ? 31 : 18) + angle * 2));
      colors.push(tint.r, tint.g, tint.b);
      if (row + 1 < rings.length) {
        const a = row * sides + k, b = row * sides + (k + 1) % sides;
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const coverSize = 512, coverWidth = 128;
function shadeCanopy(cover: Uint8Array, x: number, z: number, width: number) {
  const unit = coverSize / coverWidth;
  const cx = x * unit + coverSize * .5, cy = z * unit + coverSize * .5;
  const radius = Math.max(2, width * unit * 1.11);
  for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(coverSize, cy + radius); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(coverSize, cx + radius); x++) {
      const distance = Math.hypot(x + .5 - cx, y + .5 - cy) / radius;
      const index = y * coverSize + x;
      cover[index] = Math.min(255, cover[index] + Math.round(212 * (1 - MathUtils.smoothstep(distance, .1, 1))));
    }
  }
}

function plantFoothills(terrain: BufferGeometry, material: MeshStandardMaterial, compact: boolean) {
  const sectors = 12, groves = 17, crowns = 12;
  const species = compact
    ? [treeSilhouette(false), treeSilhouette(true)]
    : [makeFoothillTree(false, 7853), makeFoothillTree(true, 3059), makeFoothillTree(false, 2591), makeFoothillTree(true, 1247)];
  const cover = new Uint8Array(coverSize * coverSize);
  const forest = new Group();
  forest.name = 'FoothillCanopy';
  const batches = Array.from({ length: sectors }, (_, sector) => species.map((geometry, i) => {
    const batch = new InstancedMesh(geometry, material, groves * crowns);
    batch.name = `${i % 2 ? 'FirSlope' : 'Coppice'}-${sector}-${Math.floor(i / 2)}`;
    batch.count = 0;
    return batch;
  }));
  const ground = terrain.getAttribute('position');
  const tree = new Object3D(), random = seededRandom(61983), tint = new Color();
  const youngLeaves = new Color('#8ba476'), fir = new Color('#586f64'), meadow = new Color('#94a17a');
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < groves * sectors; i++) {
    const batch = batches[Math.floor(i / groves)];
    const centre = i * columns / (groves * sectors) + (random() - .5) * 2.2;
    const ring = crestAt(centre / columns * Math.PI * 2, ridges[0]);
    const creek = noise.noise(ring.x*3.1-.45,ring.z*3.1+2.11,18.5);
    const belt = [5.94, 2.32, 3.37, 4.58][i % 4];
    const depth = belt + creek * 2.4 + (random() - .38) * 1.6;
    const stand = noise.noise(ring.x * 6.3 + 1.2, ring.z * 6.3, depth * .41);
    if (creek < -.34 && i%3 !== 0) continue;
    for (let j = 0; j < crowns; j++) {
      const direction = j * 2.39996 + i, spread = Math.sqrt(j / crowns) * (.70 + random() * .18);
      const across = MathUtils.euclideanModulo(centre + Math.cos(direction) * spread * 2.58, columns);
      const down = Math.max(1.0,depth + Math.sin(direction) * spread * 1.30);
      const row = Math.floor(down), col = Math.floor(across), u = across - col, v = down - row;
      const left = row * columns + col, right = row * columns + (col + 1) % columns;
      // Interpolate the same triangles used by the hill mesh so the crowns stay embedded on steep faces.
      if (u + v < 1) {
        a.fromBufferAttribute(ground, left).multiplyScalar(1 - u - v);
        b.fromBufferAttribute(ground, right).multiplyScalar(u);
        c.fromBufferAttribute(ground, left + columns).multiplyScalar(v);
      } else {
        a.fromBufferAttribute(ground, right).multiplyScalar(1 - v);
        b.fromBufferAttribute(ground, right + columns).multiplyScalar(u + v - 1);
        c.fromBufferAttribute(ground, left + columns).multiplyScalar(1 - u);
      }
      tree.position.copy(a).add(b).add(c);
      const { x, z } = tree.position;
      if (noise.noise(x * .102, z * .102, 17.3) < -.225 || (j > 8 && stand < -.18)) continue;
      const uphill = MathUtils.smoothstep(down, 3.3, 6.6);
      const evergreen = random() < .24 + .32 * stand + .33 * uphill;
      const height = ((evergreen ? .77 : .62) + random() ** 1.4 * (evergreen ? .92 : .81)) * (1 - .17 * uphill);
      const width = height * ((evergreen ? .64 : .80) + random() * .29);
      tree.position.y -= .063 + height * .058;
      tree.rotation.set((random() - .5) * .14, random() * Math.PI * 2, (random() - .5) * .19);
      tree.scale.set(width, height, width * (.83 + random() * .32));
      tree.updateMatrix();
      const variant = compact ? 0 : (i + Math.floor(j / 2)) % 2;
      const canopy = batch[Number(evergreen) + 2 * variant];
      canopy.setMatrixAt(canopy.count, tree.matrix);
      canopy.setColorAt(canopy.count++, tint.copy(evergreen ? fir : forestTone).lerp(youngLeaves, .14 + .62 * random())
        .lerp(meadow, .20 * MathUtils.smoothstep(stand, -.23, .39) * (1 - uphill)));
      shadeCanopy(cover, x + .15 * height, z, width + .22);
    }
  }
  forest.add(...batches.flat().filter(batch => batch.count > 0));
  const contact = new DataTexture(cover, coverSize, coverSize, RedFormat);
  contact.minFilter = contact.magFilter = LinearFilter;
  contact.needsUpdate = true;
  return { group: forest, contact, dispose() {
    for (const batch of batches.flat()) batch.dispose();
    for (const geometry of species) geometry.dispose();
    contact.dispose();
  } };
}

export function makePondVista(atmosphere: ReturnType<typeof makePondAtmosphere>['uniforms'], compact = false) {
  const group = new Group();
  group.name = 'PondVista';
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const forestMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: .96, side: compact ? FrontSide : DoubleSide });
  const hills = ridges.map(ridge => {
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    const foot = new Color(ridge.foot), crest = new Color(ridge.crest), color = new Color();
    const ridgeColumns = ridge === ridges[0] ? columns : columns * 2;
    const contours = Array.from({ length: ridgeColumns }, (_, i) => crestAt(i / ridgeColumns * Math.PI * 2, ridge));
    for (const [depth, elevation] of slope) {
      for (const column of contours) {
        const { x, y, z, stone, contour } = slopePoint(column, ridge, depth, elevation);
        positions.push(x, y, z);
        color.copy(foot).lerp(crest, elevation * .68 + .10 + column.spur * .13);
        if (ridge === ridges[0]) {
          const woodland = noise.noise(x*.104,z*.104,17.3) + .23*noise.noise(x*.26,z*.26,ridge.seed);
          const forestShade = MathUtils.smoothstep(woodland,-.29,.21);
          color.lerp(forestTone,forestShade*MathUtils.smoothstep(elevation,.017,.24)*.73);
        }
        color.multiplyScalar(1 + stone * .18 + contour * .19);
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let row = 0; row < slope.length - 1; row++) {
      for (let col = 0; col < ridgeColumns; col++) {
        const a = row * ridgeColumns + col, b = row * ridgeColumns + (col + 1) % ridgeColumns;
        indices.push(a, b, a + ridgeColumns, b, b + ridgeColumns, a + ridgeColumns);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, material);
    mesh.name = ridge.name;
    group.add(mesh);
    return geometry;
  });
  const forest = plantFoothills(hills[0], forestMaterial, compact);
  for (const surface of [material, forestMaterial]) {
    const hillside = surface === material;
    surface.customProgramCacheKey = () => hillside ? 'pond-vista-ground' : 'pond-vista-trees';
    surface.onBeforeCompile = shader => {
      shader.uniforms.vistaNight = atmosphere.atmosphereNight;
      if (hillside) {
        shader.uniforms.canopyContact = { value: forest.contact };
        shader.uniforms.vistaSun = atmosphere.atmosphereSun;
      }
      const position = 'varying vec3 vistaPoint;\n';
      shader.vertexShader = position + shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        vec4 groundPoint = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          groundPoint = instanceMatrix * groundPoint;
        #endif
        vistaPoint = (modelMatrix * groundPoint).xyz;
      `);
      const hillsideColor = skyNoiseGLSL + 'uniform sampler2D canopyContact;\nuniform vec3 vistaSun;\n';
      shader.fragmentShader = 'uniform float vistaNight;\n' + position + (hillside ? hillsideColor : '') + shader.fragmentShader
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          vec2 slopePoint = vistaPoint.xz;
          float cover = sin(slopePoint.x * .32 + sin(slopePoint.y * .43)) * cos(slopePoint.y * .25 - slopePoint.x * .12);
          float moss = sin(slopePoint.x * 1.31 + sin(slopePoint.y * 1.57)) * sin(slopePoint.y * 1.72);
          diffuseColor.rgb *= (1.0 + .052 * cover + .024 * moss) * mix(1.0, .55, vistaNight);
          ${hillside ? `
            vec2 mottled = slopePoint + vec2(vistaPoint.y * 1.15, vistaPoint.y * -.88);
            float meadow = .46 + .59 * noise(mottled * .29) + .27 * noise(mottled * .91);
            float fine = 1.0 - smoothstep(.15, .65, length(fwidth(mottled) * 3.7));
            meadow += fine * .16 * noise(mottled * 3.7);
            diffuseColor.rgb *= mix(vec3(.79,.88,.90), vec3(1.11,1.10,.99), smoothstep(.18,.73,meadow));
            vec2 canopyUV = slopePoint / ${coverWidth}.0 + .5;
            float foot = texture2D(canopyContact, canopyUV).r;
            vec2 sunSide = normalize(vistaSun.xz + vec2(.001,.002));
            float stretch = mix(1.28,.44,smoothstep(.04,.88,vistaSun.y));
            float treeShade = texture2D(canopyContact, canopyUV + sunSide * stretch / ${coverWidth}.0).r;
            diffuseColor.rgb *= 1.0 - max(.23 * foot, .31 * treeShade * (1.0 - vistaNight));
          ` : ''}
        `)
        .replace('#include <fog_fragment>', `
          #include <fog_fragment>
          #ifdef USE_FOG
            float sightline = length(vistaPoint - cameraPosition);
            float hollow = sin(vistaPoint.x * .062 + .89) * cos(vistaPoint.z * .074 - .31);
            float valleyMist = exp2(-.28 * max(0.0, vistaPoint.y - 1.7 - hollow * 1.3));
            float haze = .115 * smoothstep(24.0, 132.0, sightline) + .33 * valleyMist * smoothstep(17.0, 98.0, sightline);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, haze * mix(1.0, .68, vistaNight));
          #endif
        `);
    };
  }
  group.add(forest.group);
  return {
    group,
    dispose() {
      for (const geometry of hills) geometry.dispose();
      material.dispose();
      forest.dispose();
      forestMaterial.dispose();
    },
  };
}
