import { BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import type { Texture } from 'three';
import { sampleSurface, windWaves } from './pond-life';
import type { SurfaceSample } from './PondSurface';
import { wakeFieldExtent } from './PondWakeField';
import { pondFloorHeightAt } from './PondTerrain';
import type { FloorHeight } from './PondTerrain';
import { stoneGeometry, weatherStone } from './stone-geometry';
import { makeBedLayout } from './pond-bed-layout';
import type { BedGroup } from './pond-bed-layout';

function bladeGeometry(low: boolean) {
  const vertices:number[]=[], colors:number[]=[], indices:number[]=[];
  // A long ribbon grows from a narrow sheath, twists, then curls with current.
  // The blade stays almost parallel-sided before its tapered, trailing tip.
  const rows=low?6:18;
  const rootColor = new Color('#374f37'), ribColor = new Color('#94aa79'), edgeColor = new Color('#7d976c');
  const color = new Color();
  for(let blade=0;blade<2;blade++) {
  const offset=vertices.length/3,azimuth=blade*2.1,length=blade===0?1:.74;
  for(let i=0;i<=rows;i++) {
    const t=i/rows,w=(.011+.029*Math.sin(Math.PI*Math.min(1,t*1.20))**.75)*(1-t**3)+.0006;
    const bend=.09*t+.47*t*t-.12*t*t*t,twist=.20+t*1.31;
    for(let side=-1;side<=1;side++) {
      const x=bend+side*w*Math.cos(twist),z=.065*Math.sin(t*Math.PI)*t+side*w*Math.sin(twist)+(side===0?.004*Math.sin(t*Math.PI):0);
      vertices.push((x*Math.cos(azimuth)-z*Math.sin(azimuth))*length,(t-.17*t**5)*length,
        (x*Math.sin(azimuth)+z*Math.cos(azimuth))*length);
      color.copy(rootColor).lerp(side===0?ribColor:edgeColor,.20+t*.64);
      colors.push(color.r,color.g,color.b);
    }
    if(i<rows) for(let side=0;side<2;side++) { const a=offset+i*3+side; indices.push(a,a+3,a+1,a+1,a+3,a+4); }
  }
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function pondweedGeometry(low:boolean) {
  const vertices:number[]=[],colors:number[]=[],indices:number[]=[];
  const stem=(t:number,angle:number,height:number)=>new Vector3(
    Math.cos(angle)*(.06*t+.22*t*t),height*t,Math.sin(angle)*(.06*t+.22*t*t));
  // Fine submerged pondweed: whorls follow three unequal curved stems.
  // Small recumbent leaflets replace the large paired arrowhead shapes.
  const leaf=(base:Vector3,angle:number,size:number,pitch:number)=>{
    const k=vertices.length/3,rows=low?2:5;
    for(let row=0;row<=rows;row++)for(let edge=-1;edge<=1;edge++) {
      const t=row/rows,w=Math.max(.0002,Math.sin(t*Math.PI)**.7*size*.109),reach=size*t;
      vertices.push(base.x+Math.cos(angle)*reach-Math.sin(angle)*edge*w,
        base.y+pitch*t+.035*Math.sin(t*Math.PI)-.045*t*t+(edge===0?.002:0),
        base.z+Math.sin(angle)*reach+Math.cos(angle)*edge*w);
      const c=new Color('#42664c').lerp(new Color(edge===0?'#a2b58a':'#849f74'),.15+base.y*.45+t*.20);
      colors.push(c.r,c.g,c.b);
      if(row<rows&&edge<1){const a=k+row*3+edge+1;indices.push(a,a+3,a+1,a+1,a+3,a+4);}
    }
  };
  const levels=low?[0,2,3,5,7]:[0,1,2,3,4,5,6,7];
  const leaves=low?[0,2,4]:[0,1,2,3,4];
  for(let shoot=0;shoot<3;shoot++) {
    const angle=shoot*2.39996,height=[.88,.65,.72][shoot];
    for(const level of levels) {
      const t=.13+level*.115,base=stem(t,angle,height),size=(.17-level*.009)*(shoot===0?1:.86)*(low?1.07:1);
      for(const whorl of leaves)leaf(base,whorl*Math.PI*2/5+level*.62+angle,size,.035+.026*t);
    }
    const sides=low?4:5,segments=low?8:12,k=vertices.length/3;
    for(let row=0;row<=segments;row++)for(let side=0;side<sides;side++) {
      const t=row/segments,base=stem(t,angle,height),a=side/sides*Math.PI*2,r=.0065*(1-t*.75);
      vertices.push(base.x+Math.cos(a)*r,base.y,base.z+Math.sin(a)*r);
      const c=new Color('#638246');colors.push(c.r,c.g,c.b);
      if(row<segments){const a=k+row*sides+side,b=k+row*sides+(side+1)%sides;indices.push(a,a+sides,b,b,a+sides,b+sides);}
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function placeBedBatch(name: string, geometry: BufferGeometry, material: MeshStandardMaterial, bed: BedGroup, low: boolean) {
  const placements = low ? bed.principal : [...bed.principal, ...bed.fine];
  const batch = new InstancedMesh(geometry, material, placements.length);
  const object = new Object3D();
  batch.name = name;
  batch.receiveShadow = true;
  placements.forEach((placement, i) => {
    object.position.set(...placement.position);
    object.scale.set(...placement.scale);
    object.rotation.set(...placement.rotation, 'YXZ');
    object.updateMatrix();
    batch.setMatrixAt(i, object.matrix);
    batch.setColorAt(i, placement.color);
  });
  batch.instanceMatrix.needsUpdate = true;
  if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
  return batch;
}

type WakeAt = (x: number, z: number) => SurfaceSample;

/** The compact plants flex coherently from their rooted stem. Reuse the
 * surface samples already read for floating objects and upload one vector per plant. */
function rootFlow(batch: InstancedMesh) {
  const flow = new InstancedBufferAttribute(new Float32Array(batch.count * 3), 3).setUsage(DynamicDrawUsage);
  batch.geometry.setAttribute('gardenRootFlow',flow);
  const matrices=batch.instanceMatrix.array;
  const roots=Array.from({length:batch.count},(_,i)=>{
    const j=i*16, inverse = (column: number) => {
      const a=j+column, x=matrices[a], y=matrices[a+1], z=matrices[a+2], squared=x*x+y*y+z*z;
      return new Vector3(x/squared,y/squared,z/squared);
    };
    const height=.88*Math.hypot(matrices[j+4],matrices[j+5],matrices[j+6]);
    return {x:matrices[j+12],z:matrices[j+14],response:9*Math.exp(Math.min(0,matrices[j+13]+height*.52)*.28),
      height,limit:Math.min(.18,height*.32),axisX:inverse(0),axisY:inverse(4),axisZ:inverse(8)};
  });
  const current=new Vector3();
  return (time: number, wakeAt?: WakeAt) => {
    roots.forEach(({x,z,height,limit,response,axisX,axisY,axisZ},index)=>{
      const wind=sampleSurface(x,z,time),wake=wakeAt?.(x,z);
      const dx=.018-wind.dx*.70-(wake?.dx??0)*response,dz=.007-wind.dz*.70-(wake?.dz??0)*response;
      const gain=limit/Math.sqrt(limit*limit+dx*dx+dz*dz);
      current.set(dx*gain,-(dx*dx+dz*dz)*gain*gain/Math.max(2*height,.1),dz*gain);
      flow.setXYZ(index,current.dot(axisX),current.dot(axisY),current.dot(axisZ));
    });
    flow.needsUpdate=true;
  };
}

/** Real, instanced geometry below the surface. Shared time follows panel/reduced motion. */
export function makePondGarden(low:boolean,heightAt:FloorHeight=pondFloorHeightAt) {
  const group=new Group();
  const bed = makeBedLayout(heightAt);
  const rockMaterial=new MeshStandardMaterial({color:'#ffffff',roughness:.88,vertexColors:true});
  const grassMaterial=new MeshStandardMaterial({color:'#ffffff',roughness:1,side:DoubleSide,vertexColors:true});
  const gardenTime={value:0},underwaterTint={value:new Color('#729789')};
  const gardenWake={value:null as Texture|null},gardenCell={value:.125};
  const dayTint=new Color('#729789'),nightTint=new Color('#173448');
  const submergedMaterial=(material:MeshStandardMaterial,sway:boolean)=>{
    const compact=low&&sway;
    material.customProgramCacheKey=()=>`pond-submerged-${sway}${compact?'-root':''}`;
    material.onBeforeCompile=shader=>{
    shader.uniforms.gardenTime=gardenTime;
    shader.uniforms.underwaterTint=underwaterTint;
    shader.uniforms.gardenWake=gardenWake;shader.uniforms.gardenCell=gardenCell;
    const flowInputs=compact?'attribute vec3 gardenRootFlow;':sway?'uniform float gardenTime; uniform sampler2D gardenWake; uniform float gardenCell;':'';
    shader.vertexShader=flowInputs+'varying float gardenDepth;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      ${compact?`
      transformed += gardenRootFlow * pow(clamp(position.y/.88,0.0,1.0),1.5);`:sway?`
      vec3 world=(modelMatrix*instanceMatrix*vec4(position,1.0)).xyz;
      vec2 uv=world.xz/${wakeFieldExtent.toFixed(1)}+.5,d=vec2(gardenCell/${wakeFieldExtent.toFixed(1)},0.0);
      // Roots are fixed; the long, flexible tips respond to the local pressure slope.
      // Read the previous solver state too: a small delay softens the reversal.
      vec2 sx=texture2D(gardenWake,uv+d).rg-texture2D(gardenWake,uv-d).rg;
      vec2 sz=texture2D(gardenWake,uv+d.yx).rg-texture2D(gardenWake,uv-d.yx).rg;
      vec2 slope=vec2(dot(sx,vec2(.35,.65)),dot(sz,vec2(.35,.65)))/(2.0*gardenCell);
      vec2 wind=vec2(0.0);
      ${windWaves.map(w=>`wind+=vec2(${w.x},${w.z})*cos(dot(world.xz,vec2(${w.x},${w.z}))*${w.frequency}-gardenTime*${w.speed})*${w.amplitude*w.frequency};`).join('\n')}
      mat3 basis=mat3(instanceMatrix);
      float depth=max(0.0,-world.y),height=length(basis[1])*.88;
      // The old depth falloff and unnormalised y^2 hid almost all of a short
      // blade's response. Normalise to its crown, with zero bend at the root.
      float flex=pow(clamp(position.y/.88,0.0,1.0),1.5);
      vec2 push=-slope*9.0*exp(-depth*.28)-wind*.70+vec2(.018,.007);
      float limit=min(.18,height*.32);
      push*=limit/sqrt(limit*limit+dot(push,push));
      // Yield sideways and lower the tip slightly as it bends; never lift the
      // entire plant with the surface or stretch a small shoot into a long one.
      vec3 current=vec3(push.x,-dot(push,push)/max(2.0*height,.1),push.y)*flex;
      // Inverse rotation/scale: every blade bends in the same world direction.
      // Root position is unchanged for either the ribbon or feather geometry.
      transformed+=vec3(dot(basis[0],current)/dot(basis[0],basis[0]),
        dot(basis[1],current)/dot(basis[1],basis[1]),
        dot(basis[2],current)/dot(basis[2],basis[2]));`:''}
      gardenDepth=max(0.0,-(modelMatrix*instanceMatrix*vec4(transformed,1.0)).y);`);
    shader.fragmentShader='varying float gardenDepth; uniform vec3 underwaterTint;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      outgoingLight=mix(outgoingLight,underwaterTint,clamp(.04+gardenDepth*.05,.06,.16));
      #include <opaque_fragment>`);
  };};
  submergedMaterial(rockMaterial,false);submergedMaterial(grassMaterial,true);
  weatherStone(rockMaterial);
  const slabs = placeBedBatch('BedStoneSlabs', stoneGeometry(1), rockMaterial, bed.slabs, low);
  const boulders = placeBedBatch('BedStoneBoulders', stoneGeometry(2), rockMaterial, bed.boulders, low);
  const ribbons = placeBedBatch('TallWaterGrass', bladeGeometry(low), grassMaterial, bed.ribbons, low);
  const pondweed = placeBedBatch('FeatherPondweed', pondweedGeometry(low), grassMaterial, bed.pondweed, low);
  slabs.castShadow = boulders.castShadow = true;
  const batches = [
    placeBedBatch('BedStones', stoneGeometry(0), rockMaterial, bed.stones, low),ribbons,pondweed,slabs,boulders,
  ];
  const updateRoots = low ? [rootFlow(ribbons),rootFlow(pondweed)] : [];
  let lastFlowTime=NaN;
  group.add(...batches);group.name='SubmergedGarden';
  return {group,update(time:number,night=0,wake?:Texture,cellSize=.125,wakeAt?:WakeAt){
    gardenTime.value=time;underwaterTint.value.copy(dayTint).lerp(nightTint,night);
    if(low){
      if(time!==lastFlowTime){updateRoots.forEach(update=>update(time,wakeAt));lastFlowTime=time;}
    }else{
      if(wake)gardenWake.value=wake;
      gardenCell.value=cellSize;
    }
  },dispose(){
    for(const batch of batches){batch.geometry.dispose();batch.dispose();}
    rockMaterial.dispose();grassMaterial.dispose();
  }};
}
