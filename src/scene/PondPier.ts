import { BoxGeometry, BufferGeometry, CylinderGeometry, DynamicDrawUsage, Float32BufferAttribute, Group, Line, LineBasicMaterial, MeshStandardMaterial, PointLight } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { disposeSculpture, Sculpture } from './PondCreatures';
import { worldMaterial } from './world-material';
import { outerBankHeight } from './shore-layout';
import type { SurfaceSampler } from './PondSurface';
import { pierPoint, westPier } from './pier-layout';

type Position = [number, number, number];

export function makeWestPier(low: boolean, heightAt: (x:number,z:number)=>number) {
  const {length,width,headWidth,deck,dx,dz}=westPier;
  const group=new Group();group.name='WestFishingPier';
  const wood=new Sculpture(low),iron=new Sculpture(low),rod=new Sculpture(low);
  const rotation:Position=[0,-Math.atan2(dz,dx),0];
  const p=(along:number,across:number,y:number):Position=>{const {x,z}=pierPoint(along,across);return [x,y,z];};
  const plank=(along:number,across:number,y:number,dimensions:Position,tint:string)=>{
    const [x,h,z]=dimensions;
    const mesh=low?new BoxGeometry(x,h,z):new RoundedBoxGeometry(x,h,z,1,.009);
    wood.add(mesh,tint,p(along,across,y),[1,1,1],rotation);
  };
  const tints=['#9d7c55','#a6885f','#907451','#b09266','#a1845c'];
  const boardCount=Math.ceil(length/.196),pitch=length/boardCount;
  for(let n=0;n<boardCount;n++){
    const along=(n+.5)*pitch,w=along>length-.91?headWidth:width;
    plank(along,Math.sin(n*2.3)*.012,deck-.040,[pitch-.009,.081,w],tints[(n*7)%tints.length]);
  }
  for(const side of [-1,1])plank(length*.5,side*.344,deck-.133,[length-.04,.125,.111],'#796045');
  for(const along of [.43,length*.36,length*.63,length-.30]){
    plank(along,0,deck-.176,[.154,.11,1.04],'#80654a');
    for(const side of [-1,1]){
      const across=side*.405,{x,z}=pierPoint(along,across);
      const bottom=Math.max(outerBankHeight(x,z),heightAt(x,z))-.16,top=deck+.092;
      plank(along,across,(top+bottom)*.5,[.128,top-bottom,.133],'#74593d');
      plank(along,across,top,[.153,.041,.156],'#a88659');
      if(along>1.1)wood.line([p(along,across,deck-.39),p(along-.43,across,deck-.145)],.032,'#826749',2);
    }
  }
  const ramp=pierPoint(-.31,0),step=Math.max(.235,outerBankHeight(ramp.x,ramp.z)+.052);
  plank(-.255,0,step-.038,[.53,.077,.91],'#977b54');
  const woodMaterial=worldMaterial(new MeshStandardMaterial({name:'LandingWood',vertexColors:true,roughness:.8})) as MeshStandardMaterial;
  group.add(wood.mesh('WestPierTimber',woodMaterial));

  const lampAlong=length-.29,lampAcross=.432;
  const cylinder=(top:number,bottom:number,height:number,y:number,sides:number,tint:string)=>{
    iron.add(new CylinderGeometry(top,bottom,height,sides),tint,p(lampAlong,lampAcross,y),[1,1,1],[0,Math.PI/4,0]);
  };
  cylinder(.049,.065,.092,deck+.041,8,'#4c4a36');
  cylinder(.032,.045,.44,deck+.276,8,'#51503b');
  const glowY=deck+.63;
  cylinder(.128,.095,.064,glowY-.114,4,'#4d4b39');
  cylinder(.035,.137,.106,glowY+.145,4,'#535341');
  for(const u of [-1,1])for(const v of [-1,1])iron.line([
    p(lampAlong+u*.074,lampAcross+v*.074,glowY-.101),p(lampAlong+u*.086,lampAcross+v*.086,glowY+.101),
  ],.008,'#494b37',2);
  iron.oval(p(lampAlong,lampAcross,glowY+.209),[.021,.027,.021],'#777052',undefined,8,5);
  const glass=new MeshStandardMaterial({color:'#b6a17b',roughness:.52,emissive:'#ffb66b',emissiveIntensity:.02});
  const glow=new Sculpture(low);
  glow.add(new CylinderGeometry(.115,.097,.196,4),'#d3b991',p(lampAlong,lampAcross,glowY),[1,1,1],[0,Math.PI/4,0]);
  group.add(glow.mesh('WestPierLanternGlass',glass));
  const lamp=new PointLight('#ffcc91',0,2.2,2);lamp.name='WestPierLanternLight';
  lamp.position.set(...p(lampAlong,lampAcross,glowY+.023));group.add(lamp);

  const butt=p(length-.53,-.38,deck+.15),hook=p(length+.72,-.38,deck+.59);
  const middle=p(length-.05,-.38,deck+.43),eye=p(length+.42,-.38,deck+.56);
  rod.line([butt,middle,eye],.011,'#746748',low?5:8);
  rod.line([middle,eye,hook],.005,'#586148',low?4:6);
  rod.line([butt,p(length-.31,-.38,deck+.276)],.021,'#533e2a',4);
  iron.line([p(length-.42,-.38,deck-.012),p(length-.42,-.38,deck+.227)],.015,'#57533d',2);
  iron.add(new CylinderGeometry(.043,.043,.049,10),'#8c805d',p(length-.315,-.411,deck+.262),[1,1,1],[Math.PI/2,0,0]);
  iron.oval(p(length-.315,-.447,deck+.261),[.028,.028,.009],'#5f573d',undefined,10,5);
  group.add(iron.mesh('WestPierHardware'),rod.mesh('WestPierFishingRod'));

  const float=new Sculpture(low);
  float.oval([0,-.017,0],[.016,.038,.016],'#a45e43',undefined,9,5);
  float.oval([0,.020,0],[.012,.025,.012],'#d2c499',undefined,9,5);
  const bobber=float.mesh('WestPierFloat');bobber.position.set(hook[0],.016,hook[2]);group.add(bobber);
  const lineGeometry=new BufferGeometry(),linePoints=new Float32BufferAttribute([...hook,...p(length+.72,-.38,deck+.29),hook[0],.035,hook[2]],3);
  linePoints.setUsage(DynamicDrawUsage);lineGeometry.setAttribute('position',linePoints);
  const line=new Line(lineGeometry,new LineBasicMaterial({color:'#70736a',transparent:true,opacity:.68}));
  line.name='WestPierFishingLine';line.frustumCulled=false;group.add(line);
  return {group,update(time:number,windowPower:number,sample:SurfaceSampler){
    lamp.intensity=windowPower*.19;glass.emissiveIntensity=.02+windowPower*.25;
    const surface=sample(hook[0],hook[2],time);
    bobber.position.y=.016+surface.height*.60;
    linePoints.setY(2,bobber.position.y+.019);linePoints.needsUpdate=true;
  },dispose(){disposeSculpture(group);line.geometry.dispose();line.material.dispose();}};
}
