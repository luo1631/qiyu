import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const portable=resolve(root,'.git/pond-tools/blender-4.5.15-windows-x64/blender.exe');
const blender=process.env.BLENDER_BIN||(existsSync(portable)?portable:'blender');
const [mode, ...rest] = process.argv.slice(2);
if ((mode && mode !== 'review') || rest.length) throw new Error('Usage: npm run models:shore-plants [review]');
execFileSync(blender,['--background','--factory-startup','--python-exit-code','1','--python',
  resolve(root,'scripts/models/shore-plants/build/02_forms.py'),'--',...(mode ? ['--review'] : [])],{cwd:root,stdio:'inherit'});
