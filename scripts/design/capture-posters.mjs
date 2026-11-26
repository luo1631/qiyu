import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const chrome = process.env.CHROME_BIN || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'google-chrome',
].find((path, index) => index === 2 || existsSync(path));
const review = new URL('http://127.0.0.1:5175/');
const output = resolve(root, process.argv[2] ?? 'src/floating-island/posters');
const cache = join(root, 'node_modules', '.cache', 'pond');
mkdirSync(cache, { recursive: true });
const profile = mkdtempSync(join(cache, 'poster-browser-'));

// Use an isolated local profile and a temporary loopback DevTools port.
const browser = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--no-first-run',
  '--window-size=1440,900', '--enable-unsafe-swiftshader', '--user-data-dir=' + profile, 'about:blank'], {
  windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
});
const closed = new Promise(resolve => browser.once('close', resolve));
let socket;
const pending = new Map();
let nextId = 0;

function withTimeout(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Chrome timed out during ' + method));
    }, 30000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

try {
  const debugAddress = new Promise((resolve, reject) => {
    let startupLog = '';
    browser.once('error', reject);
    browser.once('exit', code => reject(new Error('Chrome exited before capture (' + code + ')')));
    browser.stderr.on('data', chunk => {
      startupLog = (startupLog + chunk.toString()).slice(-4096);
      const match = startupLog.match(/DevTools listening on ws:\/\/([^/]+)/);
      if (match) resolve('http://' + match[1] + '/json/list');
    });
  });
  const address = await withTimeout(debugAddress, 15000, 'Chrome did not start a loopback debugging endpoint');
  const first = await fetch(address, { signal: AbortSignal.timeout(5000) });
  const target = (await first.json()).find(tab => tab.type === 'page');
  if (!target) throw new Error('Chrome did not expose the capture tab');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await withTimeout(new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  }), 5000, 'Chrome did not connect to the capture tab');
  socket.addEventListener('message', event => {
    const { id, result, error } = JSON.parse(event.data);
    const request = pending.get(id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(id);
    if (error) request.reject(new Error(error.message));
    else request.resolve(result);
  });

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const files = [];
  for (const [format, width, height] of [['wide', 1440, 900], ['tall', 390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const navigation = await send('Page.navigate', { url: review.href });
    if (navigation.errorText) throw new Error(navigation.errorText + ' at ' + review.href);
    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await evaluate("document.querySelector('.floating-island')?.dataset.ready === 'true'");
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 160));
    }
    if (!ready) throw new Error('The island did not render at ' + review.href);
    for (const [phase, text] of [['day', '白天'], ['night', '夜晚']]) {
      const glError = await evaluate(`(async () => {
        const action = Array.from(document.querySelectorAll('.island-light button'))
          .find(button => button.textContent.trim() === ${JSON.stringify(text)});
        action.click();
        for (const overlay of document.querySelectorAll('.island-header, .island-bottom')) {
          overlay.style.visibility = 'hidden';
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return document.querySelector('canvas').getContext('webgl2').getError();
      })()`);
      if (glError) throw new Error('WebGL error ' + glError + ' during ' + format + ' ' + phase);
      const { data } = await send('Page.captureScreenshot', { format: 'webp', quality: 88, fromSurface: true });
      const webp = Buffer.from(data, 'base64');
      const [imageWidth, imageHeight] = await evaluate(`(async () => {
        const image = new Image();
        image.src = ${JSON.stringify('data:image/webp;base64,' + data)};
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      })()`);
      if (webp.toString('ascii', 8, 12) !== 'WEBP' || imageWidth !== width || imageHeight !== height) {
        throw new Error('Unexpected screenshot dimensions at ' + review.href);
      }
      const name = `island-poster-${format}-${phase}.webp`;
      files.push({ name, webp });
      console.log(`${name} ${width}×${height} ${webp.length} bytes`);
    }
  }
  mkdirSync(output, { recursive: true });
  for (const { name, webp } of files) {
    const path = join(output, name);
    if (existsSync(path) && webp.equals(readFileSync(path))) continue;
    const staged = path + '.' + process.pid + '.pending';
    writeFileSync(staged, webp, { flag: 'wx' });
    renameSync(staged, path);
  }
  console.log(output);
} finally {
  socket?.close();
  browser.kill();
  await closed;
  // The generated profile is confined to the cache path created above.
  if (profile.startsWith(cache + '\\') || profile.startsWith(cache + '/')) {
    rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
  }
}
