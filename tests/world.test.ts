import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boatStart, outerDriftTargets, pondFraming, islandShores, koiObstacles, worldBounds, worldDestinations, worldIslands, worldObstacles } from '../src/scene/world-layout';
import { BoatMotion, boatHelm, clearSegment, distance, planRoute, safe } from '../src/scene/navigation';
import { InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { animalIsland } from '../src/scene/habitat-layout';
import { makePondGarden } from '../src/scene/PondGarden';
import { bedHeightAt, makeIslandTerrainSurface, pondFloorHeightAt } from '../src/scene/PondTerrain';
import { makePondIslands } from '../src/scene/PondIslands';
import { outerBankHeight, outerShoreDistance } from '../src/scene/shore-layout';
import { makePondPlantKit } from '../src/scene/pond-plant-kit';
import { makePondVista } from '../src/scene/PondVista';
import { makePondAtmosphere } from '../src/scene/PondAtmosphere';
import { makeFoothillTree } from '../src/scene/foothill-trees';
import { makeShoreGrove } from '../src/scene/PondGrove';

test('submerged shore aprons merge into a gently varying lakebed without blocking channels', () => {
  const heights:number[]=[];
  for(let x=-18;x<=18;x+=.5) for(let z=-18;z<=18;z+=.5) heights.push(bedHeightAt(x,z));
  assert.ok(Math.max(...heights)-Math.min(...heights)<.90,'bounded slopes, not deep trenches');
  assert.ok(heights.every(y=>y>-1.95 && y<=-1.06),'central basin stays bounded and the bed clears deep koi fins');
  for(const shore of islandShores){
    let inner=0,outer=0;
    for(let i=0;i<32;i++){
      const a=i/32*Math.PI*2;
      inner+=bedHeightAt(shore.x+Math.cos(a)*shore.rx*1.3,shore.z+Math.sin(a)*shore.rz*1.3);
      outer+=bedHeightAt(shore.x+Math.cos(a)*shore.rx*2.3,shore.z+Math.sin(a)*shore.rz*2.3);
    }
    assert.ok((inner-outer)/32>.06,'each shore has a raised sediment apron');
  }
  for(let x=-10;x<=10;x+=.25)for(let z=-10;z<=10;z+=.25){
    const y=bedHeightAt(x,z);
    assert.ok(Math.abs(y-bedHeightAt(x+.25,z))<.22 && Math.abs(y-bedHeightAt(x,z+.25))<.22,'no vertical seams between bed samples');
  }
});

test('generated islands seal the wave mask and leave safe boat and koi routes', () => {
  const plants = makePondPlantKit();
  const islands = makePondIslands(plants.kit);
  const terrain = makeIslandTerrainSurface(islands.banks);
  try {
    for (const [i, { x, z }] of islands.banks.entries()) {
      const { rx, rz } = islandShores[i];
      assert.ok(terrain.containsLand(x, z));
      for (let spoke = 0; spoke < 32; spoke++) {
        const angle = spoke * Math.PI * 2 / 32;
        const dx = Math.cos(angle) * rx, dz = Math.sin(angle) * rz;
        assert.ok(terrain.containsLand(x + dx*.72, z + dz*.72), 'the dry crown has no holes');
        assert.ok(!terrain.containsLand(x + dx*1.06, z + dz*1.06), 'water opens outside the shore');
        for (const radius of [1, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5]) {
          const px = x + dx*radius, pz = z + dz*radius;
          const position = { x: px*100, y: pz*100 };
          if (safe(position, worldObstacles, worldBounds)) assert.ok(!terrain.containsLand(px, pz));
          if (safe(position, koiObstacles, worldBounds)) assert.ok(terrain.heightAt(px, pz) < -1.05);
        }
      }
    }
  } finally {
    terrain.dispose();
    islands.dispose();
    plants.dispose();
  }
});

test('the foothill joins below the dry ground clear of the pond banks', () => {
  const atmosphere = makePondAtmosphere();
  const vista = makePondVista(atmosphere.uniforms);
  try {
    const mesh = vista.group.getObjectByName('WoodedFoothills');
    assert.ok(mesh instanceof Mesh);
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      assert.ok(outerShoreDistance(x, z) > 6, 'park vegetation and the shore keep open ground before the foothill');
      if (Math.abs(Math.hypot(x, z) - 24) < 1e-5) assert.ok(y < outerBankHeight(x, z), 'dry ground covers the foothill toe');
    }
  } finally {
    vista.dispose();
    atmosphere.dispose();
  }
});

test('seeded fir shoots taper to a finite crown even when the highest bough is offset upward', () => {
  for (const seed of [1, 2, 3, 4, 3059, 1247]) {
    const tree = makeFoothillTree(true, seed);
    try {
      for (const name of ['position', 'normal', 'color']) {
        assert.ok(tree.getAttribute(name).array.every(Number.isFinite), `fir seed ${seed} has finite ${name}`);
      }
    } finally {
      tree.dispose();
    }
  }
});

test('every shore tree has its full branches and foliage in the high profile', () => {
  const full = makeShoreGrove(false), compact = makeShoreGrove(true);
  try {
    for (const [i, tree] of full.group.children.entries()) {
      const reviewTree = compact.group.children[i];
      assert.equal(tree.name, reviewTree.name);
      assert.deepEqual(tree.position, reviewTree.position);
      for (const [part, surface] of tree.children.entries()) {
        const reviewSurface = reviewTree.children[part];
        assert.ok(surface instanceof Mesh && reviewSurface instanceof Mesh);
        assert.ok(surface.geometry.getAttribute('position').count > reviewSurface.geometry.getAttribute('position').count,
          `${tree.name} ${part} uses full geometry`);
      }
    }
  } finally {
    full.dispose();
    compact.dispose();
  }
});

test('underwater shelves preserve shared placements, bed contact and clearance for koi', () => {
  const high=makePondGarden(false),low=makePondGarden(true);
  try {
    for(let kind=0;kind<high.group.children.length;kind++) {
      const full=high.group.children[kind] as InstancedMesh,small=low.group.children[kind] as InstancedMesh;
      const a=new Matrix4(),b=new Matrix4();
      for(let i=0;i<small.count;i++) {
        full.getMatrixAt(i,a);small.getMatrixAt(i,b);
        assert.deepEqual(a.elements,b.elements,'LOD must not relocate surviving stones or grass');
      }
      const solid = full.name.startsWith('BedStone');
      const positions=full.geometry.attributes.position,point=new Vector3();
      for(let i=0;i<full.count;i++) {
        full.getMatrixAt(i,a);
        const [x,y,z]=[a.elements[12],a.elements[13],a.elements[14]];
        const distance = outerShoreDistance(x,z);
        assert.ok(distance > -3.5 && distance < -1.4,'shelves leave the centre basin and waterline open');
        assert.ok(Math.abs(y-pondFloorHeightAt(x,z))<.05,'scenery roots follow the submerged shelf');
        for(let vertex=0;vertex<positions.count;vertex++) {
          point.fromBufferAttribute(positions,vertex).applyMatrix4(a);
          assert.ok(point.y<-.08,'all scenery stays submerged, including a sway margin');
          if (solid && point.y > -1.06) {
            assert.ok(!safe({x:point.x*100,y:point.z*100},koiObstacles,worldBounds),'solid ledge stays out of the swim routes');
          }
        }
      }
    }
    const fullWeed=high.group.getObjectByName('FeatherPondweed') as InstancedMesh;
    const compactWeed=low.group.getObjectByName('FeatherPondweed') as InstancedMesh;
    assert.ok(compactWeed.geometry.index!.count<fullWeed.geometry.index!.count*.25,'mobile pondweed keeps its shoots with fewer subdivisions');
  } finally { high.dispose();low.dispose(); }
});

test('mobile plant deformation samples each root once per animated frame',()=>{
  const garden=makePondGarden(true);
  const meshes=['TallWaterGrass','FeatherPondweed'].map(name=>garden.group.getObjectByName(name) as InstancedMesh);
  const attributes=meshes.map(mesh=>mesh.geometry.getAttribute('gardenRootFlow'));
  const rootCount=meshes.reduce((sum,mesh)=>sum+mesh.count,0);
  let reads=0;
  const wake=()=>{reads++;return {height:0,dx:.024,dz:-.015};};
  try{
    garden.update(1,0,undefined,.25,wake);
    assert.equal(reads,rootCount);
    const first=attributes.map(attr=>Array.from(attr.array));
    assert.ok(first.every(values=>values.every(Number.isFinite)&&values.some(value=>Math.abs(value)>.03)));
    garden.update(1,.5,undefined,.25,wake);
    assert.equal(reads,rootCount);
    assert.deepEqual(attributes.map(attr=>Array.from(attr.array)),first,'changing the lighting while paused leaves each plant still');
    garden.update(2,.5,undefined,.25,wake);
    assert.equal(reads,rootCount*2);
  }finally{garden.dispose();}
});

test('shared stone hulls and aquatic leaves have finite normals and drawable faces',()=>{
  for(const low of [false,true]){
    const garden=makePondGarden(low);
    try{
      for(const child of garden.group.children){
        const mesh=child as InstancedMesh,g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
        assert.equal(p.count,n.count);
        for(const value of [...p.array,...n.array])assert.ok(Number.isFinite(value),mesh.name);
        const a=new Vector3(),b=new Vector3(),c=new Vector3(),edge=new Vector3();
        for(let i=0;i<(g.index?.count??p.count);i+=3){
          a.fromBufferAttribute(p,g.index?g.index.getX(i):i);
          b.fromBufferAttribute(p,g.index?g.index.getX(i+1):i+1);
          c.fromBufferAttribute(p,g.index?g.index.getX(i+2):i+2);
          assert.ok(edge.subVectors(b,a).cross(c.sub(a)).lengthSq()>1e-17,mesh.name+' has no collapsed leaf tips or stone bevels');
        }
      }
    }finally{garden.dispose();}
  }
});

test('world-space boat routes reach every shore without crossing island or dock', () => {
  const starts = [boatStart, ...Object.values(worldDestinations).map(v => v.dock),...outerDriftTargets];
  const destinations={...worldDestinations,...Object.fromEntries(outerDriftTargets.map((dock,i)=>['outer-'+i,{dock}]))};
  for (const start of starts) for (const [id, destination] of Object.entries(destinations)) {
    assert.ok(safe(start, worldObstacles, worldBounds));
    assert.ok(safe(destination.dock, worldObstacles, worldBounds), id);
    const route = planRoute(start, destination.dock, worldObstacles, worldBounds);
    assert.ok(route.length > 1, `route to ${id}`);
    const motion = new BoatMotion(start); motion.helm=boatHelm;
    motion.setRoute(route);
    let arrived = false;
    for (let frame = 0; frame < 6000 && !arrived; frame++) {
      const previous = { ...motion.position };
      arrived = motion.update(1 / 60, 150, worldObstacles, worldBounds);
      assert.ok(safe(motion.position, worldObstacles, worldBounds), `position to ${id}`);
      assert.ok(clearSegment(previous, motion.position, worldObstacles, worldBounds));
    }
    assert.ok(arrived, `arrival at ${id}`);
    assert.ok(distance(motion.position, destination.dock) < 2.5);
  }
});

test('desktop islands occupy four spacious regions while boats can pass the middle planting',()=>{
  for(const [w,h] of [[1440,900],[1920,1080],[1366,768]]){
    const f=pondFraming(w,h),camera=new PerspectiveCamera(f.fov,w/h,.1,1200);camera.position.set(...f.position);camera.lookAt(0,.5,0);camera.updateMatrixWorld();
    const projected=[...worldIslands,{id:'animals',...animalIsland}].map(i=>({id:i.id,p:new Vector3(i.x,.25,i.z).project(camera)}));
    for(const {id,p} of projected){
      assert.ok(Math.abs(p.x)>.28&&Math.abs(p.x)<.65,'islands spread horizontally with edge breathing room');
      assert.ok(Math.abs(p.y)>.22&&Math.abs(p.y)<.60,'islands have clear upper/lower regions');
      assert.equal(p.x<0,id==='about'||id==='github');assert.equal(p.y>0,id==='about'||id==='animals');
    }
  }
  const north = { x: 0, y: -600 }, south = { x: 0, y: 600 };
  const route = planRoute(north, south, worldObstacles, worldBounds);
  assert.deepEqual(route.at(-1), south);
  assert.ok(route.every((point, i) => Math.abs(point.x) < 260 && (!i || clearSegment(route[i - 1], point, worldObstacles, worldBounds))),
    'boats still cross the central waterway while passing the lotus cluster');
});
