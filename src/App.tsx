import './scene/scene-poster.css';
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { CursorBreeze } from './components/CursorBreeze';
import { PaperPlane } from './components/PaperPlane';
import { RenderBoundary } from './components/RenderBoundary';
import { animatePhaseIcon, UiIcon } from './components/UiIcon';
import { visitorTimeZone } from './config/clock';
import type { Language } from './config/islands';
import { lightingAt, nextPhaseTime, observerAt } from './scene/time';

const PondScene = lazy(() => import('./scene/PondScene'));
const reducedMotion = '(prefers-reduced-motion: reduce)';
const youjingUrl = new URL(import.meta.env.VITE_YOUJING_URL, window.location.href);
if (import.meta.env.DEV && youjingUrl.hostname === '127.0.0.1') youjingUrl.hostname = window.location.hostname;
const entry = new URLSearchParams(window.location.search);

function returnToYoujing() {
  const previous = document.referrer ? new URL(document.referrer) : null;
  const pagePath = (path: string) => path.replace(/\/index\.html$/, '/').replace(/\/$/, '');
  // Cross-origin referrers may contain only the origin.
  const fromYoujing = previous?.origin === youjingUrl.origin &&
    (previous.origin !== window.location.origin || pagePath(previous.pathname) === pagePath(youjingUrl.pathname));
  if (entry.get('from') === 'youjing' && fromYoujing && history.length > 1) {
    history.back();
  } else {
    window.location.assign(youjingUrl);
  }
}

function journeyLanguage(): Language {
  const language = entry.get('lang');
  if (language === 'en' || language === 'zh') return language;
  try { return localStorage.getItem('pond-language') === 'en' ? 'en' : 'zh'; }
  catch { return 'zh'; }
}

const copy = {
  zh: {
    home: '返回游境', back: '返回', day: '切换到白天', night: '切换到夜晚', pause: '暂停池塘动态', play: '播放池塘动态',
    reset: '回到全景', help: '玩法提示', entering: '正在进入栖屿', slow: '池塘实景仍在加载', still: '池塘静景',
    scene: '栖屿。池中有桃花、荷花、天鹅和小舟。',
    pondGuide: {
      playing: ['点水引船 · 划动拨水 · 双击小舟随行', '点水引船 · 滑动拨水 · 连点小舟随行'],
      paused: ['双击小舟随行 · 轻点灯铃', '连点小舟随行 · 轻点灯铃'],
    },
    boatGuide: {
      playing: ['点水引船 · 右键拖动环顾 · 滚轮缩放', '点水引船 · 双指拖动环顾 · 捏合缩放'],
      paused: ['右键拖动环顾 · 滚轮缩放', '双指拖动环顾 · 捏合缩放'],
    },
    actions: '桃花、石灯、船灯、风铃、荷叶和天鹅可点。',
    stillActions: '开启动态即可划水、引船。',
    clickToLook: '双击小岛近看。',
    tapToLook: '轻点小岛两次近看。',
    pan: '滚轮缩放，右键拖动平移，按住 Shift 转向。',
    touchPan: '双指拖动平移，捏合缩放。',
    keyboard: '方向键平移，随船时转动视角。加减键缩放，Q 和 E 转向。1 到 3 近看小岛，4 随船，0 回全景。回车点水，L 点石灯，B 点船灯，C 摇铃，P 摇落花瓣。',
  },
  en: {
    home: 'Back to Yóujìng', back: 'Back', day: 'Switch to daytime', night: 'Switch to nighttime', pause: 'Pause pond motion', play: 'Play pond motion',
    reset: 'Reset view', help: 'Play controls', entering: 'Entering Qīyǔ', slow: 'The pond is still loading', still: 'Still view of the pond',
    scene: 'Qīyǔ, a pond with peach blossoms, islands, lotuses, a swan and a wooden boat.',
    pondGuide: {
      playing: ['Click water to sail · Sweep to ripple · Double-click the boat to follow', 'Tap water to sail · Swipe to ripple · Double-tap the boat to follow'],
      paused: ['Double-click the boat to follow · Tap the lamps or chimes', 'Double-tap the boat to follow · Tap the lamps or chimes'],
    },
    boatGuide: {
      playing: ['Click water to sail · Right-drag to look around · Scroll to zoom', 'Tap water to sail · Drag with two fingers to look around · Pinch to zoom'],
      paused: ['Right-drag to look around · Scroll to zoom', 'Drag with two fingers to look around · Pinch to zoom'],
    },
    actions: 'Tap the blossoms, boat lantern, stone lamps, chimes, lilies or swan.',
    stillActions: 'Play to sail or make ripples.',
    clickToLook: 'Double-click an island to get closer.',
    tapToLook: 'Double-tap an island to get closer.',
    pan: 'Scroll to zoom, right-drag to pan, or hold Shift to turn.',
    touchPan: 'Drag with two fingers to pan and pinch to zoom.',
    keyboard: 'Arrows pan the pond or look around the boat. Plus and minus zoom. Q and E turn. 1 through 3 look closer, 4 follows the boat, and 0 resets. Enter touches the water, L toggles the stone lamps, B toggles the boat lantern, C rings the chimes, and P shakes the blossoms.',
  },
};

function App() {
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [language] = useState(journeyLanguage);
  const [timeOffset, setTimeOffset] = useState(0), [now, setNow] = useState(Date.now);
  const [reduced, setReduced] = useState(() => matchMedia(reducedMotion).matches);
  const [motionChoice, setMotionChoice] = useState<boolean | null>(null);
  const [viewChanged, setViewChanged] = useState(false), [viewReset, setViewReset] = useState(0);
  const [aboard, setAboard] = useState(false);
  const [hint, setHint] = useState(false), [help, setHelp] = useState(false);
  const [coarse] = useState(() => matchMedia('(pointer: coarse)').matches);
  const zone = visitorTimeZone(), year = new Date(now).getFullYear();
  const observer = useMemo(() => observerAt(new Date(now), zone), [year, zone]);
  const timestamp = now + timeOffset * 3600000;
  const targetNight = lightingAt(new Date(timestamp), observer).night > .5;
  const [sceneNight, setSceneNight] = useState(targetNight);
  const night = ready && !failed ? sceneNight : targetNight;
  const playing = motionChoice ?? !reduced;
  const labels = copy[language];

  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback((error?: Error) => {
    if (error) console.error('Pond scene unavailable:', error);
    setFailed(true);
    setReady(false);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = language === 'zh' ? 'luo1631·栖屿' : 'luo1631 · Qīyǔ';
    const preference = matchMedia(reducedMotion);
    const update = () => { setReduced(preference.matches); setMotionChoice(null); };
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, [language]);
  useEffect(() => {
    const sync = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = window.setInterval(sync, 5000);
    document.addEventListener('visibilitychange', sync);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', sync); };
  }, []);
  useEffect(() => {
    if (ready || failed) return;
    const timer = window.setTimeout(() => setSlowLoad(true), 12000);
    return () => clearTimeout(timer);
  }, [failed, ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (sessionStorage.getItem('pond-play-hint')) return;
      sessionStorage.setItem('pond-play-hint', '1');
    } catch { /* The hint also works without storage. */ }
    setHint(true);
    const timer = window.setTimeout(() => setHint(false), 6200);
    return () => clearTimeout(timer);
  }, [ready]);

  const phaseLabel = targetNight ? labels.day : labels.night;
  const playLabel = playing ? labels.pause : labels.play;
  const instructions = (aboard ? labels.boatGuide : labels.pondGuide)[playing ? 'playing' : 'paused'][coarse ? 1 : 0];
  return <main className={`pond-page journey-page${ready ? ' is-ready' : ''}${night ? ' at-night' : ''}`}>
    <div className="scene-poster" role={failed ? 'img' : undefined}
      aria-label={failed ? labels.scene : undefined} aria-hidden={!failed} />
    {!failed && <div className="scene">
      <RenderBoundary onFailure={onFailure}><Suspense fallback={null}>
        <PondScene timestamp={timestamp} previewOffset={timeOffset} observer={observer} paused={!playing} reduced={reduced}
          quality="high" viewReset={viewReset} sceneLabel={labels.scene} onViewChange={setViewChanged} onRide={setAboard}
          onReady={onReady} onFailure={onFailure} onPhase={setSceneNight} />
      </Suspense></RenderBoundary>
    </div>}
    <p id="pond-keyboard" className="sr-only">{labels.keyboard}</p>

    <button type="button" className="journey-button journey-home" onClick={returnToYoujing} aria-label={labels.home} title={labels.home}>
      {labels.back}
    </button>
    <div className="journey-tools">
      {ready && <button type="button" className="journey-button" onClick={() => setMotionChoice(!playing)} aria-label={playLabel} title={playLabel}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{playing ? <path d="M9 6v12m6-12v12" /> : <path d="m9 5 10 7-10 7Z" />}</svg>
      </button>}
      <button type="button" className="journey-button phase-toggle" aria-label={phaseLabel} title={phaseLabel} data-preview-offset={timeOffset}
        onPointerEnter={animatePhaseIcon}
        onClick={() => setTimeOffset(value => (nextPhaseTime(new Date(now + value * 3600000), observer).getTime() - now) / 3600000)}>
        <UiIcon key={night ? 'moon' : 'sun'} name={night ? 'moon' : 'sun'} />
      </button>
    </div>
    {ready && <div className="journey-help">
      <button type="button" className="journey-button" aria-label={labels.help} title={labels.help}
        aria-expanded={help} aria-controls="pond-help" onClick={() => { setHint(false); setHelp(value => !value); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 8a3 3 0 1 1 4.8 2.4c-1.1.85-1.8 1.35-1.8 2.8m0 3.7v.1" /></svg>
      </button>
      <div id="pond-help" className="journey-guide" hidden={!help && !hint}>
        <p>{instructions}</p>
        {help && <>
          <p>{!aboard && `${coarse ? labels.tapToLook : labels.clickToLook} `}{playing ? labels.actions : labels.stillActions}</p>
          {!aboard && <p>{coarse ? labels.touchPan : labels.pan}</p>}
        </>}
      </div>
    </div>}
    {ready && <button type="button" className="journey-button journey-reset" hidden={!viewChanged}
      onClick={() => { document.querySelector<HTMLCanvasElement>('.scene canvas')?.focus({ preventScroll: true }); setViewReset(value => value + 1); }} aria-label={labels.reset} title={labels.reset}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H5v4m10-4h4v4M5 15v4h4m10-4v4h-4" /><circle cx="12" cy="12" r="2" /></svg>
    </button>}
    {!ready && <div className="loading-note" role="status">
      {!failed && <PaperPlane />}
      <div className="loading-copy"><strong>{failed ? labels.still : slowLoad ? labels.slow : labels.entering}</strong></div>
    </div>}
    {ready && <CursorBreeze />}
  </main>;
}
export default App;
