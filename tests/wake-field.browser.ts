// Run in a browser against Vite: import('/tests/wake-field.browser.ts').then(m => m.runWakeFieldChecks()).
// These checks read the real GPU output; no CPU copy of the wave equation is used.
import { DataUtils, WebGLRenderer } from 'three';
import { makePondWakeField, shoreContains, wakeFieldExtent, wakeSettleSeconds } from '../src/scene/PondWakeField';
import type { WakeShore } from '../src/scene/PondWakeField';
import { RippleField } from '../src/scene/pond-life';
import type { Ripple } from '../src/scene/pond-life';
import { PaperWakeField } from '../src/scene/paper-wake';
import { BoatDrift, makePondSurface, sampleHull, SwimmerFloat } from '../src/scene/PondSurface';
import { pondRim, rimRadius, shoreSegments } from '../src/scene/shore-layout';
import { SwanLife, swanStart } from '../src/scene/wildlife-life';

const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };

export function runWakeFieldChecks(resolution = 160) {
  const renderer = new WebGLRenderer({ antialias: false });
  const simulations: ReturnType<typeof makePondWakeField>[] = [];
  const create = () => { const field = makePondWakeField(renderer, resolution, []); simulations.push(field); return field; };
  const read = (field: ReturnType<typeof create>) => {
    const packed = new Uint16Array(resolution * resolution * 4), heights = new Float32Array(resolution * resolution);
    renderer.readRenderTargetPixels(field.target, 0, 0, resolution, resolution, packed);
    for (let n = 0; n < heights.length; n++) heights[n] = DataUtils.fromHalfFloat(packed[n * 4]);
    check(heights.every(Number.isFinite), 'height field must stay finite');
    return heights;
  };
  const regionEnergy = (heights: Float32Array, x0: number, x1: number, z0: number, z1: number) => {
    let energy = 0;
    for (let z = 0; z < resolution; z++) for (let x = 0; x < resolution; x++) {
      const wx = ((x + .5) / resolution - .5) * wakeFieldExtent, wz = ((z + .5) / resolution - .5) * wakeFieldExtent;
      if (wx >= x0 && wx <= x1 && wz >= z0 && wz <= z1) energy += heights[z * resolution + x] ** 2;
    }
    return energy;
  };
  try {
    const straight = (frameStride: number) => {
      const field = create(), contacts = new PaperWakeField();
      for (let n = 0; n <= 360; n++) {
        const time = n / 120;
        contacts.trace(-9 + time * 6, 0, time, 600);
        if (n % frameStride === 0) field.update(time, contacts.events);
      }
      return { field, heights: read(field) };
    };
    const fast = straight(2), low = straight(4);
    let error = 0, energy = 0, peak = 0;
    for (let n = 0; n < fast.heights.length; n++) {
      error += (fast.heights[n] - low.heights[n]) ** 2;
      energy += fast.heights[n] ** 2; peak = Math.max(peak, Math.abs(fast.heights[n]));
    }
    check(energy > .0001 && peak < .04, `paper wake must remain shallow after propagation (peak ${peak}, energy ${energy})`);
    const relativeFrameError = Math.sqrt(error / energy);
    check(relativeFrameError < .015, `30/60 FPS should produce the same continuous wave field: ${relativeFrameError}`);
    const beforeSpread = regionEnergy(fast.heights, 7, 9, .8, 1.6);
    for (let n = 1; n <= 30; n++) fast.field.update(3 + n / 60, []);
    const afterSpread = regionEnergy(read(fast.field), 7, 9, .8, 1.6);
    check(afterSpread > beforeSpread, 'released water must propagate sideways after the pointer stops');
    const steps = fast.field.steps;
    fast.field.update(3.5, []);
    check(fast.field.steps === steps, 'paused scene time cannot advance the solver');
    for (let n = 31; n <= (wakeSettleSeconds + .5) * 60; n++) fast.field.update(3 + n / 60, []);
    check(!fast.field.active && read(fast.field).every(value => value === 0), 'idle water must settle and stop GPU work');

    const gap = create(), contact = new PaperWakeField();
    for (let n = 0; n <= 30; n++) {
      const time = n / 120;
      if (n === 15) contact.stop();
      contact.trace(n < 15 ? -5 + time : 5 + time, 0, time, 500);
      gap.update(time, contact.events);
    }
    check(regionEnergy(read(gap), -2, 2, -1, 1) < 1e-12, 'crossing an island must not stamp a connecting line');

    const boat = create();
    for (let n = 0; n <= 180; n++) {
      const t = n / 60;
      boat.update(t, [], { x: Math.min(t, 1.5) * 1.65, z: Math.max(0, t - 1.5) * 1.65, headingX: t < 1.5 ? 1 : 0, headingZ: t < 1.5 ? 0 : 1, speed: 1.65 });
    }
    const boatHeights = read(boat), oldWakeEnergy = regionEnergy(boatHeights, -.8, 1.5, -.8, .8);
    check(oldWakeEnergy > 1e-7, 'turning boat must leave its earlier wake in world space');
    check(boatHeights.every(value => Math.abs(value) < .25), 'travel-speed boat cannot destabilize the water field');
    for (let n = 1; n <= (wakeSettleSeconds + .5) * 60; n++) boat.update(3 + n / 60, [], { x: 2.475, z: 2.475, headingX: 0, headingZ: 1, speed: 0 });
    check(!boat.active && read(boat).every(value => value === 0), 'a stopped boat cannot keep drawing two wake lines');
    return { relativeFrameError, peak, beforeSpread, afterSpread, oldWakeEnergy, checks: 7 };
  } finally {
    simulations.forEach(field => field.dispose());
    renderer.dispose(); renderer.forceContextLoss();
  }
}

/** Exercise the actual async GPU -> buoyancy path, including bank occlusion. */
export async function runSurfaceCouplingChecks(resolution=160) {
  const renderer=new WebGLRenderer({antialias:false});
  const field=makePondWakeField(renderer,resolution,[{x:0,z:0,rx:1,rz:80}]);
  const surface=makePondSurface(renderer,wakeFieldExtent/resolution),body=new SwimmerFloat(),drift=new BoatDrift();
  const source:Ripple={x:-2,z:0,born:0,strength:.85,kind:'touch',headingX:0,headingZ:1};
  let peakHeight=0,peakTilt=0,peakFloat=0,peakDrift=0,blocked=0;
  try{
    for(let n=0;n<=120;n++){
      const t=n/60;field.update(t,[],undefined,[source]);
      if(n%2===0)await surface.update(t,field.texture,field.active);
      const local=surface.wake(-2,0),far=surface.wake(2,0);
      const hull=sampleHull((x,z)=>surface.wake(x,z),-2,0,1,0,t);
      peakHeight=Math.max(peakHeight,Math.abs(local.height));peakTilt=Math.max(peakTilt,Math.abs(hull.pitch));
      body.update(local,.12,0,1/60);peakFloat=Math.max(peakFloat,Math.abs(body.heave.value));
      drift.update(surface.wake(-1.65,0),{x:0,z:0},1/60);peakDrift=Math.max(peakDrift,Math.hypot(drift.velocity.x,drift.velocity.z));
      blocked=Math.max(blocked,Math.abs(far.height));
    }
    check(surface.reads>30,'asynchronous samples must reach the CPU');
    check(peakHeight>.001&&peakTilt>.0001&&peakFloat>.0001,'real waves must drive height, hull tilt and swimmers');
    check(blocked===0,'an island must also block the wave driving bodies');
    check(peakDrift>.0001&&peakDrift<.07,'real wave slopes must push the loaded hull horizontally with bounded speed');
    const reads=surface.reads;await surface.update(2,field.texture,field.active);
    check(surface.reads===reads,'paused simulation cannot keep requesting readbacks');
    field.update(wakeSettleSeconds+3,[]);await surface.update(wakeSettleSeconds+3,field.texture,field.active);
    check(surface.wake(-2,0).height===0,'sleeping water must clear stale buoyancy');
    return {resolution,peakHeight,peakTilt,peakFloat,peakDrift,blocked,reads,checks:6};
  }finally{surface.dispose();field.dispose();renderer.dispose();renderer.forceContextLoss();}
}

export async function runAnimalWaveLimitChecks(resolution = 160) {
  const renderer = new WebGLRenderer({ antialias: false });
  const field = makePondWakeField(renderer, resolution, []);
  const surface = makePondSurface(renderer, wakeFieldExtent / resolution);
  const swan = new SwanLife(false), ripples = new RippleField();
  const x = swanStart.x / 100, z = swanStart.y / 100;
  const points = [[x, z], [x + .25, z + .15]];
  for (let i = 0; i < 12; i++) ripples.emit(x, z, 0, .62, 'touch');
  let crest = 0, trough = 0, rawSlope = 0, animalHeight = 0, animalSlope = 0, swanHeight = 0;
  try {
    for (let n = 0; n <= 120; n++) {
      const time = n / 60;
      field.update(time, [], undefined, ripples.events);
      if (n % 2 === 0) await surface.update(time, field.texture, field.active);
      for (const [px, pz] of points) {
        const raw = surface.sample(px, pz, time), animal = surface.sampleAnimal(px, pz, time);
        const slope = Math.hypot(raw.dx, raw.dz);
        crest = Math.max(crest, raw.height); trough = Math.min(trough, raw.height);
        rawSlope = Math.max(rawSlope, slope);
        animalHeight = Math.max(animalHeight, Math.abs(animal.height));
        animalSlope = Math.max(animalSlope, Math.hypot(animal.dx, animal.dz));
        if (Math.abs(raw.height) <= .05 && slope <= .10) {
          check(animal.height === raw.height && animal.dx === raw.dx && animal.dz === raw.dz,
            'gentle water must reach animals at its original strength');
        }
      }
      if (n > 0) swan.update(1 / 60, time, undefined, 0, undefined, surface.sampleAnimal);
      swanHeight = Math.max(swanHeight, Math.abs(swan.pose.y));
    }
    check(crest > .05 && trough < -.15 && rawSlope > .25, 'the overlapping GPU waves must exceed both animal limits');
    check(animalHeight <= .05 && animalSlope <= .100001, 'limit the total wave height and slope sampled by animals');
    check(swanHeight > .01 && swanHeight < .055, `overlapping waves should only bob the swan slightly: ${swanHeight}`);
    return { resolution, crest, trough, rawSlope, animalHeight, animalSlope, swanHeight };
  } finally { surface.dispose(); field.dispose(); renderer.dispose(); renderer.forceContextLoss(); }
}

/** Compare actual GPU propagation with and without a barrier; masking alone cannot pass. */
export function runBoundaryChecks(resolution = 160) {
  const renderer = new WebGLRenderer({ antialias: false });
  const simulations: ReturnType<typeof makePondWakeField>[] = [];
  const create = (shores?: readonly WakeShore[]) => {
    const field = makePondWakeField(renderer, resolution, shores); simulations.push(field); return field;
  };
  const read = (field: ReturnType<typeof create>) => {
    const pixels = new Uint16Array(resolution * resolution * 4);
    renderer.readRenderTargetPixels(field.target, 0, 0, resolution, resolution, pixels);
    return Float32Array.from({ length: resolution * resolution }, (_, i) => DataUtils.fromHalfFloat(pixels[i * 4]));
  };
  const energy = (heights: Float32Array, select: (x: number, z: number) => boolean) => {
    let result = 0;
    for (let z = 0; z < resolution; z++) for (let x = 0; x < resolution; x++) {
      const wx = ((x + .5) / resolution - .5) * wakeFieldExtent, wz = ((z + .5) / resolution - .5) * wakeFieldExtent;
      if (select(wx, wz)) result += heights[z * resolution + x] ** 2;
    }
    return result;
  };
  const impulse = (x: number, z: number): Ripple => ({ x, z, born: 0, strength: .62, kind: 'touch', headingX: 0, headingZ: 1 });
  try {
    const wall = create([{ x: 0, z: 0, rx: 1, rz: 80 }]), open = create([]), source = impulse(-2, 0);
    // Nearest bank is about 1.1m away; a returning wave reaches the source after ~1.4s.
    for (let n = 0; n <= 150; n++) {
      wall.update(n / 60, [], undefined, [source]); open.update(n / 60, [], undefined, [source]);
    }
    const reflected = read(wall), free = read(open);
    check(reflected.every(Number.isFinite), 'reflected heights must remain finite');
    const returned = energy(reflected, (x, z) => x > -3 && x < -1.2 && Math.abs(z) < .8);
    const freeReturn = energy(free, (x, z) => x > -3 && x < -1.2 && Math.abs(z) < .8);
    const transmitted = energy(reflected, (x, z) => x > 1.2 && x < 4 && Math.abs(z) < 2);
    const freeTransmission = energy(free, (x, z) => x > 1.2 && x < 4 && Math.abs(z) < 2);
    check(returned > freeReturn * 1.3, 'bank must send a measurable wave back toward its source');
    check(freeTransmission > 1e-8 && transmitted < freeTransmission * .001, 'solid bank must block transmission');

    const banks = create(), onLand = impulse(-5.6, -4.1);
    // Inject across the scene, including land: solid cells must remain identically zero.
    for (let n = 0; n <= 60; n++) banks.update(n / 60, [], undefined, [onLand, source]);
    const landEnergy = energy(read(banks), (x, z) => shoreContains(x, z));
    check(landEnergy === 0, 'every real island interior must be solid');

    const paired = create([]), single = create([]), second = impulse(2, 0);
    for (let n = 0; n <= 15; n++) {
      paired.update(n / 60, [], undefined, [source, second]); single.update(n / 60, [], undefined, [source]);
    }
    const both = read(paired), one = read(single);
    check(energy(both, x => x > 1) > .00001, 'two simultaneous events must both excite the field');
    const leftError = energy(Float32Array.from(both, (v, i) => v - one[i]), x => x < -1);
    check(leftError < 1e-12, 'keeping an event in its ring slot must not inject it repeatedly');
    // A long frame must catch the solver up, so new impulses still reach the GPU.
    const stalled = create([]); stalled.update(0, []);
    const resumed = { ...second, born: 5 };
    stalled.update(5, [], undefined, [resumed]); stalled.update(5 + 1 / 60, [], undefined, [resumed]);
    check(energy(read(stalled), x => x > 1) > 1e-6, 'long frame must not strand fresh wave events behind simulation time');
    return { resolution, returned, freeReturn, transmitted, freeTransmission, landEnergy, checks: 6 };
  } finally {
    simulations.forEach(field => field.dispose()); renderer.dispose(); renderer.forceContextLoss();
  }
}

/** The cropped field must coincide with the previous grid at the same spacing. */
export function runWakeExtentCheck(cellSize = .25) {
  for (let i = 0; i < shoreSegments; i++) {
    const angle = i / shoreSegments * Math.PI * 2, radius = rimRadius(angle);
    check(Math.abs(pondRim.x + Math.cos(angle) * pondRim.rx * radius) < wakeFieldExtent / 2 - 2,
      'the damping strip must stay outside the X shore');
    check(Math.abs(pondRim.z + Math.sin(angle) * pondRim.rz * radius) < wakeFieldExtent / 2 - 2,
      'the damping strip must stay outside the Z shore');
  }
  const renderer = new WebGLRenderer({ antialias: false });
  const oldExtent = 64, wideWidth = oldExtent / cellSize, closeWidth = wakeFieldExtent / cellSize;
  const wide = makePondWakeField(renderer, wideWidth, undefined, oldExtent);
  const close = makePondWakeField(renderer, closeWidth);
  const widePixels = new Uint16Array(wideWidth * wideWidth * 4), closePixels = new Uint16Array(closeWidth * closeWidth * 4);
  let wetCells = 0;
  try {
    const impulse: Ripple = { x: -12, z: .5, born: 0, strength: .56, kind: 'touch', headingX: 0, headingZ: 1 };
    for (let i = 0; i <= 135; i++) {
      const time = i / 60, input = { x: time - 1, z: 2.3, headingX: 1, headingZ: 0, speed: .42 };
      wide.update(time, [], input, [impulse]);
      close.update(time, [], input, [impulse]);
    }
    renderer.readRenderTargetPixels(wide.target, 0, 0, wideWidth, wideWidth, widePixels);
    renderer.readRenderTargetPixels(close.target, 0, 0, closeWidth, closeWidth, closePixels);
    const inset = (wideWidth - closeWidth) / 2;
    for (let z = 0; z < closeWidth; z++) for (let x = 0; x < closeWidth; x++) {
      const a = ((z + inset) * wideWidth + x + inset) * 4, b = (z * closeWidth + x) * 4;
      check(widePixels[a] === closePixels[b] && widePixels[a + 1] === closePixels[b + 1],
        'both time samples must match at the same world point');
      if (closePixels[b] !== 0) wetCells++;
    }
    check(wetCells > 100 && close.steps === wide.steps, 'both grids must advance the same active wake');
    return { wideWidth, closeWidth, wetCells, steps: close.steps };
  } finally {
    close.dispose(); wide.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
}
