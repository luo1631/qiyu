import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, MeshStandardMaterial } from 'three';
import { Sculpture } from './PondCreatures';
import { seededRandom } from './pond-life';
import { outerBankHeight, shorePoint } from './shore-layout';
import { softenVegetation } from './vegetation-material';

type Point = [number, number, number];
const young = new Color('#a8b47b'), old = new Color('#638457'), shade = new Color('#405e45');
const beds = [
  [.13,.31,.057,8],[.59,.48,.063,9],[.91,.37,.076,10],[1.72,.38,.063,9],[2.25,.26,.058,8],
  [2.57,.33,.057,10],[3.16,.32,.069,8],[3.43,.33,.065,9],[3.75,.26,.094,14],[4.03,.40,.076,12],
  [4.32,.33,.094,13],[4.60,.24,.060,9],[4.97,.37,.082,11],[5.36,.31,.075,11],[5.64,.47,.081,13],[6.00,.29,.062,8],
] as const;

function ribbon(height: number, width: number, bend: number, twist: number, colour: number) {
  const positions: number[] = [], colors: number[] = [], faces: number[] = [];
  const paint = new Color();
  const segments = 7;
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    const span = (.0004 + width * (.42+.7*Math.sin(t*Math.PI)) * (1-t)**.79);
    const heightAt = height * (.98*t - .26 * Math.max(0,(t-.66)/.34)**2);
    for (const column of [-1,0,1]) {
      positions.push(span*column+twist*t*t,heightAt+Math.abs(column)*span*.61,bend*t*t);
      paint.copy(shade).lerp(old,.49+.44*t).lerp(young,colour*(.31+.43*t+.067*column));
      paint.multiplyScalar(column === 0 ? 1.063 : .958);
      colors.push(paint.r,paint.g,paint.b);
    }
    if (row === segments) continue;
    const k = row*3;
    faces.push(k,k+1,k+3,k+1,k+4,k+3,k+1,k+2,k+4,k+2,k+5,k+4);
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  geometry.setIndex(faces); geometry.computeVertexNormals();
  return geometry;
}

function blossomPetal(fall: boolean, light: boolean) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const cream = new Color('#eac5a3'), mid = new Color(light ? '#aea1cb' : '#726b9f');
  const lip = new Color(light ? '#d1bee0' : '#947fba'), tint = new Color();
  for (let row = 0; row <= 7; row++) {
    const t = row/7, span = .0007 + (fall ? .032 : .020)*Math.sin(t*Math.PI)**.74;
    for (const side of [-1,0,1]) {
      const y = fall ? .020*Math.sin(t*Math.PI)-.045*t*t : .060*t+.020*Math.sin(t*Math.PI);
      const forward = (fall ? .093 : .053)*t;
      positions.push(span*side,y+side*side*.016*Math.sin(t*Math.PI),forward);
      tint.copy(cream).lerp(mid,.29+.71*Math.min(1,t*2)).lerp(lip,side**2*.21+t**3*.25);
      colors.push(tint.r,tint.g,tint.b);
    }
    if (row === 7) continue;
    const k = row*3;
    indices.push(k,k+3,k+1,k+1,k+3,k+4,k+1,k+4,k+2,k+2,k+4,k+5);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function iris(plants: Sculpture, flowers: Sculpture, at: Point, height: number, bearing: number, pale: boolean) {
  const [x,y,z] = at;
  const tip: Point = [x+.063*Math.sin(bearing),y+height,z+.063*Math.cos(bearing)];
  plants.line([at,[x,y+height*.55,z],tip],.006,'#768451',7);
  flowers.oval(tip,[.017,.017,.017],'#cca96e',undefined,6,3);
  for (let i=0;i<6;i++) {
    const a = bearing + i*Math.PI/3;
    flowers.add(blossomPetal(i%2===0,pale),'#ffffff',tip,[1,1,1],[.071,a,.048*Math.cos(a)]);
  }
}

export function makeShoreReeds() {
  const bank = new Group(); bank.name = 'WatersideReeds';
  const random = seededRandom(59278);
  const plants = softenVegetation(new MeshStandardMaterial({vertexColors:true,side:DoubleSide}),false,true);
  const petals = softenVegetation(new MeshStandardMaterial({vertexColors:true,side:DoubleSide}),false,true);
  for (let i = 0; i < beds.length; i+=2) {
    const blades = new Sculpture(true), flowers = new Sculpture(true);
    let bloomCount=0;
    for (const [bearing,outward,span,count] of beds.slice(i,i+2)) {
      for (let j=0;j<count;j++) {
        const a = bearing + (j/count-.5)*span + (random()-.5)*.014;
        const distance = outward*(.63+.60*random()) + .11*Math.cos(j*1.9);
        const {x,z} = shorePoint(a,-distance), y=outerBankHeight(x,z), tint=random();
        const at: Point = [x,y-.012,z];
        for (let blade=0;blade<7;blade++) {
          const height = (.16+.32*random()) * (1+.17*Math.cos(j*.68));
          const direction = a + blade*2.39996 + .41*random();
          blades.add(ribbon(height,.012+.011*random(), .13+.16*random(), .023*Math.sin(direction*4),tint),
            '#ffffff',at,[1,1,1],[0,direction,0]);
        }
        if ((i+j)%7 === 4) {
          iris(blades,flowers,at,.36+random()*.21,a+i*.6,i%4===2);
          bloomCount++;
        } else if (j%5 === 1) {
          const height = .42+.22*random(), tip: Point = [x+.059,y+height,z-.024];
          blades.line([at,[x+.02,y+height*.76,z-.015],tip],.005,'#87905c',6);
          for (let k=0;k<3;k++) blades.oval([tip[0]+.008*k,tip[1]-.038+.013*k,tip[2]+.013*Math.sin(k*5)],
            [.012,.049,.011],k===1?'#9d8b64':'#8a7c54',[0,0,-.24],6,4);
        }
      }
    }
    const sedges = blades.mesh('ReedBeds',plants);
    sedges.castShadow = false;
    bank.add(sedges);
    if (bloomCount) {
      const irises = flowers.mesh('WaterIrises',petals);
      irises.castShadow = false;
      bank.add(irises);
    }
  }
  return bank;
}
