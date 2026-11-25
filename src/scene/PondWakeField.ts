import { DataTexture, HalfFloatType, LinearFilter, NearestFilter, RedFormat, Vector4 } from 'three';
import type { WebGLRenderer } from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import type { PaperWakeRipple } from './paper-wake';
import { pondShores, islandShores } from './world-layout';
import { rippleCapacity } from './pond-life';
import type { Ripple } from './pond-life';
import { isOnOuterBank, lifeScale } from './shore-layout';

// Retain the original .125/.25 m grid spacing, with a dry margin beyond the
// widest part of the bank and the solver's two-metre outer damping strip.
export const wakeFieldExtent = 40;
const step = 1 / 60, speed = 1.65;
export const wakeSettleSeconds = 8;
export interface WakeShore { x: number; z: number; rx: number; rz: number }
/** Fallback for a wake field built without the authored banks. */
export function shoreContains(x: number, z: number, shores: readonly WakeShore[] = pondShores) {
  if (shores === pondShores && isOnOuterBank(x, z)) return true;
  return (shores === pondShores ? islandShores : shores).some((shore, i) => {
    const dx = (x - shore.x) / shore.rx, dz = (z - shore.z) / shore.rz;
    const radiusSquared = dx * dx + dz * dz;
    // The sinusoidal boundary ranges from .83 to .97. A loose bound skips
    // the exact angular profile for cells well inside or outside the island.
    if (radiusSquared > .98 ** 2) return false;
    if (radiusSquared < .82 ** 2) return true;
    const angle = Math.atan2(dz, dx);
    const edge = .90 + .045 * Math.sin(angle * 2 + i) + .025 * Math.cos(angle * 3);
    return Math.hypot(dx, dz) <= edge;
  });
}
export interface WakeBoatInput { x: number; z: number; headingX: number; headingZ: number; speed: number; reach?: number }

/** A damped height field. Moving pressure excites existing water instead of restarting rings. */
export function makePondWakeField(renderer: WebGLRenderer, resolution: number,
  shores: readonly WakeShore[] | ((x: number, z: number) => boolean) = pondShores, extent = wakeFieldExtent) {
  const onLand = typeof shores === 'function' ? shores : (x: number, z: number) => shoreContains(x, z, shores);
  const cells = new Uint8Array(resolution * resolution);
  for (let z = 0; z < resolution; z++) for (let x = 0; x < resolution; x++) {
    cells[z * resolution + x] = onLand(((x + .5) / resolution - .5) * extent,
      ((z + .5) / resolution - .5) * extent) ? 255 : 0;
  }
  const boundary = new DataTexture(cells, resolution, resolution, RedFormat);
  boundary.minFilter = boundary.magFilter = NearestFilter; boundary.needsUpdate = true;
  const gpu = new GPUComputationRenderer(resolution, resolution, renderer);
  gpu.setDataType(HalfFloatType);
  const blank = gpu.createTexture();
  const field = gpu.addVariable('wakeState', `
    uniform vec4 contact;
    uniform vec4 pressure;
    uniform vec4 boatContact;
    uniform float boatStrength;
    uniform sampler2D boundary;
    uniform vec4 impulses[${rippleCapacity}];
    float blocked(vec2 uv) { return step(.5, texture2D(boundary, uv).r); }
    float neighbor(vec2 uv, vec2 offset, float center) {
      float wall = blocked(uv + offset);
      // Diagonal neighbours may not cut across the corner of a solid cell.
      if (offset.x != 0.0 && offset.y != 0.0)
        wall = max(wall, max(blocked(uv + vec2(offset.x, 0.0)), blocked(uv + vec2(0.0, offset.y))));
      // Zero normal derivative: mirror the fluid cell at the bank, returning wave energy.
      return mix(texture2D(wakeState, uv + offset).r, center, wall);
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / resolution.xy, texel = 1.0 / resolution.xy;
      if (blocked(uv) > .5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      vec2 state = texture2D(wakeState, uv).rg;
      float cardinal = neighbor(uv, vec2(texel.x, 0.0), state.x)
        + neighbor(uv, vec2(-texel.x, 0.0), state.x)
        + neighbor(uv, vec2(0.0, texel.y), state.x)
        + neighbor(uv, vec2(0.0, -texel.y), state.x);
      float diagonal = neighbor(uv, texel, state.x) + neighbor(uv, -texel, state.x)
        + neighbor(uv, vec2(texel.x, -texel.y), state.x) + neighbor(uv, vec2(-texel.x, texel.y), state.x);
      // Nine-point Laplacian reduces grid-shaped wave fronts. Fixed steps keep the CFL bound.
      float laplacian = (4.0 * cardinal + diagonal - 20.0 * state.x) / 6.0;
      float height = state.x + (state.x - state.y) * ${Math.exp(-1.3 * step).toFixed(8)}
        + laplacian * ${((speed * step / (extent / resolution)) ** 2).toFixed(8)};
      vec2 point = (gl_FragCoord.xy - resolution * .5) * ${(extent / resolution).toFixed(8)};
      for (int i = 0; i < ${rippleCapacity}; i++) {
        vec2 delta = point - impulses[i].xy;
        // Compact impulse has no distant tail on the far side of an island.
        float radial = length(delta) / .55;
        height -= impulses[i].z * .018 * exp(-radial * radial * 4.0) * (1.0 - smoothstep(.7, 1.0, radial));
      }
      if (pressure.x > 0.0) {
        vec2 segment = contact.zw - contact.xy;
        float t = clamp(dot(point - contact.xy, segment) / max(dot(segment, segment), .00001), 0.0, 1.0);
        vec2 offset = point - mix(contact.xy, contact.zw, t);
        float footprint = exp(-dot(offset, offset) / (.22 * .22));
        float forward = dot(point - contact.zw, pressure.yz);
        footprint *= 1.0 - .82 * smoothstep(0.0, .28, forward);
        // Sweep a soft, constant depression through the whole step; no periodically reset phase.
        height = mix(height, -.019, footprint * pressure.x * .62);
      }
      if (boatStrength > 0.0) {
        vec2 relative = point - boatContact.xy;
        float along = dot(relative, boatContact.zw);
        float across = dot(relative, vec2(-boatContact.w, boatContact.z));
        float sternPressure = exp(-across * across / (${(.43*lifeScale)**2}) - along * along / (${(.60*lifeScale)**2}))
          * (1.0 - smoothstep(-.1, .35, along));
        height = mix(height, -.045 * boatStrength, sternPressure * .24);
      }
      float border = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) * ${extent.toFixed(1)};
      height *= .999 * smoothstep(0.0, 2.0, border);
      gl_FragColor = vec4(height, state.x, 0.0, 1.0);
    }
  `, blank);
  const contact = new Vector4(), pressure = new Vector4();
  const boatContact = new Vector4();
  const impulses = Array.from({ length: rippleCapacity }, () => new Vector4());
  field.material.uniforms.boundary = { value: boundary };
  field.material.uniforms.impulses = { value: impulses };
  field.material.uniforms.contact = { value: contact };
  field.material.uniforms.pressure = { value: pressure };
  field.material.uniforms.boatContact = { value: boatContact };
  field.material.uniforms.boatStrength = { value: 0 };
  field.minFilter = field.magFilter = LinearFilter;
  gpu.setVariableDependencies(field, [field]);
  const error = gpu.init();
  if (error) { gpu.dispose(); boundary.dispose(); throw new Error('Pond wake field: ' + error); }

  const pending: PaperWakeRipple[] = [];
  const pendingImpulses: Ripple[] = [], seen = new WeakMap<Ripple, number>();
  let lastTime: number | null = null, simulated = 0, remainder = 0, consumed = -Infinity;
  let previous: PaperWakeRipple | null = null, liveUntil = -Infinity, cleared = true;
  let previousBoat: WakeBoatInput | undefined;
  let steps = 0;
  return {
    get texture() { return gpu.getCurrentRenderTarget(field).texture; },
    get target() { return gpu.getCurrentRenderTarget(field); },
    get active() { return !cleared; },
    get steps() { return steps; },
    update(time: number, samples: readonly PaperWakeRipple[], boat?: WakeBoatInput, ripples: readonly Ripple[] = []) {
      const frameStart = lastTime ?? time;
      if (lastTime === null) simulated = time;
      // Drop an excessive wall-clock backlog consistently; never leave simulated time behind forever.
      if (lastTime !== null && time - lastTime > .1) { simulated = time - .1; remainder = 0; previous = null; }
      remainder += lastTime === null ? 0 : Math.max(0, Math.min(.1, time - lastTime));
      lastTime = time;
      for (const event of ripples) {
        if (event.kind === 'boat' || event.strength <= 0 || event.born > time + 1e-8 || time - event.born > .22 || seen.get(event) === event.born) continue;
        seen.set(event, event.born); pendingImpulses.push({ ...event });
        liveUntil = time + wakeSettleSeconds; cleared = false;
      }
      pendingImpulses.sort((a, b) => a.born - b.born);
      const fresh = samples.filter(sample => sample.strength > 0 && sample.born > consumed && sample.born <= time + 1e-8 && time - sample.born < .22)
        .sort((a, b) => a.born - b.born);
      if (fresh.length) {
        for (const sample of fresh) pending.push({ ...sample });
        consumed = fresh[fresh.length - 1].born;
        liveUntil = time + wakeSettleSeconds; cleared = false;
      }
      if (boat && boat.speed > .04) { liveUntil = time + wakeSettleSeconds; cleared = false; }
      if (time > liveUntil) {
        if (!cleared) {
          gpu.renderTexture(blank, gpu.getCurrentRenderTarget(field));
          gpu.renderTexture(blank, gpu.getAlternateRenderTarget(field));
          cleared = true;
        }
        remainder = 0; simulated = time; previous = null; pending.length = 0; pendingImpulses.length = 0;
        previousBoat = boat ? { ...boat } : undefined;
        return;
      }
      while (remainder + 1e-8 >= step) {
        simulated += step; remainder -= step; pressure.set(0, 0, 0, 0);
        impulses.forEach(value => value.set(0, 0, 0, 0));
        for (let i = 0; i < impulses.length && pendingImpulses.length && pendingImpulses[0].born <= simulated + 1e-8; i++) {
          const event = pendingImpulses.shift()!;
          impulses[i].set(event.x, event.z, Math.min(1, event.strength), 0);
        }
        while (pending.length && pending[0].born <= simulated + 1e-8) {
          const sample = pending.shift()!;
          const connects = previous && previous.stroke === sample.stroke && sample.born - previous.born < .22;
          if (pressure.x === 0 || !connects) contact.set(connects ? previous!.x : sample.x, connects ? previous!.z : sample.z, sample.x, sample.z);
          else { contact.z = sample.x; contact.w = sample.z; }
          pressure.set(Math.min(1, sample.strength / .22), sample.headingX, sample.headingZ, 0);
          previous = sample;
        }
        field.material.uniforms.boatStrength.value = 0;
        if (boat) {
          const from = previousBoat ?? boat, t = Math.max(0, Math.min(1, (simulated - frameStart) / Math.max(time - frameStart, step)));
          let hx = from.headingX + (boat.headingX - from.headingX) * t, hz = from.headingZ + (boat.headingZ - from.headingZ) * t;
          const length = Math.hypot(hx, hz) || 1; hx /= length; hz /= length;
          const wakeReach = boat.reach ?? .88 * lifeScale, previousReach = from.reach ?? .88 * lifeScale;
          const reach = previousReach + (wakeReach - previousReach) * t;
          boatContact.set(from.x + (boat.x - from.x) * t - hx * reach, from.z + (boat.z - from.z) * t - hz * reach, hx, hz);
          const velocity = from.speed + (boat.speed - from.speed) * t;
          field.material.uniforms.boatStrength.value = velocity > .04 ? Math.min(1, Math.pow(velocity / .6, 1.5)) : 0;
        }
        gpu.compute(); steps++;
      }
      previousBoat = boat ? { ...boat } : undefined;
    },
    dispose() { gpu.dispose(); boundary.dispose(); },
  };
}
