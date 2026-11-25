import { lifeScale } from './shore-layout';
/** Metres. Quiet habitat occupies the upper-right opening, clear of the three landings. */
export const animalIsland = { x: 5.7, z: -5.1, rx: 1.38, rz: 1.03 };
export const habitatPoint = (x:number,z:number) => ({x:animalIsland.x+x,z:animalIsland.z+z});
export const lilyPads = [
  { ...habitatPoint(-2.30,.80), radius: .43, angle: .35 },
  { ...habitatPoint(-1.71,1.57), radius: .34, angle: 2.3 },
  { ...habitatPoint(-.60,2.00), radius: .48, angle: 4.2 },
  { ...habitatPoint(.65,1.72), radius: .38, angle: 1.4 },
  { ...habitatPoint(1.82,1.00), radius: .45, angle: 5.3 },
  { x: -2.5, z: .65, radius: .33, angle: 2.8 },
  { x: 1.8, z: 3.7, radius: .29, angle: .8 },
] as const;
export const lilyLeafRadiusFactor = (angle: number) => 1 + .023 * Math.sin(angle * 5);
export const lilyLeafHeight = (fraction: number, angle: number) => .015
  + fraction ** 2 * (.011 + .009 * Math.sin(angle * 3))
  + fraction ** 4 * (.027 + .018 * Math.sin(angle * 4 + .5) + .009 * Math.cos(angle * 7));
/** The authored leaf centre is .015 m above its group origin. Keep landing
 * support and rendered buoyancy on the same surface; caller supplies the wave. */
export function padSurfaceHeight(surfaceHeight: number, occupied = false) {
  return .025 + surfaceHeight * .55 - (occupied ? .012 : 0) + .015;
}
export const frogFootHeight = .007 * lifeScale;
export const turtleBackHeight = .35 * lifeScale;
export function islandRadius(x: number, z: number) {
  return Math.hypot((x - animalIsland.x) / animalIsland.rx, (z - animalIsland.z) / animalIsland.rz);
}

// Two recesses on the far side leave the southern turtle beach intact.
export function habitatShoreScale(angle: number) {
  return 1 - .22 * Math.max(0, Math.cos(angle + .61)) ** 12
    - .07 * Math.max(0, Math.cos(angle + 2.02)) ** 8;
}

export function islandHeight(x: number, z: number) {
  const dx = x - animalIsland.x, dz = z - animalIsland.z;
  const a = Math.atan2(dz / animalIsland.rz, dx / animalIsland.rx);
  const r = islandRadius(x, z) / habitatShoreScale(a);
  // A continuous beach: swimming -> shallow wading -> dry bank.
  const t = Math.max(0, Math.min(1, (1.22 - r) / .55));
  const beach = -.26 + .56 * t * t * (3 - 2 * t);
  if (dz >= -.18 || beach <= .065) return beach;
  const inland = Math.min(1, (beach - .065) / .14);
  const back = Math.min(1, (-dz - .18) / .40);
  const shoulder = .102 * Math.exp(-((dx + .42) ** 2 / .19 + (dz + .58) ** 2 / .072));
  const hollow = .042 * Math.exp(-((dx - .42) ** 2 / .17 + (dz + .61) ** 2 / .047));
  // Sculpt the dry shoulder and the saddle behind it. Both fade to zero before the beach.
  return beach + (shoulder - hollow) * inland ** 2 * (3 - 2 * inland) * back ** 2 * (3 - 2 * back);
}
