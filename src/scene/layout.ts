import type { IslandLayout } from '../config/islands';
export function navigationLayout(width:number,height:number,islands:IslandLayout[]){
  const scale=islands[0].scale;
  // Short landscape screens need the original footprint to keep docks clear.
  const compact=height<600;
  const minimum=width<700?(compact?.25:.27):(compact?.30:.32);
  const boatScale=Math.max(minimum,scale*(compact?.50:.54));
  const margin=96*boatScale+3;
  return {
    boatScale,
    bounds:{left:30,top:110,right:width-30,bottom:height-125},
    obstacles:islands.map(l=>({x:l.x,y:l.y-8*l.scale,rx:147*l.scale+margin,ry:65*l.scale+margin})),
  };
}
