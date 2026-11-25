import type { Point } from '../config/islands';
import { safe } from './navigation';
import type { Bounds, Obstacle } from './navigation';
import { PerspectiveCamera, Vector3 } from 'three';
import { animalIsland } from './habitat-layout';
import { lifeScale, outerShoreObstacles, outerShelfClearance } from './shore-layout';
import { lotusObstacles } from './lotus-layout';
import { westPierObstacles } from './pier-layout';

// Navigation is in world centimetres, independent of viewport pixels.
// Renderer and glTF use metres. Navigation y maps to Three.js z.
// Framing follows the main islands. Routes can also use the bays beside them.
const framingBounds: Bounds = { left: -840, right: 800, top: -760, bottom: 660 };
export const worldBounds: Bounds = { left: -1080, right: 1085, top: -925, bottom: 815 };
export const islandScale = .70, islandHeightScale = .82;
export const boatSizeMultiplier = 1.2;
export const boatWorldScale = lifeScale * boatSizeMultiplier;
export const boatScale = .78 * boatWorldScale;
export const boatDraft = .07 * boatWorldScale;
// Three.js bank profiles and collision envelopes share these footprints.
export const worldIslands = [
  { id: 'github', scenery: 'lamps', x: -5.6, z: 4.5, rx: 2, rz: 1.6 },
  { id: 'about', scenery: 'blossoms', x: -6, z: -4.6, rx: 4.86, rz: 4.05 },
  { id: 'email', scenery: 'chimes', x: 5.8, z: 4.8, rx: 1.65, rz: 1.4 },
] as const;
// Metres: the rendered banks and wave boundary share these unexpanded footprints.
export const islandShores = [...worldIslands.map(i => ({ x: i.x, z: i.z, rx: i.rx * islandScale, rz: i.rz * islandScale })), animalIsland];
export const pondShores = islandShores;
// Three empty sites complete a seven-island capacity without blocking today's
// open water. Metres; these are planning footprints, not rendered/collision islands.
export const reservedIslandSites=[
  {id:'reserve-north',x:.65,z:-8.5,rx:1.6,rz:1.5},
  {id:'reserve-west',x:-10.85,z:1.45,rx:1.6,rz:1.5},
  {id:'reserve-east',x:9.3,z:0,rx:1.6,rz:1.5},
] as const;
// Conservative circular hull envelope, including the oar at every heading.
export const boatCollisionRadius = 1.4 * boatWorldScale;
export const worldObstacles: Obstacle[] = islandShores.map(i => ({
  x: i.x * 100, y: i.z * 100, rx: (i.rx + boatCollisionRadius) * 100, ry: (i.rz + boatCollisionRadius) * 100,
}));
worldObstacles.push(...outerShoreObstacles(boatCollisionRadius),...lotusObstacles(boatCollisionRadius),...westPierObstacles(boatCollisionRadius));
export const boatStart: Point = { x: 0, y: 620 };
const dockStandOff = boatCollisionRadius + .49;
// Fixed berths for the route and authored dock clearance checks.
export const worldDestinations: Record<string, { dock: Point }> = Object.fromEntries(worldIslands.map(island => [island.id, {
  dock: { x: (island.x - (Math.sign(island.x) || 1) * (island.rx * islandScale + dockStandOff)) * 100, y: island.z * 100 + 20 },
}]));

export const fishObstacles: Obstacle[] = worldIslands.map(island => ({ x: island.x * 100, y: island.z * 100,
  rx: island.rx * islandScale * 100 + 30, ry: island.rz * islandScale * 100 + 30 }));
fishObstacles.push({ x: animalIsland.x * 100, y: animalIsland.z * 100, rx: animalIsland.rx * 100 + 30, ry: animalIsland.rz * 100 + 30 });
fishObstacles.push(...outerShoreObstacles(.30),...westPierObstacles(.23));

// Deep koi clear the submerged bank, not only its waterline. Surface visitors
// retain fishObstacles so turtle beach access and frog pad landings stay intact.
export const koiObstacles: Obstacle[] = islandShores.map(shore => {
  const apron=shore===animalIsland?2.08:1.86;
  return {x:shore.x*100,y:shore.z*100,rx:(shore.rx*apron+.50)*100,ry:(shore.rz*apron+.50)*100};
});
koiObstacles.push(...outerShoreObstacles(outerShelfClearance),...westPierObstacles(.28));

export const outerDriftTargets: Point[] = [
  { x: -884, y: -48 },
  { x: 884, y: 38 },
  { x: 0, y: -620 },
  { x: 0, y: 738 },
];

export const boatBayVisits: readonly Point[] = [
  {x:-884,y:-48}, {x:-245,y:-825}, {x:207,y:-757}, {x:893,y:-389},
  {x:857,y:66}, {x:63,y:734},
];

export const toScene = (point: Point): [number, number, number] => [point.x / 100, 0, point.y / 100];

function frameNavigableWater() {
  const { left, right, top, bottom } = worldBounds;
  const columns = Math.ceil((right - left) / 25), rows = Math.ceil((bottom - top) / 25);
  const xs = Array.from({ length: columns + 1 }, (_, n) => left + (right - left) * n / columns);
  const points: Vector3[] = [];
  // A cross-section's extreme navigable positions determine its screen extent.
  // Include a margin for the gaps between samples and the full hull at any heading.
  const radius = boatCollisionRadius + .16;
  for (let row = 0; row <= rows; row++) {
    const y = top + (bottom - top) * row / rows;
    const water = xs.filter(x => safe({ x, y }, worldObstacles, worldBounds, -12));
    if (!water.length) continue;
    for (const x of [water[0], water[water.length - 1]]) for (let n = 0; n < 16; n++) {
      const angle = n / 16 * 2 * Math.PI;
      points.push(new Vector3(x / 100 + Math.cos(angle) * radius, .3, y / 100 + Math.sin(angle) * radius));
    }
  }
  return points;
}

const navigationFrame = frameNavigableWater();

export function pondFraming(width: number, height: number) {
  const portrait = width < 700 || height > width * 1.2;
  const base=new Vector3(...(portrait ? [0,34,24] as const : [0,23,24] as const));
  const target=new Vector3(0,.5,0),offset=base.clone().sub(target),fov=portrait?49:38;
  const camera=new PerspectiveCamera(fov,width/Math.max(height,1),.1,1200),point=new Vector3();
  const fits=(scale:number)=>{
    camera.position.copy(target).addScaledVector(offset,scale);camera.lookAt(target);camera.updateMatrixWorld();
    for(const x of [framingBounds.left,framingBounds.right])for(const z of [framingBounds.top,framingBounds.bottom])for(let i=0;i<32;i++){
      const angle=i/32*Math.PI*2;
      point.set(x/100+Math.cos(angle)*1.4,.3,z/100+Math.sin(angle)*1.4).project(camera);
      if(Math.abs(point.x)>.94||Math.abs(point.y)>.94)return false;
    }
    for(const site of reservedIslandSites)for(let i=0;i<32;i++){
      const angle=i/32*Math.PI*2;
      point.set(site.x+Math.cos(angle)*site.rx,.3,site.z+Math.sin(angle)*site.rz).project(camera);
      if(Math.abs(point.x)>.94||Math.abs(point.y)>.94)return false;
    }
    for (const edge of navigationFrame) {
      point.copy(edge).project(camera);
      if (Math.abs(point.x) > .958 || Math.abs(point.y) > .958) return false;
    }
    return true;
  };
  let lower=portrait?1:.82,upper=lower;
  while(!fits(upper)&&upper<16)upper*=1.5;
  for(let i=0;i<12;i++){const middle=(lower+upper)/2;if(fits(middle))upper=middle;else lower=middle;}
  return {position:target.addScaledVector(offset,upper).toArray() as [number,number,number],fov};
}
