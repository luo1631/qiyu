import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh, Ray, Raycaster, SkinnedMesh, Vector3 } from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { makePondHabitat } from '../src/scene/PondHabitat';
import { makeAquaticModels } from '../src/scene/PondCreatures';
import { animalIsland, frogFootHeight, islandHeight, turtleBackHeight } from '../src/scene/habitat-layout';
import { frogStroke } from '../src/scene/locomotion';

const a = new Vector3(), b = new Vector3(), c = new Vector3(), ab = new Vector3(), ac = new Vector3();
test('frog and turtle eyes retain rounded depth instead of flattened iris plates', () => {
  for(const low of [false,true]) {
    const animals=makeAquaticModels(low);
    try {
      for(const root of [animals.frog.root,animals.turtles[0].root]) {
        const mesh=root.getObjectByName('RoundEyes') as Mesh,points=mesh.geometry.attributes.position;
        for(const side of [-1,1]) {
          const eye=new Box3();
          for(let i=0;i<points.count;i++)if(points.getX(i)*side>0)
            eye.expandByPoint(new Vector3().fromBufferAttribute(points,i));
          assert.ok(!eye.isEmpty());
          const size=eye.getSize(new Vector3());
          assert.ok(size.z>Math.max(size.x,size.y)*.85,'side-view depth must be comparable to the visible iris diameter');
        }
      }
    } finally { animals.dispose(); }
  }
});
test('seated frog hind soles fold forward beside the body instead of trailing behind', () => {
  for(const low of [false,true]) {
    const animals=makeAquaticModels(low);
    try {
      for(const limb of animals.frog.limbs) {
        const mesh=limb.children[0] as Mesh;
        if(mesh.name!=='HindLeg')continue;
        const points=mesh.geometry.attributes.position,sole=new Box3();
        for(let i=0;i<points.count;i++)if(Math.abs(points.getY(i)+.088)<1e-6)
          sole.expandByPoint(new Vector3().fromBufferAttribute(points,i));
        assert.ok(!sole.isEmpty());
        assert.ok(sole.max.z<0,'the entire sole is forward (-Z) of the hind-leg pivot');
        assert.ok(sole.getSize(new Vector3()).z>.18,'the long folded hind foot keeps its readable shape');
      }
    } finally { animals.dispose(); }
  }
});
test('frog body runs from forward head to rear hips in a low crouch', () => {
  for(const low of [false,true]) {
    const animals=makeAquaticModels(low);
    try {
      const body=new Box3().setFromObject(animals.frog.root.getObjectByName('FrogBody')!),size=body.getSize(new Vector3());
      assert.ok(size.z>size.y*1.9,'the torso must extend horizontally, not stack head and belly vertically');
      assert.ok(size.x>size.y*1.5,'a crouched frog keeps a broad, low body');
      const eyes=new Box3().setFromObject(animals.frog.root.getObjectByName('RoundEyes')!).getCenter(new Vector3());
      assert.ok(eyes.z<-.12,'eyes belong on the forward (-Z) head, not over the rump');
      assert.ok(eyes.y<.26,'eyes remain seated on the low head');
    } finally { animals.dispose(); }
  }
});

test('frog swimming kick carries the hind soles backward instead of downward',()=>{
  const animals=makeAquaticModels(false),frog=animals.frog;
  try{
    const soleCentre=()=>{
      frog.root.updateMatrixWorld(true);const centre=new Vector3();let count=0;
      for(const limb of frog.limbs){const mesh=limb.children[0] as Mesh;if(mesh.name!=='HindLeg')continue;
        const points=mesh.geometry.attributes.position;
        for(let i=0;i<points.count;i++)if(Math.abs(points.getY(i)+.088)<1e-6){centre.add(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld));count++;}
      }
      assert.ok(count>0);return centre.divideScalar(count);
    };
    const pose={x:0,y:0,z:0,yaw:0,pitch:0,speed:0,gait:0,mode:'rest' as const,jump:0,padIndex:0};
    frog.update(pose,0);const seated=soleCentre();let phase=0,best=-1;
    for(let i=0;i<128;i++){const p=i/128*Math.PI*2,e=frogStroke(p).extension;if(e>best){best=e;phase=p;}}
    frog.update({...pose,mode:'swim',speed:.3,gait:phase},0);const kicked=soleCentre();
    assert.ok(kicked.z-seated.z>.15,'power stroke extends the feet aft (+Z) of the hips');
    assert.ok(kicked.y>-.10,'the kick stays near the swimming plane');
    const knee=frog.root.getObjectByName('FrogKnee_L')!, ankle=frog.root.getObjectByName('FrogAnkle_L')!;
    assert.ok(Math.abs(knee.rotation.y)>.4&&Math.abs(ankle.rotation.x)>.07,'weighted knee and ankle both contribute to the kick');
    frog.update({...pose,mode:'jump',jump:.76},0);
    assert.ok(frog.root.getObjectByName('FrogWrist_L')!.rotation.x>.3,'forefeet reach toward the landing');
    frog.update(pose,0);assert.ok(soleCentre().distanceTo(seated)<1e-6,'the recovered leg returns to the resting support');
  }finally{animals.dispose();}
});

test('riding turtle settles its plastron onto the adult shell and freezes with time',()=>{
  const animals=makeAquaticModels(false),[adult,young]=animals.turtles;
  try{
    const pose={x:0,y:0,z:0,yaw:0,pitch:0,speed:0,gait:0,mode:'bask' as const};
    adult.update(pose,0);young.update({...pose,y:turtleBackHeight,mode:'ride'},0);
    adult.root.updateMatrixWorld(true);young.root.updateMatrixWorld(true);
    const ray=new Raycaster(new Vector3(0,1,0),new Vector3(0,-1,0));
    const shell=ray.intersectObject(adult.root.getObjectByName('ContinuousCarapace')!,false)[0];
    const bellyHits=ray.intersectObject(young.root.getObjectByName('TurtleBody')!,false);
    assert.ok(shell&&bellyHits.length>0);
    const belly=Math.min(...bellyHits.map(hit=>hit.point.y));
    assert.ok(belly-shell.point.y>=-.002&&belly-shell.point.y<.008,'plastron bears on the crown without a visible hovering gap');
    const y=young.root.position.y;young.update({...pose,y:turtleBackHeight,mode:'ride'},0);
    assert.equal(young.root.position.y,y,'paused pose does not keep settling');
  }finally{animals.dispose();}
});

function turtleSole(mesh: SkinnedMesh, ground: (x:number,z:number)=>number) {
  const points=mesh.geometry.attributes.position, weights=mesh.geometry.attributes.skinWeight;
  const world=new Vector3(), result=new Vector3();
  let height=Infinity;
  for(let i=0;i<points.count;i++)if(points.getY(i)<-.059&&weights.getZ(i)>.8){
    mesh.getVertexPosition(i,world).applyMatrix4(mesh.matrixWorld);
    const gap=world.y-ground(world.x,world.z);
    if(gap<height){height=gap;result.copy(world);}
  }
  return {point:result,height};
}

test('turtle limbs continue their stroke through the shallows and settle onto the bank',()=>{
  const animals=makeAquaticModels(false),turtle=animals.turtles[0];
  const elbow=turtle.root.getObjectByName('TurtleElbow_ForeL')!,foot=turtle.root.getObjectByName('TurtleFoot_ForeL')!;
  const depth=(y:number,gait:number,speed=.22)=>({x:animalIsland.x,y,z:animalIsland.z,yaw:0,pitch:0,gait,speed});
  try {
    turtle.update({...depth(-.1,0),mode:'swim'},0);
    let range=0,previous=elbow.rotation.y;
    for(let i=1;i<=60;i++){
      turtle.update({...depth(-.1+i*.003,.022*i),mode:'climb'},i/60);
      assert.ok(Math.abs(elbow.rotation.y-previous)<.09,'joints blend across the waterline');
      previous=elbow.rotation.y;range=Math.max(range,Math.abs(previous));
    }
    assert.ok(range>.10&&foot.parent===elbow);
    for(let n=1;n<=20;n++)turtle.update({...depth(.315,1.4,0),mode:'bask'},1+n/60);
    turtle.root.updateMatrixWorld(true);
    for(const limb of turtle.limbs){
      const {height}=turtleSole(limb.children[0] as SkinnedMesh,islandHeight);
      assert.ok(height>-.007&&height<.009,'the webbed sole supports the settled turtle');
    }
  }finally{animals.dispose();}
});

test('planted turtle soles hold through steps and turns on the rendered bank',()=>{
  const habitat=makePondHabitat(),animals=makeAquaticModels(true),turtle=animals.turtles[0];
  const start=animalIsland.z+.53,x=animalIsland.x-.065;
  const mesh=new Octree().fromGraphNode(habitat.bank),ray=new Ray(new Vector3(),new Vector3(0,-1,0));
  const ground=(px:number,pz:number)=>{
    ray.origin.set(px,2,pz);const result=mesh.rayIntersect(ray);
    return result ? result.position.y : -.26;
  };
  let previous:ReturnType<typeof turtleSole>[]=[];
  const slip:number[]=[];
  let total=0,raised=0;
  try{
    for(let frame=0;frame<=97;frame++){
      const t=frame/30,z=start-.12*Math.min(t,1.7),yaw=Math.max(0,t-1.7)*.86;
      turtle.update({x,y:ground(x,z)+.015,z,yaw,pitch:0,speed:t<1.7?.12:0,gait:t*1.35,
        mode:t<1.7?'climb':'leave'},t,ground);
      turtle.root.updateMatrixWorld(true);
      const feet=turtle.limbs.map(limb=>turtleSole(limb.children[0] as SkinnedMesh,ground));
      const touching=(height:number)=>height<.009&&height>-.013;
      if(frame>2){
        total++;
        assert.ok(feet.some(sole=>touching(sole.height)),`support through turn at ${t}`);
        if(feet.some(sole=>sole.height>.025))raised++;
        for(const [i,sole] of feet.entries())if(touching(sole.height)&&touching(previous[i].height)){
          slip.push(Math.hypot(sole.point.x-previous[i].point.x,sole.point.z-previous[i].point.z)*30);
        }
      }
      previous=feet;
    }
    slip.sort((a,b)=>a-b);
    assert.ok(total>90&&raised>30&&slip.length>80);
    assert.ok(slip[Math.floor(slip.length/2)]<.028,'support feet remain stationary as the shell changes pose');
  }finally{animals.dispose();habitat.dispose();}
});
test('koi tails are upright and frog feet have consistently oriented closed surfaces', () => {
  for (const low of [false, true]) {
    const animals=makeAquaticModels(low);
    try {
      for(const fish of animals.koi){
        const mesh=fish.root.getObjectByName('FlowingFins') as Mesh,points=mesh.geometry.attributes.position,tail=new Box3();
        for(let i=0;i<points.count;i++)if(points.getZ(i)>.54)tail.expandByPoint(new Vector3().fromBufferAttribute(points,i));
        const size=tail.getSize(new Vector3());
        assert.ok(size.y>size.x*3,'caudal lobes are vertical rather than a pair of sideways paddles');
      }
      animals.frog.root.updateMatrixWorld(true);
      for(const limb of animals.frog.limbs){
        const mesh=limb.children[0] as Mesh,points=mesh.geometry.attributes.position,edges=new Map<string,number>();
        const key=(i:number)=>[points.getX(i),points.getY(i),points.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
        for(let i=0;i<points.count;i+=3)for(const [a,b] of [[i,i+1],[i+1,i+2],[i+2,i]]){
          const x=key(a),y=key(b),edge=x<y?x+'|'+y:y+'|'+x;
          edges.set(edge,(edges.get(edge)||0)+(x<y?1:-1));
        }
        for(const balance of edges.values())assert.equal(balance,0,'toe notches must not contain overlapping reversed fans');
        assert.ok(Math.abs(new Box3().setFromObject(mesh).min.y-frogFootHeight)<.00001,'rendered sole stays on the shared landing support');
      }
    } finally { animals.dispose(); }
  }
});
function triangleNormal(mesh: Mesh, vertex: number) {
  const p = mesh.geometry.attributes.position, indices = mesh.geometry.index;
  a.fromBufferAttribute(p, indices?.getX(vertex) ?? vertex);
  b.fromBufferAttribute(p, indices?.getX(vertex + 1) ?? vertex + 1);
  c.fromBufferAttribute(p, indices?.getX(vertex + 2) ?? vertex + 2);
  return ab.subVectors(b, a).cross(ac.subVectors(c, a));
}

test('animal bank and broad leaf faces point upward without a reversed ring', () => {
  for (const low of [false, true]) {
    const habitat = makePondHabitat(low);
    try {
      const bank = habitat.group.getObjectByName('AnimalIsland') as Mesh;
      const geometry = bank.geometry, normals = geometry.attributes.normal;
      for (let i = 0; i < (geometry.index?.count ?? geometry.attributes.position.count); i += 3) {
        const face = triangleNormal(bank, i);
        assert.ok(face.y > .000001, 'every concentric beach face has the same upward winding');
      }
      for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > 0, 'smooth normals never blend opposite shore windings into a dark ring');
      const leaves: Mesh[] = [];
      habitat.group.traverse(o => { if (o instanceof Mesh && o.name === 'NotchedLeaf') leaves.push(o); });
      assert.equal(leaves.length, 7);
      for (const leaf of leaves) {
        const geometry = leaf.geometry;
        const count = geometry.index?.count ?? geometry.attributes.position.count;
        assert.ok(count >= 30 * 3);
        for (let i = 0; i < count; i += 3) assert.ok(triangleNormal(leaf, i).y > 0, 'leaf top faces the light');
      }
    } finally { habitat.dispose(); }
  }
});

test('lotus petals retain pink surfaces and a full radial silhouette at both quality levels', () => {
  for (const low of [false, true]) {
    const habitat = makePondHabitat(low);
    try {
      const flowers: Mesh[] = [];
      habitat.group.traverse(o => { if (o instanceof Mesh && o.name === 'LayeredLotus') flowers.push(o); });
      assert.equal(flowers.length, 3);
      for (const flower of flowers) {
        flower.geometry.computeBoundingBox();
        const size = flower.geometry.boundingBox!.getSize(new Vector3());
        assert.ok(size.x > .4 && size.z > .4, 'petals must not collapse when rotation is mistaken for scale');
        const colors = flower.geometry.attributes.color, positions = flower.geometry.attributes.position;
        let pinkFaces = 0, visiblePinkFaces = 0;
        const pinkBounds = new Box3();
        for (let i = 0; i < positions.count; i += 3) {
          if (colors.getX(i) < colors.getY(i) * 1.5 || colors.getZ(i) < colors.getY(i) * 1.1) continue;
          pinkFaces++;
          if (triangleNormal(flower, i).length() > .00001) visiblePinkFaces++;
          for (let n = 0; n < 3; n++) pinkBounds.expandByPoint(a.fromBufferAttribute(positions, i + n));
        }
        assert.ok(pinkFaces > 100 && visiblePinkFaces > pinkFaces * .60, 'pink petals have drawable area, not only a green stem');
        const pinkSize = pinkBounds.getSize(new Vector3());
        assert.ok(pinkSize.x > .4 && pinkSize.z > .4);
      }
    } finally { habitat.dispose(); }
  }
});
