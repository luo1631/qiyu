import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const portable = resolve(root, '.git/pond-tools/blender-4.5.15-windows-x64/blender.exe');
const blender = process.env.BLENDER_BIN || (existsSync(portable) ? portable : 'blender');
const options = { cwd: root, stdio: 'inherit' };
const argumentsList = process.argv.slice(2);
if (argumentsList.length > 1) throw new Error('Usage: npm run models:world:export [path.blend]');
const [argument] = argumentsList;
const rebuild = argument === 'rebuild';
const blenderArgs = ['--background', '--disable-autoexec', '--factory-startup'];
const stage = ['--import', 'tsx', 'scripts/optimize-models.mjs', '--authoring', 'pond-world', '--check-shore'];

if (!rebuild) {
  const source = argument ? resolve(argument) : resolve(root, 'scripts/models/pond-world-source.blend');
  if (!source.toLowerCase().endsWith('.blend') || !existsSync(source)) throw new Error('Missing saved Blender file: ' + source);
  const scratch = resolve(root, 'node_modules/.cache/pond');
  mkdirSync(scratch, { recursive: true });
  const cachePath = realpathSync(scratch);
  const working = mkdtempSync(resolve(cachePath, 'pond-world-'));
  const output = resolve(working, 'pond-world.glb');
  try {
    execFileSync(blender, [...blenderArgs, source, '--python-exit-code', '1',
      '--python', 'scripts/models/export_scene.py', '--', output], options);
    execFileSync(process.execPath, [...stage, '--world-source', output], options);
  } finally {
    const target = realpathSync(working);
    if (target === working && dirname(target) === cachePath && basename(target).startsWith('pond-world-')) {
      rmSync(target, { recursive: true, force: true });
    }
  }
  console.log('Exported saved Blender edits from ' + relative(root, source));
} else {
  execFileSync(blender, [...blenderArgs, '--python-exit-code', '1',
    '--python', 'scripts/models/build_scene.py', '--', 'pond-world'], options);
  execFileSync(process.execPath, stage, options);
}
