import { makeBoatCat } from './boat-cat';
import { makeBoatCatModel } from './boat-cat-model';
import { makeBoatHull } from './boat-hull';
import { makeBoatSleeper } from './boat-sleeper';
import { disposeSculpture } from './PondCreatures';

export function makePondBoat() {
  const { root, lantern } = makeBoatHull();
  const sleeper = makeBoatSleeper();
  root.add(sleeper.root, makeBoatCatModel());
  const cat = makeBoatCat(root);
  return {
    root, lantern, sleeper, cat,
    update(time: number, night: number) {
      sleeper.update(time);
      cat?.update(time, night);
    },
    dispose() { disposeSculpture(root); },
  };
}
