import { DataUtils, DynamicDrawUsage, HalfFloatType, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D, ShaderMaterial, Vector3, WebGLRenderTarget } from 'three';
import type { Euler, Texture, WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FloatSpring, rippleCapacity, sampleSurface, seededRandom, windWaves } from './pond-life';
import type { Ripple } from './pond-life';
import { wakeFieldExtent } from './PondWakeField';
import { lifeScale } from './shore-layout';
import { boatWorldScale } from './world-layout';
import { waterLevel } from './PondOptics';

export interface SurfaceSample { height: number; dx: number; dz: number }
export type SurfaceSampler = (x: number, z: number, time: number) => SurfaceSample;

/** A contact spawns a few ballistic drops alongside its longer-lived wave. */
export function makeSurfaceSpray(low: boolean) {
  const geometry = new IcosahedronGeometry(1, 0);
  const material = new MeshStandardMaterial({ color: '#c9dfd5', emissive: '#8cafa4', emissiveIntensity: .14,
    roughness: .25, transparent: true, opacity: .73, depthWrite: false });
  const random = seededRandom(48315);
  const drops = Array.from({ length: low ? 5 : 9 }, (_, i) => ({
    angle: i * 2.39996 - .4 + random() * .8, rise: .84 + random() * .49,
    speed: .40 + random() * .45, radius: .017 + random() * .017,
  }));
  const mesh = new InstancedMesh(geometry, material, rippleCapacity * drops.length);
  mesh.name = 'AnimalWaterSpray'; mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 4;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const point = new Object3D(), velocity = new Vector3(), up = new Vector3(0, 1, 0);
  const gravity = 9.81 * lifeScale;
  let lastTime = NaN;
  return { mesh, update(events: readonly Ripple[], time: number) {
    if (time === lastTime) return;
    lastTime = time;
    let count = 0;
    for (const event of events) {
      const amount = event.spray ?? 0, age = time - event.born;
      if (amount <= 0 || age < 0 || age > .46) continue;
      const originY = waterLevel + Math.max(0, sampleSurface(event.x, event.z, event.born).height * .5);
      const jet = .32 * amount, scale = .67 + .48 * amount;
      for (const drop of drops) {
        const bearing = drop.angle + event.born * .84;
        const rise = drop.rise * scale, arc = (rise - gravity * age * .5) * age;
        if (arc < 0) continue;
        const vx = Math.cos(bearing) * drop.speed * scale + event.headingX * jet;
        const vz = Math.sin(bearing) * drop.speed * scale + event.headingZ * jet;
        const radius = drop.radius * scale * Math.min(1, (2 * rise / gravity - age) / .085);
        point.position.set(event.x + vx * age, originY + arc, event.z + vz * age);
        point.quaternion.setFromUnitVectors(up, velocity.set(vx, rise - gravity * age, vz).normalize());
        point.scale.set(radius * .72, radius * 1.5, radius * .72);
        point.updateMatrix(); mesh.setMatrixAt(count++, point.matrix);
      }
    }
    mesh.visible = count > 0; mesh.count = count;
    if (count) mesh.instanceMatrix.needsUpdate = true;
  }, dispose() { mesh.dispose(); geometry.dispose(); material.dispose(); } };
}

const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
const animalWaveHeightLimit = .05, animalWaveSlopeLimit = .10;

function limitAnimalWave({ height, dx, dz }: SurfaceSample): SurfaceSample {
  const slope = Math.hypot(dx, dz);
  const scale = slope > animalWaveSlopeLimit ? animalWaveSlopeLimit / slope : 1;
  return { height: clamp(height, animalWaveHeightLimit), dx: dx * scale, dz: dz * scale };
}

let halfFloatSamples: Float32Array | undefined;

function surfaceSamples() {
  if (!halfFloatSamples) {
    // Three owns the conversion. One lookup per different 16-bit value is
    // enough for every subsequent GPU readback, including zeroed boundaries.
    halfFloatSamples = new Float32Array(65536);
    for (let bits = 0; bits < halfFloatSamples.length; bits++) {
      const value = DataUtils.fromHalfFloat(bits);
      halfFloatSamples[bits] = Number.isFinite(value) ? value : 0;
    }
  }
  return halfFloatSamples;
}

export function pondBreeze(x:number,z:number,time:number) {
  const gust=.7+.3*Math.sin(time*.38+x*.12+z*.08),direction=windWaves[0];
  return {x:direction.x*gust,z:direction.z*gust};
}
export interface PadSupport { x:number; z:number; height:number; dx:number; dz:number }
export function orientLilyPad(rotation: Euler, angle: number, support: PadSupport) {
  const c = Math.cos(angle), s = Math.sin(angle);
  rotation.set(-(support.dz * c + support.dx * s), angle, support.dx * c - support.dz * s, 'YXZ');
}

export class LilyPadFloat {
  readonly support:PadSupport;
  private heave=new FloatSpring({inertia:1,stiffness:12,damping:8});
  private x=new FloatSpring({inertia:1,stiffness:8,damping:6});
  private z=new FloatSpring({inertia:1,stiffness:8,damping:6});
  private dx=new FloatSpring();private dz=new FloatSpring();
  private tapStrength=0;
  private tapX=0;
  private tapZ=0;
  constructor(private anchorX:number,private anchorZ:number) {
    this.support={x:anchorX,z:anchorZ,height:.04,dx:0,dz:0};
  }
  tap(x: number, z: number) {
    const dx = x-this.support.x, dz = z-this.support.z;
    const offset = Math.max(.10,Math.hypot(dx,dz));
    this.tapX = dx/offset;
    this.tapZ = dz/offset;
    this.tapStrength = 1;
  }
  update(wave:SurfaceSample,wind:{x:number;z:number},dt:number,occupied=false) {
    // A rooted leaf yields sideways, but cannot follow a wave crest into the air.
    const px=-wave.dx*.22+wind.x*.022,pz=-wave.dz*.22+wind.z*.022;
    const scale=Math.min(1,.045/Math.max(Math.hypot(px,pz),.0001));
    const steps=Math.max(1,Math.ceil(dt*60));
    for(let n=0;n<steps;n++) {
      const pressure = this.tapStrength*(occupied?.43:1);
      this.heave.update(clamp(wave.height*.32-pressure*.011,.012)-(occupied?.008:0),dt/steps);
      this.x.update(px*scale,dt/steps);this.z.update(pz*scale,dt/steps);
      const tilt = occupied || pressure < .001 ? .055 : .13;
      this.dx.update(clamp(wave.dx*.28-wind.x*.012-this.tapX*pressure*.16,tilt),dt/steps);
      this.dz.update(clamp(wave.dz*.28-wind.z*.012-this.tapZ*pressure*.16,tilt),dt/steps);
      this.tapStrength = Math.max(0,this.tapStrength-dt/steps*1.92);
    }
    Object.assign(this.support,{x:this.anchorX+this.x.value,z:this.anchorZ+this.z.value,
      height:.04+this.heave.value,dx:this.dx.value,dz:this.dz.value});
  }
}

/** Read only the occupied central pond, asynchronously, at most 30 times/sec.
 * This is a sample of the rendered GPU field, never a second wave simulation. */
export function makePondSurface(renderer: WebGLRenderer, cellSize: number) {
  const size = 128, extent = 24;
  const target = new WebGLRenderTarget(size, size, { type: HalfFloatType, depthBuffer: false });
  const pixels = new Uint16Array(size * size * 4), values = new Float32Array(size * size * 3);
  const material = new ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { wake: { value: null } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D wake;
      void main() {
        vec2 uv = (gl_FragCoord.xy / ${size.toFixed(1)} - .5) * ${(extent / wakeFieldExtent).toFixed(8)} + .5;
        vec2 d = vec2(${(cellSize / wakeFieldExtent).toFixed(9)}, 0.0);
        float h = texture2D(wake, uv).r;
        float dx = (texture2D(wake, uv + d).r - texture2D(wake, uv - d).r) / ${(cellSize * 2).toFixed(8)};
        float dz = (texture2D(wake, uv + d.yx).r - texture2D(wake, uv - d.yx).r) / ${(cellSize * 2).toFixed(8)};
        gl_FragColor = vec4(h, dx, dz, 1.0);
      }`,
  });
  const quad = new FullScreenQuad(material);
  let pending: Promise<void> | null = null, disposed = false, revision = 0, lastTime = -Infinity, reads = 0;
  let hadWaterMotion = false;
  const read = (x: number, z: number): SurfaceSample => {
    // Interpolation is valid between the centres of the first and last texels.
    if (Math.max(Math.abs(x), Math.abs(z)) >= extent / 2 - extent / (2 * size)) return { height: 0, dx: 0, dz: 0 };
    const gx = (x / extent + .5) * size - .5, gz = (z / extent + .5) * size - .5;
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const channel = (c: number) => {
      const a = (iz * size + ix) * 3 + c, b = a + size * 3;
      return (values[a] * (1 - fx) + values[a + 3] * fx) * (1 - fz)
        + (values[b] * (1 - fx) + values[b + 3] * fx) * fz;
    };
    return { height: channel(0), dx: channel(1), dz: channel(2) };
  };
  const sample: SurfaceSampler = (x, z, time) => {
    const wind = sampleSurface(x, z, time), wake = read(x, z);
    return { height: wind.height + wake.height, dx: wind.dx + wake.dx, dz: wind.dz + wake.dz };
  };
  return {
    wake: read,
    sample,
    get reads() { return reads; },
    sampleAnimal(x: number, z: number, time: number): SurfaceSample {
      return limitAnimalWave(sample(x, z, time));
    },
    update(time: number, texture: Texture, active: boolean): Promise<void> {
      if (disposed) return Promise.resolve();
      if (!active) {
        if (hadWaterMotion) { revision++; values.fill(0); hadWaterMotion = false; }
        return pending ?? Promise.resolve();
      }
      hadWaterMotion = true;
      if (pending || time - lastTime < 1 / 30 - 1e-8) return pending ?? Promise.resolve();
      lastTime = time;
      const version = revision, previous = renderer.getRenderTarget();
      material.uniforms.wake.value = texture;
      try { renderer.setRenderTarget(target); quad.render(renderer); }
      finally { renderer.setRenderTarget(previous); }
      pending = renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size, pixels).then(() => {
        if (disposed || version !== revision) return;
        const unpack = surfaceSamples();
        for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
          values[j] = unpack[pixels[i]];
          values[j + 1] = unpack[pixels[i + 1]];
          values[j + 2] = unpack[pixels[i + 2]];
        }
        reads++;
      }).catch(error => {
        if (!disposed) { values.fill(0); console.warn('Pond surface readback failed:', error); }
      }).finally(() => { pending = null; });
      return pending;
    },
    dispose() { disposed = true; revision++; target.dispose(); quad.dispose(); material.dispose(); },
  };
}

/** A hull follows its footprint, so a narrow crest lifts one end before the other. */
export function sampleHull(sample: SurfaceSampler, x: number, z: number, hx: number, hz: number, time: number) {
  const halfLength = .95 * boatWorldScale, halfBeam = .36 * boatWorldScale;
  const bow = sample(x + hx * halfLength, z + hz * halfLength, time), stern = sample(x - hx * halfLength, z - hz * halfLength, time);
  const port = sample(x - hz * halfBeam, z + hx * halfBeam, time), starboard = sample(x + hz * halfBeam, z - hx * halfBeam, time);
  const center = sample(x, z, time);
  return { height: (center.height * 2 + bow.height + stern.height + port.height + starboard.height) / 6,
    dx: (center.dx * 2 + bow.dx + stern.dx + port.dx + starboard.dx) / 6,
    dz: (center.dz * 2 + bow.dz + stern.dz + port.dz + starboard.dz) / 6,
    pitch: Math.atan2(bow.height - stern.height, 2 * halfLength), roll: Math.atan2(port.height - starboard.height, 2 * halfBeam) };
}

// Effective SI parameters for the scene's loaded wooden boat, not measured asset data.
// Added water mass and rotational inertia filter fast crests without reducing a tide's lift.
export const boatFloatSettings = { mass: 180 * boatWorldScale ** 3, length: 2.8 * boatWorldScale, beam: .8 * boatWorldScale,
  height: .35 * boatWorldScale, waterplane: .65 * boatWorldScale ** 2, addedMassRatio: 3 } as const;

/** Horizontal force response in metres/seconds. Navigation receives this as a
 * water-relative drift velocity, so its steering drag cannot erase the wind.
 * These small effective forces share the loaded boat's inertia, not its bobbing. */
export class BoatDrift {
  readonly velocity = { x: 0, z: 0 };
  constructor(private mass = boatFloatSettings.mass as number) {}
  update(surface:Pick<SurfaceSample,'dx'|'dz'>,wind:{x:number;z:number},dt:number) {
    if(dt<=0)return;
    const inertia=this.mass*(1+boatFloatSettings.addedMassRatio),drag=180;
    // Pressure acts down the local surface slope; footprint averaging cancels
    // short opposing crests. A force limit bounds steady drift to 7 cm/s.
    let fx=wind.x*6-surface.dx*150,fz=wind.z*6-surface.dz*150;
    const gain=Math.min(1,12.6/Math.max(Math.hypot(fx,fz),1e-9));fx*=gain;fz*=gain;
    const blend=1-Math.exp(-drag*dt/inertia);
    this.velocity.x+=(fx/drag-this.velocity.x)*blend;
    this.velocity.z+=(fz/drag-this.velocity.z)*blend;
  }
  reset() { this.velocity.x=0;this.velocity.z=0; }
}

export class BoatFloat {
  readonly heave: FloatSpring; readonly pitch: FloatSpring; readonly roll: FloatSpring;
  private heaveInertia: number; private rollInertia: number; private heaveStiffness: number; private rollStiffness: number;
  constructor(mass = boatFloatSettings.mass as number) {
    const {length,beam,height,waterplane,addedMassRatio}=boatFloatSettings;
    this.heaveInertia=mass*(1+addedMassRatio);
    const pitchInertia=this.heaveInertia*(length*length+height*height)/12;
    this.rollInertia=this.heaveInertia*(beam*beam+height*height)/12;
    const stiffness=1000*9.81*waterplane;
    this.heaveStiffness=stiffness;this.rollStiffness=stiffness*beam*beam/12;
    const spring=(inertia:number,stiffness:number)=>new FloatSpring({inertia,stiffness,damping:2*1.05*Math.sqrt(inertia*stiffness)});
    this.heave=spring(this.heaveInertia,stiffness);
    this.pitch=spring(pitchInertia,stiffness*length*length/12);
    this.roll=spring(this.rollInertia,this.rollStiffness);
  }
  update(surface:{height:number;pitch:number;roll:number},dt:number,acceleration=0,turnLean=0) {
    const steps=Math.max(1,Math.ceil(dt*120));
    for(let i=0;i<steps;i++) {
      this.heave.update(clamp(surface.height,.09),dt/steps);
      this.pitch.update(clamp(surface.pitch+acceleration*.00025,.09),dt/steps);
      this.roll.update(clamp(surface.roll+clamp(turnLean,.045),.12),dt/steps);
    }
  }
  tap() {
    // Bound kinetic + restoring energy, not velocity alone: repeatedly restoring
    // a positive velocity would still let many clicks ratchet the boat upward.
    const impulse=(spring:FloatSpring,inertia:number,stiffness:number,j:number,amplitude:number)=>{
      const budget=stiffness*(amplitude*amplitude-spring.value*spring.value);
      if(budget<=0)return;
      const limit=Math.sqrt(budget/inertia),next=spring.velocity+j/inertia;
      if(Math.abs(next)>Math.abs(spring.velocity)&&Math.abs(spring.velocity)>=limit)return;
      spring.velocity=clamp(next,Math.max(limit,Math.abs(spring.velocity)));
    };
    impulse(this.heave,this.heaveInertia,this.heaveStiffness,12,.018);
    impulse(this.roll,this.rollInertia,this.rollStiffness,4.5,.055);
  }
}

/** Bounded visual response layered onto a swimmer's authored locomotion.
 * An exponential depth falloff leaves deep fish quieter than surface animals. */
export class SwimmerFloat {
  readonly heave = new FloatSpring(); readonly pitch = new FloatSpring(); readonly roll = new FloatSpring();
  update(surface: SurfaceSample, depth: number, yaw: number, dt: number, immersed = 1) {
    const gain = Math.exp(-Math.max(0, depth) * 1.8) * Math.max(0, Math.min(1, immersed));
    const { height, dx, dz } = limitAnimalWave(surface);
    const pitch = (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) * gain;
    const roll = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) * gain;
    const steps = Math.max(1, Math.ceil(dt * 60));
    for (let i = 0; i < steps; i++) {
      this.heave.update(height * gain, dt / steps); this.pitch.update(pitch, dt / steps); this.roll.update(roll, dt / steps);
    }
  }
}
