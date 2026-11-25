import { Container, Sprite, Texture } from 'pixi.js';

export const boatArtNames = [
  'boat-hull', 'character-legs', 'character-body', 'character-ear-left', 'character-ear-right', 'character-head',
] as const;

/** All artwork shares a 140 × 220 design space. Only transforms animate;
 * textures are rasterised once, with no SVG parsing or redrawing per frame. */
export class Daydreamer extends Container {
  private body: Sprite;
  private head = new Container();
  private leftEar: Sprite;
  private rightEar: Sprite;

  constructor(art: ReadonlyMap<string, Texture>) {
    super();
    this.pivot.set(70, 118.8);
    const layer = (name: string, x = 0, y = 0) => {
      const sprite = new Sprite(art.get(name)!);
      sprite.pivot.set(x, y);
      sprite.position.set(x, y);
      return sprite;
    };
    this.addChild(layer('boat-hull'));
    const character = new Container();
    character.pivot.set(70, 110);
    character.position.set(70, 110);
    character.rotation = -Math.PI / 30;
    this.body = layer('character-body', 70, 145);
    this.head.pivot.set(70, 94);
    this.head.position.set(70, 94);
    this.leftEar = layer('character-ear-left', 46, 59);
    this.rightEar = layer('character-ear-right', 93, 52);
    this.head.addChild(this.leftEar, this.rightEar, layer('character-head'));
    character.addChild(layer('character-legs'), this.body, this.head);
    this.addChild(character);
  }

  update(time: number, still: boolean) {
    // A slow 5.6-second breath, anchored at the shorts so feet do not slide.
    const breath = still ? 0 : Math.sin(time * Math.PI * 2 / 5.6);
    this.body.scale.y = 1 + breath * .004;
    this.head.y = 94 - breath * .22;
    this.head.rotation = still ? 0 : Math.sin(time * .48) * .006;
    // Brief ear flicks are separated by long rests, not a continuous wiggle.
    const phase = time % 13;
    const flick = !still && phase > 9 && phase < 10
      ? Math.sin((phase - 9) * Math.PI * 4) * Math.sin((phase - 9) * Math.PI) : 0;
    this.leftEar.rotation = flick * .055;
    this.rightEar.rotation = -flick * .026;
  }
}
