import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, SphereGeometry, Vector3 } from 'three';

export type FloraPoint = [number, number, number];
export type StemSection = [number, number, number, number];

type Leaf = {
  at: FloraPoint;
  along: FloraPoint;
  bend: FloraPoint;
  length: number;
  width: number;
  color: Color;
  rows: number;
  solid?: boolean;
};

const globe = new SphereGeometry(1, 10, 6), bud = new SphereGeometry(1, 8, 5);
const up = new Vector3(0, 1, 0), sideways = new Vector3(0, 0, 1);

/** A single indexed surface for the parts that share one plant material. */
export class FloraGeometry {
  private positions: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];

  private put(point: Vector3, color: Color, shade = 1) {
    this.positions.push(point.x, point.y, point.z);
    this.colors.push(color.r * shade, color.g * shade, color.b * shade);
  }

  private joinRings(offset: number, rows: number, sides: number) {
    for (let row = 0; row < rows; row++) {
      for (let side = 0; side < sides; side++) {
        const a = offset + row * sides + side, b = offset + row * sides + (side + 1) % sides;
        this.indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }

  stem(sections: StemSection[], color: Color, sides = 7, steps = (sections.length - 1) * 3) {
    const path = new CatmullRomCurve3(sections.map(([x, y, z]) => new Vector3(x, y, z)));
    const frame = path.computeFrenetFrames(steps, false);
    const offset = this.positions.length / 3, point = new Vector3();
    for (let row = 0; row <= steps; row++) {
      const parameter = path.getUtoTmapping(row / steps, 0);
      const centre = path.getPoint(parameter);
      const index = Math.min(sections.length - 2, Math.floor(parameter * (sections.length - 1)));
      const t = parameter * (sections.length - 1) - index;
      const radius = sections[index][3] * (1 - t) + sections[index + 1][3] * t;
      for (let i = 0; i < sides; i++) {
        const theta = i * Math.PI * 2 / sides;
        const groove = Math.sin(theta * 3 + row * .32);
        const width = radius * (1 + .083 * groove);
        point.copy(centre).addScaledVector(frame.normals[row], Math.cos(theta) * width)
          .addScaledVector(frame.binormals[row], Math.sin(theta) * width);
        this.put(point, color, .77 + .27 * parameter + .13 * groove);
      }
    }
    this.joinRings(offset, steps, sides);
  }

  leaf({ at, along, bend, length, width, color, rows, solid = true }: Leaf) {
    const dir = new Vector3(...along).normalize();
    const cross = new Vector3().crossVectors(dir, Math.abs(dir.y) < .94 ? up : sideways).normalize();
    const ridge = new Vector3().crossVectors(cross, dir);
    const base = new Vector3(...at), curve = new Vector3(...bend), centre = new Vector3(), point = new Vector3();
    const offset = this.positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const span = width * Math.max(.011, Math.sin(Math.PI * t ** .79) ** .82);
      centre.copy(base).addScaledVector(dir, t * length).addScaledVector(curve, t * t);
      const shade = .71 + .38 * t;
      this.put(point.copy(centre).addScaledVector(cross, -span), color, shade * .96);
      this.put(point.copy(centre).addScaledVector(ridge, span * .27), color, shade * 1.14);
      this.put(point.copy(centre).addScaledVector(cross, span), color, shade);
      if (solid) this.put(point.copy(centre).addScaledVector(ridge, -span * .087), color, shade * .78);
    }
    if (solid) this.joinRings(offset, rows, 4);
    else {
      for (let row = 0; row < rows; row++) {
        const a = offset + row * 3;
        this.indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
      }
    }
  }

  crown(at: FloraPoint, size: FloraPoint, color: Color, phase: number) {
    const offset = this.positions.length / 3, point = new Vector3();
    const source = Math.max(...size) < .29 ? bud : globe;
    const globePositions = source.getAttribute('position'), globeIndex = source.getIndex()!;
    for (let i = 0; i < globePositions.count; i++) {
      const x = globePositions.getX(i), y = globePositions.getY(i), z = globePositions.getZ(i);
      const knob = Math.sin(x * 7.1 + z * 4.1 + phase) * Math.cos(z * 8.2 - y * 4.8);
      const silhouette = 1 + .145 * Math.sin(x * 4.9 - y * 5.4 + phase) * Math.sin(z * 3.9 + x * 3.2) + knob * .065;
      point.set(at[0] + x * size[0] * silhouette, at[1] + y * size[1] * silhouette, at[2] + z * size[2] * silhouette);
      this.put(point, color, .77 + y * .26 + knob * .10);
    }
    for (let i = 0; i < globeIndex.count; i++) this.indices.push(offset + globeIndex.getX(i));
  }

  build(name: string) {
    const geometry = new BufferGeometry();
    geometry.name = name;
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}
