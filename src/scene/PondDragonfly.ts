import {
  Color, CubicBezierCurve, CylinderGeometry, DoubleSide, DynamicDrawUsage, Euler, Group, InstancedMesh,
  Mesh, MeshStandardMaterial, Object3D, Quaternion, Sphere, Vector2, Vector3,
} from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { Sculpture } from './PondCreatures';
import { orientLilyPad } from './PondSurface';
import type { PadSupport } from './PondSurface';
import { lilyLeafHeight, lilyLeafRadiusFactor, lilyPads } from './habitat-layout';
import { dragonflyPose, dragonflyScale, dragonflyVisits } from './wildlife-life';

const up = new Vector3(0, 1, 0);
const legPairs = [
  { hip: -.041, footX: .035, footZ: -.078, thigh: .034, shin: .046, bend: -.60 },
  { hip: -.018, footX: .046, footZ: -.021, thigh: .034, shin: .040, bend: .08 },
  { hip: .006, footX: .040, footZ: .045, thigh: .037, shin: .046, bend: .63 },
];

function leafHeightAt(point: Vector3, radius: number) {
  const angle = Math.atan2(point.x, point.z);
  return lilyLeafHeight(Math.hypot(point.x, point.z) / (radius * lilyLeafRadiusFactor(angle)), angle);
}

function makeLegs(perch: Vector3, relativeYaw: number, radius: number) {
  const geometry = new CylinderGeometry(.55, 1, 1, 5, 1, true);
  const material = new MeshStandardMaterial({color: '#343c2d', roughness: .78});
  const mesh = new InstancedMesh(geometry, material, 12);
  mesh.name = 'dragonfly-articulated-legs';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.boundingSphere = new Sphere(new Vector3(), .14);
  mesh.receiveShadow = true;
  const feet = [-1, 1].flatMap(side => legPairs.map(pair => {
    const plant = new Vector3(side * pair.footX, 0, pair.footZ);
    const onLeaf = plant.clone().multiplyScalar(dragonflyScale).applyAxisAngle(up, relativeYaw).add(perch);
    plant.y = (leafHeightAt(onLeaf, radius) - perch.y) / dragonflyScale;
    return {
      side, pair, plant, hip: new Vector3(side * .012, -.008, pair.hip),
      foldedThigh: new Vector3(side * .23, -.20, .95).normalize(),
      foldedShin: new Vector3(side * .085, -.075, -.99).normalize(),
    };
  }));
  const part = new Object3D();
  const toe = new Vector3(), knee = new Vector3(), axis = new Vector3(), bend = new Vector3(), segment = new Vector3();
  const thigh = new Vector3(), shin = new Vector3();
  let lastTuck = -1, lastReach = -1, lastCompression = -1;

  function placeSegment(slot: number, start: Vector3, end: Vector3, radius: number) {
    segment.subVectors(end, start);
    const length = segment.length();
    part.position.copy(start).lerp(end, .5);
    part.quaternion.setFromUnitVectors(up, segment.multiplyScalar(1 / length));
    part.scale.set(radius, length, radius);
    part.updateMatrix();
    mesh.setMatrixAt(slot, part.matrix);
  }

  function update(tuck: number, reach: number, compression: number) {
    if (tuck === lastTuck && reach === lastReach && compression === lastCompression) return;
    lastTuck = tuck;
    lastReach = reach;
    lastCompression = compression;
    feet.forEach(({side, pair, plant, hip, foldedThigh, foldedShin}, i) => {
      toe.copy(plant);
      toe.x += side * .007 * reach;
      toe.y += compression / dragonflyScale - .005 * reach;
      toe.z += pair.bend * .012 * reach;
      axis.subVectors(toe, hip);
      const length = axis.length();
      axis.multiplyScalar(1 / length);
      // Solve the planted knee at fixed lengths, then fold each segment toward its flight pose.
      const along = (pair.thigh ** 2 - pair.shin ** 2 + length ** 2) / (2 * length);
      const outward = Math.sqrt(Math.max(0, pair.thigh ** 2 - along ** 2));
      bend.set(side, -.16, pair.bend);
      bend.addScaledVector(axis, -bend.dot(axis)).normalize();
      knee.copy(hip).addScaledVector(axis, along).addScaledVector(bend, outward);
      shin.subVectors(toe, knee).normalize().lerp(foldedShin, tuck).normalize();
      thigh.subVectors(knee, hip).normalize().lerp(foldedThigh, tuck).normalize();
      knee.copy(hip).addScaledVector(thigh, pair.thigh);
      toe.copy(knee).addScaledVector(shin, pair.shin);
      placeSegment(i * 2, hip, knee, .0027);
      placeSegment(i * 2 + 1, knee, toe, .0022);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0, 0, 0);
  return {mesh, update};
}

function wingGeometry(side: number, hind: boolean) {
  const sweep = hind ? .055 : -.045;
  const leading = new CubicBezierCurve(new Vector2(), new Vector2(.07, sweep-.035),
    new Vector2(.20, sweep-.06), new Vector2(.225, sweep-.022));
  const trailing = new CubicBezierCurve(new Vector2(0,.012), new Vector2(.065, sweep+.053),
    new Vector2(.225, sweep+.022), new Vector2(.224, sweep-.018));
  const edge = new Vector2(), rim = new Vector2();
  // Span and chord coordinates follow the curved membrane and its markings.
  return new ParametricGeometry((span, chord, point) => {
    leading.getPoint(span, edge).lerp(trailing.getPoint(span, rim), chord);
    const arch = .004 * Math.sin(Math.PI*span) * Math.sin(Math.PI*chord);
    point.set(side*edge.x, arch, edge.y);
  }, 22, 4);
}

function wingMaterial() {
  const floor = { value: .34 };
  const material = new MeshStandardMaterial({ roughness: .62, transparent: true,
    depthWrite: false, side: DoubleSide, forceSinglePass: true });
  const membrane = { value: new Color('#a3bdbe') }, rim = { value: new Color('#dae8df') };
  const ink = { value: new Color('#547075') };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { wingLightFloor: floor, wingMembrane: membrane, wingRim: rim, wingInk: ink });
    shader.vertexShader = 'varying vec2 wingUv;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nwingUv = uv;');
    shader.fragmentShader = `varying vec2 wingUv;
      uniform float wingLightFloor;
      uniform vec3 wingMembrane, wingRim, wingInk;
      float wingBand(float value, float low, float high) {
        float width = max(.003, fwidth(value) * .5);
        return smoothstep(low-width, low+width, value) - smoothstep(high-width, high+width, value);
      }\n` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float span = wingUv.x, chord = wingUv.y;
      float border = max(wingBand(chord,-.24,.115), wingBand(chord,.88,1.24));
      float rails = max(wingBand(chord+span*.12,.26,.315), wingBand(chord-span*.14,.57,.61));
      float veinPhase = span*5.9 + chord*.74;
      float crossVeins = wingBand(fract(veinPhase),.43,.53) * wingBand(span,.24,.79) * wingBand(chord,.23,.70);
      crossVeins *= 1.0 - smoothstep(.16,.48,fwidth(veinPhase));
      float spot = length(vec2((span-.81)/.10, (chord-.23)/.145));
      float spotFilter = clamp(fwidth(spot)*.5,.015,.55);
      float stigma = 1.0 - smoothstep(.77-spotFilter,.95+spotFilter,spot);
      float marking = max(max(rails*.57*(1.0-smoothstep(.81,.98,span)), crossVeins*.30), stigma);
      vec3 pigment = mix(mix(wingMembrane, wingRim, border), wingInk, marking);
      diffuseColor.rgb *= pigment;
      diffuseColor.a *= max(.53+.24*border, .83*stigma);`);
    // Limit how dark the thin wing can become beneath backlight. Lit frames
    // still use the scene lights, and the floor follows the pond day cycle.
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight = max(outgoingLight, pigment * wingLightFloor);\n#include <opaque_fragment>');
  };
  return { material, floor };
}

export function makeDragonfly(index: number) {
  const root = new Group();
  root.name = 'dragonfly-' + index;
  root.scale.setScalar(dragonflyScale);
  const color = ['#287b9a', '#a38337', '#b95738'][index];
  const sculpt = new Sculpture();
  sculpt.oval([0,.005,-.014], [.022,.024,.042], color, [0,0,0], 16, 10);
  sculpt.oval([0,.013,-.062], [.024,.018,.021], '#384a39', [0,0,0], 16, 10);
  for (const side of [-1, 1]) sculpt.oval([side*.015,.019,-.067], [.014,.014,.014], color, [0,0,0], 12, 8);
  for (let n = 0; n < 9; n++) {
    const r = .0115 - n * .00083, z = .026 + n * .020;
    sculpt.oval([0,-.001,z], [r,r*.8,.014], n % 3 === 0 ? '#303e32' : color, [0,0,0], 10, 6);
  }
  root.add(sculpt.mesh('dragonfly-body', new MeshStandardMaterial({vertexColors:true, roughness:.47, metalness:.12})));

  const {material, floor} = wingMaterial();
  const wings: Group[] = [];
  for (const side of [-1, 1]) for (const hind of [false, true]) {
    const pivot = new Group();
    pivot.position.set(side * .013, .014, hind ? .023 : -.010);
    const wing = new Mesh(wingGeometry(side, hind), material);
    wing.name = 'translucent-wing';
    pivot.add(wing);
    root.add(pivot);
    wings.push(pivot);
  }

  const visit = dragonflyVisits[index], pad = lilyPads[visit.pad];
  const relativeYaw = visit.yaw - pad.angle;
  const perch = new Vector3(visit.offset[0], 0, visit.offset[1]).applyAxisAngle(up, -pad.angle);
  perch.y = leafHeightAt(perch, pad.radius) + .050 * dragonflyScale;
  const legs = makeLegs(perch, relativeYaw, pad.radius);
  root.add(legs.mesh);
  const leafEuler = new Euler(), airborne = new Euler(0, 0, 0, 'YXZ');
  const leaf = new Quaternion(), inheritedTilt = new Quaternion();
  const withoutLeafHeading = new Quaternion().setFromAxisAngle(up, -pad.angle);
  const leafTilt = new Quaternion(), air = new Quaternion();
  const anchor = new Vector3();

  return {root, wings, legs: legs.mesh, update(time: number, night: number, support: PadSupport) {
    floor.value = .34 - .20*night;
    orientLilyPad(leafEuler, pad.angle, support);
    leaf.setFromEuler(leafEuler);
    anchor.copy(perch).applyQuaternion(leaf);
    anchor.x += support.x;
    anchor.y += support.height - .015;
    anchor.z += support.z;
    const pose = dragonflyPose(index, time, night, anchor);
    anchor.set(0, -pose.compression, 0).applyQuaternion(leaf);
    root.position.set(pose.x + anchor.x, pose.y + anchor.y, pose.z + anchor.z);
    inheritedTilt.copy(leaf).multiply(withoutLeafHeading);
    leafTilt.identity().slerp(inheritedTilt, 1 - pose.flight);
    air.setFromEuler(airborne.set(pose.pitch, pose.yaw, pose.bank));
    root.quaternion.copy(leafTilt).multiply(air);
    legs.update(pose.tuck, pose.reach, pose.compression);
    wings.forEach((wing, n) => {
      const side = n < 2 ? -1 : 1;
      const phase = time * 49 + index * 2 + (n % 2) * 2.81;
      const hover = 1 - pose.flight;
      wing.rotation.z = side * (.075 + pose.wingPower * (.16 * hover + (.29 - .10 * hover) * Math.sin(phase)));
      wing.rotation.y = side * pose.wingPower * .065 * Math.sin(phase - .70);
    });
    return pose;
  }};
}
