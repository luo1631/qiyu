export const pondRenderProfiles = {
  high: {
    dpr: Infinity, fps: 0, shadowSize: 4096, shadowHz: 0,
    water: { resolution: 'viewport', wakeCellSize: .125, captureHz: 0, reflectionSamples: 4, antialiasRefraction: true },
  },
  mobile: {
    dpr: 1.75, fps: 60, shadowSize: 1024, shadowHz: 15,
    water: { resolution: 576, wakeCellSize: .25, captureHz: 24, reflectionSamples: 0, antialiasRefraction: true },
  },
  low: {
    dpr: 1, fps: 30, shadowSize: 512, shadowHz: 12,
    water: { resolution: 384, wakeCellSize: .25, captureHz: 22, reflectionSamples: 0, antialiasRefraction: true },
  },
} as const;

export type RenderProfile = keyof typeof pondRenderProfiles;
export type WaterRenderSettings = (typeof pondRenderProfiles)[RenderProfile]['water'];
