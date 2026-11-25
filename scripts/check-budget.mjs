import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { makeAquaticModels } from '../src/scene/PondCreatures.ts';
import { makePondHabitat, makePairHearts, makeShoreLotus } from '../src/scene/PondHabitat.ts';
import { makeWestPier } from '../src/scene/PondPier.ts';
import { makePondGarden } from '../src/scene/PondGarden.ts';
import { makePondWildlife } from '../src/scene/PondWildlife.ts';
import { makePondBanks } from '../src/scene/PondBanks.ts';
import { makeSanctuaryGroundcover, makeShoreLandscape, shoreGroveSites } from '../src/scene/shore-landscape.ts';
import { makePondFloorGeometry, pondFloorHeightAt } from '../src/scene/PondTerrain.ts';
import { Group } from 'three';
import { loadShorePlantKit } from './models/load_shore_plants.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const release = process.argv.includes('--release');
const walk = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
  const path = resolve(folder, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const files = walk(dist).map(path => ({ path: relative(dist, path).replaceAll('\\', '/'), bytes: statSync(path).size,
  gzip: gzipSync(readFileSync(path)).byteLength }));
const runtime = files.filter(file => ['.html', '.js', '.css'].includes(extname(file.path)));
const models = files.filter(file => extname(file.path) === '.glb');
const posters = files.filter(file => /pond-poster.*\.(png|webp)$/.test(file.path));
const other = files.filter(file => !runtime.includes(file) && !models.includes(file) && !posters.includes(file));
const sum = (items, field) => items.reduce((total, item) => total + item[field], 0);
const readModel = fragment => {
  const file = models.find(item => item.path.includes(fragment));
  if (!file) return null;
  const binary = readFileSync(resolve(dist, file.path));
  return JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString('utf8'));
};
const triangles = (gltf, included = () => true) => {
  if (!gltf) return 0;
  return gltf.nodes.reduce((count, node) => count + (node.mesh === undefined || !included(node.name ?? '') ? 0 :
    gltf.meshes[node.mesh].primitives.reduce((total, primitive) => total +
      ((primitive.mode ?? 4) === 4 ? gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3 : 0), 0)), 0);
};
// Shared radial lakebed, sky/water, celestial spheres and 180 batched star quads.
// Include both sun and moon conservatively even when one is below the horizon.
// Runtime draw calls and extra reflection/shadow passes still require browser measurement.
const worldGltf = readModel('pond-world-');
const islandCount = worldGltf?.nodes.filter(node => node.name?.startsWith('island-')).length ?? 0;
const signTriangles = 32 + 44 + 2; // pole, bevelled board, lettering plane
const fixedTriangles = triangles(worldGltf) + triangles(readModel('pond-boat-')) + triangles(readModel('pond-swan-')) + 2136 + islandCount * signTriangles;
const grove = readModel('pond-grove-');
const groveTriangles = low => shoreGroveSites.reduce((sum, { model, compact }) => {
  const canopy = `${model}_${low || compact ? 'CompactFoliage' : 'Foliage'}`;
  return sum + triangles(grove, name => name === `${model}_Bark` || name === canopy);
}, 0);
const floorGeometry=makePondFloorGeometry(),floorTriangles=floorGeometry.index.count/3;floorGeometry.dispose();
const plantFile=models.find(file=>file.path.includes('shore-plants-'));
if(!plantFile)throw new Error('Missing delivered shore plant kit');
const plantKit=await loadShorePlantKit(resolve(dist,plantFile.path));
const runtimeGeometry=low=>{
  const habitat = makePondHabitat();
  const resources=[makeAquaticModels(low),habitat,makePondGarden(low),makePondBanks(),makeShoreLandscape(plantKit.group,low),
    makeSanctuaryGroundcover(plantKit.group,habitat.bank,low),makeShoreLotus(undefined,low),makeWestPier(low,pondFloorHeightAt),
    makePairHearts(),makePondWildlife(new Group())];
  let triangles=0;
  for(const resource of resources){resource.group.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});resource.dispose();}
  return triangles;
};
const fullTriangles = fixedTriangles + groveTriangles(false) + floorTriangles + runtimeGeometry(false);
const lowTriangles = fixedTriangles + groveTriangles(true) + floorTriangles + runtimeGeometry(true);
const report = {
  files: files.length,
  distRawBytes: sum(files, 'bytes'),
  largest: [...files].sort((a, b) => b.bytes - a.bytes)[0],
  runtimeGzipEstimate: sum(runtime, 'gzip'),
  modelRawBytes: sum(models, 'bytes'),
  boatBytes: models.find(file=>file.path.includes('pond-boat-'))?.bytes ?? 0,
  swanBytes: models.find(file=>file.path.includes('pond-swan-'))?.bytes ?? 0,
  posterBytes: sum(posters, 'bytes'),
  largestPosterBytes: Math.max(0, ...posters.map(file => file.bytes)),
  otherRawBytes: sum(other, 'bytes'),
  conservativeColdEstimate: sum(runtime, 'gzip') + sum(models, 'bytes') + Math.max(0, ...posters.map(file => file.bytes)) + sum(other, 'bytes'),
  mainTrianglesEstimate: { desktop: fullTriangles, mobile: fullTriangles, low: lowTriangles },
};
const failures = [];
const sizeWarnings = [];
plantKit.dispose();
for (const file of files.filter(file => file.bytes > 25 * 1024 ** 2)) sizeWarnings.push(file.path + ' exceeds 25 MiB');
if (report.boatBytes > 12_000_000) sizeWarnings.push('person + boat including embedded textures exceeds 12 MB');
if (posters.length !== 4) failures.push('expected four poster variants for desktop/mobile and day/night');
const pendingCompression = posters.filter(file => file.bytes > 150 * 1024).map(file => file.path);
if (!models.some(m=>m.path.includes('pond-world-')) || !models.some(m=>m.path.includes('pond-boat-'))) failures.push('required GLB assets missing');
if (release) {
  failures.push(...sizeWarnings);
  if (pendingCompression.length) failures.push('poster variants exceed 150 KiB');
}
console.log(JSON.stringify({ mode: release ? 'release' : 'authoring', ...report, failures, sizeWarnings, pendingCompression }, null, 2));
if (failures.length) process.exitCode = 1;
