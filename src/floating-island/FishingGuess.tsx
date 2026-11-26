import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { guessDigits, guessLimit, guessMs, guessRange, guessRounds, parseGuess } from './fishing-rules';
import type { Guess } from './fishing-rules';

type Language = 'zh' | 'en';

const labels = {
  zh: {
    question: '猜得越近，越容易钓到稀有鱼。', range: '当前范围', certain: '已经猜中', time: '每轮 2 秒',
    input: '输入 1 到 999', prompt: '输入满 3 位、按 Enter 或到时自动提交', exact: '猜中了',
    low: '低了', high: '高了', missed: '未猜', delete: '退格', submit: '提交', round: '轮',
  },
  en: {
    question: 'Closer guesses improve your odds of a rare catch.', range: 'Current range', certain: 'Number found', time: '2 s per round',
    input: 'Enter a number from 1 to 999', prompt: 'Submit at 3 digits, with Enter, or when time runs out', exact: 'Correct',
    low: 'Too low', high: 'Too high', missed: 'Skipped', delete: 'Backspace', submit: 'Enter', round: 'Round',
  },
};

export function FishingGuess({ answer, language, onFinish }: {
  answer: number; language: Language; onFinish: (guesses: readonly Guess[]) => void;
}) {
  const [round, setRound] = useState<{ guesses: Guess[]; feedback: boolean }>({ guesses: [], feedback: false });
  const [digits, setDigits] = useState('');
  const [touchPad] = useState(() => matchMedia('(pointer: coarse)').matches);
  const draft = useRef('');
  const gate = useRef({ locked: true, deadline: 0 });
  const field = useRef<HTMLInputElement>(null);
  const timerBar = useRef<HTMLDivElement>(null);
  const copy = labels[language];
  const { min, max } = guessRange(round.guesses, answer);
  const index = Math.min(guessRounds, round.guesses.length + (round.feedback ? 0 : 1));

  const submit = useCallback(() => {
    if (gate.current.locked) return;
    gate.current.locked = true;
    const guess = parseGuess(draft.current);
    setRound({ guesses: [...round.guesses, guess], feedback: true });
  }, [round.guesses]);

  useLayoutEffect(() => {
    if (round.feedback) return;
    const deadline = performance.now() + guessMs;
    gate.current = { locked: false, deadline };
    field.current?.focus({ preventScroll: true });
    timerBar.current?.style.setProperty('--remaining', '1');
    let raf = 0;
    function paint() {
      const left = Math.max(0, (deadline - performance.now()) / guessMs);
      timerBar.current?.style.setProperty('--remaining', String(left));
      if (left > 0) raf = requestAnimationFrame(paint);
    }
    raf = requestAnimationFrame(paint);
    const timeout = window.setTimeout(submit, guessMs);
    return () => {
      gate.current.locked = true;
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [round.feedback, submit]);

  useEffect(() => {
    if (!round.feedback) return;
    const timeout = window.setTimeout(() => {
      if (round.guesses.length === guessRounds) onFinish(round.guesses);
      else {
        draft.current = '';
        setDigits('');
        setRound({ guesses: round.guesses, feedback: false });
      }
    }, 1025);
    return () => clearTimeout(timeout);
  }, [onFinish, round]);

  function enter(raw: string) {
    if (gate.current.locked) return;
    if (performance.now() >= gate.current.deadline) { submit(); return; }
    const next = guessDigits(raw);
    draft.current = next;
    setDigits(next);
    if (next.length === 3) submit();
  }

  function feedback(guess: Guess) {
    if (guess === null) return copy.missed;
    if (guess === answer) return copy.exact;
    return guess < answer ? copy.low : copy.high;
  }

  return <div className="fish-game" data-round={index} data-feedback={round.feedback}>
    <p className="fish-dialog-intro">{copy.question}</p>
    <div className="fish-round-meta">
      <span>{language === 'zh' ? `第 ${index} / ${guessRounds} 轮` : `${copy.round} ${index} of ${guessRounds}`}</span>
      <span>{copy.time}</span>
    </div>
    <div className="fish-timer" ref={timerBar} aria-hidden="true"><span /></div>
    <div className="fish-guess-range"><span>{min === max ? copy.certain : copy.range}</span>
      <strong>{min === max ? min : `${min}–${max}`}</strong></div>
    <form className="fish-guess-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <input ref={field} data-initial-focus type="text" pattern="[0-9]*" aria-label={copy.input}
        inputMode={touchPad ? 'none' : 'numeric'} autoComplete="off" spellCheck={false} value={digits}
        readOnly={round.feedback} onChange={event => enter(event.currentTarget.value)} placeholder={`1–${guessLimit}`}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
        }} />
    </form>
    {touchPad && <div className="fish-number-pad" onPointerDown={event => event.preventDefault()}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n =>
        <button key={n} type="button" disabled={round.feedback} onClick={() => enter(draft.current + n)}>{n}</button>)}
      <button type="button" aria-label={copy.delete} disabled={round.feedback} onClick={() => enter(draft.current.slice(0, -1))}>⌫</button>
      <button type="button" disabled={round.feedback} onClick={() => enter(draft.current + '0')}>0</button>
      <button type="button" disabled={round.feedback} onClick={submit}>{copy.submit}</button>
    </div>}
    <p className="fish-guess-prompt" role="status" data-hint={round.feedback}>
      {round.feedback ? feedback(round.guesses[round.guesses.length - 1]) : touchPad ? '' : copy.prompt}
    </p>
    <ol className="fish-round-history" aria-label={language === 'zh' ? '三轮记录' : 'Round history'}>
      {Array.from({ length: guessRounds }, (_, slot) => {
        const guess = round.guesses[slot];
        return <li key={slot} data-current={slot === index - 1} data-filled={guess !== undefined}>
          <span>{slot + 1}</span>
          <b>{guess ?? '—'}</b>
          {guess !== undefined && <i>{feedback(guess)}</i>}
        </li>;
      })}
    </ol>
  </div>;
}
