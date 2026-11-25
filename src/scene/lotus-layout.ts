import { shorePoint } from './shore-layout';
import type { Obstacle } from './navigation';

export type LotusLeafPlacement = readonly [x: number, z: number, radius: number, angle: number];
export type LotusFlowerPlacement = readonly [x: number, z: number, height: number, scale: number, form: 'open' | 'bud', tint?: 'pale'];

const shorePatches = [{angle:3.74,inward:1.1},{angle:4.23,inward:1.02},{angle:5.61,inward:1.15},{angle:2.83,inward:1.12}]
  .map((anchor,patch)=>{
    const centre=shorePoint(anchor.angle,anchor.inward);
    const offsets=patch%2===0?[[-.36,-.15,.30],[.25,.02,.35],[.02,.48,.29],[.55,.44,.25]]:[[-.30,.04,.28],[.23,.0,.26],[.02,.44,.31]];
    const leaves: LotusLeafPlacement[]=offsets.map(([x,z,r],i)=>[x,z,r,i*1.9+patch]);
    const flowers: LotusFlowerPlacement[]=[[.12,.17,patch%2===0?.32:.33,1,patch%2===0?'open':'bud']];
    return { ...centre, leaves, flowers };
  });

export const lotusPatches = [
  ...shorePatches,
  {x:-4.78,z:8.70,leaves:[[-.63,-.13,.28,.62],[-.18,-.33,.37,2.78],[.37,-.17,.46,4.31],
    [.65,.29,.30,.26],[-.07,.42,.34,1.74]],flowers:[[-.32,.17,.46,1.13,'open'],[.50,.08,.35,.68,'bud']]},
  {x:9.97,z:2.75,leaves:[[-.24,-.43,.27,1.09],[.18,-.08,.41,3.18],[.54,.28,.34,.84],[-.06,.46,.30,5.20]],
    flowers:[[.27,.40,.38,.95,'open','pale']]},
  {x:-10.62,z:-4.83,leaves:[[-.27,-.43,.27,5.31],[-.10,.03,.39,.74],[.28,.35,.33,2.75]],
    flowers:[[-.16,.30,.35,.84,'open']]},
  {x:3.82,z:8.63,leaves:[[-.28,-.19,.30,1.73],[.16,.17,.38,3.16],[.64,.31,.23,5.10]],
    flowers:[[.39,.00,.35,.86,'bud']]},
  // Left bay, far shore, and right bay, with gaps toward the middle of the pond.
  {x:-10.24,z:2.63,leaves:[[-.59,-.16,.29,2.47],[-.16,-.43,.34,.53],[.28,-.19,.41,3.40],
    [.51,.35,.30,1.26],[-.06,.46,.32,5.38]],
    flowers:[[-.25,.17,.46,1.09,'open'],[.42,-.34,.34,.83,'open','pale']]},
  {x:.30,z:-10.56,leaves:[[-.75,.13,.28,.64],[-.41,-.26,.41,4.32],[.13,-.43,.30,1.98],
    [.12,.22,.47,5.71],[.65,.02,.34,2.74],[.74,.51,.24,.88]],
    flowers:[[-.42,.17,.39,.97,'open','pale'],[.37,-.19,.49,1.21,'open']]},
  {x:10.66,z:-1.82,leaves:[[-.34,-.49,.29,1.84],[.17,-.24,.42,3.65],[-.28,.07,.30,5.10],
    [.22,.35,.35,2.82],[.64,.57,.25,.24]],
    flowers:[[.34,-.46,.47,1.13,'open'],[-.06,.45,.38,.97,'open','pale']]},
  {x:.10,z:.22,leaves:[[-.44,.05,.41,4.66],[.33,-.37,.34,1.89]],
    flowers:[[-.12,-.30,.48,1.12,'open'],[.50,.24,.36,.88,'open','pale']]},
] satisfies { x: number; z: number; leaves: LotusLeafPlacement[]; flowers: LotusFlowerPlacement[] }[];

export function lotusObstacles(clearance: number): Obstacle[] {
  return lotusPatches.map(patch=>{
    const radius=Math.max(...patch.leaves.map(([x,z,r])=>Math.hypot(x,z)+r*1.023+.047),
      ...patch.flowers.map(([x,z,,s])=>Math.hypot(x,z)+.20*s));
    return {x:patch.x*100,y:patch.z*100,rx:(radius+clearance)*100,ry:(radius+clearance)*100};
  });
}
