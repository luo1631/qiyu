import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FishPortrait } from './FishPortrait';
import { fishById, fishCatalog, fishSources, ranks } from './fishing-catalog';
import type { FishSpecies, Rank } from './fishing-catalog';
import { fishSize } from './fishing-rules';
import type { Catch, Guess } from './fishing-rules';
import { fishFamilies } from './fishing-taxonomy';

type Language = 'zh' | 'en';
export type CollectionMode = 'bag' | 'guide';

const labels = {
  zh: {
    close: '关闭', bag: '背包', guide: '鱼类图鉴', search: '搜索鱼名、学名或科名', all: '全部', foundOnly: '已发现',
    empty: '背包里还没有鱼', emptyHelp: '点击发光的小船，到瀑口钓第一条鱼。', noMatch: '没有符合条件的鱼。',
    undiscovered: '未发现', collected: (found: number, total: number) => `已发现 ${found} / ${total} 种`,
    quantity: (n: number) => `${n} 条鱼获`, recorded: (n: number) => `已钓获 ${n} 条`,
    reference: '参考体重', length: '参考尺寸', family: '所属科', lightest: '最轻记录', heaviest: '最重记录',
    study: '研究样本', region: '采样地区', sampleCount: '样本量', sampleLength: '样本尺寸范围', sampleWeight: '实测体重范围', fit: '拟合优度',
    individuals: (n: string) => `${n} 尾`,
    caughtAt: '钓获时间', weight: '实得体重', size: '体型', source: '科研来源', rank: '游戏稀有度',
    SL: '标准长', TL: '全长', FL: '叉长', EFL: '眼眶叉长', DW: '盘宽', survey: '调查体长',
    spring: '春季', autumn: '秋季', springAutumn: '春、秋季', streams: '溪流', males: '雄鱼', wildFemales: '野生雌鱼',
    result: '本次鱼获', first: '初次发现', answer: '答案', best: '最近一猜', difference: '相差', missed: '三轮未猜，钓到一条常见鱼。',
    stored: '已收入背包和图鉴', volatile: '浏览器存储不可用，这条鱼只保留在当前页面。', again: '再钓一次', inspect: '查看图鉴',
    sizes: { min: '最小 Min', tiny: '超级小', small: '小', standard: '标准', superStandard: '超级标准', large: '大', giant: '超级大', max: '最大 Max' },
  },
  en: {
    close: 'Close', bag: 'Bag', guide: 'Fish guide', search: 'Search fish or family', all: 'All', foundOnly: 'Discovered',
    empty: 'Your bag is empty', emptyHelp: 'Tap the glowing skiff to fish by the waterfall.', noMatch: 'No fish match those filters.',
    undiscovered: 'Undiscovered', collected: (found: number, total: number) => `${found} of ${total} species discovered`,
    quantity: (n: number) => `${n} ${n === 1 ? 'catch' : 'catches'}`, recorded: (n: number) => `Caught ${n}`, reference: 'Reference weight',
    length: 'Reference measurement', family: 'Family', lightest: 'Lightest', heaviest: 'Heaviest',
    study: 'Study sample', region: 'Sampling area', sampleCount: 'Sample size', sampleLength: 'Sample measurements',
    sampleWeight: 'Observed weight range', fit: 'Goodness of fit', individuals: (n: string) => `${n} fish`,
    caughtAt: 'Caught on', weight: 'Caught weight', size: 'Size', source: 'Research source', rank: 'Game rarity',
    SL: 'standard length', TL: 'total length', FL: 'fork length', EFL: 'eye-to-fork length', DW: 'disc width', survey: 'survey length',
    spring: 'spring', autumn: 'autumn', springAutumn: 'spring and autumn', streams: 'streams', males: 'males', wildFemales: 'wild females',
    result: 'Your catch', first: 'First discovery', answer: 'Answer', best: 'Closest guess', difference: 'off by',
    missed: 'All three rounds were skipped. You caught a common fish.', stored: 'Added to your bag and guide',
    volatile: 'Browser storage is unavailable. This catch lasts until you leave the page.', again: 'Fish again', inspect: 'View in guide',
    sizes: { min: 'Min', tiny: 'Tiny', small: 'Small', standard: 'Standard', superStandard: 'Super standard', large: 'Large', giant: 'Giant', max: 'Max' },
  },
};

const locales = { zh: 'zh-CN', en: 'en-GB' } as const;

function weightText(grams: number, language: Language) {
  const kg = grams >= 1000;
  const value = kg ? grams / 1000 : grams;
  return `${new Intl.NumberFormat(locales[language], { maximumFractionDigits: value < 1 ? 3 : value < 10 ? 2 : 1 }).format(value)} ${kg ? 'kg' : 'g'}`;
}

function measurementRange(range: readonly [number, number], unit: 'cm' | 'g', language: Language) {
  const format = new Intl.NumberFormat(locales[language], { maximumFractionDigits: 3 });
  return `${range.map(format.format).join('–')} ${unit}`;
}

function percent(offset: number, language: Language) {
  return new Intl.NumberFormat(locales[language], {
    style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 2,
  }).format(offset / 10000);
}

export function FishingDialog({ id, title, language, onClose, wide = false, children }: {
  id: string; title: string; language: Language; onClose: () => void; wide?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus({ preventScroll: true });
    return () => dialog.close();
  }, []);
  return <dialog id={id} ref={ref} className={`fish-dialog${wide ? ' fish-dialog-wide' : ''}`} aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }}>
    <div className="fish-dialog-title">
      <h2 id={`${id}-title`}>{title}</h2>
      <button className="fish-close" type="button" onClick={onClose} aria-label={labels[language].close}>×</button>
    </div>
    {children}
  </dialog>;
}

function RankMark({ rank, language }: { rank: Rank; language: Language }) {
  return <span className="fish-rank" data-rank={rank} aria-label={`${labels[language].rank} ${rank}`}>{rank}</span>;
}

export function CatchResult({ language, fish, answer, guesses, first, saved, onAgain, onInspect, onClose }: {
  language: Language; fish: Catch; answer: number; guesses: readonly Guess[]; first: boolean; saved: boolean;
  onAgain: () => void; onInspect: () => void; onClose: () => void;
}) {
  const copy = labels[language];
  const species = fishById.get(fish.speciesId)!;
  const entered = guesses.filter((guess): guess is number => guess !== null);
  const closest = entered.sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer))[0];
  return <FishingDialog id="fishing-catch" title={copy.result} language={language} onClose={onClose}>
    <div className="fish-result-plate" data-rank={species.rank}>
      <div className="fish-result-top"><RankMark rank={species.rank} language={language} />
        {first && <span className="fish-first">{copy.first}</span>}</div>
      <FishPortrait fish={species} />
      <div className="fish-result-name"><h3>{species[language]}</h3><i lang="la">{species.scientific}</i></div>
      <div className="fish-result-weight"><strong>{weightText(fish.grams, language)}</strong>
        <span>{copy.sizes[fishSize(fish.offset)]} <small>{percent(fish.offset, language)}</small></span></div>
    </div>
    <div className="fish-result-answer">
      <span>{copy.answer} <b>{answer}</b></span>
      {closest !== undefined && <span>{copy.best} <b>{closest}</b> · {copy.difference} {Math.abs(answer - closest)}</span>}
    </div>
    {closest === undefined && <p className="fish-result-note">{copy.missed}</p>}
    <p className="fish-result-note" role="status">{saved ? copy.stored : copy.volatile}</p>
    <div className="fish-actions">
      <button type="button" className="fish-subtle" onClick={onInspect}>{copy.inspect}</button>
      <button type="button" className="fish-primary" data-initial-focus onClick={onAgain}>{copy.again}</button>
    </div>
  </FishingDialog>;
}

interface FishEntry { id: string; species: FishSpecies; catches: Catch[]; individual?: Catch }

function FishRecord({ entry, language }: { entry: FishEntry; language: Language }) {
  const { species, catches, individual } = entry;
  const { study } = species;
  const copy = labels[language];
  const source = fishSources[species.source];
  let lightest = Infinity, heaviest = 0;
  for (const fish of catches) {
    lightest = Math.min(lightest, fish.grams);
    heaviest = Math.max(heaviest, fish.grams);
  }
  return <article className="fish-record" aria-label={species[language]}>
    <div className="fish-record-art"><FishPortrait fish={species} silhouette={!catches.length} /></div>
    <div className="fish-record-header"><div><h3>{species[language]}</h3><i lang="la">{species.scientific}</i></div>
      <RankMark rank={species.rank} language={language} /></div>
    <p className="fish-record-count">{catches.length ? copy.recorded(catches.length) : copy.undiscovered}</p>
    <dl className="fish-record-stats">
      {individual ? <>
        <div><dt>{copy.weight}</dt><dd>{weightText(individual.grams, language)}</dd></div>
        <div><dt>{copy.size}</dt><dd>{copy.sizes[fishSize(individual.offset)]} · {percent(individual.offset, language)}</dd></div>
      </> : catches.length > 0 && <>
        <div><dt>{copy.lightest}</dt><dd>{weightText(lightest, language)}</dd></div>
        <div><dt>{copy.heaviest}</dt><dd>{weightText(heaviest, language)}</dd></div>
      </>}
      <div><dt>{copy.reference}</dt><dd>{weightText(species.referenceGrams, language)}</dd></div>
      <div><dt>{copy.length}</dt><dd>{species.lengthCm} cm · {copy[species.lengthBasis]}</dd></div>
      <div><dt>{copy.family}</dt><dd title={species.family}>{language === 'zh' ? fishFamilies[species.family][0] : species.family}</dd></div>
      {individual && <div className="fish-record-date"><dt>{copy.caughtAt}</dt>
        <dd><time dateTime={new Date(individual.caughtAt).toISOString()}>{new Intl.DateTimeFormat(locales[language], {
          dateStyle: 'medium', timeStyle: 'short',
        }).format(individual.caughtAt)}</time></dd></div>}
    </dl>
    {study && <details className="fish-study">
      <summary>{copy.study}</summary>
      <dl className="fish-record-stats">
        <div className="fish-record-date"><dt>{copy.region}</dt><dd>{study.region[language]}</dd></div>
        <div><dt>{copy.sampleCount}</dt><dd>{copy.individuals(study.count.toLocaleString(locales[language]))}</dd></div>
        <div><dt>{copy.fit}</dt><dd>R² = {study.rSquared}</dd></div>
        <div><dt>{copy.sampleLength} · {copy[species.lengthBasis]}</dt><dd>{measurementRange(study.lengthRangeCm, 'cm', language)}</dd></div>
        {study.weightRangeGrams && <div><dt>{copy.sampleWeight}</dt>
          <dd>{measurementRange(study.weightRangeGrams, 'g', language)}</dd></div>}
      </dl>
    </details>}
    <a className="fish-source" href={source.url} rel="noreferrer" target="_blank" aria-label={`${copy.source} · ${source[language]}`}>
      {source[language]}{species.sample ? ` · ${copy[species.sample]}` : ''} <span aria-hidden="true">↗</span>
    </a>
  </article>;
}

export function FishCollection({ view, language, catches, initialFish, onSwitch, onClose }: {
  view: CollectionMode; language: Language; catches: readonly Catch[]; initialFish?: string;
  onSwitch: (view: CollectionMode) => void; onClose: () => void;
}) {
  const [filter, setFilter] = useState<Rank | 'all'>('all');
  const [search, setSearch] = useState('');
  const [foundOnly, setFoundOnly] = useState(false);
  const [selected, setSelected] = useState(initialFish ?? '');
  const list = useRef<HTMLUListElement>(null);
  const bag = view === 'bag';
  const copy = labels[language];
  const discovered = useMemo(() => {
    const bySpecies = new Map<string, Catch[]>();
    for (const item of catches) {
      const landed = bySpecies.get(item.speciesId);
      if (landed) landed.push(item);
      else bySpecies.set(item.speciesId, [item]);
    }
    return bySpecies;
  }, [catches]);
  const entries: FishEntry[] = bag ? catches.map(individual => ({ id: individual.id,
    species: fishById.get(individual.speciesId)!, catches: discovered.get(individual.speciesId)!, individual,
  })) : fishCatalog.map(species => ({ id: species.id, species, catches: discovered.get(species.id) ?? [] }));
  const query = search.trim().toLocaleLowerCase();
  const items = entries.filter(({ species, catches }) => {
    if (filter !== 'all' && filter !== species.rank) return false;
    if (!bag && foundOnly && !catches.length) return false;
    return !query || `${species.zh} ${species.en} ${species.scientific} ${species.family} ${fishFamilies[species.family][0]}`
      .toLocaleLowerCase().includes(query);
  });
  const detail = items.find(item => item.id === selected) ?? items.find(item => item.catches.length) ?? items[0];

  useLayoutEffect(() => {
    const container = list.current;
    const row = container?.querySelector('button[aria-pressed="true"]');
    if (!container || !row) return;
    const bounds = container.getBoundingClientRect(), item = row.getBoundingClientRect();
    if (item.top < bounds.top) container.scrollTop += item.top - bounds.top - 5;
    if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom + 5;
  }, [detail?.id, view]);

  function switchView(next: CollectionMode) {
    onSwitch(next);
    setSelected(detail ? next === 'guide' ? detail.species.id : (detail.catches[0]?.id ?? '') : '');
  }

  return <FishingDialog id="fishing-collection" title={bag ? copy.bag : copy.guide} language={language} onClose={onClose} wide>
    <div className="fish-collection-head">
      <div role="group" aria-label={language === 'zh' ? '鱼获收藏' : 'Catch collection'} className="fish-collection-tabs">
        <button type="button" aria-pressed={bag} data-initial-focus={bag ? '' : undefined} onClick={() => switchView('bag')}>{copy.bag}</button>
        <button type="button" aria-pressed={!bag} data-initial-focus={!bag ? '' : undefined} onClick={() => switchView('guide')}>{copy.guide}</button>
      </div>
      <div className="fish-collection-progress">
        <span>{bag ? copy.quantity(catches.length) : copy.collected(discovered.size, fishCatalog.length)}</span>
        {!bag && <progress aria-label={copy.collected(discovered.size, fishCatalog.length)} value={discovered.size} max={fishCatalog.length} />}
      </div>
    </div>
    <div className="fish-filters">
      <input type="search" aria-label={copy.search} placeholder={copy.search} value={search} maxLength={80}
        onChange={event => setSearch(event.currentTarget.value)} />
      <div className="fish-filter-ranks" role="group" aria-label={copy.rank}>
        {(['all', ...ranks] as const).map(rank => <button key={rank} type="button" aria-pressed={filter === rank}
          onClick={() => setFilter(rank)}>{rank === 'all' ? copy.all : rank}</button>)}
      </div>
      {!bag && <label className="fish-found-only"><input type="checkbox" checked={foundOnly}
        onChange={event => setFoundOnly(event.currentTarget.checked)} />{copy.foundOnly}</label>}
    </div>
    {detail ? <div className="fish-collection-grid">
      <ul ref={list} className="fish-list" aria-label={bag ? copy.bag : copy.guide}>
        {items.map(({ id, species, catches, individual }) => <li key={id}>
          <button type="button" aria-pressed={id === detail.id} onClick={() => setSelected(id)}>
            <RankMark rank={species.rank} language={language} />
            <span className="fish-list-name">{species[language]}</span>
            <span className="fish-list-note">{individual ? weightText(individual.grams, language) : catches.length ? `×${catches.length}` : copy.undiscovered}</span>
          </button>
        </li>)}
      </ul>
      <FishRecord entry={detail} language={language} />
    </div> : <div className="fish-empty" role="status">
      <p>{bag && !catches.length ? copy.empty : copy.noMatch}</p>
      {bag && !catches.length && <small>{copy.emptyHelp}</small>}
    </div>}
  </FishingDialog>;
}
