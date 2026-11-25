import { Color } from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

/** Start with one elliptical pond rim, then make small contour/section changes.
 * These dimensions describe the visible land, independently of navigation proxies. */
export const pondRim = {x:0,z:-.9,rx:14.0,rz:12.3};
export const wetShoreSand = new Color('#a19479');
/** The same water-laid sediment crosses the outer shoreline. The shader that
 * owns each side supplies its signed distance and scene-space gradient noise. */
export const shoreSedimentGLSL = `
  vec3 shoreSediment(vec2 point, float distanceToRim, vec3 sandColor, float grain) {
    float exposure = noise(point * .42 + vec2(8.2, 16.3));
    float deposits = noise(point * vec2(3.1, 2.2) + exposure * 1.2);
    float damp = 1.0 - smoothstep(.06, .68, abs(distanceToRim) + deposits * .18);
    float grit = noise(point * 32.0) * grain;
    float ledge = distanceToRim + .19 * exposure + .068 * deposits;
    float line = 1.0 - smoothstep(.026, .087, abs(ledge - .24));
    float breakage = smoothstep(-.18, .40, deposits + exposure * .64);
    vec3 pigment = mix(sandColor, sandColor * vec3(.80, .84, .79), damp * .52);
    return pigment * (1.0 + deposits * .17 + grit * .15 - line * breakage * .078);
  }
`;
// Broad bays and promontories, shared by the mesh, GPU water and collision sampling.
const rimWaves=[{amplitude:.052,frequency:3,phase:.4},{amplitude:.027,frequency:5,phase:-1},{amplitude:.011,frequency:7,phase:1.8}];
const outerRimRadiusSquared = (1.001 + rimWaves.reduce((radius, wave) => radius + Math.abs(wave.amplitude), 0)) ** 2;
export const rimRadius=(angle:number)=>1+rimWaves.reduce((r,w)=>r+w.amplitude*Math.sin(angle*w.frequency+w.phase),0);
const rimDerivative=(angle:number)=>rimWaves.reduce((r,w)=>r+w.amplitude*w.frequency*Math.cos(angle*w.frequency+w.phase),0);
export const outerShelfClearance=3.7;
export const shoreSegments=256;
export function shorePoint(angle:number,inward=0){
  const r=rimRadius(angle)-inward/pondRim.rz;
  return {x:pondRim.x+Math.cos(angle)*pondRim.rx*r,z:pondRim.z+Math.sin(angle)*pondRim.rz*r};
}

// The broad planting beds also tint the soil beneath the same plants.
type ShoreBed = { angle: number; outward: number; span: number; depth: number; flowers?: boolean };
export const shorePlantingBeds: readonly ShoreBed[] = [
  { angle: 3.65, outward: 2.79, span: .18, depth: 1.68 },
  { angle: 3.94, outward: 5.42, span: .18, depth: 2.35 },
  { angle: 4.27, outward: 2.41, span: .17, depth: 1.65, flowers: true },
  { angle: 5.16, outward: 2.61, span: .18, depth: 1.68, flowers: true },
  { angle: 5.50, outward: 3.76, span: .21, depth: 2.28 },
  { angle: 5.98, outward: 2.70, span: .19, depth: 1.94 },
  { angle: .43, outward: 2.30, span: .22, depth: 1.82, flowers: true },
  { angle: 1.03, outward: 3.03, span: .19, depth: 2.35 },
  { angle: 1.70, outward: 3.88, span: .16, depth: 1.87, flowers: true },
  { angle: 2.26, outward: 2.43, span: .19, depth: 1.68, flowers: true },
  { angle: 2.65, outward: 2.83, span: .18, depth: 1.62 },
  { angle: 4.62, outward: 5.26, span: .19, depth: 2.28 },
  { angle: 4.95, outward: 6.13, span: .15, depth: 2.10 },
  { angle: 1.67, outward: 4.31, span: .22, depth: 2.45 },
];

// Keep the new foundation complete; openings are a subsequent shape decision.
export const rimOpenings: readonly {angle:number;halfWidth:number}[] = [];

/** Base scale for the pond's living visitors. The boat applies its own multiplier. */
export const lifeScale = .75;
const noise = new ImprovedNoise();
const smooth = (t:number) => { const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v); };
const bankHills = [
  { angle: 4.55, distance: 5.4, span: .29, depth: 2.63, height: .53 },
  { angle: 5.04, distance: 6.25, span: .24, depth: 2.70, height: .42 },
  { angle: 1.68, distance: 4.9, span: .29, depth: 2.57, height: .49 },
];

function distanceFromRim(angle: number, radius: number) {
  let distance = (radius - rimRadius(angle)) * pondRim.rz;
  for (const opening of rimOpenings) {
    const offset = angle - opening.angle;
    const separation = Math.abs(Math.atan2(Math.sin(offset), Math.cos(offset)));
    distance = Math.min(distance, (separation - opening.halfWidth) * radius * pondRim.rz);
  }
  return distance;
}

/** Positive on land. Zero is shared by the mesh, water shading and wave mask. */
export function outerShoreDistance(x:number,z:number) {
  const px = (x - pondRim.x) / pondRim.rx, pz = (z - pondRim.z) / pondRim.rz;
  return distanceFromRim(Math.atan2(pz, px), Math.sqrt(px * px + pz * pz));
}

/** Boolean-only callers can skip the angular profile beyond every part of
 * the rim. Openings extend beyond that bound and still use the exact test. */
export function isOnOuterBank(x: number, z: number) {
  const px = (x - pondRim.x) / pondRim.rx, pz = (z - pondRim.z) / pondRim.rz;
  const radiusSquared = px * px + pz * pz;
  return (!rimOpenings.length && radiusSquared > outerRimRadiusSquared)
    || distanceFromRim(Math.atan2(pz, px), Math.sqrt(radiusSquared)) >= 0;
}

/** Water2 uses the identical rim and opening parameters, without ellipse lobes. */
export const outerShoreGLSL=`float outerShoreDistance(vec2 p){
  vec2 q=(p-vec2(${pondRim.x.toFixed(2)},${pondRim.z.toFixed(2)}))/vec2(${pondRim.rx},${pondRim.rz});
  float a=atan(q.y,q.x),r=length(q),rim=1.0${rimWaves.map(w=>`+${w.amplitude}*sin(a*${w.frequency.toFixed(1)}+(${w.phase.toFixed(2)}))`).join('')};
  float d=(r-rim)*${pondRim.rz};
  ${rimOpenings.map(o=>`d=min(d,(abs(atan(sin(a-${o.angle}),cos(a-${o.angle})))-${o.halfWidth})*r*${pondRim.rz});`).join('\n')}
  return d;
}`;

export function outerBankHeight(x:number,z:number) {
  const px = (x - pondRim.x) / pondRim.rx, pz = (z - pondRim.z) / pondRim.rz;
  const a = Math.atan2(pz, px), d = distanceFromRim(a, Math.sqrt(px * px + pz * pz));
  // Shallow sediment fans into the existing bed; no vertical skirt at the waterline.
  const shelf=3.6+.35*Math.sin(a*3+1)+.20*Math.cos(a*5);
  // A low-gradient shelf first; only the inner basin descends farther.
  if(d<=0)return -1.1*smooth(-d/shelf)-1.5*smooth((-d-shelf)/4);
  // Keep the wet margin low and use broad rises farther back for the grove.
  const relief=.28+noise.noise(x*.22,z*.22,38)*.06;
  let hills = 0;
  if (d > 2.3 && d < 19) {
    for (const mound of bankHills) {
      const angle = a - mound.angle;
      const along = Math.atan2(Math.sin(angle),Math.cos(angle))/mound.span, across = (d-mound.distance)/mound.depth;
      hills += mound.height*Math.exp(-(along*along+across*across));
    }
    hills *= smooth((d-2.3)/2.8)*smooth((19-d)/6);
  }
  return relief*(1-Math.exp(-d*1.1))*smooth(d/.5)+.04*Math.exp(-(((d-1.1)/.85)**2))*smooth(d/.35)+hills;
}

/** An ellipse expanded by depth clearance in the same radial distance metric. */
export function outerShoreObstacles(clearance:number) {
  // Conservative circular proxies are sampled FROM the rim, never used to draw it.
  const obstacles=[];
  for(let i=0;i<36;i++){
    const a=i/36*Math.PI*2,r=rimRadius(a),dr=rimDerivative(a);
    const x=pondRim.x+Math.cos(a)*pondRim.rx*r,z=pondRim.z+Math.sin(a)*pondRim.rz*r;
    if(outerShoreDistance(x,z)<-.01)continue;
    // Outward normal of the actual curved rim, including its changing radius.
    const nx=pondRim.rz*(Math.cos(a)*r+Math.sin(a)*dr),nz=pondRim.rx*(Math.sin(a)*r-Math.cos(a)*dr),n=Math.hypot(nx,nz),radius=2.5;
    obstacles.push({x:(x+nx/n*(radius-.50))*100,y:(z+nz/n*(radius-.50))*100,rx:(radius+clearance)*100,ry:(radius+clearance)*100});
  }
  return obstacles;
}
