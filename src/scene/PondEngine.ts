import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { getLayout, islands } from '../config/islands';
import type { IslandConfig, IslandLayout, Point } from '../config/islands';
import { BoatMotion, planRoute, safe } from './navigation';
import type { Bounds, Obstacle } from './navigation';
import { makeWaterTexture } from './water';
import { navigationLayout } from './layout';
import { boatArtNames, Daydreamer } from './Daydreamer';

export type PondStatus = 'drifting' | 'sailing' | 'docked' | 'paused';
interface Hooks {
  layout: (items: IslandLayout[]) => void;
  status: (status: PondStatus, target?: string) => void;
  arrive: (island: IslandConfig) => void;
  ready: () => void;
  quality: (low: boolean) => void;
}
interface Ripple { graphic: Graphics; x: number; y: number; age: number; life: number; size: number; angle: number; wake: boolean }

export class PondEngine {
  private app = new Application();
  private stage = new Container();
  private scenery = new Container();
  private rings = new Container();
  private ambient = new Graphics();
  private details = new Graphics();
  private water!: Sprite;
  private boat!: Daydreamer;
  private boatShadow = new Graphics();
  private textures: Texture[] = [];
  private sprites = new Map<string, Sprite>();
  private lilies: Sprite[] = [];
  private ripples: Ripple[] = [];
  private pool: Graphics[] = [];
  private motion = new BoatMotion({x:0,y:0});
  private layout: IslandLayout[] = [];
  private obstacles: Obstacle[] = [];
  private bounds: Bounds = {left:0,top:0,right:0,bottom:0};
  private width = 0; private height = 0;
  private elapsed = 0; private wakeClock = 0; private ambientClock = 0;
  private wait = 2; private docking = 0;
  private target?: IslandConfig;
  private hovered?: string;
  private emitted = false;
  private paused = false;
  private reduced = false;
  private low = false;
  private disposed = false;
  private initialized = false;
  private frameSamples = 0; private slowFrames = 0;
  private observer?: ResizeObserver;
  private motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  private visibility = () => { if(this.initialized){if(document.hidden)this.app.stop();else this.app.start();} };
  private preference = () => { this.reduced=this.motionPreference.matches; this.motion.route=[]; this.motion.velocity={x:0,y:0}; if(this.target)this.navigate(this.target.id);else this.setStatus(); };

  constructor(private host: HTMLElement, private hooks: Hooks) {}

  async init() {
    this.low=navigator.hardwareConcurrency<=4 || ((navigator as Navigator & {deviceMemory?:number}).deviceMemory ?? 8)<=4;
    this.reduced=this.motionPreference.matches;
    await this.app.init({resizeTo:this.host,backgroundAlpha:0,antialias:true,autoDensity:true,
      resolution:Math.min(window.devicePixelRatio||1,this.low?1.5:2),preference:'webgl',powerPreference:'low-power'});
    if(this.disposed){this.app.destroy(true);return;}
    this.initialized=true;
    this.app.ticker.minFPS=0;
    this.host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute('aria-hidden','true');
    this.app.ticker.maxFPS=this.low||this.reduced?30:60;
    this.hooks.quality(this.low);
    const names=[...new Set(islands.map(i=>i.visual)),...boatArtNames,'lily'];
    const art=await Promise.all(names.map(name=>this.loadArt(name)));
    if(this.disposed){art.forEach(t=>t.destroy(true));return;}
    this.textures.push(...art);
    this.water=new Sprite(makeWaterTexture());this.textures.push(this.water.texture);
    this.stage.addChild(this.water,this.ambient,this.rings,this.scenery,this.details);
    this.scenery.sortableChildren=true;
    islands.forEach(island=>{
      const sprite=new Sprite(art[names.indexOf(island.visual)]);sprite.anchor.set(.5,210/320);this.scenery.addChild(sprite);this.sprites.set(island.id,sprite);
    });
    for(let i=0;i<6;i++){const s=new Sprite(art[names.indexOf('lily')]);s.anchor.set(.5);this.scenery.addChild(s);this.lilies.push(s);}
    this.boat=new Daydreamer(new Map(names.map((name,i)=>[name,art[i]])));this.scenery.addChild(this.boatShadow,this.boat);
    this.app.stage.addChild(this.stage);
    this.resize();
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.host);
    this.motionPreference.addEventListener('change',this.preference);
    document.addEventListener('visibilitychange',this.visibility);
    this.app.canvas.addEventListener('pointerdown',this.waterClick);
    this.app.ticker.add(t=>this.tick(Math.min(t.deltaMS/1000,.25)));
    this.hooks.ready();this.setStatus();
  }

  private async loadArt(name:string) {
    const img=new Image();img.src=`${import.meta.env.BASE_URL}art/${name}.svg`;
    await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth*2;canvas.height=img.naturalHeight*2;
    canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);
    return Texture.from({resource:canvas,resolution:2});
  }

  private resize() {
    const oldW=this.width, oldH=this.height;
    this.width=this.host.clientWidth;this.height=this.host.clientHeight;
    if(!this.width||!this.height)return;
    this.app.renderer.resize(this.width,this.height);
    this.water.width=this.width+40;this.water.height=this.height+40;this.water.position.set(-20,-20);
    this.layout=getLayout(this.width,this.height);
    const scale=this.layout[0].scale;
    const navigation=navigationLayout(this.width,this.height,this.layout);
    this.boat.scale.set(navigation.boatScale);
    this.bounds=navigation.bounds;this.obstacles=navigation.obstacles;
    for(const l of this.layout){const s=this.sprites.get(l.config.id)!;s.position.set(l.x,l.y);s.scale.set(l.scale);s.zIndex=l.y;}
    const lilyPoints=[[.08,.42],[.91,.55],[.48,.15],[.48,.88],[.04,.84],[.96,.21]];
    this.lilies.forEach((s,i)=>{s.position.set(this.width*lilyPoints[i][0],this.height*lilyPoints[i][1]);s.scale.set(scale*(i%2?.46:.64));s.rotation=(i%3-1)*.2;s.zIndex=s.y-30;});
    const initial={x:this.width*.49,y:this.height*.49};
    const transformed=oldW?{x:this.motion.position.x/oldW*this.width,y:this.motion.position.y/oldH*this.height}:initial;
    this.motion.position=safe(transformed,this.obstacles,this.bounds)?transformed:this.nearestSafe(initial);
    this.motion.route=[];this.motion.velocity={x:0,y:0};
    this.boat.position.copyFrom(this.motion.position);
    for(const ring of this.ripples){ring.graphic.visible=false;this.pool.push(ring.graphic);}this.ripples=[];
    this.hooks.layout(this.layout);
    if(this.target&&!this.emitted)this.navigate(this.target.id);
  }

  private nearestSafe(p:Point) {
    for(let r=0;r<Math.max(this.width,this.height);r+=12)for(let i=0;i<24;i++) {
      const a=i/24*Math.PI*2,q={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};
      if(safe(q,this.obstacles,this.bounds))return q;
    }
    return p;
  }

  navigate(id:string) {
    const item=this.layout.find(l=>l.config.id===id);if(!item)return false;
    const route=planRoute(this.motion.position,item.dock,this.obstacles,this.bounds);
    if(route.length<2)return false;
    this.target=item.config;this.docking=0;this.emitted=false;this.wait=0;this.motion.setRoute(route);
    this.ripple(item.x,item.y+50*item.scale,34*item.scale,false,0,1.7);
    this.hooks.status('sailing',item.config.name);return true;
  }

  resume() {this.target=undefined;this.docking=0;this.emitted=false;this.wait=1.2;this.motion.route=[];this.motion.velocity={x:0,y:0};this.setStatus();}
  setPaused(value:boolean){this.paused=value;this.setStatus();}
  hover(id?:string){this.hovered=id;}
  private setStatus(){this.hooks.status(this.target?(this.emitted?'docked':'sailing'):this.paused||this.reduced?'paused':'drifting',this.target?.name);}

  private waterClick=(e:PointerEvent)=>{
    if(this.reduced)return;
    const rect=this.app.canvas.getBoundingClientRect();this.ripple(e.clientX-rect.left,e.clientY-rect.top,8,false,0,2.5);
  };
  private ripple(x:number,y:number,size:number,wake:boolean,angle:number,life=2.8){
    if(this.reduced||this.ripples.length>(this.low?24:52))return;
    const graphic=this.pool.pop()??new Graphics();if(!graphic.parent)this.rings.addChild(graphic);graphic.visible=true;
    this.ripples.push({graphic,x,y,age:0,life,size,angle,wake});
  }

  private tick(dt:number){
    if(this.disposed||!this.boat)return;
    if(!this.low&&!this.reduced&&!document.hidden){this.frameSamples++;if(dt>.031)this.slowFrames++;if(this.frameSamples===60&&this.slowFrames>40){this.low=true;this.app.ticker.maxFPS=30;this.hooks.quality(true);}}
    const animated=!this.paused&&!this.reduced;
    if(animated)this.elapsed+=dt;
    const time=this.elapsed;
    if(import.meta.env.DEV)this.app.canvas.dataset.motion=JSON.stringify({time,dt,position:this.motion.position,route:this.motion.route.length,target:this.target?.id});
    if(!this.emitted&&(this.target||animated)){
      if(!this.target&&this.motion.route.length===0){
        this.wait-=dt;
        if(this.wait<=0){
          for(let n=0;n<28;n++){
            const a=Math.random()*Math.PI*2,r=40+Math.random()*100;
            const p={x:this.motion.position.x+Math.cos(a)*r,y:this.motion.position.y+Math.sin(a)*r};
            if(safe(p,this.obstacles,this.bounds,6)){const route=planRoute(this.motion.position,p,this.obstacles,this.bounds);if(route.length>1){this.motion.setRoute(route);break;}}
          }
          this.wait=1.5+Math.random()*3;
        }
      }
      let done=false;
      const steps=Math.ceil(dt/(1/60));
      for(let n=0;n<steps;n++)done=this.motion.update(dt/steps,this.target?(this.reduced?240:Math.max(62,this.width*.07)):14,this.obstacles,this.bounds);
      if(done&&this.target){this.docking+=dt;if(this.docking>=.4){this.emitted=true;this.hooks.status('docked',this.target.name);this.hooks.arrive(this.target);}}
    }
    const speed=Math.hypot(this.motion.velocity.x,this.motion.velocity.y);
    this.boat.position.set(this.motion.position.x,this.motion.position.y+(animated?Math.sin(time*1.5)*1.5:0));
    this.boat.rotation=this.motion.angle+(animated?Math.sin(time*.85)*.023:0);
    this.boat.update(time,this.reduced);
    this.boat.zIndex=this.motion.position.y;this.boatShadow.zIndex=this.motion.position.y-1;
    this.boatShadow.position.set(this.boat.x+4,this.boat.y+7);
    this.boatShadow.rotation=this.boat.rotation;
    this.boatShadow.clear().ellipse(0,0,21*this.boat.scale.x,72*this.boat.scale.x).fill({color:0x446e62,alpha:.07});
    if(animated){
      this.water.x=-20+Math.sin(time*.07)*6;this.water.y=-20+Math.cos(time*.09)*5;
      this.wakeClock+=dt;
      if(this.wakeClock>(speed>25?.20:this.low?.9:.6)){
        this.wakeClock=0;
        const a=this.motion.angle,stern=66*this.boat.scale.x;
        const x=this.motion.position.x-Math.sin(a)*stern,y=this.motion.position.y+Math.cos(a)*stern;
        this.ripple(x,y,speed>20?10:6,speed>8,a,speed>20?3.3:3.9);
        if(speed>30&&!this.low)this.ripple(x+Math.cos(a)*8,y+Math.sin(a)*8,2,false,a,1.4);
      }
      this.ambientClock+=dt;
      if(this.ambientClock>3){this.ambientClock=0;const p={x:this.width*(.15+Math.random()*.7),y:this.height*(.25+Math.random()*.5)};if(safe(p,this.obstacles,this.bounds))this.ripple(p.x,p.y,5,false,0,5);}
    }
    this.drawWater(time,animated);
    for(let i=this.ripples.length-1;i>=0;i--){
      const r=this.ripples[i];if(animated)r.age+=dt;
      if(r.age>=r.life){r.graphic.visible=false;this.pool.push(r.graphic);this.ripples.splice(i,1);continue;}
      const t=r.age/r.life,sz=r.size+t*(r.wake?38:32);
      r.graphic.clear();r.graphic.position.set(r.x,r.y);r.graphic.rotation=r.angle;
      if(r.wake){
        r.graphic.moveTo(-sz*.8,-sz*.18).quadraticCurveTo(-sz*.65,sz*.4,0,sz*.5).quadraticCurveTo(sz*.65,sz*.4,sz*.8,-sz*.18).stroke({color:0xf4f6da,width:1.2,alpha:(1-t)**1.5*.55});
        r.graphic.moveTo(-sz*.65,-sz*.19+3).quadraticCurveTo(0,sz*.65,sz*.65,-sz*.19+3).stroke({color:0x78aa99,width:.8,alpha:(1-t)**2*.14});
      }else{
        r.graphic.ellipse(0,0,sz,sz*.4).stroke({color:0xf9f7df,width:1.1,alpha:Math.sin(Math.min(1,t*4)*Math.PI/2)*(1-t)*.5});
        if(!this.low)r.graphic.ellipse(0,1,sz*.77,sz*.29).stroke({color:0x7cae9c,width:.7,alpha:(1-t)*.1});
      }
    }
    for(const l of this.layout){const s=this.sprites.get(l.config.id)!;const active=l.config.id===this.hovered||l.config.id===this.target?.id;const targetScale=l.scale*(active?1.025:1);s.scale.x+=(targetScale-s.scale.x)*Math.min(1,dt*6);s.scale.y=s.scale.x;s.y=l.y+(active?-3:0);}
  }

  private drawWater(time:number,animated:boolean){
    this.ambient.clear();
    const count=this.low?9:19;
    for(let i=0;i<count;i++){
      const x=((i*193.7+73)%this.width),y=((i*137.9+155)%this.height),w=15+(i%5)*9;
      const offset=animated?Math.sin(time*.33+i)*4:0;
      this.ambient.moveTo(x-w,y+offset).bezierCurveTo(x-w*.3,y+3+offset,x+w*.3,y-4+offset,x+w,y-2+offset).stroke({color:0xf8f7df,width:1.2,alpha:.13+Math.sin(time*.4+i)*.055});
      if(i%3===0)this.ambient.moveTo(x-4,y+8+offset).lineTo(x+13,y+7+offset).stroke({color:0xf8f7df,width:1,alpha:.15});
    }
    this.details.clear();
    // Tiny leaves adrift: quiet, sparse accents rather than particle confetti.
    for(let i=0;i<7;i++){
      const x=((i*237+91)%this.width)+Math.sin(time*.05+i)*6,y=((i*183+221)%this.height);
      this.details.moveTo(x-3,y).quadraticCurveTo(x+1,y-4,x+7,y-1).quadraticCurveTo(x+3,y+3,x-3,y).fill({color:0xa7bc8e,alpha:.55});
    }
  }

  destroy(){
    this.disposed=true;this.observer?.disconnect();this.motionPreference.removeEventListener('change',this.preference);document.removeEventListener('visibilitychange',this.visibility);
    if(this.initialized){this.app.canvas.removeEventListener('pointerdown',this.waterClick);this.app.destroy(true,{children:true,texture:false,textureSource:false});}
    this.textures.forEach(t=>t.destroy(true));this.textures=[];
  }
}
