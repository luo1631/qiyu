import { Bone, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Ray, ShaderChunk, ShapeUtils, Skeleton, SkinnedMesh, SphereGeometry, TubeGeometry, Uint16BufferAttribute, Vector2, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FishPose } from './pond-life';
import type { FrogPose, TurtlePose, TadpolePose } from './habitat-life';
import { MotionExpression, frogStroke, turtlePaddle } from './locomotion';
import { lifeScale } from './shore-layout';
import { islandHeight } from './habitat-layout';
import { makeTurtleSteps } from './turtle-steps';

type XYZ = [number, number, number];
/** Small sculpted parts are baked into one coloured surface per articulated part. */
export class Sculpture {
  private parts: BufferGeometry[] = [];
  constructor(private low = false) {}
  add(geometry: BufferGeometry, color: string, at: XYZ = [0,0,0], scale: XYZ = [1,1,1], rotation: XYZ = [0,0,0]) {
    const object = new Object3D(); object.position.set(...at); object.scale.set(...scale); object.rotation.set(...rotation); object.updateMatrix();
    const shape = geometry.index ? geometry.toNonIndexed() : geometry.clone(); geometry.dispose();
    shape.applyMatrix4(object.matrix); shape.deleteAttribute('uv');
    if (!shape.attributes.color) {
      const c = new Color(color), colors = new Float32Array(shape.attributes.position.count * 3);
      for (let i=0;i<colors.length;i+=3) { colors[i]=c.r; colors[i+1]=c.g; colors[i+2]=c.b; }
      shape.setAttribute('color',new Float32BufferAttribute(colors,3));
    }
    if (!shape.attributes.koiSkin) shape.setAttribute('koiSkin',new Float32BufferAttribute(new Float32Array(shape.attributes.position.count),1));
    if (!shape.attributes.koiScaleUv) shape.setAttribute('koiScaleUv',new Float32BufferAttribute(new Float32Array(shape.attributes.position.count*2),2));
    if (!shape.attributes.finFlow) shape.setAttribute('finFlow',new Float32BufferAttribute(new Float32Array(shape.attributes.position.count*4),4));
    this.parts.push(shape); return this;
  }
  oval(at: XYZ, scale: XYZ, color: string, rotation: XYZ = [0,0,0], segments=10, rings=6) {
    return this.add(new SphereGeometry(1,this.low ? Math.min(segments,6) : segments,this.low ? Math.min(rings,3) : rings),color,at,scale,rotation);
  }
  line(points: XYZ[], radius: number, color: string, segments=8) {
    return this.add(new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),this.low ? Math.max(3,Math.ceil(segments*.5)) : segments,radius,this.low?3:4,false),color);
  }
  mesh(name: string, material = new MeshStandardMaterial({vertexColors:true,roughness:.68,side:DoubleSide})) {
    const geometry = mergeGeometries(this.parts); this.parts.forEach(g=>g.dispose());
    if (!geometry) throw new Error('Empty sculpture: '+name);
    const mesh = new Mesh(geometry,material); mesh.name=name; mesh.castShadow=mesh.receiveShadow=true; return mesh;
  }
}

export const koiColors = ['#e7b552','#df5137','#ed8d42','#f0c665','#c84135','#e8a14c','#d75b3e'];
// The head, gill shoulder, lean trunk and caudal peduncle are one continuous
// profile. Coordinates preserve the existing navigation/animation envelope.
const koiProfile = new CatmullRomCurve3([
  new Vector3(.024,.026,-.493),new Vector3(.064,.055,-.455),
  new Vector3(.094,.077,-.37),new Vector3(.121,.099,-.265),
  new Vector3(.125,.106,-.15),new Vector3(.114,.097,-.015),
  new Vector3(.088,.077,.12),new Vector3(.052,.052,.245),
  new Vector3(.024,.036,.345),new Vector3(.016,.041,.405),
],false,'centripetal').getPoints(128);
function koiSection(z:number) {
  for(let i=1;i<koiProfile.length;i++)if(z<=koiProfile[i].z){
    const a=koiProfile[i-1],b=koiProfile[i],t=Math.max(0,Math.min(1,(z-a.z)/(b.z-a.z)));
    const p=a.clone().lerp(b,t);p.x*=.83;p.y*=.83;return p;
  }
  const p=koiProfile[koiProfile.length-1].clone();p.x*=.83;p.y*=.83;return p;
}
function koiPoint(z:number,angle:number,lift=0) {
  const p=koiSection(z),c=Math.cos(angle),s=Math.sin(angle);
  const forehead=.008*Math.exp(-(((z+.36)/.12)**2)),centre=.008*Math.exp(-(((z+.16)/.28)**2));
  const cheek=.004*Math.exp(-(((z+.32)/.037)**2))*(1-Math.abs(s));
  return new Vector3(c*(p.x+lift+cheek),centre+s*(p.y+lift)+forehead*Math.max(0,s),z);
}
function koiAttributes(g:BufferGeometry,positions:number[],colors:number[],uv:number[],indices:number[]) {
  g.setAttribute('position',new Float32BufferAttribute(positions,3));
  g.setAttribute('color',new Float32BufferAttribute(colors,3));
  g.setAttribute('koiSkin',new Float32BufferAttribute(new Float32Array(positions.length/3).fill(1),1));
  g.setAttribute('koiScaleUv',new Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function koiBody(index: number, low: boolean) {
  const vertices:number[]=[],colors:number[]=[],uv:number[]=[],indices:number[]=[],base=new Color(koiColors[index]);
  const sides=low?8:20,rows=low?7:28;
  for(let row=0;row<=rows;row++)for(let j=0;j<=sides;j++){
    const z=-.493+row/rows*.898,a=j/sides*Math.PI*2;
    vertices.push(...koiPoint(z,a).toArray());colors.push(base.r,base.g,base.b);uv.push(j/sides*12,(z+.31)/.043);
    if(row<rows&&j<sides){const k=row*(sides+1)+j;indices.push(k,k+1,k+sides+2,k,k+sides+2,k+sides+1);}
  }
  // Leave the mouth open, but seal the tail inside the fin's attached root.
  const tail=rows*(sides+1);for(let j=1;j<sides-1;j++)indices.push(tail,tail+j,tail+j+1);
  const g=koiAttributes(new BufferGeometry(),vertices,colors,uv,indices);
  const normals=g.attributes.normal;
  for(let row=0;row<=rows;row++){
    const a=row*(sides+1),b=a+sides,n=new Vector3().fromBufferAttribute(normals,a).add(new Vector3().fromBufferAttribute(normals,b)).normalize();
    normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);
  }
  return g;
}
// A single skin joins neighbouring sections: useful for a broad muzzle, neck or folded leg.
type Section = [number, number, number, number, number]; // centre x/y/z, width, height
function skin(sections: Section[], sides: number, top: string, underside = top, detail=1) {
  const positions:number[]=[], colors:number[]=[], indices:number[]=[];
  const green=new Color(top), cream=new Color(underside);
  const centres=new CatmullRomCurve3(sections.map(s=>new Vector3(s[0],s[1],s[2]))),radii=new CatmullRomCurve3(sections.map(s=>new Vector3(s[3],s[4],0)));
  const rows=(sections.length-1)*detail;
  for(let row=0;row<=rows;row++){
    const t=row/rows,p=centres.getPoint(t),size=radii.getPoint(t),tangent=centres.getTangent(t).normalize();
    const across=new Vector3(tangent.z,0,-tangent.x).normalize(),up=new Vector3().crossVectors(tangent,across).normalize();
    for(let j=0;j<=sides;j++) {
      const a=j/sides*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
      const point=p.clone().addScaledVector(across,c*Math.max(.001,size.x)).addScaledVector(up,s*Math.max(.001,size.y));positions.push(point.x,point.y,point.z);
      const shade=green.clone().lerp(cream,Math.max(0,Math.min(1,(-s-.10)*1.5)));colors.push(shade.r,shade.g,shade.b);
      if(row<rows&&j<sides){const k=row*(sides+1)+j;indices.push(k,k+1,k+sides+2,k,k+sides+2,k+sides+1);}
    }
  }
  for(let j=1;j<sides-1;j++){
    indices.push(0,j+1,j);const end=rows*(sides+1);indices.push(end,end+j,end+j+1);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));
  g.setAttribute('koiSkin',new Float32BufferAttribute(new Float32Array(positions.length/3).fill(1),1));g.setIndex(indices);g.computeVertexNormals();
  const normals=g.attributes.normal;
  for(let row=0;row<=rows;row++){const a=row*(sides+1),b=a+sides,n=new Vector3().fromBufferAttribute(normals,a).add(new Vector3().fromBufferAttribute(normals,b)).normalize();normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);}
  return g;
}
/** Sparse colour markings follow the skin only; mouth lines stay crisp. */
function animalSkin(spotColor:string,scale:number,roughness=.48) {
  const material=new MeshStandardMaterial({vertexColors:true,roughness,side:DoubleSide});
  material.customProgramCacheKey=()=> 'pond-animal-skin-v1';
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{animalSpotColor:{value:new Color(spotColor)},animalSpotScale:{value:scale}});
    shader.vertexShader='attribute float koiSkin; varying float animalSkinMask; varying vec3 animalPoint; varying vec3 animalNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nanimalSkinMask=koiSkin; animalPoint=position; animalNormal=normal;');
    shader.fragmentShader=`varying float animalSkinMask; varying vec3 animalPoint; varying vec3 animalNormal;
      uniform vec3 animalSpotColor; uniform float animalSpotScale;
      float animalHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 cell=floor(animalPoint.xz*animalSpotScale),q=fract(animalPoint.xz*animalSpotScale)-.5;
      float seed=animalHash(cell),radius=mix(.15,.31,seed);
      q+=vec2(sin(seed*23.0),cos(seed*31.0))*.13;
      float brokenEdge=.035*sin(q.x*26.0+seed*11.0)*sin(q.y*19.0-seed*7.0);
      float spot=(1.0-smoothstep(radius-.055,radius+.065,length(q*vec2(1.0,.82))+brokenEdge))*step(.31,seed);
      float upper=smoothstep(-.15,.65,normalize(animalNormal).y);
      diffuseColor.rgb=mix(diffuseColor.rgb,animalSpotColor,spot*upper*animalSkinMask*.26);`);
  };
  return material;
}
/** Project a smile onto the muzzle rather than floating a line in front of the face. */
function muzzleLine(geometry:BufferGeometry,halfWidth:number,y:number,smile:number) {
  const result:XYZ[]=[],a=new Vector3(),b=new Vector3(),c=new Vector3(),hit=new Vector3(),ray=new Ray();
  const points=geometry.attributes.position,index=geometry.index!;
  for(let j=0;j<=16;j++){
    const x=(j/16*2-1)*halfWidth,height=y+smile*(x/halfWidth)**2;let nearest=Infinity;
    ray.set(new Vector3(x,height,-1),new Vector3(0,0,1));
    for(let n=0;n<index.count;n+=3){
      a.fromBufferAttribute(points,index.getX(n));b.fromBufferAttribute(points,index.getX(n+1));c.fromBufferAttribute(points,index.getX(n+2));
      if(ray.intersectTriangle(a,b,c,false,hit)&&hit.z<nearest)nearest=hit.z;
    }
    if(Number.isFinite(nearest))result.push([x,height,nearest-.0014]);
  }
  return result;
}
/** One shared eye draw, with pixel-smooth iris boundaries independent of sphere tessellation. */
function roundEyes(low:boolean,at:XYZ,radius:XYZ,backColor:string,outward=.25,horizontalPupil=false) {
  const parts:BufferGeometry[]=[];
  for(const side of [-1,1]) {
    const geometry=new SphereGeometry(1,low?12:24,low?8:16),points=geometry.attributes.position;
    const gaze=new Vector3(side*outward,.10,-1).normalize(),directions:number[]=[];
    geometry.setAttribute('eyePoint',points.clone());
    for(let i=0;i<points.count;i++)directions.push(gaze.x,gaze.y,gaze.z);
    geometry.setAttribute('eyeGaze',new Float32BufferAttribute(directions,3));
    geometry.scale(...radius).translate(side*at[0],at[1],at[2]);parts.push(geometry);
  }
  const geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());
  const material=new MeshStandardMaterial({roughness:.20});
  material.customProgramCacheKey=()=> 'pond-round-eyes-v2-'+horizontalPupil;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{eyeBack:{value:new Color(backColor)},eyeIris:{value:new Color('#b9974f')},eyePupilColor:{value:new Color('#101f1b')}});
    shader.vertexShader='attribute vec3 eyePoint; attribute vec3 eyeGaze; varying vec3 eyeSurface; varying vec3 eyeDirection;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\neyeSurface=eyePoint;eyeDirection=eyeGaze;');
    shader.fragmentShader='varying vec3 eyeSurface; varying vec3 eyeDirection; uniform vec3 eyeBack; uniform vec3 eyeIris; uniform vec3 eyePupilColor;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 eyeN=normalize(eyeSurface),gaze=normalize(eyeDirection);
      vec3 eyeRight=normalize(cross(gaze,vec3(0.0,1.0,0.0)));
      float eyeFacing=dot(eyeN,gaze),eyeAA=max(fwidth(eyeFacing)*1.2,.0015);
      float irisMask=smoothstep(.30-eyeAA,.30+eyeAA,eyeFacing);
      float pupilMask=${horizontalPupil?'(1.0-smoothstep(.40-eyeAA,.40+eyeAA,length(vec2(dot(eyeN,eyeRight)*.85,(eyeN.y-.055)*1.95))))*step(.50,eyeFacing)':'smoothstep(.79-eyeAA,.79+eyeAA,eyeFacing)'};
      float angle=atan(eyeN.y,dot(eyeN,eyeRight));
      vec3 irisPigment=eyeIris*(.93+.05*sin(angle*18.0));
      vec3 eyeColor=mix(mix(eyeBack,irisPigment,irisMask),eyePupilColor,pupilMask);
      vec3 glintDirection=normalize(gaze+vec3(0.0,.32,0.0)-eyeRight*.22);
      float glintFacing=dot(eyeN,glintDirection),glintAA=max(fwidth(glintFacing),.0002);
      float glint=smoothstep(.993-glintAA,.993+glintAA,glintFacing);
      diffuseColor.rgb=mix(eyeColor,vec3(1.0,.97,.88),glint*.9);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=mix(.50,.17,irisMask);`);
  };
  const mesh=new Mesh(geometry,material);mesh.name='RoundEyes';mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
function attachedFin(roots:XYZ[],edge:XYZ[],color:string,sculpt:Sculpture,low:boolean,bow:XYZ=[0,.014,0],rays=11,kind=1) {
  const root=new CatmullRomCurve3(roots.map(p=>new Vector3(...p))),rim=new CatmullRomCurve3(edge.map(p=>new Vector3(...p)));
  const columns=low?rays*2:rays*4,rows=low?4:7,vertices:number[]=[],colors:number[]=[],flow:number[]=[],indices:number[]=[],base=new Color(color);
  for(let row=0;row<=rows;row++)for(let j=0;j<=columns;j++){
    const t=row/rows,u=j/columns,p=root.getPoint(u).lerp(rim.getPoint(u),t);
    const flute=Math.cos(u*Math.PI*2*rays),bend=Math.sin(t*Math.PI)*Math.sin(u*Math.PI);
    // Rays share the membrane's volume; anchored roots flatten into the body,
    // while the outer half develops a shallow fan and a scalloped free edge.
    p.addScaledVector(new Vector3(...bow),bend*.85+flute*.11*Math.sin(t*Math.PI*.8)*Math.sin(u*Math.PI));
    p.lerp(root.getPoint(u),(.008+.008*flute)*t**4);vertices.push(...p.toArray());
    flow.push(t,u,kind,Math.sign(roots[0][0]));
    const ray=Math.pow(Math.max(0,Math.cos(u*Math.PI*2*rays)),10),c=base.clone().lerp(new Color('#fff5df'),t*.65).multiplyScalar(1-ray*.045*t);
    colors.push(c.r,c.g,c.b);
    if(row<rows&&j<columns){const k=row*(columns+1)+j;indices.push(k,k+1,k+columns+2,k,k+columns+2,k+columns+1);}
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setAttribute('finFlow',new Float32BufferAttribute(flow,4));g.setIndex(indices);g.computeVertexNormals();sculpt.add(g,color);
  // The pleated membrane itself describes the rays. Separate coplanar tubes
  // caused shimmering lines and wasted geometry at the real homepage scale.
}
function makeKoi(index:number,low:boolean) {
  const s=new Sculpture(low),fins=new Sculpture(low),gold=koiColors[index],finColor=index===0||index===3?'#efcc79':'#f3c6a5';
  s.add(koiBody(index,low),gold);
  for(const side of [-1,1]){
    // The cornea is seated in the tapered head rather than mounted on a stalk.
    s.oval([side*.066,.032,-.404],[.010,.018,.021],'#d7b776',undefined,10,6);
    s.oval([side*.074,.034,-.408],[.005,.013,.015],'#17221f',undefined,10,6);
    s.oval([side*.078,.040,-.414],[.002,.0035,.0035],'#fff8e9',undefined,6,4);
    const gill:XYZ[]=[];
    for(let j=0;j<7;j++){
      const a=side===1?-.40+j/6*1.30:Math.PI+.40-j/6*1.30,p=koiPoint(-.309-.016*Math.sin(j/6*Math.PI),a,.0006);gill.push(p.toArray() as XYZ);
    }
    s.line(gill,.0012,index===0?'#b48636':'#aa8e6c',6);
    s.line([[side*.021,-.011,-.483],[side*.035,-.026,-.482],[side*.047,-.038,-.451]],.0025,'#e5c589',4);
    attachedFin([[side*.073,-.022,-.285],[side*.093,-.027,-.23],[side*.087,-.029,-.16]],
      [[side*.098,-.024,-.28],[side*.215,-.032,-.15],[side*.258,-.036,-.025],[side*.225,-.04,.075],[side*.145,-.034,.095],[side*.088,-.029,-.13]],finColor,fins,low,[0,.020,0],10);
    attachedFin([[side*.055,-.036,.15],[side*.052,-.032,.20]],
      [[side*.064,-.039,.14],[side*.14,-.052,.25],[side*.10,-.053,.34],[side*.037,-.033,.27]],finColor,fins,low,[0,.012,0],6);
  }
  // Lips ring a recessed oral opening instead of plugging the nose with spheres.
  const lip:XYZ[]=Array.from({length:17},(_,i)=>{const a=i/16*Math.PI*2;return [Math.cos(a)*.019,Math.sin(a)*.017-.002,-.493] as XYZ;});
  s.line(lip,.0022,index===0?'#d6a44b':'#c7b28a',16);
  s.oval([0,-.002,-.487],[.015,.012,.003],'#544a39',undefined,8,4);
  attachedFin([[0,.086,-.255],[0,.096,-.15],[0,.088,-.015],[0,.064,.14],[0,.040,.28]],
    [[0,.091,-.255],[.003,.168,-.17],[.008,.178,-.05],[.012,.15,.095],[.006,.095,.22],[0,.041,.28]],finColor,fins,low,[.017,0,0],13,2);
  // A koi's caudal fin is vertical. One forked surface grows out of a flattened
  // peduncle; the former left/right fan pair incorrectly read as two paddles.
  attachedFin([[0,-.029,.369],[0,0,.401],[0,.034,.369]],
    [[0,-.137,.610],[.010,-.150,.699],[.017,-.080,.661],[.012,0,.548],[.021,.087,.674],[.012,.168,.709],[0,.157,.625]],
    finColor,fins,low,[.040,0,0],15,3);
  const material=new MeshStandardMaterial({vertexColors:true,roughness:.34,metalness:.015,side:DoubleSide});
  const uniforms={swimTime:{value:0},flowTime:{value:index*.73},swimPower:{value:1},turnBend:{value:0},leapBend:{value:0},finTuck:{value:0},koiTint:{value:new Color(gold)},koiIvory:{value:new Color('#fff0dc')},koiPattern:{value:index===0||index===3?-1:index*.87}};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='uniform float swimTime; uniform float flowTime; uniform float swimPower; uniform float turnBend; uniform float leapBend; uniform float finTuck; attribute float koiSkin; attribute vec2 koiScaleUv; attribute vec4 finFlow; varying vec4 finShape; varying vec2 scaleUv; varying float skinMask; varying vec3 skinPoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float flex=smoothstep(-.27,.65,position.z);
      skinMask=koiSkin;skinPoint=position;scaleUv=koiScaleUv;finShape=finFlow;
      float travelling=sin(swimTime-position.z*6.8);
      float sweep=travelling*(.16+.065*abs(turnBend))*swimPower;
      transformed.x+=(sweep+turnBend*.15+leapBend*.19)*flex*flex;
      transformed.y+=sin(swimTime-position.z*5.3)*flex*.018*swimPower;
      // Each membrane is anchored at t=0. A slow travelling bend reaches the
      // free edge later, with a smaller second ripple rather than a rigid flap.
      float freeEdge=pow(finFlow.x,1.65);
      float wave=sin(flowTime*1.65-finFlow.x*3.6+finFlow.y*2.4+finFlow.w*.35);
      float ripple=sin(flowTime*2.2-finFlow.x*6.0-finFlow.y*4.0)*.22;
      if(finFlow.z>.5){
        if(finFlow.z<1.5){
          transformed.x-=position.x*freeEdge*finTuck*.42;
          float outside=clamp(-turnBend*finFlow.w,0.0,1.0);
          float scull=sin(swimTime*.75+finFlow.w*.76-finFlow.x*2.5);
          transformed.y+=freeEdge*((wave+ripple)*.023+scull*(.029+.064*outside)-finTuck*.025);
          transformed.z+=freeEdge*(scull*(.014+.035*outside)+finTuck*.085);
        }
        else {transformed.x+=freeEdge*(finFlow.z>2.5?sin(swimTime-5.1-finFlow.x)*.072*swimPower:(wave+ripple)*.023);}
      }`);
    const bump=ShaderChunk.bumpmap_pars_fragment.slice(ShaderChunk.bumpmap_pars_fragment.indexOf('vec3 perturbNormalArb')).replace(/#endif\s*$/,'').replace('perturbNormalArb','perturbKoiNormal');
    shader.fragmentShader=`varying float skinMask; varying vec3 skinPoint; varying vec2 scaleUv; varying vec4 finShape; uniform vec3 koiTint; uniform vec3 koiIvory; uniform float koiPattern;
      float scaleRelief(vec2 uv){
        float row=floor(uv.y);vec2 p=vec2(fract(uv.x+row*.5)-.5,fract(uv.y));
        float arc=length(vec2(p.x*1.55,(p.y-.10)*.88));
        return (1.0-smoothstep(.58,.64,arc))*.55+exp(-pow((arc-.59)/.035,2.0))*.28;
      }
    `+bump+'\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      // A few authored colour islands read at homepage scale; fine periodic
      // stripes previously obscured the head and made every koi look alike.
      float shift=sin(koiPattern*2.0)*.028;
      float patchA=length(vec2((skinPoint.x-shift)/.080,(skinPoint.z+.345)/.120));
      float patchB=length(vec2((skinPoint.x+shift*1.6)/.112,(skinPoint.z+.075)/.125));
      float patchC=length(vec2((skinPoint.x-shift*1.3)/.065,(skinPoint.z-.215)/.105));
      float edge=min(patchA,min(patchB,patchC))+.065*sin(skinPoint.z*55.0+skinPoint.x*37.0+koiPattern);
      float ivory=koiPattern<0.0?0.0:smoothstep(.93,1.04,edge);
      ivory=max(ivory,1.0-smoothstep(-.070,-.018,skinPoint.y));
      vec3 pigment=mix(koiTint,koiIvory,ivory);
      float scales=smoothstep(-.32,-.27,skinPoint.z)*(1.0-smoothstep(.30,.37,skinPoint.z));
      pigment*=mix(1.0,.985+scaleRelief(scaleUv)*.025,scales);
      diffuseColor.rgb=mix(diffuseColor.rgb,pigment,skinMask);
      if(finShape.z>.5)diffuseColor.a*=mix(.94,.45,smoothstep(.05,1.0,finShape.x));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float relief=scaleRelief(scaleUv)*.00045*skinMask*smoothstep(-.30,-.22,skinPoint.z)*(1.0-smoothstep(.25,.37,skinPoint.z));
      normal=perturbKoiNormal(-vViewPosition,normal,vec2(dFdx(relief),dFdy(relief)),faceDirection);`);
  };
  const finMaterial=new MeshStandardMaterial({vertexColors:true,roughness:.50,metalness:0,transparent:true,depthWrite:false,side:DoubleSide});
  finMaterial.onBeforeCompile=material.onBeforeCompile;finMaterial.forceSinglePass=true;
  const expression=new MotionExpression(index);
  const root=new Group();root.name='Koi-'+index;const finMesh=fins.mesh('FlowingFins',finMaterial);finMesh.castShadow=false;
  root.add(s.mesh('KoiSculpt',material),finMesh);root.scale.setScalar(.67*[1,.92,.88,.80,.96,.85,.91][index]);
  return {root,update(p:FishPose,time:number){
    const m=expression.sample(p,time);
    const phase=p.swimPhase??m.phase, power=p.swimPower??m.effort, turn=p.swimTurn??(-m.turn*.7);
    const tuck=p.leapPhase?Math.max(0,Math.min(1,(p.y+.18)/.27)):0;
    const swimPower=(.22+power*.78+Math.abs(turn)*.32+m.attention*.22)*(1-.87*tuck);
    root.position.set(p.x,p.y,p.z);
    root.rotation.set(p.pitch+.048*Math.sin(phase-.45)*swimPower,p.yaw,
      (-turn*.13 + Math.sin(phase-.7)*.068*swimPower)*(1-tuck),'YXZ');
    uniforms.swimTime.value=phase;uniforms.flowTime.value=time+index*.73;
    uniforms.swimPower.value=swimPower;
    uniforms.turnBend.value=turn*(1-tuck);uniforms.leapBend.value=p.leapBend??0;uniforms.finTuck.value=tuck;
  }};
}

const shellScutes: [number,number][]=[...Array.from({length:5},(_,i)=>[0,-.76+i*.38] as [number,number]),
  ...[-1,1].flatMap(side=>Array.from({length:4},(_,i)=>[side*.58,-.60+i*.40] as [number,number]))];
function turtleShell(low:boolean) {
  const positions:number[]=[0,.35,-.035],indices:number[]=[],segments=low?64:96;
  const rings=[...Array.from({length:32},(_,i)=>(i+1)/32*.98),1.018,.992];
  rings.forEach((r,row)=>{
    for(let j=0;j<segments;j++){
      const a=j/segments*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
      const x=Math.sign(c)*Math.pow(Math.abs(c),.87)*(.31-.018*s)*r,z=Math.sign(s)*Math.pow(Math.abs(s),.94)*.35*r;
      let y=.105+.245*Math.pow(Math.max(0,1-r*r),.67);
      y+=.009*Math.exp(-((x/.085)**2))*Math.sin(Math.min(r,1)*Math.PI);
      const zz=z-.035*(1-Math.min(r,1));
      const distances=shellScutes.map(([cx,cz])=>Math.hypot(x/.32-cx,(zz/.35-cz)*.82)).sort((a,b)=>a-b);
      // Shallow recessed seams and a softly lifted centre, continuous with the
      // original weight-bearing dome. These survive neutral grey lighting.
      const seam=Math.exp(-(((distances[1]-distances[0])/.036)**2));
      y-=.0045*seam*Math.max(0,Math.min(1,(.96-r)/.12));
      y+=.006*Math.exp(-(((r-.965)/.026)**2));
      if(row===rings.length-2)y=.103;if(row===rings.length-1)y=.080;
      positions.push(x,y,z-.035*(1-Math.min(r,1)));
      const k=1+row*segments+j,next=1+row*segments+(j+1)%segments;
      if(row===0)indices.push(0,next,k);else indices.push(k,next-segments,next,k,k-segments,next-segments);
    }
  });
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
  const material=new MeshStandardMaterial({color:'#7d8955',roughness:.68});
  // Colour and geometry use the same scute centres on a continuous dome.
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{shellLight:{value:new Color('#94a06a')},shellDark:{value:new Color('#65784e')},shellSeam:{value:new Color('#5f6243')},shellRim:{value:new Color('#969361')},shellScutes:{value:shellScutes.map(p=>new Vector2(...p))}});
    shader.vertexShader='varying vec2 carapacePoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncarapacePoint=position.xz/vec2(.32,.35);');
    shader.fragmentShader=`varying vec2 carapacePoint; uniform vec3 shellLight; uniform vec3 shellDark; uniform vec3 shellSeam; uniform vec3 shellRim; uniform vec2 shellScutes[${shellScutes.length}];\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 p=carapacePoint; float nearest=9.0,second=9.0,tile=0.0;
      for(int i=0;i<${shellScutes.length};i++){
        float d=length((p-shellScutes[i])*vec2(1.0,.82));
        if(d<nearest){second=nearest;nearest=d;tile=float(i);}else{second=min(second,d);}
      }
      float radius=length(p),seam=1.0-smoothstep(.009,.028,second-nearest);
      vec3 shell=mix(shellDark,shellLight,.52+.23*sin(tile*2.4+1.0));
      shell*=.94+.06*(1.0-smoothstep(.04,.38,nearest));
      shell=mix(shell,shellSeam,seam*.42);
      shell=mix(shell,shellRim,smoothstep(.91,.99,radius));
      float rimJoint=1.0-smoothstep(.018,.055,abs(sin(atan(p.y,p.x)*9.0)));
      shell=mix(shell,shellSeam,rimJoint*smoothstep(.92,.98,radius)*.30);
      diffuseColor.rgb=shell;`);
  };
  const mesh=new Mesh(g,material);mesh.name='ContinuousCarapace';mesh.castShadow=mesh.receiveShadow=true;return mesh;
}

const poseEase = (x:number) => {const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};

function weightLimb(geometry: BufferGeometry, joint?: { sides: number; detail: number; lowerAfter: number; lowerBefore: number; footAfter: number; footBefore: number }) {
  const count = geometry.attributes.position.count;
  const joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    joints[offset + 1] = 1; joints[offset + 2] = 2;
    if (!joint) { weights[offset + 2] = 1; continue; }
    const section = Math.floor(i / (joint.sides + 1)) / joint.detail;
    const lower = poseEase((section - joint.lowerAfter) / (joint.lowerBefore - joint.lowerAfter));
    const foot = poseEase((section - joint.footAfter) / (joint.footBefore - joint.footAfter));
    weights[offset] = 1 - lower;
    weights[offset + 1] = lower * (1 - foot);
    weights[offset + 2] = lower * foot;
  }
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(joints, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  return geometry;
}

function bindLimb(base: Mesh, lowerAt: XYZ, footAt: XYZ, lowerName: string, footName: string) {
  const mesh = new SkinnedMesh(base.geometry, base.material);
  mesh.name = base.name; mesh.castShadow = base.castShadow; mesh.receiveShadow = base.receiveShadow;
  mesh.frustumCulled = false;
  const upper = new Bone(), lower = new Bone(), foot = new Bone();
  lower.name = lowerName; foot.name = footName;
  lower.position.set(...lowerAt); foot.position.set(...footAt).sub(lower.position);
  upper.add(lower); lower.add(foot); mesh.add(upper); mesh.bind(new Skeleton([upper, lower, foot]));
  return { mesh, lower, foot };
}

function makeTurtle(small:boolean,low:boolean) {
  const root=new Group();root.name=small?'YoungTurtle':'AdultTurtle';if(small)root.scale.setScalar(.53);
  const body=new Sculpture(low),headSculpt=new Sculpture(low);
  body.add(skin([[0,.087,-.34,.09,.018],[0,.085,-.25,.244,.031],[0,.083,-.07,.293,.033],
    [0,.083,.16,.274,.031],[0,.087,.32,.16,.022],[0,.088,.35,.065,.010]],low?8:12,'#9d9f6d','#b8ad75'),'#9d9f6d');
  const head=skin([[0,.193,-.632,.020,.022],[0,.202,-.617,.064,.039],[0,.210,-.587,.099,.061],
    [0,.213,-.544,.117,.080],[0,.195,-.489,.106,.077],[0,.152,-.416,.075,.052],
    [0,.130,-.315,.073,.045]],low?24:36,'#a7ba7b','#eee0b6',5);
  const headPoints=head.attributes.position,headColors=head.attributes.color,cream=new Color('#eadfb8'),green=new Color('#a7ba7b');
  for(let i=0;i<headPoints.count;i++){
    const x=headPoints.getX(i),y=headPoints.getY(i),z=headPoints.getZ(i),headness=Math.max(0,Math.min(1,(-z-.42)/.10)),bibTop=.108+.061*headness+.018*(x/.125)**2;
    const orbit=Math.exp(-(((Math.abs(x)-.098)/.034)**2+((y-.249)/.031)**2+((z+.569)/.038)**2));
    const fold=.0016*Math.sin((z+.315)*125)*Math.exp(-(((z+.385)/.057)**2));
    headPoints.setXYZ(i,x+Math.sign(x)*(orbit*.007+fold),y+orbit*.009,z-orbit*.003);
    const bib=Math.max(0,Math.min(1,(bibTop-y)/.019)),color=green.clone().lerp(cream,bib);headColors.setXYZ(i,color.r,color.g,color.b);
  }
  head.computeVertexNormals();
  const smile=muzzleLine(head,.103,.179,.009),nostrils=muzzleLine(head,.047,.231,0);
  headSculpt.add(head,'#b4c27c');headSculpt.line(smile,.0018,'#9e9467',14);
  for(const j of [4,12])if(nostrils[j])headSculpt.oval(nostrils[j],[.0036,.0028,.0016],'#8d9660',undefined,8,5);
  body.add(skin([[0,.095,.33,.038,.030],[.008,.085,.42,.025,.021],[.024,.075,.49,.014,.012],[.035,.07,.54,.002,.002]],low?6:8,'#718b4c'),'#718b4c');
  // A small living sprig sits on the shoulder of the shell, clear of the
  // central weight-bearing crown used by the young turtle's riding pose.
  for(const angle of [-1.4,-.2,1.1,2.6]){
    const dx=Math.cos(angle)*.073,dz=Math.sin(angle)*.073;
    body.add(skin([[.19,.293,.035,.002,.002],[.19+dx*.48,.312,.035+dz*.48,.023,.006],
      [.19+dx,.316,.035+dz,.002,.002]],low?6:10,'#a6bf58','#799944',low?1:2),'#a6bf58');
  }
  body.line([[.19,.292,.035],[.205,.307,.052],[.222,.318,.062]],.003,'#819b47',4);
  for(let j=0;j<5;j++){
    const angle=j/5*Math.PI*2;
    body.oval([.222+Math.sin(angle)*.020,.319,.062+Math.cos(angle)*.020],[.013,.007,.025],'#fff8df',[0,angle,0],10,6);
  }
  body.oval([.222,.326,.062],[.012,.006,.012],'#e4bd52',undefined,10,6);
  const faceMaterial=animalSkin('#83985b',17,.51),decorate=faceMaterial.onBeforeCompile;
  faceMaterial.customProgramCacheKey=()=> 'pond-turtle-face-v1';
  faceMaterial.onBeforeCompile=(shader,renderer)=>{
    decorate(shader,renderer);shader.uniforms.turtleCream={value:cream};
    shader.fragmentShader='uniform vec3 turtleCream;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      float bibTop=.108+.061*clamp((-animalPoint.z-.42)/.10,0.0,1.0)+.018*pow(animalPoint.x/.125,2.0);
      float faceBib=(1.0-smoothstep(bibTop-.010,bibTop+.003,animalPoint.y))
        *(1.0-smoothstep(-.42,-.36,animalPoint.z))*animalSkinMask;
      diffuseColor.rgb=mix(diffuseColor.rgb,turtleCream,faceBib);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      totalEmissiveRadiance+=turtleCream*faceBib*.035;`);
  };
  const headPivot=new Group(),headMesh=headSculpt.mesh('ShellHead',faceMaterial),eyes=roundEyes(low,[.101,.247,-.574],[.028,.030,.029],'#a7ba7b',.62);
  headPivot.name='TurtleNeck';headPivot.position.set(0,.13,-.315);
  headMesh.position.set(0,-.13,.315);eyes.position.copy(headMesh.position);headPivot.add(headMesh,eyes);
  root.add(body.mesh('TurtleBody',faceMaterial),turtleShell(low),headPivot);
  const legs:{hip:Group;lower:Bone;foot:Bone;side:number;rear:boolean}[]=[];
  const sides=low?16:22;
  for(const side of [-1,1])for(const front of [-1,1]) {
    const pivot=new Group();pivot.position.set(side*.215,.08,front*.235);
    const limb=new Sculpture(low);
    // A pond turtle bears weight through a bent forearm and webbed toes.
    // Keep the original sole height and articulation pivots used by land gait.
    const rear=front>0;
    limb.add(weightLimb(skin([[-side*.045,.020,-front*.030,.040,.033],[side*.022,.012,front*.022,.048,.039],
      [side*.072,-.009,front*.047,.039,.030],[side*.103,-.038,front*.080,.027,.023],
      [side*.137,-.055,front*.113,rear?.057:.043,.015],[side*.168,-.062,front*.145,rear?.044:.034,.009],
      [side*.180,-.062,front*.157,.005,.005]],sides,'#a1b176','#e0d5ad',5),
      {sides,detail:5,lowerAfter:1.45,lowerBefore:3.1,footAfter:3.4,footBefore:4.6}),'#a1b176');
    const toeCount=rear?4:5;
    for(let toe=0;toe<toeCount;toe++){
      const f=toe/(toeCount-1)-.5,ox=side*(.150+f*.058),oz=front*(.128-f*.055),length=.031*(1-.28*Math.abs(f));
      limb.add(weightLimb(skin([[ox,-.054,oz,.009,.008],[ox+side*length*.55,-.058,oz+front*length*.6,.007,.006],
        [ox+side*length,-.063,oz+front*length,.0035,.0035]],12,'#a1b176','#e0d5ad',3)),'#a1b176');
      limb.add(weightLimb(skin([[ox+side*length*.80,-.059,oz+front*length*.8,.0035,.003],
        [ox+side*(length+.008),-.065,oz+front*(length+.010),.001,.001]],8,'#c9bd97',undefined,2)),'#c9bd97');
    }
    const label=(rear?'Hind':'Fore')+(side<0?'L':'R');
    const rig=bindLimb(limb.mesh('WebbedFoot',animalSkin('#718649',20,.55)),[side*.087,-.023,front*.061],
      [side*.133,-.053,front*.106],'TurtleElbow_'+label,'TurtleFoot_'+label);
    pivot.add(rig.mesh);root.add(pivot);legs.push({hip:pivot,lower:rig.lower,foot:rig.foot,side,rear});
  }
  const limbs=legs.map(leg=>leg.hip),contact=new Vector3(),steps=makeTurtleSteps(root,legs);
  const expression=new MotionExpression(small?3:1);
  let lastPoseTime:number|undefined,rideSettle=0,limbPhase=0,lastGait:number|undefined;
  return {root,limbs,update(p:TurtlePose,time:number,ground=islandHeight){
    const m=expression.sample(p,time);
    const riding=p.mode==='ride'||p.mode==='climbBack'||p.mode==='dismount';
    const resting=p.mode==='bask'||p.mode==='ride',activity=Math.min(1,p.speed/.19);
    const land=riding?1:poseEase((p.y+.082)/.19),water=1-land;
    const turn=resting?0:p.swimTurn??(-m.turn*.72);
    const waterEffort=Math.min(1,Math.max(activity*.75,(p.swimPower??0)*.78+Math.abs(turn)*.62));
    const gaitRate=2.3+1.3*land;
    limbPhase=lastGait===undefined?p.gait*gaitRate:limbPhase+Math.max(0,p.gait-lastGait)*gaitRate;
    lastGait=p.gait;
    const settleTarget=small&&p.mode==='ride'?.026*lifeScale:0;
    if(lastPoseTime===undefined)rideSettle=settleTarget;
    else rideSettle+=(settleTarget-rideSettle)*(1-Math.exp(-Math.max(0,Math.min(.1,time-lastPoseTime))*8));
    lastPoseTime=time;
    const paddlePhase=p.swimPhase??limbPhase;
    root.position.set(p.x,p.y-rideSettle,p.z);
    root.rotation.set(p.pitch,p.yaw,water*(Math.sin(paddlePhase)*.033*waterEffort-turn*.11),'YXZ');
    const onBank=!riding&&(p.mode==='climb'||p.mode==='leave'||p.mode==='bask');
    const landContact=onBank?(p.groundContact??poseEase((Math.min(p.y, ground(p.x,p.z))-.032)/.110)):0;
    for (const {hip,lower,foot,side,rear} of legs) {
      const offset=(rear?Math.PI:0)+(side>0?Math.PI:0);
      const phase=limbPhase+offset, step=Math.sin(phase), lift=Math.max(0,Math.cos(phase));
      const paddle=turtlePaddle(paddlePhase,side,rear);
      const power=water*waterEffort*(1-side*turn*(rear?.34:.74));
      const sweep=paddle.sweep*power, recovery=paddle.recovery*power, drive=paddle.drive*power;
      hip.rotation.set(.17*lift*activity*land+.12*recovery,side*(.19*step*activity*land+.49*sweep),
        side*(.12*lift*activity*land-.11*drive+.21*recovery));
      lower.rotation.set(lift*.18*land*activity,side*(.27*sweep-.13*lift*activity*land),0);
      foot.rotation.set(-.34*lift*land*activity,side*(.21*drive-.30*recovery),side*(.20*sweep+.17*recovery));
      hip.position.y=.08+lift*.025*activity*land+.014*recovery;
      hip.position.z=(rear?1:-1)*.235+step*.055*activity*land-.030*sweep;
      if(resting){hip.rotation.set(0,0,0);lower.rotation.set(0,0,0);foot.rotation.set(0,0,0);hip.position.y=.08;hip.position.z=(rear?1:-1)*.235;}
      if (onBank && land > .35 && landContact < 1) {
        foot.getWorldPosition(contact);
        const sole = ground(contact.x,contact.z) + .013 * root.scale.x;
        const correction = Math.max(-.075, Math.min(.075, (sole-contact.y) / root.scale.x));
        hip.position.y += correction * land * (1-landContact) * (resting?1:1-poseEase(lift/.53));
      }
    }
    const reach = (p.mode==='climb'||p.mode==='climbBack')?land*activity:0;
    const glance=resting?poseEase((Math.sin(time*.74+(small?3:1))-.44)/.54):0;
    headPivot.position.z=-.315-.040*reach-.033*glance;
    headPivot.rotation.set(-m.attention*.10+Math.sin(time*1.3)*.013+.11*reach+.10*glance,
      -.23*turn+Math.sin(time*.52)*.28*glance+Math.sin(m.phase*1.6)*m.attention*.09,0);
    root.rotation.z+=Math.sin(time*.7)*.005*water;
    steps.update(p,time,ground,landContact);
  }};
}
function webbedFoot(side:number,back:boolean) {
  // Local forward is -Z. In the seated pose, the folded hind ankle and long
  // sole both run forward along the flank, rather than pointing behind the frog.
  const start=back?-.045:-.11,reach=back?-.20:-.10,cx=side*.075;
  const toes=back?[[.060,.78],[.030,1.02],[0,1.15],[-.032,1.04],[-.061,.85]]:
    [[.049,.78],[.017,1.12],[-.018,1.05],[-.049,.82]];
  const outline=[[-.024,0],[.024,0],[.040,.43]];
  toes.forEach(([x,t],i)=>{
    outline.push([x+.006,t-.04],[x+.006,t],[x-.006,t+.012],[x-.008,t-.035]);
    if(i<toes.length-1)outline.push([(x+toes[i+1][0])*.5,Math.min(t,toes[i+1][1])*(back?.68:.50)]);
  });
  outline.push([-.037,.41]);
  let contour=outline.map(([x,t])=>new Vector2(cx+side*x,start+reach*t));
  // Corner cutting rounds the toe pads without filling their concave gaps.
  for(let pass=0;pass<2;pass++)contour=contour.flatMap((p,j)=>{
    const q=contour[(j+1)%contour.length];return [p.clone().lerp(q,.18),p.clone().lerp(q,.82)];
  });
  if(!ShapeUtils.isClockWise(contour))contour.reverse();
  const points:number[]=[],indices:number[]=[],n=contour.length;
  const centre=new Vector2(cx,start+reach*.60);
  for(const [scale,y] of [[.89,-.072],[1,-.080],[.96,-.088]])for(const p of contour){
    const q=p.clone().sub(centre).multiplyScalar(scale).add(centre);
    const hump=y===-.072?.005*Math.exp(-(((q.y-start-reach*.45)/(reach*.3))**2)):0;
    points.push(q.x,y+hump,q.y);
  }
  // Earcut handles the concave toe gaps. A triangle fan overlaps those gaps.
  for(const [a,b,c] of ShapeUtils.triangulateShape(contour,[])){
    const pa=contour[a],pb=contour[b],pc=contour[c];
    const up=(pb.y-pa.y)*(pc.x-pa.x)-(pb.x-pa.x)*(pc.y-pa.y)>0;
    const top=up?[a,b,c]:[a,c,b];indices.push(...top,top[2]+2*n,top[1]+2*n,top[0]+2*n);
  }
  for(let row=0;row<2;row++)for(let j=0;j<n;j++){
    const k=(j+1)%n,a=row*n+j,b=row*n+k;indices.push(a,a+n,b+n,a,b+n,b);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
/** Crouched frog: the snout, shoulders and rump run along -Z -> +Z. */
function frogBody(low:boolean) {
  const g=skin([[0,.137,-.273,.040,.028],[0,.151,-.250,.112,.046],
    [0,.150,-.205,.174,.062],[0,.157,-.152,.183,.078],
    [0,.135,-.065,.158,.079],[0,.113,.015,.151,.072],
    [0,.108,.097,.143,.073],[0,.099,.153,.106,.060],
    [0,.087,.192,.047,.030],[0,.082,.211,.004,.004]],low?24:40,'#9dbb58','#eee4b9',5);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),upper=Math.max(0,Math.min(1,(y-.13)/.065));
    const orbit=Math.exp(-(((Math.abs(x)-.118)/.045)**2+((z+.177)/.046)**2))*upper;
    const ridge=Math.exp(-(((Math.abs(x)-.10)/.020)**2+((z-.045)/.14)**2))*upper;
    p.setXYZ(i,x+Math.sign(x)*orbit*.004,y+orbit*.018+ridge*.006,z);
  }
  g.computeVertexNormals();
  // Rejoin the duplicated seam normals after sculpting the brow and back.
  const n=g.attributes.normal,sides=low?24:40,rows=p.count/(sides+1);
  for(let row=0;row<rows;row++){
    const a=row*(sides+1),b=a+sides,normal=new Vector3().fromBufferAttribute(n,a).add(new Vector3().fromBufferAttribute(n,b)).normalize();
    n.setXYZ(a,normal.x,normal.y,normal.z);n.setXYZ(b,normal.x,normal.y,normal.z);
  }
  return g;
}
function frogSkin() {
  const material=animalSkin('#648b3f',16,.47),decorate=material.onBeforeCompile;
  material.customProgramCacheKey=()=> 'pond-crouched-frog-skin-v2';
  material.onBeforeCompile=(shader,renderer)=>{
    decorate(shader,renderer);shader.uniforms.frogCream={value:new Color('#fff0c2')};
    shader.fragmentShader='uniform vec3 frogCream;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      float chest=(1.0-smoothstep(-.35,.08,normalize(animalNormal).y))*animalSkinMask;
      diffuseColor.rgb=mix(diffuseColor.rgb,frogCream,chest);
      roughnessFactor=mix(roughnessFactor,.54,chest);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      totalEmissiveRadiance+=frogCream*chest*.045;`);
  };
  return material;
}

function makeFrog(low:boolean) {
  const root=new Group();root.name='Frog';const body=new Sculpture(low);
  const skull=frogBody(low);
  // Follow the actual curved muzzle so the mouth never hangs in front of it.
  const mouth=muzzleLine(skull,.155,.128,.007),nostrils=muzzleLine(skull,.070,.184,0);
  body.add(skull,'#9dbb58');body.line(mouth,.0015,'#8a8954',16);
  for(const j of [4,12])if(nostrils[j])body.oval(nostrils[j],[.0033,.0022,.0015],'#6f8242',undefined,8,5);
  const skinMaterial=()=>animalSkin('#668a42',16,.46);
  const torso=body.mesh('FrogBody',frogSkin()),eyes=roundEyes(low,[.118,.218,-.184],[.039,.041,.040],'#9dbb58',.32,true);
  root.add(torso,eyes);
  const joints:{side:number;back:boolean;hip:Group;lower:Bone;foot:Bone}[]=[];
  const sides=low?14:22;
  for(const side of [-1,1])for(const back of [false,true]) {
    const pivot=new Group();pivot.position.set(side*.12,.095,back?.13:-.09);const s=new Sculpture(low);
    if(back){
      // A substantial thigh folds into a visibly slimmer shin, with the ankle under the knee.
      s.add(weightLimb(skin([[-side*.050,.018,-.045,.046,.047],[side*.040,.010,-.060,.073,.064],
        [side*.112,-.019,-.090,.063,.048],[side*.130,-.050,.015,.029,.025],
        [side*.103,-.061,.027,.022,.019],[side*.078,-.067,-.018,.022,.016],
        [side*.075,-.070,-.058,.025,.012]],sides,'#95b354','#e9dea2',4),
        {sides,detail:4,lowerAfter:1.55,lowerBefore:2.59,footAfter:4.72,footBefore:5.74}),'#95b354');
    }else{
      // Bury the shoulder cap inside the chest; let the wrist continue into
      // the palm instead of meeting its back edge with two exposed end caps.
      s.add(weightLimb(skin([[-side*.005,.042,.055,.030,.028],[side*.070,.005,.025,.027,.026],
        [side*.062,-.046,-.055,.018,.017],[side*.075,-.072,-.132,.024,.011]],sides,'#9dbb58','#f1e3ab',4),
        {sides,detail:4,lowerAfter:.53,lowerBefore:1.45,footAfter:2.10,footBefore:2.88}),'#9dbb58');
    }
    s.add(weightLimb(webbedFoot(side,back)),'#9aac61');
    // Raised phalanges give the thin web a palm and toes in side light. Their
    // closed skins stay above the existing sole used by leaf landing support.
    const toes=back?[[.060,.78],[.030,1.02],[0,1.15],[-.032,1.04],[-.061,.85]]:
      [[.049,.78],[.017,1.12],[-.018,1.05],[-.049,.82]];
    const start=back?-.045:-.11,reach=back?-.20:-.10;
    for(const [x,t] of toes){
      s.add(weightLimb(skin([[side*(.075+x*.35),-.065,start+reach*.40,.0045,.003],
        [side*(.075+x*.77),-.067,start+reach*t*.74,.004,.0025],
        [side*(.075+x),-.072,start+reach*(t-.045),.0035,.002],
        [side*(.075+x),-.074,start+reach*(t-.012),.0015,.001]],10,'#9aac61','#9aac61',3)),'#9aac61');
    }
    const label=side<0?'L':'R';
    const rig=bindLimb(s.mesh(back?'HindLeg':'ForeLeg',skinMaterial()),[side*(back?.112:.070),back?-.019:.005,back?-.090:.025],
      [side*.075,back?-.068:-.072,start],(back?'FrogKnee_':'FrogElbow_')+label,(back?'FrogAnkle_':'FrogWrist_')+label);
    pivot.add(rig.mesh);root.add(pivot);joints.push({side,back,hip:pivot,lower:rig.lower,foot:rig.foot});
  }
  const limbs=joints.map(joint=>joint.hip);
  const expression=new MotionExpression(2);
  return {root,limbs,update(p:FrogPose,time:number){
    const m=expression.sample(p,time);
    const swimming=p.mode==='swim'||p.mode==='approach',activity=Math.min(1,p.speed/.3);
    // The crouched hind feet sweep outward and aft around the hip. Rotating
    // primarily around X made the old upright model kick down into the water.
    const {extension}=frogStroke(p.gait);
    const crouch=p.crouch??0;
    const turn=swimming?p.swimTurn??(-m.turn*.65):0;
    const effort=Math.max(activity,Math.abs(turn)*.54);
    const breath=swimming?0:(p.mode==='rest'?(.5+.5*Math.sin(time*4.2))*.022:0);
    torso.scale.y=1+breath;
    torso.position.y=eyes.position.y=-.018*crouch;
    root.position.set(p.x,p.y,p.z);root.rotation.set(p.pitch+(swimming?Math.sin(p.gait)*.025*activity:0),p.yaw,0,'YXZ');
    for(const {side,back,hip,lower,foot} of joints){
      if(p.mode==='jump'){
        const push=poseEase(p.jump/.21)*(1-poseEase((p.jump-.32)/.53));
        const reach=poseEase((p.jump-.42)/.32)*(1-poseEase((p.jump-.83)/.17));
        hip.rotation.set(back?.13*push-.07*crouch:.30*push+.22*reach,side*(back?-1.33*push+.11*crouch:.12*reach),0);
        lower.rotation.set(back?.14*reach:-.28*reach,side*(back?-.75*push+.17*reach+.15*crouch:.09*reach),0);
        foot.rotation.x=back?-.30*push+.17*reach:.37*reach;
      }else if(swimming){
        const outside=Math.max(0,-side*turn), stroke=frogStroke(p.gait+.48*outside).extension;
        const power=effort*(1+outside*.28), reach=outside*Math.sin(p.gait+.5)*effort;
        hip.rotation.set(back?.09*stroke*power-.07*crouch:.09*extension*activity+Math.sin(m.phase*1.8)*m.attention*.08,
          side*(back?-1.47*stroke*power:.30*reach+.08*Math.sin(p.gait+.5)*activity)+(!back?side*m.attention*.10:0),
          side*(back?-.13:.09)*stroke*power);
        const recovery=frogStroke(p.gait-.48).extension;
        lower.rotation.set(back?0:-.16*extension*activity,side*(back?-.59*stroke*power+.14*crouch:.11*reach),0);
        foot.rotation.x=back?-.29*stroke*power+.16*recovery*activity:.17*extension*activity;
      }else {
        hip.rotation.set(back?0:Math.sin(m.phase*1.8)*m.attention*.07,side*(back?.11*crouch:0),back?0:side*m.attention*.06);
        lower.rotation.set(0,side*(back?.15*crouch:0),0);foot.rotation.x=0;
      }
    }
    if(swimming)root.rotation.z=Math.sin(p.gait)*.041*activity-turn*.10;
  }};
}
function makeTadpole(index:number,low:boolean) {
  const root=new Group();root.name='Tadpole-'+index;const body=new Sculpture(low);
  body.add(skin([[0,0,-.086,.006,.006],[0,.002,-.065,.030,.025],
    [0,0,-.027,.039,.031],[0,-.002,.006,.027,.022],[0,0,.041,.010,.010]],20,'#444f36','#69725b',4),'#444f36');
  for(const side of [-1,1])body.oval([side*.024,.012,-.058],[.005,.005,.004],'#172821',undefined,10,6);
  const tail=new Group();tail.position.z=.017;const s=new Sculpture(low),vertices:number[]=[],indices:number[]=[];
  const stations=Array.from({length:low?11:19},(_,i)=>i/(low?10:18)*.19);
  stations.forEach((z,i)=>{
    const t=z/.19,x=Math.sin(t*Math.PI)*.011,h=Math.max(.0003,(.018+.035*Math.sin(t*Math.PI))*Math.pow(1-t,.65)),centre=Math.sin(t*Math.PI)*.007;
    const thickness=Math.max(.0002,.010*(1-t)**1.8);
    // A muscular centre and thin upper/lower membrane share the animated skin.
    for(const [dx,dy] of [[0,h],[thickness,0],[0,-h*.78],[-thickness,0]])vertices.push(x+dx,centre+dy,z);
    if(i<stations.length-1)for(let col=0;col<4;col++){
      const a=i*4+col,b=i*4+(col+1)%4;indices.push(a,b,a+4,b,b+4,a+4);
    }
  });
  const end=(stations.length-1)*4;indices.push(end,end+1,end+2,end,end+2,end+3);
  const membrane=new BufferGeometry();membrane.setAttribute('position',new Float32BufferAttribute(vertices,3));membrane.setIndex(indices);membrane.computeVertexNormals();s.add(membrane,'#788368');
  const fin=s.mesh('FinTail'),points=fin.geometry.attributes.position,base=points.array.slice(),expression=new MotionExpression(index+4);tail.add(fin);
  root.add(body.mesh('TadpoleHead'),tail);root.scale.setScalar(.85+index*.07);
  return {root,tail,update(p:TadpolePose,time:number){
    const m=expression.sample(p,time), turn=p.swimTurn??(-m.turn*.65), phase=p.swimPhase??m.phase*1.65;
    const power=p.swimPower??m.effort;
    root.position.set(p.x,p.y,p.z);root.rotation.set(p.pitch,p.yaw,-turn*.065+Math.sin(phase)*.043*power,'YXZ');
    for(let i=0;i<points.count;i++){
      const z=base[i*3+2],t=z/.19;
      points.setX(i,base[i*3]+t*t*(Math.sin(phase-z*29)*(.013+power*.034+m.attention*.012)+turn*.037));
    }
    points.needsUpdate=true;fin.geometry.computeVertexNormals();
  }};
}

export function makeAquaticModels(low=false) {
  const group=new Group();group.name='PondAnimals';const koi=Array.from({length:7},(_,i)=>makeKoi(i,low));
  const turtles=[makeTurtle(false,low),makeTurtle(true,low)],frog=makeFrog(low),tadpoles=Array.from({length:6},(_,i)=>makeTadpole(i,low));
  group.add(...koi.map(k=>k.root),...turtles.map(t=>t.root),frog.root,...tadpoles.map(t=>t.root));
  group.children.forEach(root=>root.scale.multiplyScalar(lifeScale));
  koi.forEach((m,i)=>m.root.userData.pondBodyId=`koi-${i}`);
  turtles.forEach((m,i)=>m.root.userData.pondBodyId=`turtle-${i}`);frog.root.userData.pondBodyId='frog';
  tadpoles.forEach((m,i)=>m.root.userData.pondBodyId=`tadpole-${i}`);
  return {group,koi,turtles,frog,tadpoles,dispose(){disposeSculpture(group);}};
}
export function disposeSculpture(group:Group) {
  const materials = new Set<MeshStandardMaterial>();
  const geometries = new Set<BufferGeometry>();
  group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (object instanceof InstancedMesh) object.dispose();
    if (object instanceof SkinnedMesh) object.skeleton.dispose();
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
