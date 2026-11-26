import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { visitorTimeZone } from '../config/clock';
import { lightingAt, observerAt } from '../scene/time';
import { CatchResult, FishCollection, FishingDialog } from './FishingDialogs';
import type { CollectionMode } from './FishingDialogs';
import { FishingGuess } from './FishingGuess';
import { useFishing } from './use-fishing';
import type { IslandScene, Placement } from './scene';
import dayWide from './posters/island-poster-wide-day.webp';
import dayTall from './posters/island-poster-tall-day.webp';
import nightWide from './posters/island-poster-wide-night.webp';
import nightTall from './posters/island-poster-tall-night.webp';
import './island.css';
import './fishing.css';

type Mode = 'auto' | 'day' | 'night';

const text = {
  zh: {
    title: '浮岛', local: '本地', auto: '随时间', day: '白天', night: '夜晚',
    reset: '复位', resetLabel: '回到默认视角', light: '选择天色',
    mouse: '拖动环看 · 滚轮缩放', touch: '滑动环看 · 双指缩放',
    canvas: '海面上的栖屿浮岛。点击发光小船可垂钓，鱼咬钩后单击画面或按 Enter 收竿。方向键环看，加减键缩放，Home 键复位。编辑时按 Enter 放置。',
    edit: '编辑', tree: '种树', stone: '放石', placement: '放置树木和岸石',
    editMouse: '单击岛面放置 · 右键环看 · 滚轮缩放', editTouch: '轻点岛面放置 · 滑动环看 · 双指缩放',
    loading: '正在进入浮岛', unavailable: '当前浏览器无法显示实时 3D 场景。',
    fishing: '钓鱼', entry: '点击发光的小船，去瀑口垂钓', bag: '背包', guide: '图鉴',
    waiting: '浮漂已入水，等鱼咬钩', bite: '鱼咬钩了！', cancel: '收竿休息', reel: '收竿',
    biteHelp: '左键收竿 · 随后三轮猜数，每轮 2 秒', biteTouch: '轻点收竿 · 随后三轮猜数，每轮 2 秒', guessing: '三轮猜数',
  },
  en: {
    title: 'Floating Isle', local: 'Local', auto: 'Local time', day: 'Day', night: 'Night',
    reset: 'Reset', resetLabel: 'Reset camera', light: 'Lighting',
    mouse: 'Drag to orbit · Scroll to zoom', touch: 'Swipe to orbit · Pinch to zoom',
    canvas: 'A floating island over the sea. Tap the glowing skiff to fish, then tap the scene or press Enter when a fish bites. Arrow keys orbit, plus and minus zoom, Home resets. In edit mode, Enter places at the center.',
    edit: 'Edit', tree: 'Plant tree', stone: 'Place stone', placement: 'Place trees and stones',
    editMouse: 'Click to place · Right-drag to orbit · Scroll to zoom', editTouch: 'Tap to place · Swipe to orbit · Pinch to zoom',
    loading: 'Entering the island', unavailable: 'This browser cannot display the live 3D scene.',
    fishing: 'Fish', entry: 'Tap the glowing skiff to fish by the waterfall', bag: 'Bag', guide: 'Guide',
    waiting: 'The float is out. Waiting for a bite', bite: 'A fish is biting!', cancel: 'Stop fishing', reel: 'Reel in',
    biteHelp: 'Left-click to reel in · Three guesses, 2 s each', biteTouch: 'Tap to reel in · Three guesses, 2 s each', guessing: 'Guess the number',
  },
};

const language = new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'zh';
const copy = text[language];
const timeZone = visitorTimeZone();
const formatter = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-GB', {
  timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export default function FloatingIsland() {
  const [mode, setMode] = useState<Mode>('auto');
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [collection, setCollection] = useState<{ view: CollectionMode; initialFish?: string } | null>(null);
  const { session: fishing, catches, interact, finish, cancel } = useFishing();
  const host = useRef<HTMLDivElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const controller = useRef<IslandScene | null>(null);
  const localTone = useMemo(() => {
    const time = new Date(now);
    return lightingAt(time, observerAt(time, timeZone));
  }, [now]);
  const tone = useMemo(() => mode === 'auto' ? { night: localTone.night, twilight: localTone.twilight }
    : { night: mode === 'night' ? 1 : 0, twilight: 0 }, [localTone, mode]);
  const initialTone = useRef(tone);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    let active = true;
    void import('./scene').then(({ startIsland }) => {
      if (!active || !host.current) return;
      controller.current = startIsland(host.current, initialTone.current, copy.canvas, available => {
        if (active) setStatus(available ? 'ready' : 'unavailable');
      }, interact);
      setStatus('ready');
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('Unable to initialize the floating island.', error);
      setStatus('unavailable');
    });
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 15000);
    document.addEventListener('visibilitychange', update);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
      controller.current?.dispose();
      controller.current = null;
    };
  }, [interact]);

  useEffect(() => {
    initialTone.current = tone;
    controller.current?.setTone(tone);
  }, [tone]);

  useLayoutEffect(() => {
    controller.current?.setFishing(fishing.phase === 'game' ? 'reeling' : fishing.phase === 'caught' ? 'landed' : fishing.phase);
    if (fishing.phase === 'waiting') host.current?.querySelector('canvas')?.focus({ preventScroll: true });
  }, [fishing.phase, status]);

  function selectPlacement(tool: Placement | null) {
    setPlacement(tool);
    controller.current?.setPlacement(tool);
  }

  function openCollection(view: CollectionMode, initialFish?: string) {
    setCollection({ view, initialFish });
  }

  function startFishing() {
    selectPlacement(null);
    interact('cast');
  }

  const isFishing = fishing.phase === 'waiting' || fishing.phase === 'bite';

  return <main className="floating-island" data-ready={status === 'ready'} data-night={tone.night > .5}
    style={{ '--night': tone.night, '--twilight': tone.twilight } as CSSProperties} aria-labelledby="island-title"
    onKeyDown={event => {
      if (event.key === 'Escape' && !collection) {
        if (isFishing) cancel();
        else if (placement) {
          selectPlacement(null);
          editButton.current?.focus();
        }
      }
    }}>
    <div className="island-sky" aria-hidden="true" />
    {status !== 'ready' && <picture className="island-still" aria-hidden="true">
      <source media="(max-aspect-ratio: 3/4)" srcSet={tone.night > .5 ? nightTall : dayTall} />
      <img src={tone.night > .5 ? nightWide : dayWide} alt="" />
    </picture>}
    <div className="island-canvas" ref={host} />
    {status !== 'ready' && <p className="island-status" role="status">
      {status === 'loading' ? copy.loading : copy.unavailable}
    </p>}
    <header className="island-header">
      <h1 id="island-title">{copy.title}</h1>
      <time className="island-local-time" dateTime={new Date(now).toISOString()} title={timeZone}>
        <span>{copy.local}</span> {formatter.format(now)}
      </time>
    </header>
    <nav className="island-fishing-dock" aria-label={copy.fishing}>
      <button type="button" className="island-start-fishing" onClick={startFishing} title={copy.entry}
        disabled={status !== 'ready' || fishing.phase !== 'idle'}><span aria-hidden="true" />{copy.fishing}</button>
      <button type="button" aria-haspopup="dialog" onClick={() => openCollection('bag')}>
        {copy.bag}{catches.length > 0 && <small>{catches.length}</small>}</button>
      <button type="button" aria-haspopup="dialog" onClick={() => openCollection('guide')}>{copy.guide}</button>
    </nav>
    <div className="island-bottom">
      {isFishing && <div className="island-fishing-notice" data-bite={fishing.phase === 'bite'}>
        <p role="status"><strong>{fishing.phase === 'bite' ? copy.bite : copy.waiting}</strong>
          {fishing.phase === 'bite' && <small><span className="island-mouse">{copy.biteHelp}</span>
            <span className="island-touch">{copy.biteTouch}</span></small>}</p>
        {fishing.phase === 'bite' && <button type="button" className="fish-primary" aria-haspopup="dialog"
          onClick={() => interact('reel')}>{copy.reel}</button>}
        <button type="button" className="fish-stop" onClick={cancel} aria-label={copy.cancel} title={copy.cancel}>×</button>
      </div>}
      <p className="island-hint">
        <span className="island-mouse">{placement ? copy.editMouse : copy.mouse}</span>
        <span className="island-touch">{placement ? copy.editTouch : copy.touch}</span>
      </p>
      <div id="island-placement" role="group" aria-label={copy.placement} className="island-controls island-placement"
        hidden={!placement || status !== 'ready'}>
        {(['tree', 'stone'] as const).map(tool =>
          <button key={tool} type="button" aria-pressed={placement === tool} onClick={() => selectPlacement(tool)}>
            {copy[tool]}
          </button>)}
      </div>
      <div className="island-controls">
        <div role="group" aria-label={copy.light} className="island-light">
          {(['auto', 'day', 'night'] as const).map(choice =>
            <button key={choice} type="button" aria-pressed={mode === choice} onClick={() => setMode(choice)}>
              {copy[choice]}
            </button>)}
        </div>
        <button className="island-reset" type="button" disabled={status !== 'ready'}
          aria-label={copy.resetLabel} title={copy.resetLabel} onClick={() => controller.current?.reset()}>
          <span aria-hidden="true">↺</span> {copy.reset}
        </button>
        <button ref={editButton} className="island-edit" type="button" disabled={status !== 'ready' || isFishing}
          aria-expanded={Boolean(placement)} aria-controls="island-placement" onClick={() => selectPlacement(placement ? null : 'stone')}>
          {copy.edit}
        </button>
      </div>
    </div>
    {fishing.phase === 'game' && <FishingDialog id="fishing-guess" title={copy.guessing} language={language} onClose={cancel}>
      <FishingGuess language={language} answer={fishing.answer} onFinish={finish} />
    </FishingDialog>}
    {fishing.phase === 'caught' && <CatchResult language={language} fish={fishing.fish} answer={fishing.answer}
      guesses={fishing.guesses} first={fishing.first} saved={fishing.saved} onClose={cancel} onAgain={() => interact('cast')}
      onInspect={() => { cancel(); openCollection('guide', fishing.fish.speciesId); }} />}
    {collection && <FishCollection view={collection.view} initialFish={collection.initialFish} catches={catches} language={language}
      onClose={() => setCollection(null)} onSwitch={view => setCollection({ view })} />}
  </main>;
}
