import { Bone, Float32BufferAttribute, MathUtils, Mesh, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import type { Object3D } from 'three';

const { clamp, smoothstep } = MathUtils;

function bindCoat(cat: Object3D, chest: Object3D, head: Object3D) {
  const coat = cat.getObjectByName('BoatCat_CH_CatContourCoat');
  if (!(coat instanceof Mesh) || coat instanceof SkinnedMesh) return;
  const geometry = coat.geometry;
  if (!geometry.hasAttribute('skinWeight')) {
    cat.updateWorldMatrix(true, true);
    const local = cat.matrixWorld.clone().invert().multiply(coat.matrixWorld);
    const position = geometry.attributes.position, vertex = new Vector3();
    const joints = new Uint16Array(position.count * 4), weights = new Float32Array(position.count * 4);
    for (let i = 0; i < position.count; i++) {
      const y = vertex.fromBufferAttribute(position, i).applyMatrix4(local).y;
      const neck = smoothstep(y, .238, .316);
      const body = (1 - neck) * smoothstep(y, .055, .188);
      const offset = i * 4;
      joints[offset + 1] = 1;
      joints[offset + 2] = 2;
      weights[offset] = 1 - neck - body;
      weights[offset + 1] = body;
      weights[offset + 2] = neck;
    }
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(joints, 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  }
  const sole = new Bone(), torso = new Bone(), skull = new Bone();
  cat.add(sole); chest.add(torso); head.add(skull);
  const skin = new SkinnedMesh(geometry, coat.material);
  skin.name = coat.name;
  skin.position.copy(coat.position);
  skin.quaternion.copy(coat.quaternion);
  skin.scale.copy(coat.scale);
  skin.castShadow = coat.castShadow;
  skin.receiveShadow = coat.receiveShadow;
  skin.layers.mask = coat.layers.mask;
  cat.add(skin);
  coat.removeFromParent();
  cat.updateWorldMatrix(true, true);
  skin.bind(new Skeleton([sole, torso, skull]));
  skin.computeBoundingSphere();
  skin.boundingSphere!.radius += .07;
}

/** An anchored doze, an ear-led turn toward a nearby sound, then a slow settle. */
export function makeBoatCat(boat: Object3D) {
  const cat = boat.getObjectByName('BoatCat');
  if (!cat) return null;
  const chest = cat.getObjectByName('BoatCatChest');
  const head = cat.getObjectByName('BoatCatHead');
  const leftEar = cat.getObjectByName('BoatCatEarL');
  const rightEar = cat.getObjectByName('BoatCatEarR');
  const tail = cat.getObjectByName('CH_CatCurledTail');
  if (!chest || !head || !leftEar || !rightEar || !(tail instanceof Mesh)) return null;
  const tip = tail.morphTargetDictionary?.TipLift;
  const weights = tail.morphTargetInfluences;
  if (tip === undefined || !weights) return null;
  bindCoat(cat, chest, head);

  const point = new Vector3();
  let stirredAt = -Infinity, nextStir = 19;
  let direction = 0, alertness = 0;
  const stir = (time: number, bearing: number, strength: number) => {
    stirredAt = time;
    direction = bearing;
    alertness = strength;
    nextStir = time + 36 + 14 * (1 + Math.sin(time * .43));
  };
  return {
    notice(time: number, sound: Vector3) {
      if (time - stirredAt < 4.5) return;
      cat.getWorldPosition(point);
      if (Math.hypot(sound.x - point.x, sound.z - point.z) > 2.1) return;
      cat.worldToLocal(point.copy(sound));
      const bearing = Math.atan2(point.x, Math.max(.12, point.z));
      stir(time, clamp(bearing / .85, -1, 1), 1);
    },
    update(time: number, night: number) {
      if (time >= nextStir && night < .64) stir(time, Math.cos(time * .69) < 0 ? -.67 : .67, .58);
      const age = time - stirredAt;
      const breath = Math.sin(time * 1.87) * (.86 + .14 * Math.sin(time * .23));
      const headTurn = alertness * smoothstep(age, .13, .57) * (1 - smoothstep(age, 1.18, 2.38));
      const earSettle = alertness * (1 - smoothstep(age, .92, 1.80));
      const nearEar = earSettle * smoothstep(age, .01, .15);
      const farEar = earSettle * smoothstep(age, .085, .27);
      const left = direction >= 0 ? nearEar : farEar;
      const right = direction <= 0 ? nearEar : farEar;
      const sleepCycle = (time + 5.7) / 13.7, twitchAge = (sleepCycle % 1) * 13.7;
      const twitch = smoothstep(twitchAge, .015, .083) * (1 - smoothstep(twitchAge, .10, .32)) * smoothstep(age, 2.5, 3.2);
      const twitchLeft = Math.floor(sleepCycle) % 2 !== 0;
      // The chest expands around the fixed paw anchors while the neck follows the face.
      chest.scale.set(1 + .026 * breath, 1 + .015 * breath, 1 + .022 * breath);
      head.rotation.set(-.135 * headTurn + .012 * breath, .36 * direction * headTurn, -.058 * direction * headTurn, 'YXZ');
      leftEar.rotation.set(.07 * left, .32 * direction * left + (twitchLeft ? .21*twitch : 0), -.09 * left);
      rightEar.rotation.set(.07 * right, .32 * direction * right - (twitchLeft ? 0 : .21*twitch), .09 * right);
      weights[tip] = alertness * smoothstep(age, .76, 1.27) * (1 - smoothstep(age, 1.49, 2.45))
        + .24 * twitch * smoothstep(age, 3.2, 4.1);
    },
  };
}
