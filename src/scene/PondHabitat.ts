import { BufferGeometry, CatmullRomCurve3, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion, Shape, ShapeGeometry, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { animalIsland, habitatPoint, habitatShoreScale, islandHeight, lilyLeafHeight, lilyLeafRadiusFactor, lilyPads } from './habitat-layout';
import { Sculpture, disposeSculpture } from './PondCreatures';
import { FloatSpring, seededRandom, sampleSurface } from './pond-life';
import type { SurfaceSampler } from './PondSurface';
import { LilyPadFloat, orientLilyPad, pondBreeze } from './PondSurface';
import { stoneGeometry, weatherStone } from './stone-geometry';
import { outerShoreDistance } from './shore-layout';
import { pondFloorHeightAt } from './PondTerrain';
import { skyNoiseGLSL } from './PondAtmosphere';
import { islandGround } from './shore-landscape';
import { lotusPatches } from './lotus-layout';
import { addLotusBloom, bloomMaterial } from './lotus-bloom';

function bankGeometry(low:boolean) {
  const vertices:number[]=[animalIsland.x,.30,animalIsland.z],colors:number[]=[],indices:number[]=[];
  const rings=[.25,.53,.71,.89,1.05,1.23,1.35,1.49,1.69,1.88],segments=low?48:64;
  const meadow=new Color('#879670'),peat=new Color('#6e7757'),sand=new Color('#b9a682'),wet=new Color('#7e8272');colors.push(meadow.r,meadow.g,meadow.b);
  rings.forEach((radius,row)=>{
    for(let i=0;i<segments;i++) {
      const a=i/segments*Math.PI*2,submerged=Math.max(0,Math.min(1,(radius-1.23)/.55));
      const r=radius*(.98+(.026+submerged*.025)*Math.sin(a*3+.4)+(.016+submerged*.022)*Math.cos(a*5));
      const profile=1+(habitatShoreScale(a)-1)*(1-submerged);
      const x=animalIsland.x+Math.cos(a)*animalIsland.rx*r*profile,z=animalIsland.z+Math.sin(a)*animalIsland.rz*r*profile;
      // Keep the existing turtle beach, then fan out below water into the bed.
      const y=radius<=1.23?islandHeight(x,z):[-.55,-.86,-1.23,-1.56][row-6]+submerged*.035*Math.sin(a*4+radius*2);vertices.push(x,y,z);
      const blend=(lo:number,hi:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));return t*t*(3-2*t);};
      const boundary=.087*Math.sin(a*3+.6)+.064*Math.cos(a*5)+.022*Math.sin(a*8-1.4);
      const damp = .98 + .068 * Math.sin(a * 2 + .85) + .028 * Math.cos(a * 5 - .47);
      const dx=x-animalIsland.x,dz=z-animalIsland.z;
      const rear=blend(.20,.59,-dz)*(1-blend(.73,.99,r));
      const litter=rear*(.28+.22*Math.sin(dx*11+dz*5))*(.7+.3*Math.cos(dz*18-dx*8));
      const c=meadow.clone().lerp(peat,litter).lerp(sand,blend(.63+boundary,.99+boundary,r))
        .lerp(wet,blend(damp,1.30,r)).multiplyScalar(.97+.052*Math.sin(a*4+radius*3));
      colors.push(c.r,c.g,c.b);
      const k=1+row*segments+i,next=1+row*segments+(i+1)%segments;
      if(row===0)indices.push(0,next,k);else indices.push(k,next-segments,next,k,k-segments,next-segments);
    }
  });
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
const leafPalette = [
  ['#9ead78','#4d745c'], ['#a6ad78','#657e55'], ['#aeb086','#638260'],
].map(([outer, inner]) => [new Color(outer), new Color(inner)]);
const leafEdge = new Color('#8b7a57');
function padGeometry(radius:number, variant:number, segments=64, rings=8) {
  const vertices:number[]=[0,.015,0],indices:number[]=[],colors:number[]=[];
  const [light,dark]=leafPalette[variant%leafPalette.length],c=new Color();
  colors.push(light.r,light.g,light.b);
  for(let row=1;row<=rings;row++)for(let i=0;i<=segments;i++) {
    const t=row/rings,a=.16+i/segments*(Math.PI*2-.32),r=radius*t*lilyLeafRadiusFactor(a);
    vertices.push(Math.sin(a)*r,lilyLeafHeight(t,a),Math.cos(a)*r);
    const sector=(.51+.49*Math.sin(a*3+variant*.74))*(.53+.47*Math.cos(a*8-variant));
    c.copy(dark).lerp(light,.32+.31*(1-t)+.10*Math.sin(a*2+variant));
    c.lerp(leafEdge,t**9*sector*.26).multiplyScalar(.94+.06*Math.sin(a*7+t*5+variant));
    colors.push(c.r,c.g,c.b);
    if(i<segments){const k=1+(row-1)*(segments+1)+i;
      if(row===1)indices.push(0,k,k+1);else{const previous=k-segments-1;indices.push(previous,k,previous+1,previous+1,k,k+1);}
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function padMaterial() {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .68, side: DoubleSide });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 leafPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      leafPoint = position.xz;
      #ifdef USE_INSTANCING
        leafPoint *= length(instanceMatrix[0].xyz);
      #endif
    `);
    shader.fragmentShader = skyNoiseGLSL + 'varying vec2 leafPoint;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float radius = length(leafPoint);
      float angle = atan(leafPoint.x, leafPoint.y + .00001);
      float sector = angle * (8.0 / 6.28318) + radius * .23 * sin(angle * 3.0);
      float radialDistance = abs(fract(sector + .5) - .5) * radius;
      float base = smoothstep(.018, .058, radius);
      float ridge = (1.0 - smoothstep(.002, .013, radialDistance)) * base;
      float branch = abs(fract(sector * 2.0 + radius * 2.9 + .5) - .5) * radius;
      float sideRib = (1.0 - smoothstep(.001, .005, branch)) * base * smoothstep(.09,.22,radius);
      float bands = noise(leafPoint * 21.0);
      float grain = noise(leafPoint * 95.0);
      float detail = 1.0 - smoothstep(.010,.038,length(fwidth(leafPoint)));
      diffuseColor.rgb *= 1.0 + bands * .12 + (ridge * .105 + sideRib * .029 + grain * .032) * detail;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor - bands * .10, .56, .78);
    `);
  };
  material.customProgramCacheKey = () => 'pond-floating-leaf';
  return material;
}
function makeStemTube(points: [number,number,number][], length: number, radius: number, segments: number, sides: number) {
  const path = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y * length, z)));
  return new TubeGeometry(path, segments, radius, sides, false);
}

function stemBend(source: TubeGeometry, length: number, output: BufferGeometry = source, start = 0, origin = new Vector3()) {
  const positions = (output.attributes.position as Float32BufferAttribute).setUsage(DynamicDrawUsage);
  const normals = (output.attributes.normal as Float32BufferAttribute).setUsage(DynamicDrawUsage);
  const rest = new Float32Array(source.attributes.position.array), restNormals = new Float32Array(source.attributes.normal.array);
  const standalone = source === output;
  let previousX = 0, previousZ = 0, previousLength = standalone ? length : NaN;
  return (dx: number, dz: number, height: number) => {
    if (dx === previousX && dz === previousZ && height === previousLength) return;
    previousX = dx; previousZ = dz; previousLength = height;
    const stretch = height / length;
    for (let i = start, p = 0; p < rest.length; i++, p += 3) {
      const t = Math.max(0, Math.min(1, rest[p + 1] / length));
      positions.setXYZ(i, rest[p] + t * t * dx + origin.x, rest[p + 1] * stretch + origin.y, rest[p + 2] + t * t * dz + origin.z);
      // Transform the rest normal by the inverse transpose of the bend.
      const slope = t === 0 || t === 1 ? 0 : 2 * t / length;
      const nx = restNormals[p], nz = restNormals[p + 2];
      const ny = (restNormals[p + 1] - (nx * dx + nz * dz) * slope) / stretch;
      const inverse = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      normals.setXYZ(i, nx * inverse, ny * inverse, nz * inverse);
    }
    if (standalone) positions.needsUpdate = normals.needsUpdate = true;
  };
}

function floatingStem(points: [number,number,number][], length: number, radius: number, segments: number, sides: number, material: MeshStandardMaterial) {
  const geometry = makeStemTube(points, length, radius, segments, sides);
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += .08; // Covers the leaf's 4.5 cm drift and heave.
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, bend: stemBend(geometry, length) };
}

const stemEmbedment = .07;
const bedRootAt = (x: number, z: number) => pondFloorHeightAt(x, z) - stemEmbedment;

function driftwood(low: boolean, ground: (x: number, z: number) => number) {
  const shape=new Sculpture(low);
  const bark=new Color('#756753'),ridge=new Color('#94876c'),wet=new Color('#584d3a');
  const endWood=['#74624a','#a69876','#807357','#a09171'].map(hex=>new Color(hex));
  const addPiece=(points: readonly [number, number, number][], r0:number, r1:number) => {
    const curve=new CatmullRomCurve3(points.map(([x,y,z])=>new Vector3(x,y,z)));
    const rows=low?5:8,sides=low?7:9;
    const tube=new TubeGeometry(curve,rows,1,sides,false);
    const source=tube.attributes.position,vertices:number[]=[],colours:number[]=[],faces=Array.from(tube.index!.array);
    const point=new Vector3(),shade=new Color(),centres:Vector3[]=[];
    for(let row=0;row<=rows;row++){
      const t=row/rows,centre=curve.getPointAt(t),tangent=curve.getTangentAt(t),radius=r0+(r1-r0)*t;
      centres.push(centre);
      const embedded=ground(centre.x,centre.z),height=embedded+radius*(.48+.115*Math.sin(t*Math.PI));
      const jagged=(t<.10?1-t*10:0)+(t>.86?(t-.86)/.14:0);
      for(let side=0;side<=sides;side++){
        const angle=side/sides*Math.PI*2;
        const contour=1+.078*Math.sin(angle*5+t*3)+.050*Math.sin(angle*3-t*7);
        point.fromBufferAttribute(source,row*(sides+1)+side).sub(centre).multiplyScalar(radius*contour).add(centre);
        point.y+=height-centre.y;
        point.addScaledVector(tangent,jagged*radius*(.18*Math.sin(angle*3)+.10*Math.cos(angle*7)));
        vertices.push(point.x,point.y,point.z);
        const grain=.50+.26*Math.sin(angle*5+t*3)+.18*Math.sin(angle*11+t*6);
        shade.copy(bark).lerp(ridge,grain).lerp(wet,Math.max(0,Math.min(1,(embedded+.075-point.y)/.12))*.72);
        colours.push(shade.r,shade.g,shade.b);
      }
      centre.y=height;
    }
    for(const row of [0,rows]){
      const start=row*(sides+1),centre=centres[row],axis=curve.getTangentAt(row/rows);
      const direction=row===0?1:-1;
      let previous=start;
      for(const [ring,rad] of [1,.76,.52,.24].entries()){
        const next=vertices.length/3;
        for(let j=0;j<=sides;j++){
          const i=(start+j)*3;
          point.set(vertices[i],vertices[i+1],vertices[i+2]).lerp(centre,1-rad).addScaledVector(axis,ring*.0018*direction);
          vertices.push(point.x,point.y,point.z);const tone=endWood[ring];colours.push(tone.r,tone.g,tone.b);
          if(ring&&j<sides){
            const a=previous+j,b=a+1,c=next+j,d=c+1;
            if(row===0)faces.push(a,b,c,b,d,c);else faces.push(a,c,b,b,c,d);
          }
        }
        previous=next;
      }
      const middle=vertices.length/3;vertices.push(centre.x,centre.y,centre.z);const tone=endWood[3];colours.push(tone.r,tone.g,tone.b);
      for(let i=0;i<sides;i++)if(row===0)faces.push(previous+i,previous+i+1,middle);else faces.push(previous+i,middle,previous+i+1);
    }
    tube.dispose();
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
    geometry.setAttribute('color',new Float32BufferAttribute(colours,3));geometry.setIndex(faces);geometry.computeVertexNormals();
    const normals=geometry.attributes.normal;
    for(let row=0;row<=rows;row++){
      const left=row*(sides+1),right=left+sides;
      point.set(normals.getX(left)+normals.getX(right),normals.getY(left)+normals.getY(right),normals.getZ(left)+normals.getZ(right)).normalize();
      normals.setXYZ(left,point.x,point.y,point.z);normals.setXYZ(right,point.x,point.y,point.z);
    }
    shape.add(geometry,'#857359');
  };
  const onBank=(x:number,z:number):[number,number,number]=>{
    const p=habitatPoint(x,z);return [p.x,ground(p.x,p.z),p.z];
  };
  addPiece([onBank(.45,-.59),onBank(.64,-.49),onBank(.83,-.43),onBank(1.04,-.27)],.091,.048);
  addPiece([onBank(.62,-.51),onBank(.60,-.43),onBank(.50,-.36)],.046,.018);
  return shape.mesh('SanctuaryDriftwood',new MeshStandardMaterial({vertexColors:true,roughness:.94,side:DoubleSide}));
}

function cattails(low: boolean, ground: (x: number, z: number) => number) {
  const plants = new Sculpture(low);
  const pockets = [
    {x: -.63, z: -.59, stems: [[-.046,.010,.41], [.007,-.025,.57], [.083,.036,.49], [.110,-.026,.34]]},
    {x: .34, z: -.60, stems: [[-.056,.027,.34], [.029,.021,.54], [.106,-.045,.45]]},
    {x: .89, z: -.32, stems: [[-.026,.010,.29], [.031,-.062,.36]]},
  ];
  for (const [patch, site] of pockets.entries()) for (const [i, [sx, sz, height]] of site.stems.entries()) {
    const {x,z} = habitatPoint(site.x + sx, site.z + sz);
    const y = ground(x,z) - .018, angle = patch * 2.78 + i * .98;
    const dx = Math.cos(angle), dz = Math.sin(angle), sway = .045 + height * .08;
    plants.line([[x,y,z], [x + dx*sway*.28,y + height*.52,z + dz*sway*.28],
      [x + dx*sway,y + height,z + dz*sway]], .0055 + height*.009, '#78804f', 5);
    if (height >= .39) {
      const tipX = x + dx*sway, tipZ = z + dz*sway;
      plants.oval([tipX,y+height-.036,tipZ], [.019,.059,.017], i % 2 ? '#805d40' : '#6f563d',
        [dz*.19,0,-dx*.19], 8, 5);
      plants.line([[tipX,y+height+.004,tipZ], [tipX+dx*.006,y+height+.037,tipZ+dz*.006]], .0035, '#9a8055', 3);
    }
    for (const direction of [-1, 1]) {
      const bladeAngle = angle + direction * (1.06 + i * .15);
      const leanX = Math.cos(bladeAngle), leanZ = Math.sin(bladeAngle);
      const reach = height * (direction === 1 ? .54 : .34), length = height * (direction === 1 ? .80 : .62);
      // The raised centre carries light through a tapered, bending silhouette.
      const vertices: number[] = [], indices: number[] = [], rows = low ? 4 : 6;
      for (let row = 0; row <= rows; row++) {
        const t = row/rows, sweep = reach * (t * t), w = Math.max(.001, Math.sin(Math.PI * t) ** .72 * .017);
        for (const side of [-1,0,1]) vertices.push(x + leanX*sweep - leanZ*w*side,
          y + length*t - reach*.23*t**3 + (1-Math.abs(side))*w*.34, z + leanZ*sweep + leanX*w*side);
        if (row < rows) { const a = row*3; indices.push(a,a+1,a+3,a+1,a+4,a+3,a+1,a+2,a+4,a+2,a+5,a+4); }
      }
      const blade = new BufferGeometry();
      blade.setAttribute('position', new Float32BufferAttribute(vertices,3));
      blade.setIndex(indices); blade.computeVertexNormals();
      plants.add(blade, direction === 1 ? '#88986b' : '#647d5a');
    }
  }
  return plants.mesh('SanctuaryCattails', new MeshStandardMaterial({vertexColors:true,roughness:.87,side:DoubleSide}));
}

export function makePondHabitat(low=false) {
  const surface=(roughness:number)=>new MeshStandardMaterial({vertexColors:true,roughness,side:DoubleSide});
  const group=new Group();group.name='AnimalSanctuary';
  const bank=new Mesh(bankGeometry(low),surface(.91));bank.name='AnimalIsland';bank.castShadow=bank.receiveShadow=true;group.add(bank);
  const ground=islandGround(bank), rocks=new Sculpture(low),random=seededRandom(684);
  // Asymmetric little groups leave a clear south-west beach for the turtles.
  for(const [index,[ox,oz,s]] of [[.76,-.62,.32],[1.03,-.43,.22],[.53,-.77,.23],[-1.00,-.12,.27],[-1.08,.16,.17]].entries()) {
    const x=animalIsland.x+ox,z=animalIsland.z+oz,y=ground(x,z);
    const g=stoneGeometry(index);
    const positions=g.attributes.position;
    // Ground the stones into the sloping bank. A dark buried foot gives the
    // pale upper facets the same sediment contact as the neighboring sand.
    const colors=g.attributes.color;
    for(let i=0;i<colors.count;i++) {
      const tint=.69+.31*Math.max(0,Math.min(1,(positions.getY(i)+.42)/.74));
      colors.setXYZ(i,colors.getX(i)*tint,colors.getY(i)*tint*.97,colors.getZ(i)*tint*.92);
    }
    rocks.add(g,'#c2bda5',[x,y-s*.06,z],[s,s*(index%2?.52:.68),s*.78],[.1,random()*3,.1]);
  }
  group.add(rocks.mesh('SanctuaryStones',weatherStone(surface(.89))));
  group.add(driftwood(low,ground),cattails(low,ground));
  const stemMaterial=new MeshStandardMaterial({color:'#71844e',roughness:.86,side:DoubleSide});
  const stems=lilyPads.map((pad,i)=>{
    const rootY=bedRootAt(pad.x+.09,pad.z-.08);
    const stem=floatingStem([[.09,0,-.08],[-.025,.58,.025],[0,1,0]],.04-rootY,.008,low?4:7,low?3:4,stemMaterial);
    stem.mesh.name='LilyStem-'+i;
    stem.mesh.position.set(pad.x,rootY,pad.z);group.add(stem.mesh);return stem;
  });
  const padMotion=lilyPads.map(p=>new LilyPadFloat(p.x,p.z));
  let surfaceTime=0;
  const updateSurface=(time:number,frogPad:number,sample:SurfaceSampler)=>{
    if(time===surfaceTime)return;
    const dt=Math.max(0,Math.min(.08,time-surfaceTime));surfaceTime=time;
    padMotion.forEach((motion,i)=>{const p=lilyPads[i];motion.update(sample(p.x,p.z,time),pondBreeze(p.x,p.z,time),dt,frogPad===i);});
  };
  const leafMaterial = padMaterial();
  const pads=lilyPads.map((pad,i)=>{
    const root=new Group();root.name='LilyPad-'+i;root.position.set(pad.x,.025,pad.z);root.rotation.y=pad.angle;
    const leaf=new Mesh(padGeometry(pad.radius,i),leafMaterial);
    leaf.name='NotchedLeaf';leaf.castShadow=leaf.receiveShadow=true;
    leaf.userData.pondPadIndex = i;
    root.add(leaf);group.add(root);return root;
  });
  const flowers:Group[]=[];
  const flowerMaterial=bloomMaterial();
  for(const [index,padIndex] of [0,2,4].entries()) {
    const pad=lilyPads[padIndex],x=pad.x+.33,z=pad.z-.24,y=bedRootAt(x,z),base=.08-y;
    const root=new Group();root.name='Lotus-'+index;root.position.set(x,y,z);
    const s=new Sculpture(low);s.line([[0,0,0],[-.03,base*.55,.01],[0,base+.112,0]],.011,'#6b8b48',7);
    addLotusBloom(s,{at:[0,base+.105,0],scale:[1.08,1.19,1.02][index],seed:280+index,low});
    root.add(s.mesh('LayeredLotus',flowerMaterial));group.add(root);flowers.push(root);
  }
  const {x:budX,z:budZ}=habitatPoint(1.49,1.18),budY=bedRootAt(budX,budZ),bud=new Sculpture(low);
  bud.line([[0,0,0],[-.02,.12-budY,.03],[.01,.35-budY,.05]],.012,'#6e8b49',6);
  addLotusBloom(bud,{at:[.01,.38-budY,.05],scale:1.04,seed:267,low,bud:true});
  const budRoot=new Group();budRoot.position.set(budX,budY,budZ);
  budRoot.add(bud.mesh('LotusBud',flowerMaterial));group.add(budRoot);flowers.push(budRoot);
  const bends=flowers.map(()=>({x:new FloatSpring(),z:new FloatSpring()}));let lastTime=0;
  return {group,bank,ground,updateSurface,padSupport:(index:number)=>padMotion[index].support,
    tap(index:number,x:number,z:number){ padMotion[index]?.tap(x,z); },
    update(time:number,frogPad=-1,sample:SurfaceSampler=sampleSurface){
    updateSurface(time,frogPad,sample);
    pads.forEach((root,i)=>{
      const p=lilyPads[i],support=padMotion[i].support;
      root.position.set(support.x,support.height-.015,support.z);
      orientLilyPad(root.rotation,p.angle,support);
      stems[i].bend(support.x-p.x,support.z-p.z,support.height-stems[i].mesh.position.y);
    });
    const dt=Math.max(0,Math.min(.08,time-lastTime)),steps=Math.max(1,Math.ceil(dt*60));lastTime=time;
    flowers.forEach((root,i)=>{
      const wave=sample(root.position.x,root.position.z,time),wind=pondBreeze(root.position.x,root.position.z,time),bend=bends[i];
      for(let n=0;n<steps;n++){
        bend.x.update(Math.max(-.06,Math.min(.06,-wave.dz*.45+wind.z*.018)),dt/steps);
        bend.z.update(Math.max(-.06,Math.min(.06,wave.dx*.45-wind.x*.018)),dt/steps);
      }
      root.rotation.x=bend.x.value;root.rotation.z=bend.z.value;
    });
  },dispose(){disposeSculpture(group);}};
}

/** Decorative shore plants reuse the existing lotus surfaces without adding frog
 * landing indices or changing the established sanctuary's motion contract. */
export function makeShoreLotus(heightAt:(x:number,z:number)=>number=pondFloorHeightAt, low=false) {
  const group=new Group();group.name='ShoreLotus';
  const leafMaterial=padMaterial(),stemMaterial=new MeshStandardMaterial({color:'#71844e',roughness:.88,side:DoubleSide});
  const flowerMaterial=bloomMaterial();
  const counts=[0,0,0];
  lotusPatches.forEach((patch,j)=>patch.leaves.forEach((_,i)=>counts[(i+j)%3]++));
  const batches=counts.map((count,i)=>{
    const mesh=new InstancedMesh(padGeometry(1,i,low?28:48,low?5:7),leafMaterial,count);
    mesh.name='ShoreLotusLeaves-'+i;mesh.castShadow=mesh.receiveShadow=true;
    mesh.userData.pondShoreLeaves = true;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);group.add(mesh);
    return {mesh,used:0};
  });
  const pads:{mesh:InstancedMesh;slot:number;motion:LilyPadFloat;x:number;z:number;root:number;angle:number;radius:number}[]=[];
  const tubes:TubeGeometry[]=[];
  const contacts:{x:number;z:number;root:number;radius:number}[]=[];
  for(const [index,patch] of lotusPatches.entries()) {
    for(const [i,[dx,dz,radius,angle]] of patch.leaves.entries()) {
      const x=patch.x+dx,z=patch.z+dz,bedY=heightAt(x,z),root=bedY-stemEmbedment;
      if(outerShoreDistance(x,z)>-radius-.08||bedY>-.035)throw new Error('Lotus needs an entirely submerged shore patch');
      const batch=batches[(index+i)%3];
      tubes.push(makeStemTube([[0,0,0],[.018,.5,-.018],[0,1,0]],.04-root,.006,low?4:5,low?3:4));
      pads.push({mesh:batch.mesh,slot:batch.used++,motion:new LilyPadFloat(x,z),x,z,root,angle,radius});
      contacts.push({x,z,root,radius});
    }
    const flowers=new Sculpture(low);
    for(const [j,[dx,dz,y,scale,form,tint]] of patch.flowers.entries()){
      const x=patch.x+dx,z=patch.z+dz,root=heightAt(x,z)-stemEmbedment;
      const bloomScale=scale*(form==='bud' ? .86 : .73), base=y-.093*bloomScale;
      flowers.line([[x,root,z],[x-.025,.10,z],[x,base+.008,z]],.009*scale,'#71884b',6);
      addLotusBloom(flowers,{at:[x,base,z],scale:bloomScale,seed:421+index*17+j*109,low,pale:tint==='pale',bud:form==='bud'});
    }
    group.add(flowers.mesh('ShoreLotusFlowers-'+index,flowerMaterial));
  }
  const stemGeometry = mergeGeometries(tubes)!;
  const stems = new Mesh(stemGeometry, stemMaterial);
  stems.name = 'ShoreLotusStems'; stems.castShadow = stems.receiveShadow = true;
  group.add(stems);
  let stemOffset = 0;
  const bendStems = pads.map(({ x, z, root }, i) => {
    const tube = tubes[i];
    const bend = stemBend(tube, .04 - root, stemGeometry, stemOffset, new Vector3(x, root, z));
    stemOffset += tube.attributes.position.count;
    tube.dispose();
    return bend;
  });
  group.userData.contacts=contacts;
  const placement=new Object3D();
  let previous=0;
  const update=(time:number,sample:SurfaceSampler=sampleSurface)=>{
    const dt=Math.max(0,Math.min(.08,time-previous));previous=time;
    for(let i=0;i<pads.length;i++) {
      const p=pads[i];
      p.motion.update(sample(p.x,p.z,time),pondBreeze(p.x,p.z,time),dt,false);
      const support=p.motion.support;
      placement.position.set(support.x,support.height-.015,support.z);
      orientLilyPad(placement.rotation,p.angle,support);
      placement.scale.set(p.radius,1,p.radius);placement.updateMatrix();
      p.mesh.setMatrixAt(p.slot,placement.matrix);
      bendStems[i](support.x-p.x,support.z-p.z,support.height-p.root);
    }
    stemGeometry.attributes.position.needsUpdate = stemGeometry.attributes.normal.needsUpdate = true;
    for(const {mesh} of batches)mesh.instanceMatrix.needsUpdate=true;
  };
  update(0);
  stemGeometry.computeBoundingSphere();stemGeometry.boundingSphere!.radius+=.10;
  for(const {mesh} of batches){mesh.computeBoundingSphere();mesh.boundingSphere!.radius+=.10;}
  return {group,update,
    tap(mesh: Object3D, slot: number, x: number, z: number) {
      pads.find(pad => pad.mesh === mesh && pad.slot === slot)?.motion.tap(x,z);
    },
    dispose(){disposeSculpture(group);}};
}

export function makePairHearts() {
  const shape=new Shape();shape.moveTo(0,-.08);shape.bezierCurveTo(-.22,.05,-.14,.22,0,.12);shape.bezierCurveTo(.14,.22,.22,.05,0,-.08);
  const geometry=new ShapeGeometry(shape,8),group=new Group();group.name='PairAffection';
  const hearts=Array.from({length:4},()=>{const material=new MeshBasicMaterial({color:'#ed9d9e',transparent:true,depthWrite:false,side:DoubleSide});const mesh=new Mesh(geometry,material);mesh.visible=false;group.add(mesh);return mesh;});
  return {group,update(events:{x:number;z:number;born:number;seed:number}[],time:number,cameraRotation:Quaternion){hearts.forEach((mesh,i)=>{const e=events[events.length-1-Math.floor(i/2)],age=e?time-e.born-i%2*.38:-1;mesh.visible=age>=0&&age<2.7;if(!mesh.visible)return;mesh.position.set(e.x+Math.sin(age*1.5+e.seed)*.08+(i%2-.5)*.13,.13+age*.29,e.z);mesh.quaternion.copy(cameraRotation);mesh.scale.setScalar((i%2?.55:.77)*Math.min(1,age*4));mesh.material.opacity=Math.sin(age/2.7*Math.PI)*.72;});},dispose(){geometry.dispose();hearts.forEach(m=>m.material.dispose());}};
}
