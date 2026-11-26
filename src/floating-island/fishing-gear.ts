import {
  BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, Line, LineBasicMaterial, MathUtils,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import { Sculpture } from '../scene/sculpture';
import type { FishingPose } from './fishing-rules';
import { fishingHeading, fishingSeat, lakeLevel } from './terrain';

function biteSignal() {
  const label = document.createElement('canvas');
  label.width = label.height = 128;
  const ink = label.getContext('2d')!;
  ink.save();
  ink.shadowColor = '#ffe5a4aa';
  ink.shadowBlur = 15;
  ink.fillStyle = '#fcf1cd';
  ink.beginPath();
  ink.arc(64, 58, 37, 0, Math.PI * 2);
  ink.moveTo(51, 88);
  ink.lineTo(64, 110);
  ink.lineTo(77, 88);
  ink.closePath();
  ink.fill();
  ink.restore();
  ink.strokeStyle = '#674521';
  ink.lineCap = 'round';
  ink.lineWidth = 10;
  ink.beginPath();
  ink.moveTo(64, 36);
  ink.lineTo(64, 59);
  ink.stroke();
  ink.fillStyle = '#674521';
  ink.beginPath();
  ink.arc(64, 75, 5, 0, Math.PI * 2);
  ink.fill();
  const map = new CanvasTexture(label);
  map.colorSpace = SRGBColorSpace;
  const mark = new Sprite(new SpriteMaterial({ map, depthWrite: false, toneMapped: false }));
  mark.name = '咬钩感叹号';
  mark.scale.setScalar(.78);
  mark.renderOrder = 7;
  return mark;
}

export function makeFishingGear() {
  const root = new Group();
  root.name = '瀑口的鱼竿、钓线与浮漂';
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .73 });
  const tip = new Vector3(-.041, .22, 1.47);
  const guide = new Vector3();
  const rod = new Sculpture()
    .line([[0, -.014, -.17], [0, 0, .12]], .038, '#62513f', 9)
    .line([[0, -.005, .03], [0, .039, .41], [-.011, .106, .75], [-.027, .17, 1.10]], .018, '#ae8146', 8)
    .line([[-.027, .17, 1.10], [-.036, .204, 1.31], [tip.x, tip.y, tip.z]], .009, '#dbb977', 7)
    .oval([.038, -.050, .085], [.058, .047, .062], '#8c9c92').mesh('弯曲的竹钓竿', material);
  const steps = 12;
  const lineGeometry = new BufferGeometry();
  const filament = new Float32BufferAttribute(new Float32Array((steps + 1) * 3), 3);
  lineGeometry.setAttribute('position', filament);
  const line = new Line(lineGeometry, new LineBasicMaterial({ color: '#e1ecd6', transparent: true, opacity: .86, depthWrite: false }));
  line.frustumCulled = false;

  const float = new Sculpture().oval([0, -.027, 0], [.056, .077, .056], '#eee3c4')
    .oval([0, .046, 0], [.052, .038, .052], '#cf643f')
    .line([[0, .06, 0], [0, .129, 0]], .012, '#eab46a', 6).mesh('朱红浮漂', material);
  const ripple = new Mesh(new TorusGeometry(1, .031, 5, 36).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: '#e8f6e4', transparent: true, opacity: .5, depthWrite: false }));
  ripple.renderOrder = 6;
  const signal = biteSignal();
  root.add(rod, line, float, ripple, signal);
  root.visible = false;
  const forwardX = Math.sin(fishingHeading), forwardZ = Math.cos(fishingHeading);

  return {
    root,
    update(pose: FishingPose, hand: Vector3, seatY: number, time: number, elapsed: number) {
      root.visible = pose !== 'idle';
      if (!root.visible) return;
      const bite = pose === 'bite';
      const lift = pose === 'landed' ? 1 : pose === 'reeling' ? MathUtils.smoothstep(elapsed, 0, .43) : 0;
      rod.position.copy(hand);
      rod.rotation.set(-.14 - lift * 1.10 + (bite ? .075 * Math.sin(time * 10.5) : .019 * Math.sin(time * 2.1)),
        fishingHeading - .055, -.085, 'YXZ');
      rod.localToWorld(guide.copy(tip));

      const nibble = bite ? .075 * Math.max(0, Math.sin(time * 10.5)) : 0;
      float.position.set(fishingSeat.x + forwardX * 2.27, lakeLevel + .017 + Math.sin(time * 3.2) * .018 - nibble,
        fishingSeat.y + forwardZ * 2.27);
      float.position.lerp(guide, lift * .83);
      float.rotation.z = .054 * Math.sin(time * 3.3) + (bite ? .23 : 0);
      ripple.visible = lift < .04;
      ripple.position.set(float.position.x, lakeLevel + .014, float.position.z);
      const wave = (time * (bite ? 1.48 : .68)) % 1;
      ripple.scale.setScalar(.095 + (.31 + (bite ? .23 : 0)) * wave);
      ripple.material.opacity = (1 - wave) * (bite ? .80 : .49);
      for (let index = 0; index <= steps; index++) {
        const t = index / steps;
        const slack = Math.sin(t * Math.PI) * (.11 - lift * .07);
        filament.setXYZ(index, MathUtils.lerp(guide.x, float.position.x, t),
          MathUtils.lerp(guide.y, float.position.y + .084, t) - slack,
          MathUtils.lerp(guide.z, float.position.z, t) + slack * .23);
      }
      filament.needsUpdate = true;
      signal.visible = bite;
      signal.position.set(fishingSeat.x, seatY + 1.23 + .07 * Math.sin(time * 5.), fishingSeat.y);
    },
  };
}
