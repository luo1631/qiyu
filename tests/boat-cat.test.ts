import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, InstancedMesh, Mesh, Raycaster, SkinnedMesh, Vector3 } from 'three';
import { makePondBoat } from '../src/scene/PondBoat';

test('the native boat cat leads with the nearer ear and settles with planted paws', t => {
  const boat = makePondBoat(), scene = boat.root;
  t.after(() => boat.dispose());
  scene.rotation.y = .63;
  const cat = boat.cat;
  assert.ok(cat);
  const root = scene.getObjectByName('BoatCat')!;
  const chest = root.getObjectByName('BoatCatChest')!;
  const head = root.getObjectByName('BoatCatHead')!;
  const left = root.getObjectByName('BoatCatEarL')!;
  const right = root.getObjectByName('BoatCatEarR')!;
  const coat = root.getObjectByName('BoatCat_CH_CatContourCoat');
  assert.ok(coat instanceof SkinnedMesh, 'the contour deforms through the neck and chest');
  const tail = root.getObjectByName('CH_CatCurledTail') as Mesh;
  const tip = tail.morphTargetDictionary?.TipLift ?? -1;
  const checkEyelids = () => {
    const direction = new Vector3(0,0,-1).transformDirection(head.matrixWorld);
    for (const side of [-1,1]) {
      const eye = head.localToWorld(new Vector3(side*.063,.094,.35));
      const visible = new Raycaster(eye,direction).intersectObject(root,true)[0];
      assert.equal(visible?.object.name,'Sleeping eye','the lid stays on the visible face as the head moves');
    }
  };

  cat.update(0, 1);
  scene.updateMatrixWorld(true);
  checkEyelids();
  const joint = coat.geometry.attributes.skinWeight, planted = new Map<number, Vector3>();
  const positionAt = (i: number) => coat.localToWorld(coat.getVertexPosition(i, new Vector3()));
  let cheek = -1;
  for (let i = 0; i < joint.count; i++) {
    const p = positionAt(i);
    if (p.y < .441) planted.set(i, p);
    if (joint.getZ(i) > .999 && p.y > .78 && p.y < .86) cheek = i;
  }
  assert.ok(planted.size > 20 && cheek >= 0);
  const restingCheek = positionAt(cheek);
  cat.notice(1, new Vector3(18, 0, 18));
  cat.update(1.24, 1);
  assert.equal(left.rotation.y, 0, 'distant sounds leave the ears at rest');
  assert.notEqual(chest.scale.x, 1, 'the chest moves between resting breaths');

  cat.notice(3, root.localToWorld(new Vector3(.48, .04, .23)));
  cat.update(3.11, 1);
  assert.ok(left.rotation.y > right.rotation.y + .12);
  assert.equal(head.rotation.y, 0, 'the head follows the ears');
  cat.update(3.66, 1);
  assert.ok(head.rotation.y > .3 && head.rotation.x < -.11);
  scene.updateMatrixWorld(true);
  checkEyelids();
  assert.ok(positionAt(cheek).distanceTo(restingCheek) > .008, 'the moving cheek follows the head bone');
  cat.notice(3.67, root.localToWorld(new Vector3(-.48, .04, .23)));
  cat.update(4.30, 1);
  assert.ok(head.rotation.y > 0, 'rapid repeat taps do not reverse a turn');
  assert.ok((tail.morphTargetInfluences?.[tip] ?? 0) > .9);
  const tailDelta = tail.geometry.morphAttributes.position[tip];
  let stationary = 0, raised = 0;
  for (let vertex = 0; vertex < tailDelta.count; vertex++) {
    const height = tailDelta.getY(vertex);
    if (height === 0) stationary++;
    if (height > .04) raised++;
  }
  assert.ok(stationary > 0 && raised > 0, 'the tip bends while the base stays fixed');
  scene.updateMatrixWorld(true);
  for (const [i, p] of planted) assert.ok(positionAt(i).distanceTo(p) < 1e-6, 'ground vertices stay fixed under the pose');
  cat.update(5.6, 1);
  assert.equal(head.rotation.y, 0);
  assert.equal(tail.morphTargetInfluences?.[tip], 0);
});

test('the generated skiff fits the established buoyancy envelope and releases its meshes', () => {
  const boat = makePondBoat();
  const bounds = new Box3().setFromObject(boat.root);
  assert.ok(bounds.min.y > -.12 && bounds.min.y < -.08);
  assert.ok(bounds.min.z > -1.74 && bounds.min.z < -1.64 && bounds.max.z > 1.52 && bounds.max.z < 1.68);
  assert.ok(bounds.min.x > -1.53 && bounds.max.x < .86, 'the hull, oar and gear fit the existing route clearance');
  let meshes = 0, triangles = 0;
  const reserved = new Map<Mesh['geometry'], number>();
  boat.root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry;
    assert.ok(geometry.attributes.normal.array.every(Number.isFinite));
    meshes++;
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3 * (object instanceof InstancedMesh ? object.count : 1);
    if (reserved.has(geometry)) return;
    reserved.set(geometry, 0);
    geometry.addEventListener('dispose', () => reserved.set(geometry, reserved.get(geometry)! + 1));
  });
  assert.ok(triangles > 0 && meshes > 0);
  boat.dispose();
  for (const releases of reserved.values()) assert.equal(releases, 1);
});
