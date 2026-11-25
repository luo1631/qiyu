export interface Point { x: number; y: number }
export type Language = 'zh' | 'en';
export type IslandAction = { type: 'panel'; content: 'about' | 'projects' } | { type: 'external' | 'email'; url: string };
export interface IslandConfig {
  id: string;
  name: string;
  label: { zh: string; en: string };
  caption: string;
  position: { desktop: Point; mobile: Point };
  dock: Point;
  visual: 'github' | 'projects' | 'about' | 'email';
  action: IslandAction;
}

// Set your actual destinations here. Empty values show a friendly setup message.
export const links = { github: 'https://github.com/luo1631', email: '' };

export const islands: IslandConfig[] = [
  { id: 'github', name: 'GitHub', label: { zh: 'GitHub', en: 'GitHub' }, caption: 'Things I build', visual: 'github',
    position: { desktop: { x: .25, y: .30 }, mobile: { x: .25, y: .23 } },
    dock: { x: 90, y: 125 }, action: { type: 'external', url: links.github } },
  { id: 'about', name: 'Rongyu Island', label: { zh: '容与岛', en: 'Rongyu Island' }, caption: 'A little about me', visual: 'about',
    position: { desktop: { x: .22, y: .72 }, mobile: { x: .25, y: .63 } },
    dock: { x: 130, y: 115 }, action: { type: 'panel', content: 'about' } },
  { id: 'email', name: 'Email', label: { zh: '邮箱', en: 'Email' }, caption: 'Send a little hello', visual: 'email',
    position: { desktop: { x: .77, y: .76 }, mobile: { x: .76, y: .81 } },
    dock: { x: -145, y: 125 }, action: { type: 'email', url: links.email } },
];

export const islandNames: Record<Language, Record<string, string>> = {
  zh: Object.fromEntries(islands.map(island => [island.id, island.label.zh])),
  en: Object.fromEntries(islands.map(island => [island.id, island.label.en])),
};
export type DestinationId = keyof typeof islandNames.zh;

export interface IslandLayout { config: IslandConfig; x: number; y: number; scale: number; dock: Point }
export function getLayout(width: number, height: number): IslandLayout[] {
  const mobile = width < 700 || height > width * 1.18;
  const scale = mobile ? Math.min(.68, width / (width<360?730:660), height / 1100) : Math.min(1.08, width / 1450, height / (height<650?1250:850));
  const top = mobile ? 100 : 80;
  const bottom = mobile ? 135 : 140;
  const area = Math.max(250, height - top - bottom);
  return islands.map(config => {
    const p = config.position[mobile ? 'mobile' : 'desktop'];
    const x = p.x * width, y = top + p.y * area;
    return { config, x, y, scale, dock: { x: x + config.dock.x * scale, y: y + config.dock.y * scale } };
  });
}
