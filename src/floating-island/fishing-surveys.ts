import type { FishForm, FishRatings, FishStudy } from './fishing-catalog';

export const surveySources = {
  koreaCoast: {
    zh: '韩国东南沿海调查，表 1', en: 'Southeastern Korean coast survey, table 1',
    url: 'https://research-management.mq.edu.au/ws/portalfiles/portal/62371867/Publisher%20version%20%28open%20access%29.pdf', length: 'TL',
  },
  rodrigues: {
    zh: '罗德里格斯岛礁鱼调查，表 1', en: 'Rodrigues reef fish survey, table 1',
    url: 'https://www.ncl.ac.uk/tcmweb/tmr/Length-weight%20relationships%20for%20Rodrigues%20fishes.pdf', length: 'TL',
  },
  guandu: {
    zh: '巴西瓜恩杜河调查，表 1', en: 'Guandu River survey, table 1',
    url: 'https://r1.ufrrj.br/lep/articles/Length-weight%20relationships%20of%2020%20species%20in%20the%20Guandu%20River.pdf', length: 'TL',
  },
  mali: {
    zh: '马里两座水库调查，表 1', en: 'Malian reservoir survey, table 1',
    url: 'https://sfi-cybium.fr/en/length-weight-relationships-19-fish-species-two-tropical-artificial-reservoirs-manantali-and', length: 'TL',
  },
  putumayo: {
    zh: '普图马约河上游调查，表 1', en: 'Upper Putumayo River survey, table 1',
    url: 'https://onlinelibrary.wiley.com/doi/10.1155/jai/3116845', length: 'SL',
  },
} as const;

type SurveyRow = readonly [
  id: string, zh: string, en: string, scientific: string, ratings: FishRatings, form: FishForm,
  referenceCm: number, a: number, b: number,
  specimens: readonly [count: number, minCm: number, maxCm: number, rSquared: number, weightsGrams?: FishStudy['weightRangeGrams']],
  season?: 'spring' | 'autumn' | 'springAutumn', lengthBasis?: 'DW',
];

interface Survey {
  source: keyof typeof surveySources | 'atlantic';
  region: FishStudy['region'];
  rows: readonly SurveyRow[];
}

// Coefficients retain their source units. The Atlantic table gives ln(a) for weight in kg.
const surveys: readonly Survey[] = [
  {
    source: 'koreaCoast', region: { zh: '韩国东南沿海', en: 'Southeastern Korean coast' },
    rows: [
      ['whitespotted-conger', '星康吉鳗', 'Whitespotted conger', 'Conger myriaster', [4, 2, 4], 'eel',
        38, .0006, 3.273, [101, 14.9, 49.5, .976, [4.4, 212.1]]],
      ['estuarine-tapertail', '刀鲚', 'Estuarine tapertail anchovy', 'Coilia nasus', [5, 4, 5], 'silver',
        24, .0009, 3.346, [54, 11.7, 28.5, .970, [2.7, 67.9]]],
      ['spearnose-grenadier', '多棘腔吻鳕', 'Spearnose grenadier', 'Coelorinchus multispinulosus', [2, 3, 2], 'eel',
        22, .0047, 2.857, [393, 7.4, 30.4, .956, [1.4, 107.3]]],
      ['gunthers-gurnard', '贡氏红娘鱼', 'Günther’s gurnard', 'Lepidotrigla guentheri', [2, 2, 2], 'perch',
        14, .0067, 3.210, [117, 5.7, 18.1, .983, [1.9, 75.9]]],
      ['tanakas-snailfish', '田中狮子鱼', 'Tanaka’s snailfish', 'Liparis tanakae', [2, 3, 2], 'eel',
        35, .0098, 3.065, [406, 6.0, 56.3, .993, [2.2, 1742.8]]],
      ['rosy-seabass', '赤鯥', 'Rosy seabass', 'Doederleinia berycoides', [3, 3, 5], 'perch',
        22, .0208, 2.871, [832, 9.1, 29.1, .986, [11.0, 346.1]]],
      ['lined-cardinalfish', '细条天竺鲷', 'Lined cardinalfish', 'Jaydia lineata', [2, 2, 2], 'perch',
        8, .0072, 3.414, [3981, 3.5, 10.2, .974, [0.5, 17.5]]],
      ['red-sea-bream', '真鲷', 'Red sea bream', 'Pagrus major', [5, 2, 5], 'carp',
        30, .0135, 3.073, [30, 15.2, 42.2, .985, [49.5, 1279.9]]],
      ['gills-eelpout', '吉氏绵鳚', 'Gill’s eelpout', 'Zoarces gillii', [1, 2, 1], 'eel',
        31, .0040, 3.038, [49, 11.3, 45.1, .990, [5.4, 395.0]]],
      ['lunar-dragonet', '弯月䲗', 'Lunar dragonet', 'Callionymus lunatus', [1, 2, 2], 'perch',
        14, .0071, 2.912, [282, 6.2, 18.7, .990, [1.3, 36.4]]],
      ['red-barracuda', '油魣', 'Red barracuda', 'Sphyraena pinguis', [3, 2, 3], 'pike',
        27, .0048, 3.044, [31, 13.1, 35.9, .988, [11.4, 244.0]]],
      ['robust-tonguesole', '宽体舌鳎', 'Robust tonguesole', 'Cynoglossus robustus', [3, 2, 4], 'flat',
        16, .0043, 3.175, [135, 8.0, 19.7, .961, [3.3, 50.9]]],
    ],
  },
  {
    source: 'rodrigues', region: { zh: '印度洋罗德里格斯岛', en: 'Rodrigues, Indian Ocean' },
    rows: [
      ['shoemaker-spinefoot', '白点蓝子鱼', 'Shoemaker spinefoot', 'Siganus sutor', [2, 2, 3], 'perch',
        26, .0127, 3.0308, [519, 14.1, 48.0, .9762]],
      ['longtail-mojarra', '长吻钻嘴鱼', 'Longtail silverbiddy', 'Gerres longirostris', [2, 2, 2], 'silver',
        29, .0075, 3.1338, [226, 20.5, 41.0, .9401]],
      ['spangled-emperor', '星斑裸颊鲷', 'Spangled emperor', 'Lethrinus nebulosus', [3, 2, 4], 'perch',
        35, .0193, 2.8897, [189, 14.5, 59.0, .9779]],
      ['yellowstripe-goatfish', '黄线拟须鲷', 'Yellowstripe goatfish', 'Mulloidichthys flavolineatus', [2, 2, 3], 'silver',
        29, .0056, 3.1758, [70, 24.5, 36.7, .9492]],
      ['honeycomb-grouper', '网纹石斑鱼', 'Honeycomb grouper', 'Epinephelus merra', [4, 2, 4], 'perch',
        18, .0334, 2.7333, [50, 11.5, 24.0, .9636]],
      ['convict-surgeonfish', '横带刺尾鱼', 'Convict surgeonfish', 'Acanthurus triostegus', [4, 2, 4], 'carp',
        17, .0223, 3.1054, [33, 12.5, 23.0, .9386]],
      ['picasso-triggerfish', '叉斑锉鳞鲀', 'Picasso triggerfish', 'Rhinecanthus aculeatus', [4, 2, 5], 'puffer',
        21, .1559, 2.4059, [17, 14.0, 27.0, .9559]],
    ],
  },
  {
    source: 'atlantic', region: { zh: '西北大西洋陆架', en: 'Northwest Atlantic shelf' },
    rows: [
      ['spiny-dogfish', '白斑角鲨', 'Spiny dogfish', 'Squalus acanthias', [4, 3, 3], 'shark',
        75, -13.2302, 3.1863, [12070, 13, 114, .9714], 'spring'],
      ['little-skate', '小鳐', 'Little skate', 'Leucoraja erinacea', [3, 2, 3], 'ray',
        41, -12.4462, 3.1280, [5897, 8, 59, .9747], 'spring'],
      ['spiny-butterfly-ray', '刺蝶鳐', 'Spiny butterfly ray', 'Gymnura altavela', [3, 5, 4], 'ray',
        110, -12.4197, 3.1787, [67, 38, 210, .9949], 'autumn', 'DW'],
      ['white-hake', '白长鳍鳕', 'White hake', 'Urophycis tenuis', [3, 2, 3], 'pike',
        52, -12.4000, 3.1715, [3889, 4, 126, .9897], 'autumn'],
      ['fawn-cusk-eel', '深海鳞鼬鳚', 'Fawn cusk-eel', 'Lepophidium profundorum', [1, 3, 1], 'eel',
        23, -13.7333, 3.2359, [78, 13, 28, .9542], 'springAutumn'],
      ['atlantic-butterfish', '三刺鲳', 'Atlantic butterfish', 'Peprilus triacanthus', [3, 2, 3], 'carp',
        15, -10.6315, 2.9225, [6809, 1, 21, .9553], 'autumn'],
    ],
  },
  {
    source: 'mali', region: { zh: '马里马南塔利水库', en: 'Manantali Reservoir, Mali' },
    rows: [
      ['elongate-tigerfish', '福氏狗脂鲤', 'Elongate tigerfish', 'Hydrocynus forskahlii', [3, 2, 4], 'pike',
        29, .006, 3.011, [646, 9.4, 45.2, .993, [5, 598]]],
      ['golden-claroteid', '金色长颌鲿', 'Golden Nile catfish', 'Chrysichthys auratus', [1, 2, 2], 'catfish',
        15, .009, 2.960, [143, 8.1, 19.5, .982, [5, 62]]],
      ['nile-perch', '尼罗尖吻鲈', 'Nile perch', 'Lates niloticus', [4, 2, 4], 'perch',
        30, .009, 3.018, [27, 7.5, 39.0, .998, [4, 697]]],
      ['schall-catfish', '沙尔歧须鮠', 'Schall’s catfish', 'Synodontis schall', [2, 2, 3], 'catfish',
        28, .006, 3.101, [27, 12.5, 40.0, .995, [17, 584]]],
    ],
  },
  {
    source: 'mali', region: { zh: '马里塞林格水库', en: 'Selingue Reservoir, Mali' },
    rows: [
      ['shortfin-distichodus', '短翼复齿脂鲤', 'Shortfin distichodus', 'Distichodus brevipinnis', [1, 2, 2], 'silver',
        24, .011, 2.929, [40, 7.7, 37.6, .989, [4, 459]]],
      ['african-butter-catfish', '红线锡伯鲶', 'African butter catfish', 'Schilbe mystus', [1, 2, 2], 'catfish',
        19, .003, 3.195, [248, 6.0, 29.6, .969, [1, 163]]],
    ],
  },
  {
    source: 'guandu', region: { zh: '巴西瓜恩杜河', en: 'Guandu River, Brazil' },
    rows: [
      ['gilberts-curimata', '吉伯特驼背脂鲤', 'Gilbert’s curimata', 'Cyphocharax gilbert', [1, 2, 1], 'silver',
        18, .0054, 3.33, [31, 14.6, 23.0, .97, [41.7, 177.8]]],
      ['copelands-leporinus', '科氏兔脂鲤', 'Copeland’s leporinus', 'Leporinus copelandii', [2, 2, 2], 'silver',
        32, .0051, 3.23, [35, 18.5, 54.0, .97, [59.4, 2447.8]]],
      ['trahira', '马拉巴厘齿脂鲤', 'Trahira', 'Hoplias malabaricus', [3, 2, 4], 'pike',
        32, .0113, 3.02, [51, 21.8, 46.1, .91, [121.8, 1216]]],
      ['brown-hoplo', '滨岸护胸鲶', 'Brown hoplo', 'Hoplosternum littorale', [2, 2, 3], 'catfish',
        18, .0201, 2.95, [148, 10.2, 24.1, .93, [17.5, 305.3]]],
      ['chestnut-armored-catfish', '栗色真甲鲶', 'Chestnut armored catfish', 'Loricariichthys castaneus', [2, 2, 3], 'catfish',
        26, .0018, 3.21, [155, 12.0, 35.5, .97, [4.6, 243.3]]],
      ['singing-catfish', '条纹喉鳍鲶', 'Singing catfish', 'Trachelyopterus striatulus', [2, 2, 2], 'catfish',
        19, .0093, 3.16, [56, 15.7, 22.4, .94, [52.4, 172.9]]],
    ],
  },
  {
    source: 'putumayo', region: { zh: '哥伦比亚普图马约河上游', en: 'Upper Putumayo River, Colombia' },
    rows: [
      ['silver-arowana', '银龙鱼', 'Silver arowana', 'Osteoglossum bicirrhosum', [5, 3, 5], 'pike',
        58, .0059, 3.0613, [223, 22.0, 96.0, .984, [98.0, 5150.0]]],
      ['red-bellied-piranha', '红腹食人鲳', 'Red-bellied piranha', 'Pygocentrus nattereri', [5, 2, 5], 'carp',
        19, .0368, 3.0229, [110, 12.3, 25.3, .961, [66.0, 697.5]]],
      ['zebra-catfish', '茹鲁阿短平口鲶', 'Zebra catfish', 'Brachyplatystoma juruense', [3, 3, 4], 'catfish',
        55, .0065, 3.2143, [2346, 41.8, 67.9, .938, [992.0, 5345.0]]],
    ],
  },
];

export const surveyFish = surveys.flatMap(({ source, region, rows }) => rows.map(([
  id, zh, en, scientific, ratings, form, lengthCm, a, b,
  [count, minCm, maxCm, rSquared, weightRangeGrams], sample, lengthBasis,
]) => {
  const study: FishStudy = { region, count, lengthRangeCm: [minCm, maxCm], weightRangeGrams, rSquared };
  return { id, zh, en, scientific, ratings, form, source, lengthCm, a, b, sample, lengthBasis, study };
}));
