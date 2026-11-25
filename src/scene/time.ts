import { getMoonIllumination, getMoonPosition, getPosition, getTimes } from 'suncalc';
import { civilTime, utcOffsetMinutes, visitorTimeZone } from '../config/clock';

const radians=Math.PI/180;
export const siteLatitude=29;
export interface Observer { latitude:number; longitude:number; timeZone:string }
/** Infer a standard-time central meridian, not GPS. DST does not move the observer. */
export function observerAt(date=new Date(),timeZone=visitorTimeZone()):Observer {
  const year=civilTime(date,timeZone).year;
  const standardOffset=Math.min(utcOffsetMinutes(new Date(Date.UTC(year,0,15,12)),timeZone),utcOffsetMinutes(new Date(Date.UTC(year,6,15,12)),timeZone));
  const longitude=((standardOffset/4+180)%360+360)%360-180;
  return {latitude:siteLatitude,longitude,timeZone};
}

/** At the pond's fixed 29°N, sunrise and sunset occur every day. Anchor the
 * second calculation at the following solar noon so a DST change won't skip a day. */
export function pondSunTimes(date: Date, zone: string) {
  const { latitude, longitude } = observerAt(date, zone);
  const today = getTimes(date, latitude, longitude, 0, utcOffsetMinutes(date, zone));
  const tomorrow = getTimes(new Date(+today.solarNoon + 86400000), latitude, longitude);
  return { sunrise: today.sunrise!.getTime(), sunset: today.sunset!.getTime(), nextSunrise: tomorrow.sunrise!.getTime() };
}

export function pondPhaseAt(time: number, times: ReturnType<typeof pondSunTimes>) {
  if (time < times.sunrise) return { night: true, until: times.sunrise };
  if (time < times.sunset) return { night: false, until: times.sunset };
  return { night: true, until: times.nextSunrise };
}
// Match the camera bearing. Screen up=N, left=E, right=W, down=S.
export const northDirection:[number,number,number]=[0,0,-1];
const eastDirection=[-1,0,0];
export function horizontalToWorld(altitude:number,azimuth:number,radius:number):[number,number,number] {
  const h=altitude*radians,a=azimuth*radians,n=Math.cos(h)*Math.cos(a),e=Math.cos(h)*Math.sin(a);
  return [(northDirection[0]*n+eastDirection[0]*e)*radius,Math.sin(h)*radius,(northDirection[2]*n+eastDirection[2]*e)*radius];
}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
/** SunCalc 2 uses UTC instants, degrees, and azimuth clockwise from north. */
export function lightingAt(date:Date,observer=observerAt(date)) {
  const solar=getPosition(date,observer.latitude,observer.longitude);
  const lunar=getMoonPosition(date,observer.latitude,observer.longitude),phase=getMoonIllumination(date);
  const sun=horizontalToWorld(solar.altitude,solar.azimuth,145),moon=horizontalToWorld(lunar.altitude,lunar.azimuth,125);
  // Compress only the colour transition. Orbital motion still follows the real instant.
  const daylight=smooth(-2,5,solar.altitude),night=1-daylight,twilight=1-smooth(.5,6,Math.abs(solar.altitude));
  const p=civilTime(date,observer.timeZone),hour=p.hour+p.minute/60+p.second/3600+date.getMilliseconds()/3600000;
  // Meeus 12.4, also used by SunCalc; decorative stars share the real date.
  const days=(date.getTime()-Date.UTC(2000,0,1,12))/86400000;
  const siderealAngle=((280.46061837+360.98564736629*days+observer.longitude)%360)*radians;
  return {hour,daylight,twilight,night,sun,moon,sunAltitude:solar.altitude,moonAltitude:lunar.altitude,
    moonFraction:phase.fraction,moonPhase:phase.phase,moonWaxing:phase.waxing,siderealAngle,latitude:observer.latitude,
    sunPower:daylight*(2.6-twilight*.6)*smooth(0,4,solar.altitude),
    fillPower:1.02+daylight*.43+night*.45,moonPower:night*1.23*smooth(0,7,lunar.altitude)*(.08+.92*phase.fraction),
    windowPower:smooth(.18,.78,night)*3.5,exposure:1+night*.32,stars:smooth(.65,1,night)};
}

/** Keep the half-day preview when it changes phase; winter dawn/dusk can both be dark. */
export function nextPhaseTime(date:Date,observer=observerAt(date)):Date {
  const halfDay=12*3600000,toDay=lightingAt(date,observer).night>.5;
  const candidate=new Date(date.getTime()+halfDay),light=lightingAt(candidate,observer);
  if((toDay?light.daylight:light.night)>=.99)return candidate;
  // At the pond's fixed 29°N, solar noon/midnight always give an unambiguous phase.
  const event=toDay?'solarNoon':'nadir';
  let target=getTimes(candidate,observer.latitude,observer.longitude)[event];
  if(target.getTime()<=date.getTime()){
    target=getTimes(new Date(candidate.getTime()+2*halfDay),observer.latitude,observer.longitude)[event];
  }
  return target;
}
