import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { biteDelay, catchPrefix, makeCatch, parseCatch, pickAnswer, pickSpecies } from './fishing-rules';
import type { Catch, Guess } from './fishing-rules';
import type { FishingAction } from './scene';

type Session = { phase: 'idle' } | { phase: 'waiting'; due: number } | { phase: 'bite' } |
  { phase: 'game'; answer: number } | { phase: 'caught'; fish: Catch; answer: number; guesses: readonly Guess[]; first: boolean; saved: boolean };

function loadShelf() {
  const shelf = new Map<string, Catch>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(catchPrefix)) continue;
      const item = parseCatch(localStorage.getItem(key), key.slice(catchPrefix.length));
      if (item) shelf.set(item.id, item);
    }
  } catch {
    // A session can still hold catches when browser storage is unavailable.
  }
  return shelf;
}

export function useFishing() {
  const [session, setSession] = useState<Session>({ phase: 'idle' });
  const current = useRef(session);
  const [shelf, setShelf] = useState(loadShelf);
  const savedShelf = useRef(shelf);
  const temporary = useRef(new Map<string, Catch>());
  const catches = useMemo(() => Array.from(shelf.values()).sort((a, b) => b.caughtAt - a.caughtAt), [shelf]);

  const change = useCallback((next: Session) => {
    current.current = next;
    setSession(next);
  }, []);

  const interact = useCallback((action: FishingAction) => {
    const { phase } = current.current;
    if (action === 'cast' && (phase === 'idle' || phase === 'caught')) {
      change({ phase: 'waiting', due: performance.now() + biteDelay() });
    }
    if (action === 'reel' && phase === 'bite') change({ phase: 'game', answer: pickAnswer() });
  }, [change]);

  useEffect(() => {
    if (session.phase !== 'waiting') return;
    const timer = window.setTimeout(() => {
      if (current.current === session) change({ phase: 'bite' });
    }, Math.max(0, Math.ceil(session.due - performance.now())));
    return () => window.clearTimeout(timer);
  }, [change, session]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== null && !event.key.startsWith(catchPrefix)) return;
      const merged = new Map([...loadShelf(), ...temporary.current]);
      savedShelf.current = merged;
      setShelf(merged);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const finish = useCallback((guesses: readonly Guess[]) => {
    const game = current.current;
    if (game.phase !== 'game') return;
    const latest = new Map([...savedShelf.current, ...loadShelf()]);
    const discovered = new Set(Array.from(latest.values(), item => item.speciesId));
    const caught = makeCatch(pickSpecies(guesses, game.answer, discovered));
    let saved = true;
    try {
      localStorage.setItem(catchPrefix + caught.id, JSON.stringify(caught));
    } catch {
      saved = false;
      temporary.current.set(caught.id, caught);
    }
    latest.set(caught.id, caught);
    savedShelf.current = latest;
    setShelf(latest);
    change({ phase: 'caught', fish: caught, answer: game.answer, guesses, first: !discovered.has(caught.speciesId), saved });
  }, [change]);

  const cancel = useCallback(() => {
    if (current.current.phase !== 'idle') change({ phase: 'idle' });
  }, [change]);

  return { session, catches, interact, finish, cancel };
}
