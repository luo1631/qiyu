import { createRoot } from 'react-dom/client';
import PondScene from '../../src/scene/PondScene';
import { observerAt } from '../../src/scene/time';
import type { Quality } from '../../src/scene/PondScene';
import type { RootState } from '@react-three/fiber';
import type { Mesh, PerspectiveCamera, WebGLRenderer } from 'three';
import './scene-review.css';

// Authoring-only route: uses the real scene, camera, materials and water. Dates
// here are fixed fixtures; the public homepage always retains its actual clock.
const params = new URLSearchParams(location.search);
const time = /^\d{2}:\d{2}$/.test(params.get('time') ?? '') ? params.get('time')! : '12:30';
const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : '2026-11-01';
const date = new Date(`${day}T${time}:00+08:00`);
const timestamp = Number.isFinite(+date) ? +date : Date.parse('2026-11-01T12:30:00+08:00');
const requestedQuality = params.get('quality');
const quality: Quality = requestedQuality === 'low' || requestedQuality === 'mobile' ? requestedQuality : 'high';
const qualityLabel = { high: '高画质', mobile: '移动画质', low: '低画质' }[quality];
const freeze = params.get('freeze') !== '0';
const clean = params.get('clean') === '1';
const profile = !clean && params.get('passes') === '1';
const captureEveryFrame = params.get('capture') === 'full';
const seed = Number(params.get('seed') ?? 731);
const detail = params.get('view');
const views = {
  grove: { position: [-11.5, 6.6, -2.4], target: [-12.2, 1.85, -8.4], fov: 40 },
  'east-bank': { position: [5.9, 6.75, -6.9], target: [8.6, .88, -12.85], fov: 48 },
  about: { position: [-2.65, 4.55, .55], target: [-6.17, 1.72, -4.62], fov: 47 },
  boat: { position: [2.1, 3.6, 8.9], target: [0, .12, 6.20], fov: 38 },
  sleeper: { position: [.09, 2.09, 6.24], target: [.49, .54, 6.40], fov: 29 },
  wet: { position: [2, 4.2, -7.7], target: [4.5, .2, -11.9], fov: 40 },
  lanterns: { position: [-3.34, 2.65, 7.32], target: [-5.63, .89, 4.54], fov: 42 },
  chimes: { position: [7.98, 2.83, 7.30], target: [5.79, .97, 4.79], fov: 41 },
  lotus: { position: [7.9, 2.45, .35], target: [5.6, .22, -3.76], fov: 38 },
  'pond-centre': { position: [.25, 3.35, 3.20], target: [.10, .14, .20], fov: 35 },
  pier: { position: [-8.10, 3.04, 1.07], target: [-11.23, .22, -2.66], fov: 48 },
  swan: { position: [1.1, 2.25, -3.45], target: [1.65, .30, -.40], fov: 37 },
  dawn: { position: [1.55, 1.12, 9.32], target: [-6.7, 1.06, 5.76], fov: 55 },
  dusk: { position: [-5.85, 1.39, .65], target: [8.0, 1.30, 6.15], fov: 55 },
  moonrise: { position: [1.55, 1.12, 9.32], target: [-7.0, 1.84, 7.94], fov: 60 },
} as const;
const link = (key: string, value: string) => {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value); else next.delete(key);
  return '?' + next.toString();
};
let context: RootState | undefined;

const counters = ['画面', '反射', '折射', '阴影', '波场与其他'].map(name => ({ name, calls: 0, faces: 0 }));
let measuredFrames = 0, lastFrame = 0;

function trackPasses(renderer: WebGLRenderer) {
  const draw = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    const target = renderer.getRenderTarget();
    if (!target && object.name === 'PondWater') measuredFrames++;
    const name = target?.texture.name;
    const index = !target ? 0 : name === 'PondReflection' ? 1 : name === 'PondRefraction' ? 2 : target.depthTexture ? 3 : 4;
    const row = counters[index];
    const geometryCount = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    const first = Math.max(geometry.drawRange.start, group?.start ?? 0);
    const last = Math.min(geometry.drawRange.start + geometry.drawRange.count, group ? group.start + group.count : geometryCount, geometryCount);
    const count = Math.max(0, last - first);
    row.calls++;
    if ((object as Mesh).isMesh) row.faces += count / 3 * ('isInstancedMesh' in object && 'count' in object ? Number(object.count) : 1);
    return draw(camera, scene, geometry, material, object, group);
  };
}
function frameSubject() {
  const view = detail && Object.hasOwn(views, detail) ? views[detail as keyof typeof views] : null;
  if (!view || !context) return;
  const camera = context.camera as PerspectiveCamera;
  camera.position.set(...view.position);
  camera.fov = view.fov;
  camera.lookAt(...view.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  context.invalidate();
}

function showMetrics() {
  const canvas = context?.gl.domElement;
  const display = document.querySelector('output');
  if (!canvas?.dataset.pond || !display) return;
  const frame = JSON.parse(canvas.dataset.pond);
  const count = (value: number) => Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  display.textContent = `${count(frame.sceneTriangles)} 面 · ${count(frame.meanTriangles)} 面/帧 · ${frame.meanCalls} 次绘制/帧 · ${frame.shadowUpdates}/${frame.sampledFrames} 帧更新阴影 · 水面 ${frame.waterCaptureSize.join('×')}，取景 ${frame.waterCaptures} 次`
    + (freeze ? '' : ` · P50 ${frame.renderFrameP50.toFixed(1)} ms · P95 ${frame.renderFrameP95.toFixed(1)} ms`);
  const rendered = measuredFrames - lastFrame;
  if (profile && rendered > 0) {
    const rows = document.querySelectorAll<HTMLTableRowElement>('.review-passes tbody tr');
    counters.forEach((row, i) => {
      rows[i].cells[1].textContent = (row.calls / rendered).toFixed(1);
      rows[i].cells[2].textContent = count(row.faces / rendered);
      row.calls = row.faces = 0;
    });
    lastFrame = measuredFrames;
  }
}

createRoot(document.getElementById('root')!).render(<main className="review-stage">
  <PondScene timestamp={timestamp} observer={observerAt(new Date(timestamp), 'Asia/Shanghai')} paused={freeze} reduced={freeze}
    seed={Number.isFinite(seed) ? seed : 731} captureEveryFrame={captureEveryFrame} fullScenery quality={quality}
    onReady={() => {
      document.body.dataset.ready = 'true';
      if (!clean) { showMetrics(); window.setInterval(showMetrics, 750); }
    }}
    onContext={state => { context = state; if (profile) trackPasses(state.gl); }}
    onFailure={() => { document.body.dataset.failed = 'true'; }} onFramed={frameSubject} />
  {!clean && <nav className="review-controls" aria-label="实景审阅">
    <div><a href={link('view', '')}>全景</a><a href={link('view', 'grove')}>远岸树群</a><a href={link('view', 'east-bank')}>东岸</a><a href={link('view', 'about')}>桃花亭</a><a href={link('view', 'lanterns')}>石灯滩</a><a href={link('view', 'chimes')}>风铃岛</a><a href={link('view', 'boat')}>小船</a><a href={link('view', 'sleeper')}>睡姿</a><a href={link('view', 'wet')}>水线</a><a href={link('view', 'lotus')}>荷花</a><a href={link('view', 'pond-centre')}>池心荷花</a><a href={link('view', 'pier')}>左岸栈桥</a><a href={link('view', 'swan')}>天鹅</a></div>
    <div><a href={link('time', '12:30')}>日间</a><a href={link('time', '17:00')}>暮色</a><a href={link('time', '23:30')}>月夜</a></div>
    <div><a href={link('quality', quality === 'low' ? 'high' : 'low')}>{qualityLabel}</a><a href={link('freeze', freeze ? '0' : '1')}>{freeze ? '播放' : '静止'}</a><a href={link('passes', profile ? '' : '1')}>{profile ? '关闭通道统计' : '通道统计'}</a><a href={link('capture', captureEveryFrame ? '' : 'full')}>{captureEveryFrame ? '启用水面缓存' : '逐帧刷新水面'}</a><a href="/">主页</a></div>
    <output />
    {profile && <table className="review-passes"><thead><tr><th>通道</th><th>提交次/帧</th><th>面/帧</th></tr></thead>
      <tbody>{counters.map(row => <tr key={row.name}><th scope="row">{row.name}</th><td>–</td><td>–</td></tr>)}</tbody></table>}
  </nav>}
</main>);
