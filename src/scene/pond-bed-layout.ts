import { Color } from 'three';
import { islandRadius } from './habitat-layout';
import { seededRandom } from './pond-life';
import type { FloorHeight } from './PondTerrain';
import { pondRim, shorePoint } from './shore-layout';
import { islandScale, worldIslands } from './world-layout';

type Triplet = [number, number, number];
export interface BedPlacement {
  position: Triplet;
  scale: Triplet;
  rotation: Triplet;
  color: Color;
}
export interface BedGroup {
  principal: BedPlacement[];
  fine: BedPlacement[];
}

// Leave broad runs of open sand between the ledges. Angles follow the live rim
// from the east shore through the two foreground bays and around to the far side.
const shelves = [
  { angle: .37, inset: 2.43, span: 1.82, size: .93, ledge: -.09, rake: .10 },
  { angle: 1.07, inset: 2.46, span: 1.16, size: .64, ledge: .24, rake: -.28 },
  { angle: 2.00, inset: 2.57, span: 2.04, size: 1, ledge: -.14, rake: .04 },
  { angle: 3.53, inset: 2.18, span: 1.43, size: .74, ledge: -.27, rake: .31 },
  { angle: 5.50, inset: 2.24, span: 1.66, size: .86, ledge: .18, rake: -.15 },
];

export function makeBedLayout(heightAt: FloorHeight) {
  const random = seededRandom(4761);
  const group = (): BedGroup => ({ principal: [], fine: [] });
  const [stones, slabs, boulders, ribbons, pondweed] = Array.from({ length: 5 }, group);
  const coolStone = new Color('#aaa99b'), ochreStone = new Color('#c1b7a1');
  const grassOlive = new Color('#b2c28d'), grassPale = new Color('#ded6a6');
  const forest = new Color('#829c66'), fresh = new Color('#b6c28b');

  for (const shelf of shelves) {
    const ledge: BedPlacement[] = [];
    const anchor = (along: number, across: number, burial: number): Triplet | null => {
      const { x, z } = shorePoint(shelf.angle + along / pondRim.rz, shelf.inset + across);
      // Use the same floor as the renderer, including the live island aprons.
      const floor = heightAt(x, z);
      if (floor > -.46 || islandRadius(x, z) < 1.42 || worldIslands.some(island =>
        Math.hypot((x - island.x) / (island.rx * islandScale), (z - island.z) / (island.rz * islandScale)) < 1.22)) return null;
      return [x, floor - burial, z];
    };
    const stone = (bucket: BedGroup, along: number, across: number, scale: Triplet, principal: boolean) => {
      const position = anchor(along, across, .038);
      if (!position) return;
      const placement: BedPlacement = {
        position, scale,
        // The strata along a shelf share a direction. The exposed corners vary.
        rotation: [.07 + random() * .10, -shelf.angle - Math.PI / 2 + shelf.rake + (random() - .5) * .45, -.11 + random() * .15],
        color: coolStone.clone().lerp(ochreStone, random() * .80),
      };
      (principal ? bucket.principal : bucket.fine).push(placement);
      ledge.push(placement);
    };
    const size = shelf.size;
    stone(boulders, shelf.ledge * shelf.span, .05, [.56 * size, .35 * size, .40 * size], true);
    stone(slabs, (shelf.ledge < 0 ? .34 : -.40) * shelf.span, .16, [.52 * size, .30 * size, .43 * size], true);
    stone(slabs, -.58 * shelf.span, -.12, [.32 * size, .19 * size, .33 * size], false);
    for (let i = 0; i < 7; i++) {
      const along = (i < 4 ? -.56 + i * .32 : .57 + (i - 4) * .14) * shelf.span;
      const across = (i % 2 ? .48 : -.38) + (random() - .5) * .16;
      const radius = (.09 + random() * .11) * size;
      stone(stones, along + (random() - .5) * .20, across, [radius * 1.39, radius * .59, radius], i < 3);
    }

    const root = (i: number, burial: number) => {
      // Colonies gather against the long sides and around the ends of a ledge.
      // Keep roots off exposed stone faces and let each pocket fan unevenly.
      for (let attempt = 0; attempt < 12; attempt++) {
        const end = i % 3 === 0 ? -.69 : .40;
        const along = shelf.span * (end + (random() - .5) * .63);
        const across = (i % 2 === 0 ? .53 : -.37) + (random() - .5) * .40;
        const position = anchor(along, across, burial);
        if (position && ledge.every(rock =>
          Math.hypot(position[0] - rock.position[0], position[2] - rock.position[2]) > rock.scale[0] * .79)) return position;
      }
      return null;
    };
    for (let i = 0; i < Math.round(19 * size); i++) {
      const position = root(i, .037);
      if (!position) continue;
      const height = Math.min(size * (.36 + random() * .32), -position[1] - .22);
      (i < 8 ? ribbons.principal : ribbons.fine).push({
        position,
        scale: [height * (.92 + random() * .34), height, height * (.93 + random() * .33)],
        rotation: [(random() - .5) * .15, -shelf.angle + (random() - .5) * 2.2, (random() - .5) * .21],
        color: grassOlive.clone().lerp(grassPale, random() * .80),
      });
    }
    for (let i = 0; i < (size > .75 ? 4 : 2); i++) {
      const position = root(i + 1, .031);
      if (!position) continue;
      const height = Math.min(.35 + random() * .23, -position[1] - .24);
      (i < 2 ? pondweed.principal : pondweed.fine).push({
        position, scale: [height, height, height], rotation: [0, random() * Math.PI * 2, 0],
        color: forest.clone().lerp(fresh, random()),
      });
    }
  }
  return { stones, slabs, boulders, ribbons, pondweed };
}
