import { Texture } from 'pixi.js';

export function makeWaterTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1600; canvas.height = 1100;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#d4e7de'; c.fillRect(0,0,1600,1100);
  let seed = 1631;
  const rand = () => { seed = (seed*16807)%2147483647; return seed/2147483647; };
  const washes = [
    [330,200,600,'#e9edd3'],[1100,440,670,'#b3d6ce'],[550,780,500,'#bedbd1'],
    [1400,50,550,'#e5ebd6'],[70,950,450,'#e8ecd5'],[870,850,330,'#c8e4df'],
  ] as const;
  for(const [x,y,r,col] of washes) {
    const g=c.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,col);g.addColorStop(1,col+'00');
    c.fillStyle=g;c.fillRect(0,0,1600,1100);
  }
  // Soft submerged sand, hand-drawn caustics, and restrained paper grain.
  for(let n=0;n<160;n++) {
    const x=rand()*1600,y=rand()*1100,rx=30+rand()*150,ry=5+rand()*20;
    c.beginPath();c.ellipse(x,y,rx,ry,-.3,0,Math.PI*2);
    c.fillStyle=n%3===0?'rgba(255,252,224,.09)':'rgba(105,165,146,.025)';c.fill();
  }
  for(let n=0;n<65;n++) {
    const x=rand()*1600,y=rand()*1100,len=20+rand()*90;
    c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+len*.2,y+4,x+len*.7,y-6,x+len,y-3);
    c.strokeStyle='rgba(251,251,222,.28)';c.lineWidth=1+rand()*2;c.stroke();
  }
  const img=c.getImageData(0,0,1600,1100);
  for(let i=0;i<img.data.length;i+=4){const grain=(rand()-.5)*5;img.data[i]+=grain;img.data[i+1]+=grain;img.data[i+2]+=grain;}
  c.putImageData(img,0,0);
  return Texture.from(canvas);
}
