import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Group, MathUtils, Mesh, MeshStandardMaterial,
} from 'three';
import type { Vector3 } from 'three';
import { makeDragonfly } from './PondDragonfly';
import { makePondSwan } from './PondSwan';
import { SwimmerFloat } from './PondSurface';
import type { PadSupport, SurfaceSampler } from './PondSurface';
import type { SwanLife } from './wildlife-life';
import { dragonflyVisits } from './wildlife-life';
import { lifeScale } from './shore-layout';

export function makePondWildlife() {
  const group = new Group();
  group.name = 'PondWildlife';
  const bird = makePondSwan(), swan = bird.root;
  group.add(swan);
  const insects=Array.from({length:3},(_,i)=>makeDragonfly(i));insects.forEach(d=>group.add(d.root));
  const floating=new SwimmerFloat();
  // A local slender surface wake follows the actual path. It is visual only;
  // the small shared RippleField events remain authoritative for wave/grass motion.
  const vertices=new Float32Array(2*32*2*3),alphas=new Float32Array(2*32*2*3),indices:number[]=[];
  for(let side=0;side<2;side++)for(let n=0;n<31;n++){
    const i=side*64+n*2;indices.push(i,i+1,i+2,i+1,i+3,i+2);
  }
  const wakeGeometry=new BufferGeometry();wakeGeometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
  wakeGeometry.setAttribute('color',new Float32BufferAttribute(alphas,3));wakeGeometry.setIndex(indices);
  const wakeMaterial=new MeshStandardMaterial({color:'#c3ded0',vertexColors:true,transparent:true,opacity:.23,depthWrite:false,roughness:.65,side:DoubleSide});
  wakeMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','diffuseColor.a *= vColor.r;');};
  const wake=new Mesh(wakeGeometry,wakeMaterial);wake.frustumCulled=false;wake.name='swan-local-wake';group.add(wake);
  const trail:{x:number;z:number;time:number;hx:number;hz:number}[]=[];
  let lastTime = NaN, called = -Infinity, gaze = 0;
  return {
    group, swan, insects, wings: bird.wings,
    notice(time: number, eye: Vector3) {
      called = time;
      const dx = eye.x - swan.position.x, dz = eye.z - swan.position.z;
      const yaw = swan.rotation.y;
      const towardX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const towardZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      gaze = MathUtils.clamp(Math.atan2(-towardX, -towardZ), -1.39, 1.39);
    },
    update(life:SwanLife,time:number,dt:number,night:number,sample:SurfaceSampler,padSupport:(i:number)=>PadSupport){
    const p = life.pose;
    const clearanceAboveWater = Math.max(0, p.y - p.waterHeight);
    const afloat = Math.max(0, 1 - clearanceAboveWater / .19);
    if (dt > 0) floating.update(sample(p.x, p.z, time), 0, p.yaw, dt, afloat);
    swan.position.set(p.x, p.y, p.z);
    const swimming = p.mode === 'glide' || p.mode === 'rest' || p.mode === 'turn';
    const elapsed = time - called;
    const attention = swimming ? afloat * MathUtils.smoothstep(elapsed, 0, .34) * (1 - MathUtils.smoothstep(elapsed, .94, 2.48)) : 0;
    swan.rotation.set(p.pitch + floating.pitch.value * afloat + .042 * attention, p.yaw,
      p.roll + floating.roll.value * afloat, 'YXZ');
    const idleGlance = swimming ? Math.sin(time * .81) * (p.mode === 'rest' ? .31 : .127) + (p.swimTurn ?? 0) * .26 : 0;
    const headTurn = MathUtils.lerp(idleGlance, gaze, attention) * (1 - p.reach);
    bird.pose(p, time, headTurn, attention);
    insects.forEach((d,i)=>d.update(time,night,padSupport(dragonflyVisits[i].pad)));
    const hx=-Math.sin(p.yaw),hz=-Math.cos(p.yaw);
    if(dt>0&&time!==lastTime){
      if(clearanceAboveWater<.035&&p.speed>.02){
        if(trail.length&&time-trail[0].time>.45)trail.length=0;
        if(!trail.length||time-trail[0].time>.12)trail.unshift({x:p.x-hx*.44*lifeScale,z:p.z-hz*.44*lifeScale,time,hx,hz});
      }
      while(trail.length>32||trail.length&&time-trail[trail.length-1].time>5)trail.pop();
    }
    lastTime=time;wake.visible=trail.length>2;
    if(wake.visible){
      const pos=wakeGeometry.attributes.position,color=wakeGeometry.attributes.color;
      for(let side=0;side<2;side++)for(let n=0;n<32;n++){
        const t=trail[Math.min(n,trail.length-1)],age=time-t.time,sign=side?1:-1;
        const spread=.16*lifeScale+age*.10,fade=Math.max(0,1-age/5)*Math.min(1,n/3),width=.006+age*.002;
        for(let edge=0;edge<2;edge++){
          const offset=sign*(spread+(edge?width:-width)),x=t.x-t.hz*offset,z=t.z+t.hx*offset,i=side*64+n*2+edge;
          pos.setXYZ(i,x,sample(x,z,time).height+.006,z);color.setXYZ(i,fade,fade,fade);
        }
      }
      pos.needsUpdate=color.needsUpdate=true;
    }
  },dispose(){
    bird.dispose();wakeGeometry.dispose();wakeMaterial.dispose();
    const materials=new Set<MeshStandardMaterial>();
    insects.forEach(d=>{
      d.legs.dispose();
      d.root.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m as MeshStandardMaterial));}});
    });materials.forEach(m=>m.dispose());
  }};
}
