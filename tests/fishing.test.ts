import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fishById, fishCatalog, fishSources, ranks } from '../src/floating-island/fishing-catalog';
import { accuracy, biteDelay, fishSize, guessDigits, guessRange, parseCatch, parseGuess, pickAnswer,
  pickSpecies, rankOdds, rollOffset } from '../src/floating-island/fishing-rules';
import { inLake, fishingHeading, fishingSeat, onIsland, shoreDistance } from '../src/floating-island/terrain';

test('the fishing spot sits on dry land within cast distance of the pond', () => {
  assert.ok(onIsland(fishingSeat.x, fishingSeat.y) && !inLake(fishingSeat.x, fishingSeat.y));
  const x = fishingSeat.x + 2.27 * Math.sin(fishingHeading), z = fishingSeat.y + 2.27 * Math.cos(fishingHeading);
  assert.ok(inLake(x, z) && shoreDistance(x, z) > .25);
});

test('a cast waits 5–10 seconds and uses a single inclusive 1–999 guessing range', () => {
  assert.equal(biteDelay(() => 0), 5000);
  assert.ok(biteDelay(() => .999999) < 10000);
  assert.equal(pickAnswer(() => 0), 1);
  assert.equal(pickAnswer(() => .999999), 999);
  assert.equal(guessDigits('７a８9x0'), '789');
  assert.equal(parseGuess('０９'), 9);
  assert.equal(parseGuess('000'), null);
  assert.equal(parseGuess(''), null);
  assert.deepEqual(guessRange([null, 150, 500], 300), { min: 151, max: 499 });
  assert.deepEqual(guessRange([150, 300], 300), { min: 300, max: 300 });
});

test('closer guesses improve the chance of each cumulative rarity threshold', () => {
  const best = [accuracy([null, null, null], 600), accuracy([100, 200, 300], 600),
    accuracy([450, null, 530], 600), accuracy([620, 642, 649], 600), accuracy([600, null, null], 600)];
  assert.equal(best[0], 0);
  assert.equal(best[best.length - 1], 1);
  for (let index = 0; index < best.length; index++) {
    const odds = rankOdds(best[index]);
    assert.ok(odds.every(p => p > 0));
    assert.ok(Math.abs(odds.reduce((a, b) => a + b, 0) - 1) < 1e-10);
    if (index === 0) continue;
    const before = rankOdds(best[index - 1]);
    for (let count = 1; count < ranks.length; count++) {
      assert.ok(odds.slice(0, count).reduce((a, b) => a + b, 0) > before.slice(0, count).reduce((a, b) => a + b, 0));
    }
  }
  assert.equal(pickSpecies([null, null, null], 400, new Set(), () => 0).rank, 'E');
  assert.equal(pickSpecies([400, null, null], 400, new Set(), () => .2).rank, 'S');
});

test('the ±1% super-standard and ±7.5% standard ranges include both boundaries', () => {
  const boundaries = [-2500, -2499, -2001, -2000, -751, -750, -101, -100, 0, 100, 101, 750, 751, 2000, 2001, 2499, 2500];
  assert.deepEqual(boundaries.map(fishSize), ['min', 'tiny', 'tiny', 'small', 'small', 'standard', 'standard',
    'superStandard', 'superStandard', 'superStandard', 'standard', 'standard', 'large', 'large', 'giant', 'giant', 'max']);
  const random = (phase: number) => {
    const values = [1 - Math.exp(-9 / 2), phase];
    return () => values.shift()!;
  };
  assert.equal(rollOffset(random(0)), 2500);
  assert.equal(rollOffset(random(.5)), -2500);
  assert.equal(rollOffset(random(.25)), 0);
});

test('the research records yield gram weights and each species has a unique collectable identity', () => {
  assert.equal(fishById.size, fishCatalog.length);
  assert.equal(new Set(fishCatalog.map(fish => fish.scientific)).size, fishCatalog.length);
  for (const fish of fishCatalog) {
    assert.ok(fishSources[fish.source].url.startsWith('https://'));
    assert.ok(fish.referenceGrams > 0 && Number.isFinite(fish.referenceGrams));
  }
  assert.ok(Math.abs(fishById.get('crucian')!.referenceGrams - 175.026) < .01);
  assert.ok(Math.abs(fishById.get('medaka')!.referenceGrams - .1579) < .0001);
  assert.ok(Math.abs(fishById.get('largemouth')!.referenceGrams - 669.272) < .01);
  assert.ok(Math.abs(fishById.get('atlantic-halibut')!.referenceGrams - 12096.85) < .01);
  assert.equal(fishById.get('atlantic-herring')?.source, 'atlantic');
  assert.equal(fishById.get('blackdevil')?.referenceGrams, 290);
  assert.equal(fishById.get('fangtooth')?.referenceGrams, 42.63);
  assert.ok(Math.abs(fishById.get('tiger-puffer')!.referenceGrams - 1551.664) < .01);
  assert.equal(fishById.get('cownose-ray')?.lengthBasis, 'DW');
  assert.equal(fishById.get('swordfish')?.lengthBasis, 'EFL');
});

test('the fish guide descends by total rating and allocates the six exact species shares', () => {
  assert.equal(fishCatalog.length, 140);
  assert.deepEqual(ranks.map(rank => fishCatalog.filter(fish => fish.rank === rank).length), [7, 14, 21, 28, 35, 35]);
  const rankOrder = fishCatalog.map(fish => ranks.indexOf(fish.rank));
  assert.deepEqual(rankOrder, [...rankOrder].sort((a, b) => a - b));
  for (let index = 1; index < fishCatalog.length; index++) {
    const before = fishCatalog[index - 1].ratings;
    const after = fishCatalog[index].ratings;
    const diff = before.reduce((sum, value) => sum + value, 0) - after.reduce((sum, value) => sum + value, 0);
    assert.ok((diff || before[1] - after[1] || before[2] - after[2]) >= 0);
  }
});

test('the added fish cards each represent a different family absent from the previous guide', () => {
  const familySamples = new Set(['blackdevil', 'fangtooth', 'viperfish', 'lanternfish', 'hatchetfish', 'silver-spinyfin',
    'orange-roughy', 'sablefish', 'black-scabbardfish', 'lancetfish', 'northern-snakehead', 'nile-tilapia',
    'torrent-catfish', 'tymen-stickleback', 'hana-sculpin', 'swordfish', 'mahi-mahi', 'cownose-ray', 'goosefish', 'tiger-puffer']);
  const newFamilies = fishCatalog.filter(fish => familySamples.has(fish.id)).map(fish => fish.family);
  const previousFamilies = new Set(fishCatalog.filter(fish => !familySamples.has(fish.id)).map(fish => fish.family));
  assert.equal(newFamilies.length, 20);
  assert.equal(new Set(newFamilies).size, 20);
  assert.ok(newFamilies.every(family => !previousFamilies.has(family)));
});

test('the detailed surveys each contribute a new family with a reference inside the measured size range', () => {
  const earlierFamilies = new Set(fishCatalog.filter(fish => !fish.study).map(fish => fish.family));
  const detailedFish = fishCatalog.filter(fish => fish.study !== undefined);
  assert.equal(earlierFamilies.size, 58);
  assert.equal(detailedFish.length, 40);
  assert.equal(new Set(detailedFish.map(fish => fish.family)).size, 40);
  for (const fish of detailedFish) {
    assert.ok(!earlierFamilies.has(fish.family), fish.scientific);
    const study = fish.study!;
    const [min, max] = study.lengthRangeCm;
    assert.ok(Number.isInteger(study.count) && study.count > 0, fish.scientific);
    assert.ok(0 < min && min < fish.lengthCm && fish.lengthCm < max, fish.scientific);
    assert.ok(study.rSquared > 0 && study.rSquared <= 1, fish.scientific);
    if (study.weightRangeGrams) {
      const [lightest, heaviest] = study.weightRangeGrams;
      assert.ok(0 < lightest && lightest < fish.referenceGrams && fish.referenceGrams < heaviest, fish.scientific);
    }
  }
  const dogfish = fishById.get('spiny-dogfish')!;
  assert.equal(dogfish.study?.count, 12070);
  assert.ok(Math.abs(dogfish.referenceGrams - 1693.19) < .01);
  assert.equal(fishById.get('spiny-butterfly-ray')?.lengthBasis, 'DW');
  const arowana = fishById.get('silver-arowana')!;
  assert.equal(arowana.lengthBasis, 'SL');
  assert.deepEqual(arowana.study?.weightRangeGrams, [98, 5150]);
  assert.ok(Math.abs(arowana.referenceGrams - 1476.50) < .01);
});

test('malformed records are ignored while prior catches retain their stored weight', () => {
  const record = { speciesId: 'crucian', grams: 200.054, offset: -213, caughtAt: 1650000000000 };
  assert.deepEqual(parseCatch(JSON.stringify(record), 'specimen'), { ...record, id: 'specimen' });
  for (const invalid of [JSON.stringify({ ...record, offset: 2501 }), JSON.stringify({ ...record, speciesId: 'unknown' }),
    JSON.stringify({ ...record, grams: '200' }), JSON.stringify({ ...record, caughtAt: -1 }), '{bad', null]) {
    assert.equal(parseCatch(invalid, 'invalid'), null);
  }
});
