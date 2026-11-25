import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, MathUtils, Points, ShaderMaterial } from 'three';
import { seededRandom } from './pond-life';

export function makePondFireflies() {
  const positions: number[] = [], phases: number[] = [];
  const random = seededRandom(53267);
  for (const [x,z,count] of [[-6.2,-3.2,11],[5.7,3.9,9],[-6.2,5.05,7],[4.7,-7.3,6],[.5,-10.1,7]]) {
    for (let i = 0; i < count; i++) {
      positions.push(x+(random()-.5)*2.6,.26+random()*.72,z+(random()-.5)*1.51);
      phases.push(random()*Math.PI*2,random()*.55+.44,random());
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('fireflyPhase',new Float32BufferAttribute(phases,3));
  const uniforms = { time: {value:0}, darkness: {value:0}, pixelRatio: {value:1}, attention: {value:0} };
  const material = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
    vertexShader: `
      attribute vec3 fireflyPhase;
      uniform float time, darkness, pixelRatio, attention;
      varying float glow, warmth;
      void main() {
        float phase = fireflyPhase.x, speed = fireflyPhase.y;
        float loop = time*speed + phase;
        vec3 drift = vec3(cos(loop)*.31+sin(loop*.63)*.16, sin(loop*1.61)*.16, sin(loop*.82)*.32);
        vec4 view = modelViewMatrix*vec4(position+drift,1.0);
        gl_Position = projectionMatrix*view;
        gl_PointSize = clamp(158.0/max(1.0,-view.z),5.0,12.0)*pixelRatio;
        float beat = max(0.0,sin(time*(.8+speed*.5)+phase*1.87));
        float answer = smoothstep(3.9,5.1,position.x)*smoothstep(1.5,3.2,position.z)*attention;
        glow = darkness*(.043 + beat*beat*.64 + answer*.24);
        warmth = fireflyPhase.z;
      }`,
    fragmentShader: `
      varying float glow, warmth;
      void main() {
        float radius = length(gl_PointCoord*2.0-1.0);
        if (radius >= 1.0) discard;
        float core = exp(-radius*radius*27.0);
        float haze = exp(-radius*radius*4.7)*.19;
        vec3 tint = mix(vec3(.73,.90,.29),vec3(1.0,.65,.22),warmth);
        gl_FragColor = vec4(tint, (core+haze)*glow);
        #include <colorspace_fragment>
      }`,
  });
  const points = new Points(geometry,material);
  points.name = 'BankFireflies';
  points.renderOrder = 5;
  points.visible = false;
  points.frustumCulled = false;
  return { points, update(time: number, night: number, ratio: number, attention: number) {
    uniforms.time.value = time;
    uniforms.darkness.value = MathUtils.smoothstep(night,.55,.93);
    uniforms.pixelRatio.value = ratio;
    uniforms.attention.value = attention;
    points.visible = uniforms.darkness.value > .008;
  }, dispose() { geometry.dispose(); material.dispose(); } };
}
