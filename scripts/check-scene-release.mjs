import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const files = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => {
    const path = resolve(entry.parentPath, entry.name);
    return { name: entry.name, path, bytes: statSync(path).size };
  });
const bytes = files.reduce((total, file) => total + file.bytes, 0);
const runtime = files.filter(file => /\.(?:html|css|js)$/.test(file.name));
const runtimeGzip = runtime.reduce((total, file) => total + gzipSync(readFileSync(file.path)).byteLength, 0);
const missing = files.some(({ name }) => name === 'index.html') ? [] : ['index.html'];
for (const format of ['wide', 'tall']) for (const phase of ['day', 'night']) {
  if (!files.some(file => file.name.startsWith(`pond-poster-${format}-${phase}-`) && file.name.endsWith('.webp'))) missing.push(`${format} ${phase} poster`);
}
const foreignAssets = files.filter(({ name }) => /^(?:youjing-|exhibit-)|\.(?:glb|gltf)$/i.test(name)).map(file => file.name);
console.log(JSON.stringify({ bytes, runtimeGzip, missing, foreignAssets }, null, 2));
if (missing.length || foreignAssets.length) process.exitCode = 1;
