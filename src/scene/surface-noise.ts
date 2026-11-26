import { Sky } from 'three/addons/objects/Sky.js';

const upstream = (Sky as typeof Sky & { SkyShader: { fragmentShader: string } }).SkyShader.fragmentShader;
const noiseStart = upstream.indexOf('vec2 gradient(');
const noiseEnd = upstream.indexOf('// constants for atmospheric scattering');
if (noiseStart < 0 || noiseEnd < noiseStart) throw new Error('Unsupported Three Sky shader');
export const skyNoiseGLSL = upstream.slice(noiseStart, noiseEnd);
