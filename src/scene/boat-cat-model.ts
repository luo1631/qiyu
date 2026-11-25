import { CatmullRomCurve3, Color, Float32BufferAttribute, Group, MathUtils, MeshStandardMaterial, Raycaster, SphereGeometry, Vector3 } from 'three';
import { forwardBench } from './boat-hull';
import { batchBoatParts, boatCurve, boatForm, boatPart, boatSurface } from './boat-shapes';

export function makeBoatCatModel() {
  const cat = new Group();
  cat.name = 'BoatCat';
  cat.position.set(-.224, forwardBench.y - .003, forwardBench.z + .006);
  cat.rotation.y = -.34;
  const fur = new MeshStandardMaterial({ vertexColors: true, roughness: .96 });
  const amber = new Color('#cd934e'), biscuit = new Color('#edbf80'), dark = new Color('#a36136');
  const cream = new Color('#f0dfc0'), tint = new Color();
  const paws = new MeshStandardMaterial({ color: '#f0dfc0', roughness: .96 });
  const darkFace = new MeshStandardMaterial({ color: '#68432c', roughness: .85 });
  const pink = new MeshStandardMaterial({ color: '#aa7261', roughness: .86 });

  const sections = [
    [.002,-.021,.061,.083], [.039,-.025,.109,.121], [.092,-.034,.132,.133],
    [.148,-.029,.127,.120], [.205,-.013,.099,.100], [.254,.004,.087,.087],
    [.290,.021,.113,.102], [.335,.033,.138,.112], [.386,.028,.130,.105],
    [.421,.017,.091,.080], [.444,.009,.035,.027], [.448,.008,.005,.006],
  ];
  const rows=62, sides=36, positions:number[]=[], colors:number[]=[], uv:number[]=[], faces:number[]=[];
  const curve = new CatmullRomCurve3(sections.map(([,z,width,depth])=>new Vector3(width,depth,z)), false, 'catmullrom');
  // Keep the cross-sections level so adjacent rings cannot fold into the chest.
  for (let row=0;row<=rows;row++) {
    const y=MathUtils.lerp(.002,.448,row/rows);
    const next=sections.findIndex(([level])=>level>y);
    const t=next>0 ? (next-1+MathUtils.inverseLerp(sections[next-1][0],sections[next][0],y))/(sections.length-1) : 1;
    const ring=curve.getPoint(t);
    for (let j=0;j<sides;j++) {
      const angle=j*Math.PI*2/sides, front=Math.max(0,Math.sin(angle));
      const x=ring.x*Math.cos(angle);
      const cheek=Math.exp(-(((Math.abs(x)-.036)/.048)**2)-(((y-.329)/.032)**2));
      const z=ring.z+ring.y*Math.sin(angle)+.023*front**5*cheek;
      positions.push(x,y,z); uv.push(row/rows,j/sides);
      const feet=(1-MathUtils.smoothstep(y,.162,.250))*.85;
      const muzzle=MathUtils.smoothstep(y,.267,.306)*(1-MathUtils.smoothstep(y,.345,.374));
      const bib=MathUtils.smoothstep(front+.059*Math.sin(y*47+angle*4),.55,.79)*(feet+muzzle);
      const stripes=MathUtils.smoothstep(.82,1,Math.cos(y*56+2.3*angle+Math.sin(angle*3)))
        *(1-.76*front)*MathUtils.smoothstep(y,.111,.237);
      const forehead=MathUtils.smoothstep(y,.376,.406)*MathUtils.smoothstep(front,.56,.96);
      const tabby=Math.exp(-(((Math.abs(x)-.034-.037*Math.sin(y*39))/.013)**2));
      tint.copy(amber).lerp(biscuit,.24+.38*front).lerp(dark,.66*stripes+forehead*tabby*.45).lerp(cream,Math.min(.97,bib));
      colors.push(tint.r,tint.g,tint.b);
      if (row===rows) continue;
      const a=row*sides+j,b=row*sides+(j+1)%sides;
      faces.push(a,a+sides,b,b,a+sides,b+sides);
    }
  }
  for (let j=1;j<sides-1;j++) faces.push(0,j,j+1,rows*sides,rows*sides+j+1,rows*sides+j);
  const furSurface=boatSurface(positions,faces,uv,colors);
  const coat = boatPart(cat, 'BoatCat_CH_CatContourCoat', furSurface, fur);

  const chest = new Group();
  chest.name = 'BoatCatChest';
  chest.position.set(0, .139, -.014);
  cat.add(chest);
  const head = new Group();
  head.name = 'BoatCatHead';
  head.position.set(0, .279, .020);
  cat.add(head);
  cat.updateWorldMatrix(true,true);
  // The sleepy lids and whisker roots follow the sculpted face, including its yaw.
  const direction = new Vector3(0,0,-1).transformDirection(cat.matrixWorld);
  const scan = new Raycaster(), origin = new Vector3();
  const surfaceAt = (x: number, y: number) => {
    scan.set(cat.localToWorld(origin.set(x,head.position.y+y,.38)),direction);
    const hit = scan.intersectObject(coat,false)[0];
    return hit ? cat.worldToLocal(hit.point).z-head.position.z : .099;
  };

  for (const side of [-1, 1]) {
    const paw = boatPart(cat, 'Anchored front paw', new SphereGeometry(1, 16, 11), paws);
    paw.position.set(side * .061, .039, .079);
    paw.scale.set(.054, .040, .061);

    const ear = new Group();
    ear.name = side > 0 ? 'BoatCatEarL' : 'BoatCatEarR';
    ear.position.set(side * .088, .108, -.014);
    head.add(ear);
    const shape = [[0,-.013,0,.051,.036],[side*.012,.015,-.004,.045,.030],
      [side*.022,.050,-.006,.030,.020],[side*.025,.083,-.009,.013,.010],[side*.024,.094,-.009,.002,.002]] as const;
    boatPart(ear, 'Fur on the ear', boatForm(shape, 22, 19, [1, 0, 0], (_p, t, a) =>
      tint.copy(amber).lerp(dark, .10 + .41 * t + .17 * Math.max(0, -Math.sin(a)))), fur);
    const lining = [[0,.005,.020,.031,.012],[side*.011,.029,.022,.029,.009],
      [side*.022,.058,.011,.016,.007],[side*.023,.078,.002,.002,.002]] as const;
    boatPart(ear, 'Pink inner ear', boatForm(lining, 15, 14, [1, 0, 0]), pink);

    const eye = Array.from({length:7},(_,i) => {
      const t=i/6, x=side*(.028 + .070*t), y=.105 - Math.sin(t*Math.PI)*.013 + t*.004;
      const width=.0014 + .0033*Math.sin(t*Math.PI)**.71;
      return [x,y,surfaceAt(x,y)+.0028,width,width*.71] as const;
    });
    boatPart(head, 'Sleeping eye', boatForm(eye, 15, 9, [0, 1, 0]), darkFace);
    boatCurve(head, 'Muzzle line', [[0,.049,surfaceAt(0,.049)+.002],[side*.014,.035,surfaceAt(side*.014,.035)+.0024],
      [side*.032,.040,surfaceAt(side*.032,.040)+.0027]], .0017, darkFace, 12);
    for (const offset of [-1, 1]) {
      const x0=side*.050, y0=.058+.008*offset, z0=surfaceAt(x0,y0)+.0017;
      boatCurve(head, 'Whisker', [[x0,y0,z0],[side*.087,y0+.004*(1+offset),z0+.009],
        [side*.127,y0+.014*offset,z0+.004]], .00115, paws, 11);
    }
  }
  const noseBase=surfaceAt(0,.065);
  const nose = boatPart(head, 'Rose nose', boatForm([
    [0,.046,noseBase+.005,.004,.004],[0,.061,noseBase+.009,.016,.008],
    [0,.071,noseBase+.005,.016,.006],[0,.077,noseBase-.004,.004,.002],
  ], 14, 14, [1, 0, 0]), pink);
  nose.castShadow = false;

  const tailShape = boatForm([
    [.084,.095,-.108,.030,.029], [.126,.073,-.063,.031,.029], [.132,.054,.012,.030,.028],
    [.112,.049,.099,.028,.024], [.059,.060,.153,.026,.023], [-.010,.082,.168,.024,.021],
    [-.060,.094,.152,.016,.016], [-.071,.112,.130,.005,.006],
  ], 44, 14, [0, 1, 0], (_point, t, a) => tint.copy(biscuit)
    .lerp(dark, .22 + .56 * MathUtils.smoothstep(.18, .83, Math.sin(t * 24.8)) + .11 * Math.cos(a)));
  const tailUV = tailShape.getAttribute('uv'), movement = new Float32Array(tailUV.count * 3);
  for (let i = 0; i < tailUV.count; i++) {
    const lift = MathUtils.smoothstep(tailUV.getX(i), .43, 1);
    movement[i * 3] = .018 * lift;
    movement[i * 3 + 1] = .086 * lift;
    movement[i * 3 + 2] = .020 * lift;
  }
  const tip = new Float32BufferAttribute(movement, 3);
  tip.name = 'TipLift';
  tailShape.morphAttributes.position = [tip];
  tailShape.morphTargetsRelative = true;
  boatPart(cat, 'CH_CatCurledTail', tailShape, fur);
  batchBoatParts(head);
  return cat;
}
