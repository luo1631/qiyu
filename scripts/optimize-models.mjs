import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { islands } from '../src/config/islands.ts';
import { simplifyBoat } from './models/simplify-boat.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(root, 'node_modules/@gltf-transform/cli/bin/cli.js');
const out = resolve(root, 'public/models');
mkdirSync(out, { recursive: true });
const assets = [];
const authoring=process.argv.includes('--authoring');
const options = process.argv.slice(2);
const sourceIndex = options.indexOf('--world-source');
const worldSource = sourceIndex === -1 ? null : options[sourceIndex + 1];
if (sourceIndex !== -1) {
  if (!worldSource) throw new Error('--world-source requires a GLB path');
  options.splice(sourceIndex, 2);
}
const checkPending=options.includes('--check-shore');
const requested=new Set(options.filter(arg=>arg!=='--authoring' && arg!=='--check-shore'));
for(const name of requested)if(!['pond-world','pond-boat','pond-fish'].includes(name))throw new Error('Unknown model: '+name);
if(checkPending&&(!authoring||requested.size!==1||!requested.has('pond-world')))throw new Error('--check-shore requires --authoring pond-world');
if(worldSource&&!checkPending)throw new Error('--world-source requires --check-shore');

async function stageFile(target, contents) {
  if (existsSync(target) && contents.equals(readFileSync(target))) return;
  const pending = resolve(dirname(target), `.${basename(target)}.${randomUUID()}.pending`);
  try {
    writeFileSync(pending, contents, { flag: 'wx' });
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(pending, target);
        break;
      } catch (error) {
        // A Windows file reader can hold the destination briefly. Keep the
        // current asset in place until the same-volume replacement succeeds.
        if (attempt === 6 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
        await delay(60 * 2 ** attempt);
      }
    }
  } finally {
    rmSync(pending, { force: true });
  }
}

async function deliverModel(name, source, target) {
  if (authoring) {
    execFileSync(process.execPath, [cli, 'validate', source], { cwd: root, stdio: 'inherit' });
    if (checkPending) execFileSync(process.execPath, ['--import', 'tsx', 'scripts/models/check_shore_contacts.mjs', '--world', source],
      { cwd: root, stdio: 'inherit' });
    await stageFile(target, readFileSync(source));
    return;
  }
  execFileSync(process.execPath, [cli, 'optimize', source, target,
    '--compress', 'meshopt', '--palette', name === 'pond-fish' ? 'false' : 'true', '--simplify', 'false',
    '--join', name === 'pond-fish' ? 'false' : 'true', '--flatten', 'false', '--instance', 'false',
    '--texture-compress', 'false', '--texture-size', '512'],
    { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, [cli, 'validate', target], { cwd: root, stdio: 'inherit' });
}

for (const name of ['pond-world', 'pond-boat', 'pond-fish']) {
  const rebuilding=requested.size===0||requested.has(name);
  const authoredSource = name === 'pond-world' && worldSource ? resolve(root, worldSource) : resolve(root, 'scripts/models/raw', name + '.glb');
  let source = authoredSource;
  if (name === 'pond-world' && rebuilding) {
    // Preserve the editable/raw four-island artwork; ship only the live catalogue.
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const document = await io.read(authoredSource);
    for (const node of document.getRoot().listNodes()) {
      const inactiveIsland=node.getName().startsWith('island-')&&!islands.some(island=>node.getName()==='island-'+island.id);
      // The runtime builds its own conforming lakebed and already removes these
      // old flat-bed props. Keep them in raw/editable sources, not the download.
      if (!inactiveIsland && !node.getName().startsWith('waterbed_')) continue;
      const subtree = [];
      node.traverse(child => subtree.push(child));
      subtree.reverse().forEach(child => child.dispose());
    }
    // The runtime draws bark strokes from the authored along-branch UVs.
    // Mark them as a shader attribute so texture-coordinate pruning keeps them.
    const bark = document.getRoot().listNodes().find(node => node.getName() === 'about_TreeBark');
    for (const primitive of bark?.getMesh()?.listPrimitives() ?? []) {
      const grain = primitive.getAttribute('TEXCOORD_0');
      if (grain) primitive.setAttribute('_BARK_GRAIN', grain);
    }
    await document.transform(prune());
    const activeIslands = new Set(document.getRoot().listNodes().map(node => node.getName()));
    for (const island of islands) {
      if (!activeIslands.has('island-' + island.id)) throw new Error('Missing active island: ' + island.id);
    }
    const scratch = resolve(root, 'node_modules/.cache/pond');
    mkdirSync(scratch, { recursive: true });
    source = worldSource ? resolve(dirname(authoredSource), 'active-world.glb') : resolve(scratch, 'active-world.glb');
    await io.write(source, document);
  }
  const target = resolve(out, name === 'pond-boat' ? 'pond-boat-web.glb' : name + '.glb');
  if (rebuilding && name === 'pond-boat') {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const document = await io.read(authoredSource);
    await simplifyBoat(document);
    const scratch = resolve(root, 'node_modules/.cache/pond');
    mkdirSync(scratch, { recursive: true });
    const derived = resolve(scratch, `pond-boat-${randomUUID()}.glb`);
    try {
      await io.write(derived, document);
      await deliverModel(name, derived, target);
    } finally {
      rmSync(derived, { force: true });
    }
  } else if (rebuilding) {
    await deliverModel(name, source, target);
    if (worldSource) await stageFile(resolve(root, 'scripts/models/raw', name + '.glb'), readFileSync(authoredSource));
  }
  const binary = readFileSync(target);
  const jsonLength = binary.readUInt32LE(12);
  const gltf = JSON.parse(binary.subarray(20, 20 + jsonLength).toString('utf8'));
  if (name === 'pond-world' && rebuilding) {
    const raw = readFileSync(source);
    const authored = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString('utf8'));
    for (const node of authored.nodes.filter(node => node.name?.startsWith('island-'))) {
      if (!gltf.nodes.some(optimized => optimized.name === node.name)) throw new Error('Lost clickable island: ' + node.name);
    }
    if (gltf.nodes.filter(node => node.name?.startsWith('island-')).length !== islands.length) throw new Error('Island catalogue/model count mismatch');
  }
  if (name === 'pond-fish' && !gltf.nodes.some(node => node.name === 'FishTail')) throw new Error('Lost animated fish tail');
  let triangles = 0, primitives = 0;
  for (const node of gltf.nodes ?? []) {
    if (node.mesh === undefined) continue;
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      primitives++;
      if ((primitive.mode ?? 4) !== 4) continue;
      triangles += gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
    }
  }
  assets.push({ name, rawBytes: statSync(authoredSource).size, bytes: binary.byteLength, triangles, primitives });
}
const sceneTriangles = assets[0].triangles + assets[1].triangles;
const report = { generator: authoring?'Blender 4.5.15 / web geometry, no compression':'Blender 4.5.15 + glTF Transform 4.5.1 / Meshopt',
  source: worldSource ? 'scripts/models/export_scene.py' : 'scripts/models/build_scene.py', assets, worldAndBoatTriangles: sceneTriangles,
  note: 'Koi and habitat use procedural runtime geometry; check:budget counts those plus sky, bed and water. Reflection/refraction/shadow passes are extra.' };
const reportPath=resolve(root,'scripts/models/asset-report.json');
await stageFile(reportPath, Buffer.from(JSON.stringify(report, null, 2) + '\n'));
console.log(JSON.stringify(report, null, 2));
