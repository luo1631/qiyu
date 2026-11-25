// GPU probes execute the garden material's actual vertex patch. No CPU copy of
// its deformation is used, and the forcing comes from the real wave solver.
import { BufferGeometry, DataUtils, Float32BufferAttribute, HalfFloatType, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, ShaderMaterial, Vector3, WebGLRenderer, WebGLRenderTarget, Camera } from 'three';
import { makePondGarden } from '../src/scene/PondGarden';
import { makePondWakeField, wakeFieldExtent } from '../src/scene/PondWakeField';
import { PaperWakeField } from '../src/scene/paper-wake';
import { makePondSurface } from '../src/scene/PondSurface';
const check=(condition:boolean,message:string)=>{if(!condition)throw new Error(message);};

export function runGardenFlowChecks(resolution=160) {
  const renderer=new WebGLRenderer({antialias:false}),garden=makePondGarden(false);
  const field=makePondWakeField(renderer,resolution,[]),target=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:false});
  const shader={uniforms:{},vertexShader:`varying vec3 displacement;
    void main(){
      vec2 screenUV=uv;
      #include <begin_vertex>
      displacement=mat3(instanceMatrix)*(transformed-position);
      gl_Position=vec4(screenUV*2.0-1.0,0.0,1.0);
    }`,fragmentShader:'varying vec3 displacement;void main(){gl_FragColor=vec4(displacement,1.0);}'};
  const source=garden.group.getObjectByName('TallWaterGrass') as InstancedMesh;
  (source.material as MeshStandardMaterial).onBeforeCompile(shader as Parameters<MeshStandardMaterial['onBeforeCompile']>[0],renderer);
  const material=new ShaderMaterial({...shader,depthTest:false,depthWrite:false}),geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute([0,.83,0,0,.83,0,0,.83,0],3));
  geometry.setAttribute('uv',new Float32BufferAttribute([0,0,2,0,0,2],2));
  const mesh=new InstancedMesh(geometry,material,1),scene=new Scene(),camera=new Camera(),pixels=new Uint16Array(4);
  mesh.frustumCulled=false;scene.add(mesh);
  const probe=(localHeight=.83,scale=.65,depth=.9)=>{
    const position=geometry.getAttribute('position');for(let n=0;n<3;n++)position.setY(n,localHeight);position.needsUpdate=true;
    const matrix=new Matrix4().makeScale(scale,scale,scale);matrix.setPosition(-2,-depth,0);mesh.setMatrixAt(0,matrix);mesh.instanceMatrix.needsUpdate=true;
    renderer.setRenderTarget(target);renderer.setViewport(0,0,1,1);renderer.setScissorTest(false);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixels);renderer.setRenderTarget(null);
    return {x:DataUtils.fromHalfFloat(pixels[0]),y:DataUtils.fromHalfFloat(pixels[1]),z:DataUtils.fromHalfFloat(pixels[2]),alpha:DataUtils.fromHalfFloat(pixels[3])};
  };
  let peak=0,positive=0,negative=0,deepPeak=0,peakTime=0,maxRoot=0,maxRise=-Infinity,maxTip=0,previous=0,maxFrameChange=0;
  try{
    field.update(0,[]);garden.update(20,0,field.texture,wakeFieldExtent/resolution);
    const calm=probe(),deepCalm=probe(.83,.65,2);
    const source={x:-2.65,z:0,born:0,strength:.85,kind:'touch' as const,headingX:0,headingZ:1};
    for(let n=1;n<=150;n++){
      const time=n/60;field.update(time,[],undefined,[source]);garden.update(20,0,field.texture,wakeFieldExtent/resolution);
      const tip=probe(),root=probe(0),deep=probe(.83,.65,2),dx=tip.x-calm.x;
      const change=Math.hypot(dx,tip.z-calm.z);if(change>peak){peak=change;peakTime=time;}
      positive=Math.max(positive,dx);negative=Math.min(negative,dx);
      deepPeak=Math.max(deepPeak,Math.hypot(deep.x-deepCalm.x,deep.z-deepCalm.z));
      maxRoot=Math.max(maxRoot,Math.hypot(root.x,root.y,root.z));maxRise=Math.max(maxRise,tip.y);
      maxTip=Math.max(maxTip,Math.hypot(tip.x,tip.z));maxFrameChange=Math.max(maxFrameChange,Math.abs(dx-previous));previous=dx;
    }
    check(peak>.015,`a nearby real wave must visibly bend the upper blade by at least 1.5 cm: ${JSON.stringify({peak,calm,positive,negative,maxRoot,maxRise,maxTip})}`);
    check(positive>.001&&negative<-.001,'a passing crest must reverse the bend rather than loop autonomously');
    check(maxRoot===0&&maxRise<=0,'roots remain fixed and tips cannot fly above their resting height');
    check(maxTip<.18&&maxFrameChange<.08,'interference remains bounded and does not snap the grass');
    check(deepPeak<peak&&deepPeak>peak*.3,'depth softens the response without making deeper grass inert');
    const frozen=probe();garden.update(20,0,field.texture,wakeFieldExtent/resolution);
    check(JSON.stringify(probe())===JSON.stringify(frozen),'paused scene time and wave state freeze the grass');
    field.update(12,[]);const contacts=new PaperWakeField();let paperPeak=0;
    for(let n=0;n<=150;n++){
      const time=12+n/60;contacts.trace(-6+n/60*4,.1,time,400);field.update(time,contacts.events);
      garden.update(20,0,field.texture,wakeFieldExtent/resolution);const tip=probe();
      paperPeak=Math.max(paperPeak,Math.hypot(tip.x-calm.x,tip.z-calm.z));
    }
    check(paperPeak>.015,`the narrow paper tail must still move nearby grass: ${paperPeak}`);
    return {resolution,peak,paperPeak,positive,negative,deepPeak,peakTime,maxRoot,maxRise,maxTip,maxFrameChange,checks:7};
  }finally{geometry.dispose();material.dispose();mesh.dispose();target.dispose();garden.dispose();field.dispose();renderer.dispose();renderer.forceContextLoss();}
}

export async function runCompactGardenFlowChecks(resolution=160) {
  const renderer=new WebGLRenderer({antialias:false}),garden=makePondGarden(true),calm=makePondGarden(true);
  const field=makePondWakeField(renderer,resolution,[]),cell=wakeFieldExtent/resolution,surface=makePondSurface(renderer,cell);
  const target=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:false});
  const grass=garden.group.getObjectByName('TallWaterGrass') as InstancedMesh;
  const still=calm.group.getObjectByName('TallWaterGrass') as InstancedMesh;
  const matrix=new Matrix4(),plant=new Vector3();
  let site=0;
  for(let i=0;i<grass.count;i++){
    grass.getMatrixAt(i,matrix);
    if(matrix.elements[12]>plant.x){plant.setFromMatrixPosition(matrix);site=i;}
  }
  grass.getMatrixAt(site,matrix);
  const shader={uniforms:{},vertexShader:`varying vec3 displacement;
    void main(){
      #include <begin_vertex>
      displacement=mat3(instanceMatrix)*(transformed-position);
      gl_Position=vec4(uv*2.0-1.0,0.0,1.0);
    }`,fragmentShader:'varying vec3 displacement;void main(){gl_FragColor=vec4(displacement,1.0);}'};
  (grass.material as MeshStandardMaterial).onBeforeCompile(shader as Parameters<MeshStandardMaterial['onBeforeCompile']>[0],renderer);
  const material=new ShaderMaterial({...shader,depthTest:false,depthWrite:false}),geometry=new BufferGeometry();
  const vertices=new Float32BufferAttribute([0,.83,0,0,.83,0,0,.83,0],3);
  const motion=new InstancedBufferAttribute(new Float32Array(3),3);
  geometry.setAttribute('position',vertices);geometry.setAttribute('uv',new Float32BufferAttribute([0,0,2,0,0,2],2));
  geometry.setAttribute('gardenRootFlow',motion);
  const mesh=new InstancedMesh(geometry,material,1),scene=new Scene(),camera=new Camera(),pixels=new Uint16Array(4);
  mesh.setMatrixAt(0,matrix);mesh.frustumCulled=false;scene.add(mesh);
  function probe(source: InstancedMesh,height: number) {
    for(let n=0;n<3;n++)vertices.setY(n,height);
    vertices.needsUpdate=true;
    const push=source.geometry.getAttribute('gardenRootFlow');
    motion.setXYZ(0,push.getX(site),push.getY(site),push.getZ(site));motion.needsUpdate=true;
    renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.render(scene,camera);
    renderer.readRenderTargetPixels(target,0,0,1,1,pixels);renderer.setRenderTarget(null);
    return [DataUtils.fromHalfFloat(pixels[0]),DataUtils.fromHalfFloat(pixels[1]),DataUtils.fromHalfFloat(pixels[2])] as const;
  }
  let peak=0,positive=0,negative=0,root=0,maxRise=-Infinity,tipMax=0;
  try{
    const splash={x:plant.x-.63,z:plant.z,born:0,strength:.85,kind:'touch' as const,headingX:0,headingZ:1};
    for(let n=1;n<=126;n++){
      const time=n/60;field.update(time,[],undefined,[splash]);await surface.update(time,field.texture,field.active);
      garden.update(time,0,field.texture,cell,surface.wake);calm.update(time);
      const tip=probe(grass,.83),base=probe(still,.83),dx=tip[0]-base[0];
      peak=Math.max(peak,Math.hypot(dx,tip[2]-base[2]));positive=Math.max(positive,dx);negative=Math.min(negative,dx);
      maxRise=Math.max(maxRise,tip[1]);tipMax=Math.max(tipMax,Math.hypot(tip[0],tip[2]));
      if(n%8===0)root=Math.max(root,Math.hypot(...probe(grass,0)));
    }
    check(plant.x>11.8&&plant.x<11.90,'the outermost shelf exercises valid bilinear readback at the edge');
    check(peak>.014&&positive>.001&&negative<-.001,`the cached wave at the root still bends and reverses the actual geometry ${JSON.stringify({peak,positive,negative})}`);
    check(root===0&&maxRise<=0&&tipMax<.18,'compact shoots stay grounded and bounded');
    return {resolution,root:plant.toArray(),peak,positive,negative,maxRise,tipMax,reads:surface.reads};
  }finally{
    geometry.dispose();material.dispose();mesh.dispose();target.dispose();surface.dispose();garden.dispose();calm.dispose();field.dispose();renderer.dispose();renderer.forceContextLoss();
  }
}
