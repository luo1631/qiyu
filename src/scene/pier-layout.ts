import { shorePoint } from './shore-layout';
import type { Obstacle } from './navigation';

const base=shorePoint(3.33,-.70),head=shorePoint(3.33,3.26);
const length=Math.hypot(head.x-base.x,head.z-base.z);
export const westPier = {
  base,head,length,dx:(head.x-base.x)/length,dz:(head.z-base.z)/length,
  width:1.02,headWidth:1.24,deck:.365,
};

export function pierPoint(along:number,across:number) {
  return {x:westPier.base.x+westPier.dx*along-westPier.dz*across,
    z:westPier.base.z+westPier.dz*along+westPier.dx*across};
}

/** Overlapping circles cover the supported deck and the fishing float. */
export function westPierObstacles(clearance:number):Obstacle[] {
  const {length,headWidth}=westPier,count=8;
  const radius=Math.hypot(headWidth*.5,length/(2*count))+.035+clearance;
  const obstacles=Array.from({length:count+1},(_,i)=>{
    const p=pierPoint(length*i/count,0);
    return {x:p.x*100,y:p.z*100,rx:radius*100,ry:radius*100};
  });
  const float=pierPoint(length+.72,-.38),gap=(.13+clearance)*100;
  obstacles.push({x:float.x*100,y:float.z*100,rx:gap,ry:gap});
  return obstacles;
}
