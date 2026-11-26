import { fishById, fishCatalog, ranks } from './fishing-catalog';
import type { FishSpecies } from './fishing-catalog';

export const guessLimit = 999;
export const guessRounds = 3;
export const guessMs = 2000;

export type Guess = number | null;
export type Size = 'min' | 'tiny' | 'small' | 'standard' | 'superStandard' | 'large' | 'giant' | 'max';
export type FishingPose = 'idle' | 'waiting' | 'bite' | 'reeling' | 'landed';

export interface Catch {
  id: string;
  speciesId: string;
  grams: number;
  offset: number;
  caughtAt: number;
}

export function biteDelay(random = Math.random) {
  return 5000 + 5000 * random();
}

export function pickAnswer(random = Math.random) {
  return 1 + Math.floor(guessLimit * random());
}

export function guessDigits(value: string) {
  return value.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10)).replace(/\D/g, '').slice(0, 3);
}

export function parseGuess(value: string): Guess {
  const n = Number(guessDigits(value));
  return n >= 1 && n <= guessLimit ? n : null;
}

export function guessRange(guesses: readonly Guess[], answer: number) {
  let min = 1, max = guessLimit;
  for (const guess of guesses) {
    if (guess === null) continue;
    if (guess === answer) return { min: answer, max: answer };
    if (guess < answer) min = Math.max(min, guess + 1);
    if (guess > answer) max = Math.min(max, guess - 1);
  }
  return { min, max };
}

export function accuracy(guesses: readonly Guess[], answer: number) {
  const scores = guesses.map(guess => guess === null ? 0 : Math.exp(-.5 * ((guess - answer) / 110) ** 2));
  const best = Math.max(0, ...scores);
  if (best === 1) return 1;
  return best * .75 + scores.reduce((sum, score) => sum + score, 0) / guessRounds * .25;
}

const baseOdds = [.004, .016, .05, .15, .28, .50];
const exactOdds = [.23, .34, .27, .12, .035, .005];

export function rankOdds(score: number) {
  const s = Math.max(0, Math.min(1, score));
  return baseOdds.map((base, index) => base + (exactOdds[index] - base) * s);
}

const fishByRank = ranks.map(rank => fishCatalog.filter(fish => fish.rank === rank));

export function pickSpecies(guesses: readonly Guess[], answer: number, discovered: ReadonlySet<string>, random = Math.random) {
  let tier = ranks.length - 1;
  if (guesses.some(guess => guess !== null)) {
    let draw = random();
    const odds = rankOdds(accuracy(guesses, answer));
    for (let index = 0; index < odds.length; index++) {
      draw -= odds[index];
      if (draw < 0) { tier = index; break; }
    }
  }
  const pool = fishByRank[tier];
  const weights = pool.map(fish => discovered.has(fish.id) ? 1 : 1.6);
  let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < pool.length; index++) {
    draw -= weights[index];
    if (draw < 0) return pool[index];
  }
  return pool[pool.length - 1];
}

// One unit represents 0.01%. Capping the tails gives Max and Min a finite chance.
export function rollOffset(random = Math.random) {
  const radius = Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, 1 - random())));
  const unitNormal = radius * Math.cos(2 * Math.PI * random());
  return Math.round(Math.max(-2500, Math.min(2500, 1100 * unitNormal)));
}

export function fishSize(offset: number): Size {
  const amount = Math.abs(offset);
  if (amount >= 2500) return offset > 0 ? 'max' : 'min';
  if (amount > 2000) return offset > 0 ? 'giant' : 'tiny';
  if (amount > 750) return offset > 0 ? 'large' : 'small';
  return amount > 100 ? 'standard' : 'superStandard';
}

export function makeCatch(species: FishSpecies): Catch {
  const offset = rollOffset();
  const caughtAt = Date.now();
  const id = globalThis.crypto.randomUUID?.() ?? `${caughtAt.toString(36)}-${Math.random().toString(36).slice(2)}`;
  return { id, speciesId: species.id, grams: species.referenceGrams * (1 + offset / 10000), offset, caughtAt };
}

export const catchPrefix = 'qiyu.fishing.catch.v1:';

export function parseCatch(raw: string | null, id: string): Catch | null {
  if (!raw) return null;
  try {
    const entry: unknown = JSON.parse(raw);
    if (!entry || typeof entry !== 'object') return null;
    const { speciesId, grams, offset, caughtAt } = entry as Partial<Catch>;
    if (typeof speciesId !== 'string' || !fishById.has(speciesId) ||
        typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0 ||
        typeof offset !== 'number' || !Number.isInteger(offset) || Math.abs(offset) > 2500 ||
        typeof caughtAt !== 'number' || !Number.isSafeInteger(caughtAt) || caughtAt < 0 || caughtAt > 8.64e15) return null;
    return { id, speciesId, grams, offset, caughtAt };
  } catch {
    return null;
  }
}
