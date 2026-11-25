import { MathUtils } from 'three';

// The angular sizes are slightly enlarged so a thin crescent still reads on a phone.
export const sunAngularRadius = MathUtils.degToRad(.69);
export const moonAngularRadius = MathUtils.degToRad(1.02);

/** The sky and the terrain retain scattered light after the sun has set. */
export function pondSkyLight(solarAltitude: number) {
  const smooth = (low: number, high: number) => MathUtils.smoothstep(solarAltitude, low, high);
  return {
    darkness: 1 - smooth(-12, 10),
    afterglow: smooth(-13, -2) * (1 - smooth(3, 19)),
    sunWarmth: 1 - smooth(5, 31),
    starlight: 1 - smooth(-15, -5),
  };
}

export function lunarVisibility(altitude: number, illuminatedFraction: number) {
  return MathUtils.smoothstep(altitude, -.2, 2.5) * MathUtils.smoothstep(illuminatedFraction, .004, .042);
}
