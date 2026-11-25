import {
  BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, LatheGeometry,
  MathUtils, MeshStandardMaterial, PointLight, Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sculpture } from './PondCreatures';
import { weatherStone } from './stone-geometry';
import { worldMaterial } from './world-material';

type Point = [number,number,number];
const roofRim = 1.205;
const hex = Array.from({ length: 6 }, (_, i) => new Vector2(Math.cos(i*Math.PI/3),Math.sin(i*Math.PI/3)));
const stoneTones = ['#9b9e90','#bdbaab','#aca990'];
const tileTones = ['#526b6b','#597574','#446363','#647d77','#4b6868','#587371','#5e7272'];
const between = MathUtils.lerp;

function roofPoint(side: number, u: number, t: number, lift = 0): Point {
  const a = hex[side], b = hex[(side+1)%6];
  const radius = roofRim*(.10+.90*(1-t));
  const corner = .198*Math.abs(2*u-1)**3*(1-t)**2.75;
  return [between(a.x,b.x,u)*radius,1.278+.741*t**1.64+corner+lift,between(a.y,b.y,u)*radius];
}

function roofSurface(columns: number, rows: number, point: (u:number,v:number)=>Point) {
  const positions: number[] = [], faces: number[] = [];
  const stride = columns+1;
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    positions.push(...point(col/columns,row/rows));
    if (row === rows || col === columns) continue;
    const a = row*stride+col, b = a+stride;
    faces.push(a,b,a+1,a+1,b,b+1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

function makeRoof() {
  const tiles = new Sculpture(), rafters = new Sculpture();
  for (let side = 0; side < 6; side++) {
    tiles.add(roofSurface(15,9,(u,v)=>roofPoint(side,u,v,-.006)),'#3d5657');
    rafters.add(roofSurface(12,9,(u,v)=>roofPoint(side,u,v,-.063)),'#725643');
    for (let c = 0; c < 8; c++) for (let j = 0; j < 12; j++) {
      const left = (j+.042)/12, right = (j+.958)/12;
      const low = (c+.065)/8*.978, high = (c+.967)/8*.978;
      const color = tileTones[(side*5+c*2+(j+1)*(c+4)+Math.floor(j*.6))%tileTones.length];
      tiles.add(roofSurface(4,2,(u,v)=>roofPoint(side,between(left,right,u),between(low,high,v),
        .010+.030*Math.sin(Math.PI*u)**.78+.015*(1-v)**2)), color);
      if (c === 0) {
        const [x,y,z] = roofPoint(side,(left+right)*.5,.005);
        tiles.add(new CylinderGeometry(.028,.026,.022,8),color,[x,y+.018,z],[1,1,1],
          [Math.PI/2,0,-(side+.5)*Math.PI/3]);
      }
    }
    rafters.line(Array.from({length:15},(_,i)=>roofPoint(side,i/14,0,-.039)),.037,'#745744',15);
    tiles.line(Array.from({length:15},(_,i)=>roofPoint(side,i/14,0,.011)),.022,'#51696b',17);
    tiles.line(Array.from({length:13},(_,i)=>roofPoint(side,0,i/12,.027)),.027,'#415c5b',16);
    const [x,y,z] = roofPoint(side,0,0);
    tiles.line([[x*.951,y-.035,z*.951],[x,y+.027,z],[x*1.025,y+.091,z*1.025]],.025,'#547375',7);
  }
  for (const [top,bottom,height,y,tint] of [
    [.072,.125,.061,2.021,'#476563'],[.067,.073,.071,2.079,'#70857b'],[.022,.075,.111,2.172,'#527271'],
  ] as const) tiles.add(new CylinderGeometry(top,bottom,height,12),tint,[0,y,0]);
  tiles.oval([0,2.246,0],[.034,.034,.034],'#91a193',undefined,10,5);
  const glaze = new MeshStandardMaterial({vertexColors:true,roughness:.68,metalness:.055,side:DoubleSide});
  return [tiles.mesh('PavilionGlazedRoof',glaze),rafters.mesh('PavilionUnderEaves')];
}

function makePavilionLantern() {
  const pivot = new Group(), frame = new Sculpture(), paper = new Sculpture();
  pivot.name = 'PavilionLantern';
  pivot.position.set(.26,1.246,.46);
  frame.line([[0,0,0],[0,-.085,0]],.007,'#6b5548',2);
  frame.add(new CylinderGeometry(.046,.071,.026,8),'#715643',[0,-.094,0]);
  frame.add(new CylinderGeometry(.070,.052,.024,8),'#876044',[0,-.228,0]);
  frame.line([[0,-.236,0],[0,-.306,0]],.005,'#9b6d59',2);
  frame.oval([0,-.316,0],[.019,.025,.019],'#915f48',undefined,8,5);
  for (let i = 0; i < 8; i++) {
    const t = i*Math.PI/4;
    frame.line([[Math.sin(t)*.061,-.102,Math.cos(t)*.061],
      [Math.sin(t)*.083,-.162,Math.cos(t)*.083],[Math.sin(t)*.065,-.219,Math.cos(t)*.065]],.004,'#af7b50',6);
  }
  const outline = [[.066,-.222],[.074,-.21],[.081,-.165],[.074,-.121],[.061,-.101]];
  paper.add(new LatheGeometry(outline.map(([r,y])=>new Vector2(r,y)),8),'#e4c295');
  const silk = new MeshStandardMaterial({vertexColors:true,roughness:.88,emissive:'#ffc18a',emissiveIntensity:.035,side:DoubleSide});
  const light = new PointLight('#ffc990',0,2.95,2);
  light.position.set(0,-.175,.044);
  pivot.add(frame.mesh('LanternCedarRibs'),paper.mesh('LanternAmberPaper',silk),light);
  return { pivot, update(time: number, power: number, wind: number) {
    const warmth = Math.min(1,power/3.5);
    const flicker = .95+.035*Math.sin(time*3.9)+.015*Math.sin(time*11.8);
    light.intensity = warmth*flicker*1.34;
    silk.emissiveIntensity = .05+warmth*flicker*1.48;
    pivot.rotation.set(Math.cos(time*1.36)*.026,0,Math.sin(time*1.58)*(.032+wind*.062));
  } };
}

export function makePondPavilion() {
  const group = new Group(), plinth = new Sculpture(), pillars = new Sculpture(), rails = new Sculpture(), ceramics = new Sculpture();
  group.name = 'PeachPavilion';
  for (const [index, [top,bottom,height,y]] of [
    [.956,.997,.14,.004],[.972,.946,.056,.096],[.947,.975,.087,.156],[.905,.941,.030,.212],
  ].entries()) {
    plinth.add(new CylinderGeometry(top,bottom,height,6),stoneTones[index%3],[0,y,0],[1,1,1],[0,Math.PI/6,0]);
  }
  for(const [index,[z,h,y,w]] of [[1.228,.083,-.009,.81],[1.073,.097,.041,.77],[.934,.112,.101,.73]].entries()) {
    plinth.add(new RoundedBoxGeometry(w,h,.245,2,.014),stoneTones[index],[0,y,z],[1,1,1],[0,.014*(1-index),0]);
  }
  for (const corner of hex) {
    const x = corner.x*.772, z = corner.y*.772;
    plinth.add(new CylinderGeometry(.078,.089,.055,8),'#a4a495',[x,.249,z]);
    pillars.add(new CylinderGeometry(.043,.057,1.018,12),'#89624c',[x,.778,z]);
    for(const y of [.301,1.227]) {
      pillars.add(new CylinderGeometry(.066,.063,.041,10),'#6e5948',[x,y,z]);
    }
    pillars.add(new RoundedBoxGeometry(.133,.061,.126,2,.010),'#856851',[x,1.296,z],[1,1,1],[0,-Math.atan2(z,x),0]);
  }
  for (let i = 0; i < 6; i++) {
    const a = hex[i], b = hex[(i+1)%6];
    const x = (a.x+b.x)*.386, z = (a.y+b.y)*.386;
    const angle = -Math.atan2(b.y-a.y,b.x-a.x);
    rails.add(new RoundedBoxGeometry(.868,.091,.105,2,.009),'#74513e',[x,1.241,z],[1,1,1],[0,angle,0]);
    for (const q of [.16,.32,.50,.68,.84]) {
      const p = new Vector2().lerpVectors(a,b,q);
      rails.line([[p.x*.734,1.19,p.y*.734],[p.x*.865,1.25,p.y*.865],[p.x*1.10,1.264,p.y*1.10]],.017,
        q===.50?'#a07b5c':'#86664f',4);
    }
    if (i < 2 || i === 5) continue;
    rails.add(new RoundedBoxGeometry(.661,.048,.198,2,.009),'#a48061',[x*.88,.411,z*.88],[1,1,1],[0,angle,0]);
    rails.add(new BoxGeometry(.638,.057,.059),'#76563e',[x,.578,z],[1,1,1],[0,angle,0]);
    for(const t of [.16,.36,.64,.84]) {
      const p = new Vector2().lerpVectors(a,b,t);
      rails.add(new BoxGeometry(.025,.281,.035),'#8b684e',[p.x*.752,.398,p.y*.752],[1,1,1],[0,angle,0]);
    }
  }
  rails.add(new CylinderGeometry(.063,.091,.204,8),'#836349',[-.02,.321,-.249]);
  rails.add(new CylinderGeometry(.193,.179,.037,10),'#a48060',[-.02,.437,-.249]);
  const pot = [[0,0],[.051,0],[.064,.015],[.064,.045],[.050,.067],[.028,.075],[0,.075]];
  ceramics.add(new LatheGeometry(pot.map(([x,y])=>new Vector2(x,y)),16),'#80a39a',[-.054,.456,-.278]);
  ceramics.oval([-.054,.533,-.278],[.017,.013,.016],'#abc6b8',undefined,8,4);
  ceramics.line([[-.005,.469,-.257],[.035,.492,-.248],[.046,.522,-.245]],.013,'#91b3ab',6);
  ceramics.line([[-.095,.468,-.302],[-.132,.498,-.313],[-.117,.521,-.302],[-.088,.516,-.291]],.008,'#7d9e95',7);
  for(const [x,z] of [[.08,-.178],[-.104,-.149]]) {
    ceramics.add(new CylinderGeometry(.031,.023,.034,10),'#c7cebb',[x,.477,z]);
    ceramics.add(new CylinderGeometry(.024,.022,.004,10),'#7d6a45',[x,.496,z]);
  }
  const timber = (name: string) => worldMaterial(new MeshStandardMaterial({name,vertexColors:true,roughness:.83})) as MeshStandardMaterial;
  const lantern = makePavilionLantern();
  group.add(plinth.mesh('PavilionStoneSteps',weatherStone(new MeshStandardMaterial({vertexColors:true,roughness:.94}))),
    pillars.mesh('PavilionCedarPosts',timber('PavilionTimber')),rails.mesh('PavilionJoinery',timber('Wood')),
    ceramics.mesh('PavilionTeaSet',new MeshStandardMaterial({vertexColors:true,roughness:.53})),...makeRoof(),lantern.pivot);
  return { group, update: lantern.update };
}
