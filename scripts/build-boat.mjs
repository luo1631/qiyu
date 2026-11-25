/** Rebuild only the shared resting figure and boat, preserving the world master. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const portable=resolve(root,'.git/pond-tools/blender-4.5.15-windows-x64/blender.exe');
const blender=process.env.BLENDER_BIN||(existsSync(portable)?portable:'blender');
const world=resolve(root,'scripts/models/pond-source.blend');
const hash=()=>createHash('sha256').update(readFileSync(world)).digest('hex');
const before=hash();
const run=(script,args=[])=>execFileSync(blender,['--background','--factory-startup','--python-exit-code','1',
  '--python',resolve(root,'scripts/models',script),'--',...args],{cwd:root,stdio:'inherit'});
run('build_scene.py',['pond-boat']);
run('check_boat_contacts.py',['--out','.playwright-mcp/boat/contact-check.json']);
// AO is opt-in while its joined vertex-colour/export parity is under review.
// The approved default keeps the directly exported forms and surface maps.
if(process.argv.includes('--bake-ao'))run('bake_boat_ao.py',[
  '--input','scripts/models/raw/pond-boat.glb','--output','scripts/models/raw/pond-boat.glb',
  '--save','scripts/models/pond-boat-baked.blend']);
if(hash()!==before)throw new Error('Boat-only build changed the world master');
execFileSync(process.execPath,['--import','tsx','scripts/optimize-models.mjs','--authoring','pond-boat'],{cwd:root,stdio:'inherit'});
