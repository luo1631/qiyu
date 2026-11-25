import { Color, FogExp2, Vector3 } from 'three';
import type { DirectionalLight, HemisphereLight, WebGLRenderer } from 'three';
import { shadowLayer } from './PondOptics';
import type { lightingAt } from './time';
import { pondSkyLight } from './sky-light';

type LightSample = ReturnType<typeof lightingAt>;
const moonColor = new Color('#d3e4f5');
const moonLampColor = new Color('#bed4ee');
const daySunColor = new Color('#fff1cf'), goldenSunColor = new Color('#ffb77d');
const dayFogColor = new Color('#97bfc5'), twilightFogColor = new Color('#b5a0a4'), nightFogColor = new Color('#1c344a');
const dayFillColor = new Color('#dcebee'), nightFillColor = new Color('#b7cce8');
const dayGroundColor = new Color('#706858'), nightGroundColor = new Color('#4d6177');
const twilightFillColor = new Color('#c6afca'), twilightGroundColor = new Color('#836c72');

export const pondShadowCamera = { extent: 16, near: .5, far: 70 } as const;
export function pondShadowSettings(mapSize: number) {
  const texel = 2 * pondShadowCamera.extent / mapSize;
  const fine = mapSize >= 2048;
  return { mapSize, sunRadius: (fine ? .059 : .033) / texel, normalBias: fine ? .017 : .034, bias: fine ? -.00031 : -.00058 };
}

export function makePondLighting() {
  const fog = new FogExp2(dayFogColor, .003), sunColor = new Color();
  const surface = {
    sun: { direction: new Vector3(), color: sunColor, power: 0 },
    moon: { direction: new Vector3(), color: moonColor, power: 0 },
  };
  const position = (lamp: DirectionalLight | null, celestial: [number, number, number], intensity: number) => {
    if (!lamp) return;
    lamp.position.set(celestial[0], intensity > 0 ? celestial[1] : 5, celestial[2]).setLength(25);
    lamp.intensity = intensity;
  };
  return {
    fog, surface,
    update(light: LightSample, renderer: WebGLRenderer, sun: DirectionalLight | null, moon: DirectionalLight | null,
      fill: HemisphereLight | null) {
      const air = pondSkyLight(light.sunAltitude);
      sunColor.copy(daySunColor).lerp(goldenSunColor, air.sunWarmth * .86);
      fog.color.copy(dayFogColor).lerp(nightFogColor, air.darkness).lerp(twilightFogColor, air.afterglow * .51);
      renderer.toneMappingExposure = light.exposure;
      if (fill) {
        fill.color.copy(dayFillColor).lerp(nightFillColor, air.darkness);
        fill.groundColor.copy(dayGroundColor).lerp(nightGroundColor, air.darkness);
        // Residual sky light holds a little warmth after the direct sun is gone.
        const dusk = air.afterglow * .72;
        fill.color.lerp(twilightFillColor, dusk);
        fill.groundColor.lerp(twilightGroundColor, dusk);
        fill.intensity = light.fillPower;
      }
      position(sun, light.sun, light.sunPower);
      position(moon, light.moon, light.moonPower);
      sun?.color.copy(sunColor);
      moon?.color.copy(moonLampColor);
      surface.sun.direction.set(...light.sun).normalize();
      surface.sun.power = light.sunPower;
      surface.moon.direction.set(...light.moon).normalize();
      surface.moon.power = light.moonPower * .5;
    },
  };
}

/** A shadow update is decided before the main camera renders. Auxiliary
 * cameras then sample the same atlas and never trigger a second render of it. */
export class PondShadows {
  private lastUpdate = -Infinity;
  private previewing = false;
  private dirty = true;

  configure(sun: DirectionalLight | null, moon: DirectionalLight | null) {
    for (const lamp of [sun, moon]) {
      if (!lamp) continue;
      lamp.shadow.camera.layers.set(shadowLayer);
      lamp.shadow.autoUpdate = false;
    }
    this.invalidate();
  }

  invalidate() { this.dirty = true; }

  prepare(renderer: WebGLRenderer, sun: DirectionalLight | null, moon: DirectionalLight | null,
    now: number, updatesPerSecond: number, continuous: boolean, previewing: boolean) {
    const interval = updatesPerSecond ? 1000 / updatesPerSecond : 0;
    const due = (continuous || previewing) && now - this.lastUpdate >= interval;
    if (this.dirty || due || this.previewing !== previewing) {
      for (const lamp of [sun, moon]) {
        if (!lamp) continue;
        const { shadow } = lamp;
        shadow.needsUpdate = lamp.intensity > .01 || !shadow.map
          || shadow.map.width !== shadow.mapSize.x || shadow.map.height !== shadow.mapSize.y;
        if (shadow.needsUpdate) renderer.shadowMap.needsUpdate = true;
      }
      this.lastUpdate = now;
      this.previewing = previewing;
      this.dirty = false;
    }
    return renderer.shadowMap.needsUpdate;
  }
}
