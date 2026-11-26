import { familyOf } from './fishing-taxonomy';
import type { FishFamily } from './fishing-taxonomy';
import { surveyFish, surveySources } from './fishing-surveys';

export const ranks = ['S', 'A', 'B', 'C', 'D', 'E'] as const;
export type Rank = typeof ranks[number];
export type FishForm = 'silver' | 'carp' | 'perch' | 'trout' | 'eel' | 'catfish' | 'pike' | 'sturgeon' | 'flat' | 'shark' |
  'angler' | 'fangtooth' | 'dragon' | 'lantern' | 'hatchet' | 'ray' | 'billfish' | 'puffer';

export const fishSources = {
  ...surveySources,
  jialing: {
    zh: '嘉陵江中游调查，表 2', en: 'Middle Jialing River survey, table 2',
    url: 'https://www.mdpi.com/1424-2818/15/4/561#table_body_display_diversity-15-00561-t002', length: 'SL',
  },
  japan: {
    zh: '日本淡水鱼调查，表 1、2', en: 'Japanese freshwater fish survey, tables 1–2',
    url: 'https://doi.org/10.1155/jai/6613003', length: 'SL',
  },
  michigan: {
    zh: '密歇根州自然资源厅，表 17.1', en: 'Michigan DNR, table 17.1',
    url: 'https://www.michigandnr.com/Publications/pdfs/ifr/manual/SMII%20Chapter17.pdf', length: 'TL',
  },
  atlantic: {
    zh: 'NOAA 东北渔业科学中心，表 1', en: 'NOAA Northeast Fisheries Science Center, table 1',
    url: 'https://repository.library.noaa.gov/view/noaa/3346/noaa_3346_DS1.pdf', length: 'survey',
  },
  mesopelagic: {
    zh: '东热带北大西洋中层鱼调查，表 1', en: 'Tropical North Atlantic mesopelagic survey, table 1',
    url: 'https://doi.org/10.1111/jfb.15068', length: 'SL',
  },
  polarAngler: {
    zh: '罗斯海个体实测，Polar Research', en: 'Measured Ross Sea specimen, Polar Research',
    url: 'https://polarresearch.net/index.php/polar/article/view/3249', length: 'TL',
  },
  pacificPrey: {
    zh: '加州大学深海鱼样本均值，表 1.2', en: 'UC deep-sea specimens, table 1.2 means',
    url: 'https://escholarship.org/content/qt8tv893m7/qt8tv893m7_noSplash_54262855a6fa0d81c68874501abec1b0.pdf', length: 'SL',
  },
  roughy: {
    zh: '澳洲 Kapala 调查，图 24.2', en: 'Australian Kapala survey, figure 24.2',
    url: 'https://www.frdc.com.au/sites/default/files/products/1996-139%20Trawl%20fish%20length-weight%20relationship%20from%20data%20collected%20during%20FRV%20Kapala%20surverys.pdf', length: 'TL',
  },
  sablefish: {
    zh: 'NOAA 北太平洋裸盖鱼调查，图 12', en: 'NOAA North Pacific sablefish survey, figure 12',
    url: 'https://apps-afsc.fisheries.noaa.gov/Publications/AFSC-TM/NOAA-TM-AFSC-35.pdf', length: 'FL',
  },
  scabbard: {
    zh: 'ICES 北大西洋深水调查，表 11', en: 'ICES North Atlantic deepwater survey, table 11',
    url: 'https://www.vliz.be/imisdocs/publications/ocrd/275884.pdf', length: 'TL',
  },
  pacific: {
    zh: 'NOAA 太平洋远洋鱼调查，表 1', en: 'NOAA Pacific pelagic fish report, table 1',
    url: 'https://repository.library.noaa.gov/view/noaa/9081/noaa_9081_DS1.pdf', length: 'FL',
  },
  bosten: {
    zh: '博斯腾湖调查，表 1 样本均值', en: 'Bosten Lake survey, table 1 means',
    url: 'https://doi.org/10.1155/jai/3548420', length: 'TL',
  },
  ghana: {
    zh: '加纳北部水库调查，表 2', en: 'Northern Ghana reservoir survey, table 2',
    url: 'https://backend.orbit.dtu.dk/ws/portalfiles/portal/199444817/29.11.2019_Assessing_.pdf', length: 'TL',
  },
  puffer: {
    zh: '日本红鳍东方鲀研究，表 1', en: 'Japanese tiger pufferfish study, table 1',
    url: 'https://doi.org/10.1111/jfb.15199', length: 'TL',
  },
} as const;

type Source = keyof typeof fishSources;
type LengthBasis = (typeof fishSources)[Source]['length'] | 'EFL' | 'DW';
type Sample = 'spring' | 'autumn' | 'springAutumn' | 'streams' | 'males' | 'wildFemales';
type Rating = 1 | 2 | 3 | 4 | 5;
export type FishRatings = readonly [recognition: Rating, rarity: Rating, popularity: Rating];
type Specimen = readonly [
  id: string, zh: string, en: string, scientific: string, ratings: FishRatings, form: FishForm,
  lengthCm: number, a: number, b: number, sample?: Sample, lengthBasis?: LengthBasis,
];

export interface FishSpecies {
  id: string;
  zh: string;
  en: string;
  scientific: string;
  family: FishFamily;
  ratings: FishRatings;
  rank: Rank;
  form: FishForm;
  source: Source;
  lengthCm: number;
  lengthBasis: LengthBasis;
  referenceGrams: number;
  sample?: Sample;
  study?: FishStudy;
}

export interface FishStudy {
  region: { zh: string; en: string };
  count: number;
  lengthRangeCm: readonly [min: number, max: number];
  weightRangeGrams?: readonly [min: number, max: number];
  rSquared: number;
}

// Reference lengths are selected inside the studies' measured ranges, or the DNR survey curves.
// The coefficients retain each table's original units and logarithm convention.
// Ratings are editorial estimates of name recognition, wild rarity, and appeal in food, angling, or aquariums.
const jialing: Specimen[] = [
  ['crucian', '鲫鱼', 'Chinese crucian carp', 'Carassius auratus', [5, 1, 5], 'carp', 18, .028, 3.024],
  ['common-carp', '鲤鱼', 'Common carp', 'Cyprinus carpio', [5, 1, 5], 'carp', 32, .044, 2.840],
  ['grass-carp', '草鱼', 'Grass carp', 'Ctenopharyngodon idella', [5, 1, 4], 'silver', 39, .060, 2.652],
  ['tchangs-sharpbelly', '张氏䱗', 'Tchang’s sharpbelly', 'Hemiculter tchangi', [1, 2, 1], 'silver', 12, .010, 3.067],
  ['trunkfish-culter', '拟尖头鲌', 'False sharphead culter', 'Culter oxycephaloides', [1, 3, 2], 'silver', 29, .012, 3.008],
  ['topmouth-culter', '翘嘴鲌', 'Topmouth culter', 'Culter alburnus', [4, 2, 5], 'silver', 33, .017, 2.851],
  ['mongolian-culter', '蒙古鲌', 'Mongolian culter', 'Culter mongolicus', [2, 3, 2], 'silver', 30, .011, 3.045],
  ['david-scraper', '黄尾鲴', 'Yellowtail scraper', 'Xenocypris davidi', [3, 2, 4], 'silver', 24, .009, 3.180],
  ['smallscale-scraper', '细鳞鲴', 'Smallscale scraper', 'Xenocypris microlepis', [2, 2, 2], 'silver', 32, .041, 2.745],
  ['chinese-pseudobream', '似鳊', 'Chinese pseudobream', 'Pseudobrama simoni', [2, 2, 2], 'carp', 16, .026, 2.842],
  ['silver-carp', '鲢鱼', 'Silver carp', 'Hypophthalmichthys molitrix', [5, 1, 4], 'carp', 42, .018, 3.038],
  ['bighead-carp', '鳙鱼', 'Bighead carp', 'Hypophthalmichthys nobilis', [5, 1, 5], 'carp', 54, .015, 3.078],
  ['barbel-steed', '唇䱻', 'Barbel steed', 'Hemibarbus labeo', [2, 2, 2], 'silver', 20, .020, 2.951],
  ['spotted-steed', '花䱻', 'Spotted steed', 'Hemibarbus maculatus', [2, 3, 2], 'silver', 24, .011, 3.129],
  ['chinese-gudgeon', '中华鳈', 'Chinese gudgeon', 'Sarcocheilichthys sinensis', [2, 2, 2], 'silver', 12, .027, 2.933],
  ['blackfin-gudgeon', '黑鳍鳈', 'Blackfin gudgeon', 'Sarcocheilichthys nigripinnis', [1, 3, 1], 'silver', 8, .009, 3.325],
  ['silver-gudgeon', '银鮈', 'Silver gudgeon', 'Squalidus argentatus', [1, 1, 1], 'silver', 9, .026, 2.760],
  ['dabrys-gudgeon', '蛇鮈', 'Dabry’s gudgeon', 'Saurogobio dabryi', [1, 2, 2], 'silver', 11, .056, 2.372],
  ['khanka-bitterling', '兴凯鱊', 'Khanka bitterling', 'Acheilognathus chankaensis', [2, 3, 1], 'carp', 7, .028, 2.892],
  ['chinese-barb', '倒刺鲃', 'Chinese barb', 'Spinibarbus sinensis', [3, 3, 3], 'carp', 29, .006, 3.391],
  ['sima', '白甲鱼', 'Sima', 'Onychostoma sima', [3, 3, 3], 'silver', 26, .333, 2.129],
  ['darkbarbel-catfish', '瓦氏黄颡鱼', 'Darkbarbel catfish', 'Tachysurus vachellii', [3, 2, 3], 'catfish', 18, .027, 2.742],
  ['thicklip-catfish', '粗唇鮠', 'Thicklip catfish', 'Tachysurus crassilabris', [2, 3, 2], 'catfish', 18, .059, 2.453],
  ['longfin-catfish', '大鳍鳠', 'Longfin catfish', 'Hemibagrus macropterus', [2, 3, 2], 'catfish', 22, .032, 2.576],
  ['mandarin', '鳜鱼', 'Mandarin fish', 'Siniperca chuatsi', [5, 3, 5], 'perch', 22, .035, 2.856],
];

const japan: Specimen[] = [
  ['japanese-eel', '日本鳗鲡', 'Japanese eel', 'Anguilla japonica', [5, 5, 5], 'eel', 26, -13.582, 2.978],
  ['rosy-bitterling', '高体鳑鲏', 'Rosy bitterling', 'Rhodeus ocellatus', [3, 2, 3], 'carp', 4, -12.280, 3.492],
  ['stone-moroko', '麦穗鱼', 'Stone moroko', 'Pseudorasbora parva', [2, 1, 2], 'silver', 6, -11.976, 3.241],
  ['striped-shiner', '棒花吻鮈', 'Striped shiner', 'Pungtungia herzi', [2, 2, 2], 'silver', 7, -12.104, 3.243],
  ['pale-chub', '宽鳍鱲', 'Pale chub', 'Opsariichthys platypus', [3, 2, 3], 'silver', 8, -11.767, 3.096],
  ['biwa-loach', '琵琶花鳅', 'Biwa loach', 'Cobitis biwae', [1, 3, 2], 'eel', 6, -12.975, 3.274],
  ['amur-catfish', '鲇鱼', 'Amur catfish', 'Silurus asotus', [5, 1, 4], 'catfish', 18, -10.337, 2.741],
  ['cherry-salmon', '樱鳟', 'Cherry salmon', 'Oncorhynchus masou', [3, 4, 4], 'trout', 9, -12.058, 3.266],
  ['ayu', '香鱼', 'Ayu sweetfish', 'Plecoglossus altivelis', [4, 3, 5], 'silver', 13, -12.622, 3.313],
  ['swamp-eel', '黄鳝', 'Asian swamp eel', 'Monopterus albus', [5, 2, 4], 'eel', 35, -13.272, 2.891],
  ['grey-mullet', '鲻鱼', 'Flathead grey mullet', 'Mugil cephalus', [4, 1, 3], 'silver', 10, -10.674, 2.956],
  ['medaka', '日本青鳉', 'Japanese medaka', 'Oryzias latipes', [4, 3, 4], 'silver', 2, -10.857, 3.008],
  ['mosquitofish', '食蚊鱼', 'Western mosquitofish', 'Gambusia affinis', [3, 1, 1], 'silver', 2.8, -11.206, 3.093],
  ['dark-sleeper', '暗色沙塘鳢', 'Dark sleeper', 'Odontobutis obscura', [2, 3, 2], 'perch', 9, -10.008, 2.870],
  ['amur-goby', '子陵吻虾虎鱼', 'Amur goby', 'Rhinogobius giurinus', [2, 1, 2], 'perch', 5, -11.602, 3.165],
  ['torrent-catfish', '赖氏钝头鮠', 'Japanese torrent catfish', 'Liobagrus reinii', [2, 4, 2], 'catfish', 7, -11.559, 3.029],
  ['tymen-stickleback', '图们江多刺鱼', 'Tymen stickleback', 'Pungitius tymensis', [2, 3, 2], 'perch', 4, -11.831, 3.163],
  ['hana-sculpin', '大棘杜父鱼', 'Hana sculpin', 'Cottus nozawae', [2, 3, 2], 'perch', 7.5, -12.611, 3.452],
];

const michigan: Specimen[] = [
  ['largemouth', '大口黑鲈', 'Largemouth bass', 'Micropterus salmoides', [5, 2, 5], 'perch', 36, -5.16885, 3.12735],
  ['smallmouth', '小口黑鲈', 'Smallmouth bass', 'Micropterus dolomieu', [4, 2, 5], 'perch', 32, -4.91466, 3.02635],
  ['rock-bass', '岩钝鲈', 'Rock bass', 'Ambloplites rupestris', [2, 1, 2], 'perch', 18, -4.81208, 3.05438],
  ['white-bass', '白鲈', 'White bass', 'Morone chrysops', [3, 2, 3], 'perch', 27, -5.0233, 3.0342],
  ['bluegill', '蓝鳃太阳鱼', 'Bluegill', 'Lepomis macrochirus', [4, 1, 4], 'carp', 15, -5.10377, 3.17266],
  ['bowfin', '弓鳍鱼', 'Bowfin', 'Amia calva', [3, 3, 3], 'eel', 56, -4.89906, 2.96004],
  ['burbot', '江鳕', 'Burbot', 'Lota lota', [3, 3, 3], 'eel', 49, -5.21478, 3.03888],
  ['channel-catfish', '斑点叉尾鮰', 'Channel catfish', 'Ictalurus punctatus', [4, 1, 5], 'catfish', 45, -5.8116, 3.2764],
  ['flathead-catfish', '扁头鮰', 'Flathead catfish', 'Pylodictis olivaris', [3, 2, 5], 'catfish', 65, -5.39084, 3.16495],
  ['black-crappie', '黑刺盖太阳鱼', 'Black crappie', 'Pomoxis nigromaculatus', [3, 1, 4], 'carp', 22, -5.24330, 3.17980],
  ['white-crappie', '白刺盖太阳鱼', 'White crappie', 'Pomoxis annularis', [3, 1, 4], 'carp', 22, -5.8236, 3.3835],
  ['rainbow-darter', '虹镖鲈', 'Rainbow darter', 'Etheostoma caeruleum', [2, 2, 2], 'perch', 6, -5.6619, 3.403],
  ['freshwater-drum', '淡水石首鱼', 'Freshwater drum', 'Aplodinotus grunniens', [3, 1, 2], 'perch', 34, -5.4353, 3.1973],
  ['american-eel', '美洲鳗鲡', 'American eel', 'Anguilla rostrata', [4, 4, 4], 'eel', 52, -6.94, 3.47],
  ['longnose-gar', '长吻雀鳝', 'Longnose gar', 'Lepisosteus osseus', [3, 3, 4], 'pike', 86, -7.067, 3.5070],
  ['muskellunge', '大狗鱼', 'Muskellunge', 'Esox masquinongy', [4, 4, 5], 'pike', 100, -6.43636, 3.44346],
  ['yellow-perch', '黄鲈', 'Yellow perch', 'Perca flavescens', [4, 1, 4], 'perch', 19, -5.33475, 3.17285],
  ['northern-pike', '白斑狗鱼', 'Northern pike', 'Esox lucius', [4, 2, 5], 'pike', 64, -5.61083, 3.14178],
  ['pumpkinseed', '橙点太阳鱼', 'Pumpkinseed', 'Lepomis gibbosus', [3, 1, 3], 'carp', 14, -5.11138, 3.21060],
  ['atlantic-salmon', '大西洋鲑', 'Atlantic salmon', 'Salmo salar', [5, 4, 5], 'trout', 56, -4.47028, 2.78090],
  ['chinook', '大鳞大麻哈鱼', 'Chinook salmon', 'Oncorhynchus tshawytscha', [4, 3, 5], 'trout', 72, -5.31348, 3.113913],
  ['coho', '银大麻哈鱼', 'Coho salmon', 'Oncorhynchus kisutch', [4, 3, 4], 'trout', 57, -6.16900, 3.42700],
  ['lake-sturgeon', '湖鲟', 'Lake sturgeon', 'Acipenser fulvescens', [4, 5, 4], 'sturgeon', 110, -5.61713, 3.13960],
  ['brook-trout', '溪红点鲑', 'Brook trout', 'Salvelinus fontinalis', [4, 3, 4], 'trout', 25, -4.97427, 2.98634, 'streams'],
  ['brown-trout', '褐鳟', 'Brown trout', 'Salmo trutta', [4, 2, 5], 'trout', 33, -5.03265, 3.01000, 'streams'],
  ['lake-trout', '湖红点鲑', 'Lake trout', 'Salvelinus namaycush', [4, 3, 4], 'trout', 60, -5.51900, 3.17882],
  ['rainbow-trout', '虹鳟', 'Rainbow trout', 'Oncorhynchus mykiss', [5, 2, 5], 'trout', 35, -5.14777, 3.05253],
  ['walleye', '大眼梭鲈', 'Walleye', 'Sander vitreus', [4, 2, 5], 'perch', 42, -5.14176, 3.03606],
];

const atlantic: Specimen[] = [
  ['sandbar-shark', '灰真鲨', 'Sandbar shark', 'Carcharhinus plumbeus', [4, 5, 3], 'shark', 135, -12.6740, 3.1706, 'springAutumn'],
  ['atlantic-sturgeon', '大西洋鲟', 'Atlantic sturgeon', 'Acipenser oxyrinchus', [5, 5, 4], 'sturgeon', 120, -14.2902, 3.4547, 'springAutumn'],
  ['american-shad', '美洲西鲱', 'American shad', 'Alosa sapidissima', [3, 3, 3], 'silver', 32, -12.1377, 3.2207, 'springAutumn'],
  ['atlantic-herring', '大西洋鲱', 'Atlantic herring', 'Clupea harengus', [5, 2, 4], 'silver', 26, -11.7972, 3.0314, 'spring'],
  ['atlantic-cod', '大西洋鳕', 'Atlantic cod', 'Gadus morhua', [5, 3, 5], 'catfish', 64, -11.7803, 3.0606, 'spring'],
  ['black-sea-bass', '条纹锯鮨', 'Black sea bass', 'Centropristis striata', [3, 2, 4], 'perch', 31, -11.2205, 3.0225, 'autumn'],
  ['bluefish', '蓝鱼', 'Bluefish', 'Pomatomus saltatrix', [3, 2, 4], 'silver', 46, -11.4296, 3.0548, 'autumn'],
  ['amberjack', '高体鰤', 'Greater amberjack', 'Seriola dumerili', [4, 3, 5], 'silver', 66, -9.8906, 2.7221, 'autumn'],
  ['atlantic-wolffish', '大西洋狼鱼', 'Atlantic wolffish', 'Anarhichas lupus', [3, 4, 3], 'eel', 69, -12.2186, 3.1439, 'springAutumn'],
  ['atlantic-mackerel', '大西洋鲭', 'Atlantic mackerel', 'Scomber scombrus', [5, 2, 5], 'silver', 31, -12.6713, 3.3119, 'spring'],
  ['summer-flounder', '夏鲆', 'Summer flounder', 'Paralichthys dentatus', [3, 2, 4], 'flat', 44, -12.2841, 3.2156, 'autumn'],
  ['atlantic-halibut', '大西洋庸鲽', 'Atlantic halibut', 'Hippoglossus hippoglossus', [4, 4, 5], 'flat', 101, -12.5865, 3.2674, 'spring'],
  ['cownose-ray', '大西洋牛鼻鲼', 'Cownose ray', 'Rhinoptera bonasus', [4, 3, 4], 'ray', 80, -11.8649, 3.2327, 'autumn', 'DW'],
  ['goosefish', '美洲鮟鱇', 'American goosefish', 'Lophius americanus', [4, 2, 4], 'angler', 54, -10.7106, 2.9227, 'autumn'],
];

const mesopelagic: Specimen[] = [
  ['viperfish', '斯氏蝰鱼', 'Sloane’s viperfish', 'Chauliodus sloani', [4, 4, 4], 'dragon', 18, .0008, 3.355],
  ['lanternfish', '闪光灯笼鱼', 'Glistening lanternfish', 'Myctophum nitidulum', [3, 2, 3], 'lantern', 5.6, .0109, 3.129],
  ['hatchetfish', '褶胸鱼', 'Diaphanous hatchetfish', 'Sternoptyx diaphana', [3, 3, 3], 'hatchet', 3.5, .0763, 2.673],
  ['silver-spinyfin', '银眼鲷', 'Silver spinyfin', 'Diretmus argenteus', [2, 3, 2], 'carp', 6, .0755, 2.769],
];

const roughy: Specimen[] = [
  ['orange-roughy', '大西洋胸棘鲷', 'Orange roughy', 'Hoplostethus atlanticus', [3, 4, 4], 'perch', 35, .0627, 2.8118, 'males'],
];

const sablefish: Specimen[] = [
  ['sablefish', '裸盖鱼', 'Sablefish', 'Anoplopoma fimbria', [4, 3, 4], 'silver', 61, .0017812, 3.430072],
];

const scabbard: Specimen[] = [
  ['black-scabbardfish', '黑带鱼', 'Black scabbardfish', 'Aphanopus carbo', [3, 3, 4], 'eel', 102, .0001, 3.4964, 'males'],
];

const pacific: Specimen[] = [
  ['lancetfish', '长吻帆蜥鱼', 'Longnose lancetfish', 'Alepisaurus ferox', [3, 3, 3], 'dragon', 97, 6.01e-6, 2.76],
  ['swordfish', '剑鱼', 'Swordfish', 'Xiphias gladius', [5, 3, 5], 'billfish', 145, 1.30e-5, 3.07, undefined, 'EFL'],
  ['mahi-mahi', '鲯鳅', 'Mahi-mahi', 'Coryphaena hippurus', [4, 2, 5], 'silver', 95, 3.69e-6, 3.17],
];

const ghana: Specimen[] = [
  ['nile-tilapia', '尼罗罗非鱼', 'Nile tilapia', 'Oreochromis niloticus', [5, 1, 4], 'perch', 24, .0226, 2.93],
];

const puffer: Specimen[] = [
  ['tiger-puffer', '红鳍东方鲀', 'Tiger pufferfish', 'Takifugu rubripes', [5, 3, 5], 'puffer', 43, 6.95e-7, 3.55, 'wildFemales'],
];

type UnrankedFish = Omit<FishSpecies, 'rank' | 'family' | 'lengthBasis'> & { lengthBasis?: LengthBasis };

const measuredFish: UnrankedFish[] = [
  { id: 'blackdevil', zh: '约氏黑角鮟鱇', en: 'Humpback blackdevil', scientific: 'Melanocetus johnsonii', ratings: [5, 5, 5],
    form: 'angler', source: 'polarAngler', lengthCm: 15.7, referenceGrams: 290 },
  { id: 'fangtooth', zh: '角高体金眼鲷', en: 'Common fangtooth', scientific: 'Anoplogaster cornuta', ratings: [4, 4, 4],
    form: 'fangtooth', source: 'pacificPrey', lengthCm: 10.6, referenceGrams: 42.63 },
  { id: 'northern-snakehead', zh: '乌鳢', en: 'Northern snakehead', scientific: 'Channa argus', ratings: [5, 2, 4],
    form: 'pike', source: 'bosten', lengthCm: 37.32, referenceGrams: 690.64 },
];

function referenceWeight(source: Source, cm: number, a: number, b: number) {
  if (source === 'michigan') return 10 ** a * (cm * 10) ** b;
  if (source === 'japan') return Math.exp(a) * (cm * 10) ** b;
  if (source === 'atlantic') return 1000 * Math.exp(a) * cm ** b;
  if (source === 'pacific') return 1000 * a * cm ** b;
  if (source === 'puffer') return a * (cm * 10) ** b;
  return a * cm ** b;
}

function totalRating([recognition, rarity, popularity]: FishRatings) {
  return recognition + rarity + popularity;
}

const regressionFish = (Object.entries({ jialing, japan, michigan, atlantic, mesopelagic, roughy, sablefish, scabbard, pacific, ghana, puffer }) as
  [Source, Specimen[]][]).flatMap(([source, specimens]) => specimens.map(
  ([id, zh, en, scientific, ratings, form, lengthCm, a, b, sample, lengthBasis]) => ({
    id, zh, en, scientific, ratings, form, source, lengthCm, sample, lengthBasis,
    referenceGrams: referenceWeight(source, lengthCm, a, b),
  }),
));

const surveyedFish = surveyFish.map(({ a, b, ...fish }) => ({
  ...fish, referenceGrams: referenceWeight(fish.source, fish.lengthCm, a, b),
}));

const orderedFish = [...regressionFish, ...measuredFish, ...surveyedFish].sort((a, b) => totalRating(b.ratings) - totalRating(a.ratings) || b.ratings[1] - a.ratings[1] ||
  b.ratings[2] - a.ratings[2] || a.id.localeCompare(b.id, 'en'));

const rankCutoffs = [0, 5, 15, 30, 50, 75, 100].map(percent => Math.round(orderedFish.length * percent / 100));
export const fishCatalog: readonly FishSpecies[] = ranks.flatMap((rank, index) =>
  orderedFish.slice(rankCutoffs[index], rankCutoffs[index + 1]).map(fish => ({
    ...fish, rank, family: familyOf(fish.scientific), lengthBasis: fish.lengthBasis ?? fishSources[fish.source].length,
  })),
);

export const fishById = new Map(fishCatalog.map(fish => [fish.id, fish]));
