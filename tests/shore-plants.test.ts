import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3,InstancedMesh,Matrix4,Mesh,Vector3} from 'three';
import {makePondPlantKit} from '../src/scene/pond-plant-kit';
import {islandGround, makeSanctuaryGroundcover, makeShoreLandscape} from '../src/scene/shore-landscape';
import {makePondHabitat} from '../src/scene/PondHabitat';
import {outerBankHeight} from '../src/scene/shore-layout';
import {westPier} from '../src/scene/pier-layout';
import {classifyWaterPasses,refractionLayer,waterLevel,waterPassMargin} from '../src/scene/PondOptics';
import {plantPrefabs} from '../src/scene/shore-plant-geometry';
import type {PlantClump} from '../src/scene/shore-plant-geometry';

test('grass prefabs retain independent roots and shrubs retain distinct woody silhouettes',()=>{
  const kit=makePondPlantKit();
  try {
    for(const [name,count] of [['EN_GrassSmall',9],['EN_GrassMedium',23],['EN_GrassLarge',47]] as const) {
      const prefab=kit.kit.getObjectByName(name)!;assert.ok(prefab);let meshes=0;
      prefab.traverse(o=>{if(o instanceof Mesh)meshes++;});assert.equal(meshes,count);
      assert.equal(prefab.userData.rootCount,count);
    }
    for(const name of ['EN_ShrubSpreading','EN_ShrubCompact','EN_ShrubOpen','EN_Groundcover','EN_MeadowFlowers']) {
      const prefab = kit.kit.getObjectByName(name);
      assert.equal(prefab?.userData.rootCount, 1, name);
    }
  } finally {kit.dispose();}
});

test('whole clumps follow the bank at each rendered root and share geometry batches',()=>{
  const kit=makePondPlantKit(),landscape=makeShoreLandscape(kit.kit);
  try {
    const clumps=landscape.group.getObjectByName('PlantClumps')!;
    const wet = clumps.children.filter(child => child.name.startsWith('WaterSedges-'));
    const dry = clumps.children.filter(child => child.name.startsWith('ShorePlants-'));
    assert.equal(dry.length, 8, 'three linked grass meshes, three shrubs and two groundcover forms above water');
    assert.equal(wet.length, 3, 'wet sedges are instanced separately from the dry shore');
    assert.ok(wet.every(child => !child.castShadow), 'fine crossing sedges need no shadow casters');
    classifyWaterPasses(landscape.group);
    const matrix=new Matrix4(),point=new Vector3(),bounds=new Box3();let roots=0;
    for(const child of clumps.children) {
      assert.ok(child instanceof InstancedMesh);const p=child.geometry.attributes.position;
      let lowest=0;for(let i=1;i<p.count;i++)if(p.getY(i)<p.getY(lowest))lowest=i;
      for(let i=0;i<child.count;i++) {
        child.getMatrixAt(i,matrix);point.fromBufferAttribute(p,lowest).applyMatrix4(matrix);
        assert.ok(Math.abs(point.y-outerBankHeight(point.x,point.z))<.015,'actual lowest vertices contact the bank');roots++;
        const lowestWorld=bounds.copy(child.geometry.boundingBox!).applyMatrix4(matrix).min.y;
        assert.equal(child.layers.isEnabled(refractionLayer),lowestWorld<=waterLevel+waterPassMargin,
          'a shallow root cannot send its dry neighbours into the refraction pass');
      }
    }
    const grass = dry.find(child => child.name.includes('GrassRootVariant')) as InstancedMesh;
    const points = grass.geometry.attributes.position, flex = grass.geometry.attributes.plantFlex;
    for (let i = 0; i < points.count; i++) if (points.getY(i) < .008) {
      assert.ok(flex.getX(i) < .00007, 'the lowest blades stay in the soil as wind moves their tops');
    }
    const material = Array.isArray(grass.material) ? grass.material[0] : grass.material;
    const preview = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '' };
    const depth = { ...preview, uniforms: {} };
    material.onBeforeCompile(preview as never, null as never);
    grass.customDepthMaterial!.onBeforeCompile(depth as never, null as never);
    const wind = (preview.uniforms as { plantWind: { value: Vector3 } }).plantWind;
    assert.equal((depth.uniforms as { plantWind: unknown }).plantWind, wind, 'the depth pass shares the visible movement');
    assert.equal(depth.vertexShader, preview.vertexShader);
    landscape.update(2);
    assert.equal(wind.value.z, 1);
    landscape.update(0);
    assert.equal(wind.value.z, 0);
    landscape.setGrassShadows(false);
    assert.ok(dry.filter(child => (child as InstancedMesh).customDepthMaterial).every(child => !child.castShadow));
    assert.ok(dry.filter(child => !(child as InstancedMesh).customDepthMaterial).every(child => child.castShadow));
    landscape.setGrassShadows(true);
    assert.ok(dry.every(child => child.castShadow) && wet.every(child => !child.castShadow));
    const planted = landscape.group.userData.plantRoots as {x: number; z: number}[];
    assert.equal(roots,planted.length);
    for (const root of planted) {
      const dx = root.x - westPier.base.x, dz = root.z - westPier.base.z;
      const along = dx * westPier.dx + dz * westPier.dz;
      const across = dz * westPier.dx - dx * westPier.dz;
      assert.ok(along < -2.5 || along > .25 || Math.abs(across) > westPier.width / 2,
        'keep the planted roots off the walk to the west pier');
    }
    const grassClumps = landscape.group.userData.clumps.filter(({kind}: {kind: string}) => ['small','medium','large'].includes(kind));
    assert.ok(grassClumps.length < roots / 5, 'grass placements still grow from multiple roots');
  } finally {landscape.dispose();kit.dispose();}
});

test('compact blades and foliage retain each planted root on the shore', () => {
  const kit = makePondPlantKit();
  const full = makeShoreLandscape(kit.kit), compact = makeShoreLandscape(kit.kit, true);
  try {
    assert.deepEqual(compact.group.userData.plantRoots, full.group.userData.plantRoots);
    const byGeometryName = (landscape: typeof full, meshName: string) => landscape.group.getObjectByName('PlantClumps')!.children
      .filter((node): node is InstancedMesh => node instanceof InstancedMesh && node.name.includes(meshName));
    const detailed = byGeometryName(full, 'GrassRootVariant'), broad = byGeometryName(compact, 'GrassCompact');
    assert.equal(broad.length, detailed.length);
    const totals = (meshes: InstancedMesh[]) => meshes.reduce((sum, node) => sum + node.count * node.geometry.index!.count / 3, 0);
    assert.ok(totals(broad) < .4 * totals(detailed));
    const fullFoliage = ['PondShrub','PondGroundcover','PondWildflowers'].flatMap(name => byGeometryName(full,name));
    const compactFoliage = byGeometryName(compact, 'PlantLow');
    assert.equal(compactFoliage.length, fullFoliage.length);
    assert.equal(compactFoliage.length, 5);
    assert.ok(totals(compactFoliage) < .42 * totals(fullFoliage));
    const matrix = new Matrix4(), root = new Vector3();
    for (const node of [...broad,...compactFoliage]) {
      const positions = node.geometry.attributes.position;
      let lowest = 0;
      for (let i = 1; i < positions.count; i++) if (positions.getY(i) < positions.getY(lowest)) lowest = i;
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i, matrix);
        root.fromBufferAttribute(positions, lowest).applyMatrix4(matrix);
        assert.ok(Math.abs(root.y - outerBankHeight(root.x, root.z)) < .015);
      }
    }
  } finally {
    full.dispose(); compact.dispose(); kit.dispose();
  }
});

test('sanctuary groundcover keeps both groups rooted on the sculpted bank in each quality', () => {
  const kit = makePondPlantKit(), habitat = makePondHabitat();
  const ground = islandGround(habitat.bank);
  const variants = [makeSanctuaryGroundcover(kit.kit, habitat.bank), makeSanctuaryGroundcover(kit.kit, habitat.bank, true)];
  try {
    const matrix = new Matrix4(), root = new Vector3();
    const totals = variants.map(({group}) => {
      assert.deepEqual(Object.keys(group.userData.zoneCounts).sort(), ['Shoulder','StoneEdges']);
      let count = 0, triangles = 0;
      for (const mesh of group.children) {
        assert.ok(mesh instanceof InstancedMesh);
        const points = mesh.geometry.attributes.position;
        let bottom = 0;
        for (let i = 1; i < points.count; i++) if (points.getY(i) < points.getY(bottom)) bottom = i;
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          root.fromBufferAttribute(points, bottom).applyMatrix4(matrix);
          const height = ground(root.x, root.z);
          assert.ok(height > .03 && root.y <= height + .001 && root.y > height - .04,
            `grass root (${root.x.toFixed(3)}, ${root.z.toFixed(3)}) at ${root.y.toFixed(3)}, bank at ${height.toFixed(3)}`);
        }
        count += mesh.count;
        triangles += mesh.count * mesh.geometry.index!.count / 3;
      }
      assert.equal(count, group.userData.plantRoots.length);
      return {count, triangles};
    });
    const expected = (variants[0].group.userData.clumps as PlantClump[]).reduce((sum, {kind}) =>
      sum + Number(kit.kit.getObjectByName(plantPrefabs[kind])!.userData.rootCount), 0);
    assert.equal(totals[0].count,expected,'full presentation uses all the authored roots');
    assert.ok(totals[1].count > 0 && totals[1].triangles < totals[0].triangles);
  } finally { variants.forEach(variant => variant.dispose()); habitat.dispose(); kit.dispose(); }
});
