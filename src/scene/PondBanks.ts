import { BufferGeometry, Color, DodecahedronGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { outerBankHeight, outerShoreDistance, shorePlantingBeds, shorePoint, shoreSedimentGLSL, shoreSegments, wetShoreSand } from './shore-layout';
import { stoneGeometry, weatherStone } from './stone-geometry';
import { makeShoreReeds } from './shore-reeds';
import { Sculpture, disposeSculpture } from './PondCreatures';
import { seededRandom } from './pond-life';
import { softenVegetation } from './vegetation-material';
import { cloudFieldGLSL } from './PondAtmosphere';
import type { makePondAtmosphere } from './PondAtmosphere';

const smooth = (lower: number, upper: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - lower) / (upper - lower)));
  return t * t * (3 - 2 * t);
};

/** One continuous pond rim. Both qualities share the full ground and shoreline. */
export function makePondBanks(atmosphere?: ReturnType<typeof makePondAtmosphere>['uniforms']) {
  const group=new Group();group.name='OuterPondBanks';
  const vertices:number[]=[],colors:number[]=[],distances:number[]=[],edges:number[]=[],planting:number[]=[],indices:number[]=[];
  const rows=[0,.03,.08,.16,.28,.45,.7,1,1.5,2.25,3.5,5,6.5,8,14,30,80,180];
  const drySand=new Color('#b3a181'),soil=new Color('#928065'),grass=new Color('#617654'),light=new Color('#81936b');
  const noise=new ImprovedNoise(),color=new Color();
  const margin = Array.from({ length: shoreSegments }, (_, col) => {
    const angle = col / shoreSegments * Math.PI * 2;
    const { x, z } = shorePoint(angle);
    const exposure = noise.noise(x * .16, z * .16, 22) * .74 + noise.noise(x * .44, z * .44, 62) * .26;
    return { angle, sandWidth: Math.max(.20, .51 + exposure * 2.45) };
  });
  for(const outward of rows)for(let col=0;col<shoreSegments;col++) {
    const {angle,sandWidth}=margin[col],{x,z}=shorePoint(angle,-outward),y=outerBankHeight(x,z);
    vertices.push(x,y,z);
    distances.push(outward);
    edges.push(outward - sandWidth);
    const variation=noise.noise(x*.8,z*.8,17);
    let cover = 0;
    for (const bed of shorePlantingBeds) {
      const offset = angle - bed.angle;
      const along = Math.atan2(Math.sin(offset), Math.cos(offset)) / bed.span;
      const across = (outward - bed.outward) / bed.depth;
      cover = Math.max(cover, 1 - smooth(.12, 1.22, along * along + across * across + variation * .42));
    }
    planting.push(cover * smooth(.7, 1.65, outward));
    // Wet sand shares the sediment colour at the waterline. The dry grass
    // breaks into irregular pockets whose width follows the same rim row.
    color.copy(wetShoreSand).lerp(drySand,smooth(.04,.47,outward));
    const edge = outward - sandWidth - variation * .28;
    color.lerp(soil, smooth(-.24,.24,edge) * (1 - smooth(.40,.89,edge)) * .48);
    const meadow=smooth(-.13,.82,edge);
    color.lerp(grass,meadow);
    const detail=1-smooth(1.5,3.5,outward);
    color.lerp(light,Math.max(0,variation)*.32*detail*meadow);
    colors.push(color.r,color.g,color.b);
  }
  for(let row=0;row<rows.length-1;row++)for(let col=0;col<shoreSegments;col++) {
    const a=row*shoreSegments+col,b=row*shoreSegments+(col+1)%shoreSegments,c=a+shoreSegments,e=b+shoreSegments;
    indices.push(a,b,c,b,e,c);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
  geometry.setAttribute('bankDistance',new Float32BufferAttribute(distances,1));
  geometry.setAttribute('bankMeadowEdge',new Float32BufferAttribute(edges,1));
  geometry.setAttribute('bankPlanting',new Float32BufferAttribute(planting,1));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .94 });
  const bankSunlight = { value: 0 };
  material.onBeforeCompile = shader => {
    if (atmosphere) Object.assign(shader.uniforms, atmosphere);
    shader.uniforms.bankSunlight = bankSunlight;
    shader.uniforms.wetShoreSand = { value: wetShoreSand };
    const varyings = 'varying vec3 bankPoint;\nvarying float bankOutward;\nvarying float meadowEdge;\nvarying float plantingShade;\n';
    shader.vertexShader = 'attribute float bankDistance;\nattribute float bankMeadowEdge;\nattribute float bankPlanting;\n' + varyings + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nbankPoint = position;\nbankOutward = bankDistance;\nmeadowEdge = bankMeadowEdge;\nplantingShade = bankPlanting;');
    shader.fragmentShader = cloudFieldGLSL + shoreSedimentGLSL + varyings
      + 'uniform float bankSunlight;\nuniform vec3 wetShoreSand;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 point = bankPoint.xz;
      float meadow = smoothstep(1.1, 2.6, bankOutward);
      float patches = noise(point * vec2(.19, .27) + vec2(3.72, 9.1));
      float tussocks = noise(point * 2.5 + patches * 1.4);
      float fringe = smoothstep(.23, .78, meadowEdge + .34 * tussocks + .32 * patches)
        * smoothstep(.28, .82, bankOutward);
      float meadowTone = smoothstep(-.40, .44, patches + tussocks * .32);
      vec3 grassTone = mix(vec3(.107, .149, .096), vec3(.147, .182, .117), meadowTone);
      diffuseColor.rgb = mix(diffuseColor.rgb, grassTone, meadow * .64);
      diffuseColor.rgb = mix(diffuseColor.rgb, grassTone, fringe * (1.0 - meadow) * .72);
      float litter = smoothstep(-.33, .35, patches + .50 * tussocks);
      vec3 undergrowth = mix(vec3(.080, .122, .086), vec3(.110, .150, .092), litter);
      diffuseColor.rgb = mix(diffuseColor.rgb, undergrowth, plantingShade * (.56 + tussocks * .26));
      float fibers = noise(point * vec2(22.0, 14.0));
      float detail = 1.0 - smoothstep(.028, .085, length(fwidth(point)));
      float dry = smoothstep(.035, .48, bankOutward);
      float deposits = noise(point * 2.1 + patches * 1.6);
      float nearSand = dry * (1.0 - smoothstep(.6, 1.8, bankOutward));
      float sandGrain = 1.0 - smoothstep(.009, .029, max(length(dFdx(point)), length(dFdy(point))));
      diffuseColor.rgb *= 1.0 + dry * (fibers * .10 * detail + noise(point * 4.8) * .09)
        + nearSand * deposits * .12;
      if (bankOutward < .92) {
        vec3 sediment = shoreSediment(point, bankOutward, wetShoreSand, sandGrain);
        diffuseColor.rgb = mix(diffuseColor.rgb, sediment, 1.0 - smoothstep(.10, .92, bankOutward));
      }
      ${atmosphere ? `
        float shade = cloudOpacity(cloudIntersection(bankPoint, atmosphereSun));
        diffuseColor.rgb *= 1.0 - shade * bankSunlight * dry * .24;` : ''}
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(.56, .94, smoothstep(.03, .65, bankOutward));`);
  };
  material.customProgramCacheKey = () => atmosphere ? 'pond-bank-sky' : 'pond-bank';
  const bank=new Mesh(geometry,material);bank.name='ContinuousOuterBank';bank.castShadow=bank.receiveShadow=true;group.add(bank);
  const random=seededRandom(74021);
  // Fieldstones collect at bends and below grass. Broad intervening stretches
  // can show the continuous wet margin and the traces of water in sand.
  const patches = [
    { angle: .28, span: .14, count: 6 }, { angle: 1.87, span: .17, count: 7 },
    { angle: 2.66, span: .19, count: 9 }, { angle: 3.49, span: .14, count: 8 },
    { angle: 4.18, span: .11, count: 7 }, { angle: 4.82, span: .13, count: 6 },
    { angle: 5.57, span: .17, count: 9 },
  ];
  const points = patches.flatMap(({ angle, span, count }) => Array.from({ length: count }, (_, i) => {
    const a = angle + span * ((i / (count - 1) - .5) * 2 + (random() - .5) * .15);
    const { x, z } = shorePoint(a, .16 - random() * .96);
    return { x, z, d: outerShoreDistance(x,z) };
  }));
  const object=new Object3D(),rockMaterial=weatherStone(new MeshStandardMaterial({color:'#bcbab2',vertexColors:true,roughness:.89}));
  const dampStone = new Color().setRGB(.59,.64,.52), dryStone = new Color().setRGB(1.00,.96,.88), tint = new Color();
  for(let kind=0;kind<3;kind++) {
    const positions=points.filter((_,i)=>i%5===kind),rocks=new InstancedMesh(stoneGeometry(kind),rockMaterial,positions.length);
    rocks.name='BankStones-'+kind;
    positions.forEach((p,i)=>{const s=.09+random()*.17+(i%8===0?.12:0);
      object.position.set(p.x,outerBankHeight(p.x,p.z)-s*(.06+random()*.14),p.z);
      object.scale.set(s*1.3,s*.65,s);object.rotation.set(random()*.16,random()*Math.PI*2,random()*.14);
      object.updateMatrix();rocks.setMatrixAt(i,object.matrix);
      tint.copy(dampStone).lerp(dryStone,smooth(.0,.60,p.d)*.76);
      rocks.setColorAt(i,tint);
    });rocks.castShadow=rocks.receiveShadow=true;group.add(rocks);
  }
  // The slope sheds small fragments near exposed stone clusters. Their
  // embedded bases and muted tints keep the rim legible at the home camera.
  const gravelRandom = seededRandom(52491);
  const gravelColor = new Color();
  const flank = new Color().setRGB(.34, .37, .28), ochre = new Color().setRGB(.55, .46, .31);
  const gravelSource = new DodecahedronGeometry(.83);
  const gravelMaterial = weatherStone(new MeshStandardMaterial({ color: '#bcbab2', roughness: .91 }));
  const groundNormal = new Vector3();
  for (let kind = 0; kind < 3; kind++) {
    const clusters = points.filter((p, i) => i % 5 === kind && p.d > -.11);
    if (!clusters.length) continue;
    const gravel = new InstancedMesh(gravelSource, gravelMaterial, clusters.length * 4);
    gravel.name = 'BankGravel-' + kind;
    clusters.forEach((p, i) => {
      const direction = Math.atan2(p.z, p.x) + Math.PI * .55;
      for (let j = 0; j < 4; j++) {
        const angle = direction + (gravelRandom() - .5) * 3.24;
        const spread = .16 + .46 * gravelRandom();
        const x = p.x + Math.cos(angle) * spread, z = p.z + Math.sin(angle) * spread;
        const span = .016 + .035 * gravelRandom() ** 1.3;
        const y = outerBankHeight(x, z);
        const slopeX = (outerBankHeight(x + .06, z) - outerBankHeight(x - .06, z)) / .12;
        const slopeZ = (outerBankHeight(x, z + .06) - outerBankHeight(x, z - .06)) / .12;
        object.position.set(x, y - span * .29, z);
        object.scale.set(span * (1.0 + gravelRandom() * .50), span * .50, span);
        object.quaternion.setFromUnitVectors(object.up, groundNormal.set(-slopeX, 1, -slopeZ).normalize());
        object.rotateY(angle);
        object.updateMatrix();
        gravel.setMatrixAt(i * 4 + j, object.matrix);
        gravel.setColorAt(i * 4 + j, gravelColor.copy(flank).lerp(ochre, gravelRandom()));
      }
    });
    gravel.receiveShadow = true;
    group.add(gravel);
  }
  const plants=new Sculpture(false);
  points.filter((p,i)=>i%5>=3&&p.d>.04).forEach((p,index)=>{
    const y=outerBankHeight(p.x,p.z);
    for(let blade=0;blade<5;blade++) {
      const angle=blade*2.39996+index,height=.12+random()*.22,bend=.09+random()*.15,w=.009+random()*.014;
      const v:number[]=[],faces:number[]=[];
      for(let row=0;row<=6;row++)for(const side of [-1,1]) {
        const t=row/6,width=w*(.55+.58*Math.sin(Math.PI*t))*(1-t)**.55+.0005;
        v.push(p.x+Math.cos(angle)*bend*t*t-Math.sin(angle)*width*side,
          y+height*t-.07*t**3,p.z+Math.sin(angle)*bend*t*t+Math.cos(angle)*width*side);
        if(row<6&&side===1){const k=row*2;faces.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
      const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.setIndex(faces);g.computeVertexNormals();
      plants.add(g,blade%3?'#708665':'#9aab76');
    }
  });
  group.add(plants.mesh('BankSedges',softenVegetation(new MeshStandardMaterial({vertexColors:true,side:DoubleSide}))),makeShoreReeds());
  return { group, update(sunPower: number) { bankSunlight.value = sunPower / 2.6; }, dispose() { disposeSculpture(group); } };
}
