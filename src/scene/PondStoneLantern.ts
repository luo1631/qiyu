import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group, LatheGeometry,
  MeshStandardMaterial, PointLight, Vector2 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sculpture } from './PondCreatures';
import { weatherStone } from './stone-geometry';

type Point = [number, number, number];
type Course = readonly [height: number, radius: number, cornerRise?: number];
const facets = 6;
const granite = new Color('#a6a998'), dark = new Color('#65776d'), sun = new Color('#c5bbaa');
const rim = [.02,.12,.50,.88,.98];

function stoneCourses(profile: readonly Course[], phase: number, tint: number) {
  const count = facets * rim.length;
  const positions: number[] = [], colors: number[] = [], faces: number[] = [];
  const pigment = new Color();
  for (const [row,[y,radius,rise=0]] of profile.entries()) {
    for (let f = 0; f < facets; f++) {
      const a = f * Math.PI/3 + phase, b = a + Math.PI/3;
      for (const [column,t] of rim.entries()) {
        const x = Math.cos(a)*(1-t)+Math.cos(b)*t, z = Math.sin(a)*(1-t)+Math.sin(b)*t;
        const corner = Math.abs(t * 2 - 1);
        const nick = .0034 * Math.sin(f * 13.4 + row * .65 + t * 4.1);
        positions.push(x*(radius+nick), y + rise*corner**3 + nick*.48,z*(radius+nick));
        pigment.copy(dark).lerp(granite,tint).lerp(sun,.21+.14*Math.cos(f*1.83+phase));
        pigment.multiplyScalar(.96 + .065 * Math.sin(row*1.2+f*.49) + .113 * (row/profile.length));
        colors.push(pigment.r,pigment.g,pigment.b);
        if (row === profile.length-1) continue;
        const i = f*rim.length + column, p = row*count+i, q = row*count + (i+1)%count;
        faces.push(p,p+count,q, q,p+count,q+count);
      }
    }
  }
  const top = (profile.length-1)*count;
  for (let i = 1; i < count-1; i++) faces.push(0,i,i+1,top,top+i+1,top+i);
  const shape = new BufferGeometry();
  shape.setAttribute('position',new Float32BufferAttribute(positions,3));
  shape.setAttribute('color',new Float32BufferAttribute(colors,3));
  shape.setIndex(faces); shape.computeVertexNormals();
  return shape;
}

function carvedLamp(x: number, z: number, y: number, scale: number, short: boolean) {
  const root = new Group(), stone = new Sculpture(), core = new Sculpture();
  root.position.set(x,y,z); root.scale.setScalar(scale);
  root.rotation.y = short ? -.28 : .09;
  const turn = Math.PI / 6;
  function course(profile: readonly Course[], tint: number) { stone.add(stoneCourses(profile,turn,tint),'#ffffff'); }

  const firebox = short ? .318 : .612;
  if (short) {
    for (let i = 0; i < 3; i++) {
      const a = i*Math.PI*2/3+.27, dx = Math.cos(a), dz = Math.sin(a);
      stone.line([[dx*.157,.005,dz*.157],[dx*.155,.100,dz*.155],[dx*.107,.191,dz*.107],[dx*.046,.247,dz*.046]],.043,'#9aab9e',10);
    }
    course([[.224,.118],[.237,.162],[.258,.207],[.284,.223],[.309,.218]],.60);
  } else {
    course([[-.054,.275],[-.010,.280],[.029,.270],[.052,.245],[.063,.243],[.072,.225]],.65);
    course([[.064,.230],[.089,.216],[.111,.158],[.148,.130],[.163,.102]],.76);
    course([[.153,.100],[.176,.111],[.194,.102],[.230,.087],[.324,.081],[.407,.072],[.480,.085],[.502,.093]],.71);
    course([[.480,.084],[.509,.093],[.540,.122],[.574,.209],[.596,.226],[.617,.222]],.69);
  }
  course([[firebox-.005,.217],[firebox+.018,.205],[firebox+.030,.174]],.77);
  for (let i = 0; i < facets; i++) {
    const a = i*Math.PI/3 + turn, p:Point = [Math.cos(a)*.148,firebox+.119,Math.sin(a)*.148];
    stone.add(new RoundedBoxGeometry(.042,.198,.049,2,.007),'#aab09b',p,[1,1,1],[0,-a,0]);
    stone.add(new CylinderGeometry(.033,.038,.022,6),'#8c9582',[p[0],firebox+.045,p[2]]);
    stone.add(new CylinderGeometry(.039,.034,.022,6),'#b5b8a4',[p[0],firebox+.209,p[2]]);
  }
  const roof = firebox+.222;
  course([[roof-.021,.192],[roof,.234,.006],[roof+.018,.262,.028],[roof+.035,.269,.034],
    [roof+.049,.249,.032],[roof+.056,.220,.024],[roof+.077,.163,.014],[roof+.116,.112,.004],
    [roof+.154,.072],[roof+.166,.050]],.51);
  course([[roof+.158,.059],[roof+.183,.067],[roof+.201,.049],[roof+.216,.041],[roof+.237,.043],
    [roof+.267,.026],[roof+.280,.006]],.67);

  stone.add(new CylinderGeometry(.073,.069,.018,10),'#625349',[0,firebox+.039,0]);
  core.add(new LatheGeometry([
    [0,0],[.020,0],[.047,.014],[.049,.041],[.044,.071],[.030,.109],[.009,.123],[0,.124],
  ].map(([r,y])=>new Vector2(r,y)),16),'#ffe4b0',[0,firebox+.043,0],[1,1,1],[.04,.0,-.11]);
  return {root,stone,core,lightAt:firebox+.122};
}

export function makePondStoneLanterns(ground: (x:number,z:number)=>number) {
  const group = new Group();
  group.name = 'StoneLanterns';
  const reference = ground(0,0), lights: PointLight[] = [];
  const rock = weatherStone(new MeshStandardMaterial({vertexColors:true,roughness:.97}));
  const paper = new MeshStandardMaterial({vertexColors:true,color:'#9c8260',emissive:'#ffab52',roughness:.72});
  for (const {x,z,s,short} of [{x:0,z:0,s:1,short:false},{x:.48,z:-.32,s:.83,short:true}]) {
    const lamp=carvedLamp(x,z,ground(x,z)-reference,s,short);
    const flame=lamp.core.mesh('StoneLampPaper',paper);
    flame.castShadow=false;
    lamp.root.add(lamp.stone.mesh('CarvedStone',rock),flame);
    const light=new PointLight('#ffc474',0,2.1*s,2);
    light.position.set(0,lamp.lightAt,.050);
    lamp.root.add(light); lights.push(light); group.add(lamp.root);
  }
  return { group, update(amount:number,time:number) {
    const flicker=.95+.035*Math.sin(time*5.1)+.015*Math.sin(time*13.2);
    paper.emissiveIntensity=amount*2.42*flicker;
    paper.color.setRGB(.27+amount*.37,.22+amount*.34,.13+amount*.26);
    lights.forEach((light,i)=>{light.intensity=amount*flicker*(i===0?.78:.36);});
  } };
}
