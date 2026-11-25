import { BufferGeometry, DataTexture, Float32BufferAttribute, LinearFilter, Mesh, Ray, RGBAFormat, Vector3 } from 'three';
import type { Triangle } from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { Octree } from 'three/addons/math/Octree.js';
import { islandShores } from './world-layout';
import { outerBankHeight, pondRim, shorePoint, shoreSegments } from './shore-layout';
import { waterLevel } from './PondOptics';

const noise = new ImprovedNoise();
const clamp = (x:number) => Math.max(0,Math.min(1,x));
const smooth = (x:number) => {const t=clamp(x);return t*t*(3-2*t);};
export const terrainSize=36;
export const terrainHeightMin=-2.6,terrainHeightRange=3.4;
const apronShores = islandShores.map(({ x, z, rx, rz }) => ({ x, z, invX: 1 / rx, invZ: 1 / rz, phase: x * .4 }));
function apronAt(x: number, z: number) {
  let apron = 0;
  for (const shore of apronShores) {
    const dx = (x - shore.x) * shore.invX, dz = (z - shore.z) * shore.invZ;
    const squaredRadius = dx * dx + dz * dz;
    // At this distance the Gaussian is smaller than 1e-12 even at its outer peak.
    if (squaredRadius > 16) continue;
    const radius = Math.sqrt(squaredRadius);
    const edge = 1.30 + .09 * Math.sin(Math.atan2(dz, dx) * 3 + shore.phase);
    apron = Math.max(apron, Math.exp(-(((radius - edge) / .48) ** 2)));
  }
  return apron;
}

const terrainDetail = (x: number, z: number) => noise.noise(x * .43, z * .43, 23);

function bedRelief(x: number, z: number, apron: number, detail: number) {
  const broad = noise.noise(x * .15, z * .15, 17);
  // Keep the outer water light and shallow; the broad central basin carries
  // the extra depth, rather than a dark trench following the entire rim.
  const basin=1-smooth((Math.hypot(x/9.5,(z+.25)/8.5)-.12)/.85);
  const relief=-1.12-basin*.70+broad*.18+detail*.05+apron*.24;
  // Ease the highest submerged sediment below the deepest koi plus its fins;
  // a smooth ceiling avoids a flat clipped terrace or a new hidden obstacle.
  return -1.06 - .045 * Math.log1p(Math.exp((-1.06 - relief) / .045));
}

export function terrainAt(x: number, z: number) {
  const apron = apronAt(x, z), detail = terrainDetail(x, z);
  // Sediment uses its own broad, gently warped field instead of fragmented relief bands.
  const warpX=noise.noise(x*.07,z*.07,51)*2.2,warpZ=noise.noise(x*.07+5,z*.07,62)*2.2;
  const sand=clamp(.50+noise.noise((x+warpX)*.13+6,(z+warpZ)*.13,11)*.72+detail*.06+apron*.28);
  const growth=clamp(.38+noise.noise(x*.32,z*.32,42)*1.1)*(1-apron*.50);
  const gravel=clamp(noise.noise(x*.6,z*.6,4)*.8+.25);
  return { height: bedRelief(x, z, apron, detail), sand, growth, gravel };
}
export const bedHeightAt = (x: number, z: number) => bedRelief(x, z, apronAt(x, z), terrainDetail(x, z));
/** One rendered bottom from the shallow rim to the deep sediment. A small
 * smooth union removes the normal crease where the two height fields meet. */
export function pondFloorHeightAt(x:number,z:number,bed=bedHeightAt(x,z)) {
  const bank=outerBankHeight(x,z),blend=.08;
  const h=clamp(.5+.5*(bank-bed)/blend);
  return bed*(1-h)+bank*h+blend*h*(1-h);
}
export type FloorHeight = (x: number, z: number, bed?: number) => number;

function islandWaterline(geometry: BufferGeometry) {
  const p = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const edgePoints: { x: number; z: number }[] = [];
  const edges: { x: number; low: number; high: number; slope: number }[] = [];
  const vertex = (corner: number) => index ? index.getX(corner) : corner;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    edgePoints.length = 0;
    for (let j = 0; j < 3; j++) {
      const a = vertex(i + j), b = vertex(i + (j + 1) % 3);
      const ya = p.getY(a), yb = p.getY(b);
      if ((ya > waterLevel) === (yb > waterLevel)) continue;
      const t = (waterLevel - ya) / (yb - ya);
      edgePoints.push({ x: p.getX(a) + (p.getX(b) - p.getX(a)) * t,
        z: p.getZ(a) + (p.getZ(b) - p.getZ(a)) * t });
    }
    if (edgePoints.length !== 2 || edgePoints[0].z === edgePoints[1].z) continue;
    const [a, b] = edgePoints[0].z < edgePoints[1].z ? edgePoints : [edgePoints[1], edgePoints[0]];
    edges.push({ x: a.x, low: a.z, high: b.z, slope: (b.x - a.x) / (b.z - a.z) });
  }
  const bounds = geometry.boundingBox!;
  return (x: number, z: number) => {
    if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z) return false;
    let inside = false;
    for (const edge of edges) {
      if (z >= edge.low && z < edge.high && x < edge.x + (z - edge.low) * edge.slope) inside = !inside;
    }
    return inside;
  };
}

/** Lift the actual pond bed from authored bank triangles, not independent oval
 * colour patches. Only submerged slopes spread out; the dry island stays fixed. */
export function makeIslandTerrainSurface(banks:readonly {mesh:Mesh;x:number;z:number}[]){
  const point = new Vector3();
  const sources=banks.map(({mesh,x:cx,z:cz})=>{
    mesh.updateWorldMatrix(true,false);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', mesh.geometry.getAttribute('position').clone());
    geometry.setIndex(mesh.geometry.index);
    const p = geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      // Preserve the stored world-space precision of the source mesh.
      p.setXYZ(i, point.x, point.y, point.z);
    }
    geometry.computeBoundingBox();
    const containsLand = islandWaterline(geometry);
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p, i);
      const spread=1+.28*smooth((-point.y-.12)/1.15);
      point.x=cx+(point.x-cx)*spread;point.z=cz+(point.z-cz)*spread;
      // Bury the apron tip beneath the local basin so its edge cannot become
      // another raised patch, even on the side facing the deepest water.
      const blend=smooth((-point.y-.85)/.60),buried=Math.min(point.y,pondFloorHeightAt(point.x,point.z)-.15);
      point.y+=(buried-point.y)*blend;p.setXYZ(i,point.x,point.y,point.z);
    }
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!.clone();
    const tree = new Octree();
    // The bed uses vertical queries through dense, shallow banks. Larger
    // leaves avoid extra triangle-box tests when building the four trees.
    tree.trianglesPerLeaf = 32;
    // Several island crowns are planar at Y=.30. Give the subdivision
    // volume above their vertices so triangles on the top bound stay indexed.
    tree.bounds.copy(bounds).expandByScalar(.01);
    tree.fromGraphNode(new Mesh(geometry, mesh.material));
    geometry.dispose();
    return { tree, bounds, containsLand };
  });
  const ray = new Ray(new Vector3(), new Vector3(0, -1, 0));
  const candidates: Triangle[] = [];
  const heightAt: FloorHeight = (x, z, bed) => {
    let height = pondFloorHeightAt(x, z, bed);
    ray.origin.set(x, 5, z);
    for (const { tree, bounds } of sources) {
      if(x<bounds.min.x||x>bounds.max.x||z<bounds.min.z||z>bounds.max.z)continue;
      candidates.length = 0;
      tree.getRayTriangles(ray, candidates);
      let surface = -Infinity;
      for (const triangle of candidates) {
        if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, point)) surface = Math.max(surface, point.y);
      }
      if (surface === -Infinity) continue;
      // Keep the coarser radial mesh below the original bank here. If they
      // coincide, neighbouring triangles trade places across the same apron.
      const bank = surface - .13;
      const blend = .14;
      const h = clamp(.5 + .5 * (bank - height) / blend);
      const lifted = Math.min(-.06, height * (1 - h) + bank * h + blend * h * (1 - h));
      // An island apron can extend beneath a raised outer bank. It may lift
      // the floor, but must not cut that higher shore down to water level.
      height = Math.max(height, lifted);
    }
    return height;
  };
  return { heightAt, containsLand(x: number, z: number) {
    return sources.some(source => source.containsLand(x, z));
  }, dispose() { sources.forEach(({ tree }) => tree.clear()); candidates.length = 0; } };
}
/** Radial rows meet the bank at the exact same waterline vertices. */
export function makePondFloorGeometry(heightAt:FloorHeight=pondFloorHeightAt){
  const rows=80,positions=[pondRim.x,heightAt(pondRim.x,pondRim.z),pondRim.z],indices:number[]=[];
  const rim = Array.from({ length: shoreSegments }, (_, i) => shorePoint(i / shoreSegments * Math.PI * 2));
  for(let row=1;row<=rows;row++)for(let i=0;i<shoreSegments;i++){
    const edge=rim[i],t=row/rows;
    const x=pondRim.x+(edge.x-pondRim.x)*t,z=pondRim.z+(edge.z-pondRim.z)*t;
    positions.push(x,heightAt(x,z),z);
    const a=1+(row-1)*shoreSegments+i,b=1+(row-1)*shoreSegments+(i+1)%shoreSegments;
    if(row===1)indices.push(0,b,a);
    else indices.push(a-shoreSegments,b-shoreSegments,a,b-shoreSegments,b,a);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function makeTerrainMap(heightAt:FloorHeight=pondFloorHeightAt) {
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const worldX = (x / (size - 1) - .5) * terrainSize, worldZ = (y / (size - 1) - .5) * terrainSize;
    const t = terrainAt(worldX, worldZ), i = (y * size + x) * 4;
    const height = heightAt(worldX, worldZ, t.height);
    data[i]=Math.round(clamp((height-terrainHeightMin)/terrainHeightRange)*255);data[i+1]=Math.round(t.sand*255);
    data[i+2]=Math.round(t.growth*255);data[i+3]=Math.round(t.gravel*255);
  }
  const texture=new DataTexture(data,size,size,RGBAFormat);texture.minFilter=texture.magFilter=LinearFilter;texture.needsUpdate=true;
  return texture;
}
