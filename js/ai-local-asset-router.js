/* ===== ZERO-ROUND-TRIP LOCAL ASSET ROUTER ================================
 *
 * Match only requests that can be satisfied by one audited, deterministic
 * code-native asset without asking a model to interpret the scene. False
 * negatives are intentional: a false positive could silently add or remove
 * scientifically meaningful structure.
 *
 * This module is deliberately independent of the UI and the general image
 * engine router.  The caller may pass motifRequest to the existing high-level
 * motif compiler when matched is true.
 */

export const LOCAL_ASSET_ROUTER_VERSION = "5e-local-asset-router@3";

const DESTRUCTIVE_EDIT_REQUEST =
  /삭제|제거|없애|빼(?:고|줘|라|기)|지우|잘라\s*내|omit|exclude|remove|erase|delete|cut\s+out/;
const REVISION_REQUEST =
  /수정|고쳐|바꿔|변경|재배치|다시\s*(?:그려|만들|생성)|이전\s*(?:그림|이미지|결과|요청)|방금\s*(?:그림|이미지|결과)|기존\s*(?:그림|이미지|결과)|원본|참고\s*(?:이미지|그림)|edit|revise|revision|modify|change|rearrange|redo|again|previous\s+(?:image|result)|reference\s+image/;

const ANNOTATION_TOKEN_SOURCE =
  "문자|글자|텍스트|숫자|기호|라벨|레이블|화살표|지시선|caption|text|number(?:s)?|symbol(?:s)?|label(?:s)?|arrow(?:s)?|leader(?:\\s+line)?s?";
const ANNOTATION_TOKEN = new RegExp(`(?:${ANNOTATION_TOKEN_SOURCE})`, "i");
const NEGATED_ANNOTATION_LIST = new RegExp(
  `(?:${ANNOTATION_TOKEN_SOURCE})(?:(?:\\s*(?:은|는|이|가|을|를|과|와|및|하고|도|모두|모든|any|and|or)?\\s*)(?:${ANNOTATION_TOKEN_SOURCE})){0,8}\\s*(?:은|는|이|가|을|를|도)?\\s*(?:없이|없게|제외(?:하고)?|넣지\\s*마(?:라|세요)?|그리지\\s*마(?:라|세요)?|생성하지\\s*마(?:라|세요)?|표시하지\\s*마(?:라|세요)?|쓰지\\s*마(?:라|세요)?|without|omitted?|excluded?)`,
  "gi",
);
const ENGLISH_NEGATED_ANNOTATION_LIST = new RegExp(
  `(?:no|without|omit|exclude|do\\s+not\\s+(?:add|draw|include|show|write))\\s+(?:any\\s+)?(?:${ANNOTATION_TOKEN_SOURCE})(?:(?:\\s*(?:,|and|or)?\\s*)(?:${ANNOTATION_TOKEN_SOURCE})){0,8}`,
  "gi",
);
const NEGATABLE_DIAGRAM_DETAIL_SOURCE =
  "분기|계기|전류계|전압계|이동\\s*도르래|복합\\s*도르래|경사면|손|힘\\s*벡터|광선|빛살|물체|거리|눈금|격자|그리드|값|수치|환경\\s*수용력|여러\\s*곡선|복수\\s*곡선|종\\s*라벨|문자|글자|텍스트|숫자|기호|라벨|레이블|화살표|지시선|branches?|meters?|ammeters?|voltmeters?|moving\\s+pulleys?|compound\\s+pulleys?|inclined\\s+planes?|hands?|force\\s+vectors?|rays?|objects?|distances?|ticks?|grid|values?|numeric\\s+values?|carrying\\s+capacity|multiple\\s+curves?|species\\s+labels?|caption|text|numbers?|symbols?|labels?|arrows?|leader(?:\\s+line)?s?";
const KOREAN_NEGATED_DIAGRAM_DETAILS = new RegExp(
  `(?:${NEGATABLE_DIAGRAM_DETAIL_SOURCE})(?:(?:\\s*(?:은|는|이|가|을|를|과|와|및|하고|도|모두|모든)?\\s*)(?:${NEGATABLE_DIAGRAM_DETAIL_SOURCE})){0,12}\\s*(?:은|는|이|가|을|를|도)?\\s*(?:없이|없게|제외(?:하고)?|넣지\\s*마(?:라|세요)?|그리지\\s*마(?:라|세요)?|생성하지\\s*마(?:라|세요)?|표시하지\\s*마(?:라|세요)?|쓰지\\s*마(?:라|세요)?)`,
  "gi",
);
const ENGLISH_NEGATED_DIAGRAM_DETAILS = new RegExp(
  `(?:no|without|omit|exclude|do\\s+not\\s+(?:add|draw|include|show|write))\\s+(?:any\\s+)?(?:${NEGATABLE_DIAGRAM_DETAIL_SOURCE})(?:(?:\\s*(?:,|and|or)?\\s*)(?:${NEGATABLE_DIAGRAM_DETAIL_SOURCE})){0,12}`,
  "gi",
);

const MAP_VARIANTS = Object.freeze([
  Object.freeze({
    id: "korean_peninsula",
    pattern: /한\s*반도|한반도|korean\s+peninsula/,
  }),
  Object.freeze({
    id: "east_asia",
    pattern: /동\s*아시아|east\s+asia/,
  }),
  Object.freeze({
    id: "pacific",
    pattern: /태평양|pacific(?:\s+ocean)?/,
  }),
  Object.freeze({
    id: "world",
    pattern: /세계(?:\s*전체)?|전\s*세계|지구\s*전체|world|global/,
  }),
]);

const COASTLINE_REQUEST =
  /해안선|물리(?:적)?\s*해안|physical\s+coast(?:line)?|coastline(?:\s+outline)?/;
const MAP_WORD = /지도|맵|map|outline|윤곽/;
const MAP_UNSAFE_OR_OVERLAY =
  /국경|정치\s*경계|행정\s*(?:경계|구역)|국가\s*경계|도(?:시)?\s*경계|political\s+boundar|border|administrative|지명|도시\s*이름|국가\s*이름|장소\s*이름|place\s*name|city\s*name|country\s*name|라벨|레이블|label|지질도|지질|암석|단층|geolog|일기도|기상도|날씨|기압|등압선|강수|태풍|전선|weather|isobar|contour|등치선|등고선|경로|항로|궤적|이동\s*경로|route|path|track|overlay|오버레이|표식|마커|marker|위치\s*점|관측소|지진|진앙|화산|판\s*경계|해류|풍향|화살표|arrow|채우|색칠|음영|회색|fill|shad|gray|grey|colou?r|(?:두|여러|복수|2)\s*개(?:의)?\s*(?:지도|맵)|(?:지도|맵)\s*(?:두|여러|복수|2)\s*개|multiple\s+maps|\bmaps\b/;
const MAP_OTHER_SCENE =
  /학생|교사|사람|동물|식물|자동차|우주선|로켓|회로|전구|전원|스위치|도르래|용수철|비커|플라스크|시험관|그래프|좌표|표\s*(?:와|과|를|를|추가)|student|teacher|person|animal|plant|vehicle|spacecraft|rocket|circuit|pulley|spring|beaker|flask|graph|chart/;

const PANEL_FLOW_WORD =
  /panel[_\s-]*flow|패널\s*(?:흐름|전개|비교)|(?:상태|과정)\s*비교\s*패널|입자\s*상자|particle\s*box(?:es)?|particlebox/;
const PANEL_CONNECTOR =
  /(?:패널|상자|용기|비커|플라스크|시험관).{0,24}(?:사이|간).{0,12}(?:평범한|일반|단순|직선|실선)?\s*(?:연결선|선으로\s*연결|연결)|plain\s+(?:connector|line)s?|connected\s+by\s+(?:plain|solid)\s+lines?/;
const PANEL_SEQUENCE = /왼쪽부터|좌측부터|순서대로|차례로|from\s+left|in\s+order/;
const PANEL_BOX = /빈\s*(?:사각(?:형)?\s*)?(?:상자|박스)|empty\s+(?:rectangular\s+)?box(?:es)?/;
const PANEL_PARTICLE_BOX = /입자\s*상자|입자상자|particle\s*box(?:es)?|particlebox/;
const PANEL_VESSELS = Object.freeze([
  Object.freeze({ id: "beaker", pattern: /비커|beakers?/ }),
  Object.freeze({ id: "flask", pattern: /플라스크|flasks?/ }),
  Object.freeze({ id: "test_tube", pattern: /시험관|test\s*tubes?/ }),
]);
const PANEL_EMPTY = /빈\s*(?:용기|비커|플라스크|시험관)|내용물\s*없는|액체\s*없는|empty\s+(?:vessels?|beakers?|flasks?|test\s*tubes?)|without\s+(?:liquid|contents?)/;
const PANEL_UNSUPPORTED_STATE =
  /피스톤|추\s*(?:를|가|와|과|달)|고정\s*장치|콕|밸브|눈금|액면|용액|혼합|농도|온도|압력|반응|가열|냉각|색(?:깔)?|회색|음영|piston|weight|clamp|stopcock|valve|graduat|liquid\s*level|solution|mixture|concentration|temperature|pressure|reaction|heat|cool|gray|grey|shad/;
const PANEL_OTHER_SCENE =
  /학생|교사|사람|동물|식물|지도|해안선|우주선|로켓|자동차|회로|배선|저항|전구|전원|스위치|도르래|용수철|그래프|좌표|등치선|등고선|student|teacher|person|animal|plant|map|coastline|spacecraft|rocket|vehicle|circuit|wiring|resistor|bulb|battery|switch|pulley|spring|graph|chart|contour/;

const DUAL_AXIS_WORD =
  /이중\s*(?:y|와이)?\s*축|좌우\s*(?:두\s*)?(?:y|와이)\s*축|dual[-\s]*(?:y[-\s]*)?axis/;
const DUAL_X_AXIS = /x\s*축|엑스\s*축|x[-\s]*axis/;
const DUAL_BLANK =
  /빈\s*(?:이중\s*(?:y|와이)?\s*축|좌표|그래프)|데이터\s*없이|곡선\s*없이|계열\s*없이|blank|empty|without\s+(?:data|series|curves?)/;
const DUAL_UNSUPPORTED =
  /격자|그리드|데이터\s*(?:점|값|를|가)|계열\s*(?:을|를|이|가)|곡선\s*(?:을|를|이|가)|함수|증가|감소|최대|최소|막대|산점|x\s*range|y\s*range|leftrange|rightrange|plotbox|grid|data\s*(?:point|value)|series\s*(?:with|of|is|are)|curve\s*(?:with|of|is|are)|function|increase|decrease|maximum|minimum|bar\s+chart|scatter/;
const DUAL_OTHER_SCENE =
  /학생|사람|동물|식물|지도|해안선|우주선|로켓|자동차|회로|배선|저항|전구|전원|스위치|도르래|용수철|비커|플라스크|시험관|입자\s*상자|등치선|등고선|student|person|animal|plant|map|coastline|spacecraft|rocket|vehicle|circuit|wiring|resistor|bulb|battery|switch|pulley|spring|beaker|flask|particle\s*box|contour/;

const WIRING_WORD = /배선|도선|회로|wiring|wire|circuit/;
const ORTHOGONAL_WORD =
  /직교.{0,8}(?:배선|도선|회로|선)|수평.{0,12}수직|수직.{0,12}수평|orthogonal\s*(?:wiring|wire|circuit)|axis[-\s]*aligned\s*(?:wiring|wire|circuit)/;
const DIAGONAL_WORD =
  /대각\s*(?:배선|도선|회로|선)|비스듬한\s*(?:배선|도선|선)|diagonal\s*(?:wiring|wire|circuit)/;
const RECTANGULAR_LOOP = /직사각형|사각형|rectangular|rectangle/;
const TRIANGULAR_LOOP = /삼각형|triangle|triangular/;
const CLOSED_LOOP = /닫힌\s*(?:고리|회로|루프)|폐회로|closed\s+(?:loop|circuit)/;
const SOLID_WIRE = /실선|평범한\s*선|일반\s*선|solid\s+lines?|plain\s+lines?/;
const WIRING_SCAFFOLD_ONLY =
  /(?:배선|도선|회로)\s*(?:골격|도식)\s*(?:만)?|(?:배선|도선)\s*만|wiring\s+(?:scaffold|only)|wire\s+scaffold|circuit\s+scaffold/;
const TERMINAL_WORD = /단자(?:점)?|노드|terminal\s*nodes?|terminals?|nodes?/;
const WIRING_UNSUPPORTED =
  /저항|전구|전원|전지|배터리|스위치|축전기|커패시터|코일|인덕터|다이오드|트랜지스터|접지|교차|점선|파선|굵은\s*선|갈라|분기|가지|병렬|직렬|resistor|bulb|lamp|power\s*supply|cell|battery|switch|capacitor|inductor|coil|diode|transistor|ground|crossing|dashed|branch|parallel|series\s+circuit/;
const WIRING_OTHER_SCENE =
  /학생|사람|동물|식물|지도|해안선|우주선|로켓|자동차|도르래|용수철|비커|플라스크|시험관|입자\s*상자|그래프|좌표|등치선|등고선|student|person|animal|plant|map|coastline|spacecraft|rocket|vehicle|pulley|spring|beaker|flask|particle\s*box|graph|chart|contour/;

const CONTOUR_WORD = /등치선|등고선|아이소라인|contours?|isolines?/;
const CONTOUR_SCAFFOLD =
  /개략\s*(?:등치선|등고선)|일반\s*(?:등치선|등고선)|도식용\s*(?:등치선|등고선)|(?:등치선|등고선)\s*(?:묶음|도식|골격)|generic\s+(?:contours?|isolines?)|schematic\s+(?:contours?|isolines?)|(?:contour|isoline)\s+(?:bundle|scaffold)/;
const NESTED_CONTOUR = /중첩|동심|겹겹|nested|concentric/;
const PARALLEL_CONTOUR = /평행|나란한|parallel/;
const CLOSED_CONTOUR = /닫힌.{0,12}(?:선|곡선|등치선|등고선)|closed.{0,12}(?:lines?|curves?|contours?|isolines?)/;
const OPEN_CONTOUR = /열린.{0,12}(?:선|곡선|등치선|등고선)|open.{0,12}(?:lines?|curves?|contours?|isolines?)/;
const VALUELESS_CONTOUR = /값\s*없이|수치\s*없이|높이\s*값\s*없이|unvalued|without\s+(?:values?|levels?)/;
const CONTOUR_UNSUPPORTED =
  /지도|지형|산\s*(?:모양|봉우리|정상)|분지|계곡|기압|등압|온도|강수|날씨|일기|지질|단층|지역|한반도|동아시아|태평양|세계|채우|색칠|음영|회색|점선|파선|서로\s*교차|map|topograph|mountain|peak|basin|valley|pressure|isobar|temperature|rain|weather|geolog|fault|region|korea|east\s+asia|pacific|world|fill|shad|gray|grey|dashed|intersect/;
const CONTOUR_OTHER_SCENE =
  /학생|사람|동물|식물|우주선|로켓|자동차|회로|배선|저항|전구|전원|스위치|도르래|용수철|비커|플라스크|시험관|입자\s*상자|그래프|좌표|student|person|animal|plant|spacecraft|rocket|vehicle|circuit|wiring|resistor|bulb|battery|switch|pulley|spring|beaker|flask|particle\s*box|graph|chart/;

const DC_SOURCE = /직류\s*전원(?:\s*장치)?|dc\s*(?:power\s*)?source/;
const CIRCUIT_SWITCH = /스위치|개폐기|switch/;
const CIRCUIT_RESISTOR = /저항(?:기)?|resistor/;
const CIRCUIT_LAMP = /전구|램프|lamp|bulb/;
const SERIES_LOOP =
  /단일\s*(?:닫힌\s*)?(?:사각(?:형)?\s*)?직렬\s*(?:배선\s*)?(?:회로|루프|고리)|하나의\s*(?:닫힌\s*)?(?:사각(?:형)?\s*)?직렬\s*(?:배선\s*)?(?:회로|루프|고리)|single\s+(?:closed\s+)?(?:rectangular\s+)?series\s+(?:circuit|loop)|one\s+(?:closed\s+)?(?:rectangular\s+)?series\s+(?:circuit|loop)/;
const CLOSED_WIRING_LOOP =
  /닫힌\s*(?:사각(?:형)?\s*)?(?:(?:배선\s*)?(?:루프|고리)|직렬\s*회로)|끊김\s*없는\s*(?:사각(?:형)?\s*)?배선|closed\s+(?:rectangular\s+)?(?:(?:wiring\s+)?loop|series\s+circuit)/;
const OPEN_SWITCH = /열린\s*(?:상태의\s*)?(?:스위치|개폐기)|(?:스위치|개폐기)\s*(?:상태(?:는|가)?\s*)?(?:열림|열려)|open\s+switch|switch\s*(?:state\s*)?(?:is|=)?\s*open/;
const CLOSED_SWITCH = /닫힌\s*(?:상태의\s*)?(?:스위치|개폐기)|(?:스위치|개폐기)\s*(?:상태(?:는|가)?\s*)?(?:닫힘|닫혀)|closed\s+switch|switch\s*(?:state\s*)?(?:is|=)?\s*closed/;
const LEFT_DC_SOURCE = /왼쪽.{0,12}(?:직류\s*전원)|(?:직류\s*전원).{0,12}왼쪽|(?:dc\s*(?:power\s*)?source).{0,18}(?:on\s+the\s+left|at\s+left)|(?:left).{0,18}(?:dc\s*(?:power\s*)?source)/;
const TOP_SWITCH = /위(?:쪽|에|에는)?.{0,12}(?:스위치|개폐기)|(?:스위치|개폐기).{0,12}위(?:쪽|에)?|switch.{0,18}(?:on\s+the\s+top|at\s+top)|top.{0,18}switch/;
const RIGHT_RESISTOR = /오른쪽.{0,12}저항|저항.{0,12}오른쪽|resistor.{0,18}(?:on\s+the\s+right|at\s+right)|right.{0,18}resistor/;
const BOTTOM_LAMP = /아래(?:쪽|에|에는)?.{0,12}(?:전구|램프)|(?:전구|램프).{0,12}아래(?:쪽|에)?|(?:lamp|bulb).{0,18}(?:on\s+the\s+bottom|at\s+bottom)|bottom.{0,18}(?:lamp|bulb)/;
const SERIES_CIRCUIT_UNSAFE =
  /분기|가지\s*회로|병렬|계기|전류계|전압계|검류계|축전기|커패시터|코일|인덕터|다이오드|트랜지스터|접지|교차|두\s*(?:개|개의)?\s*(?:회로|루프)|여러\s*(?:회로|루프)|복수\s*(?:회로|루프)|branch|parallel|meter|ammeter|voltmeter|galvanometer|capacitor|inductor|coil|diode|transistor|ground|crossing|multiple\s+(?:circuits|loops)|two\s+(?:circuits|loops)/;
const CIRCUIT_VALUE =
  /저항값|전압|전류|기전력|전력|옴|볼트|암페어|와트|(?:[0-9]+(?:\.[0-9]+)?\s*)(?:ω|ohms?|v(?:olts?)?|a(?:mps?)?|w(?:atts?)?)\b|resistance\s+value|voltage|current|emf|power\s+value/;
const CIRCUIT_OTHER_SCENE =
  /학생|사람|동물|식물|지도|해안선|우주선|로켓|자동차|도르래|용수철|비커|플라스크|시험관|입자\s*상자|그래프|좌표|등치선|등고선|렌즈|거울|스크린|student|person|animal|plant|map|coastline|spacecraft|rocket|vehicle|pulley|spring|beaker|flask|particle\s*box|graph|chart|contour|lens|mirror|screen/;

const FIXED_CEILING_PULLEY =
  /천장.{0,12}고정.{0,8}도르래|고정.{0,8}도르래.{0,12}천장|ceiling[-\s]*fixed\s+pulley|fixed\s+pulley.{0,18}(?:ceiling|overhead)/;
const ONE_CONTINUOUS_ROPE =
  /(?:하나의|한\s*가닥의?|1\s*가닥의?)\s*연속(?:된)?\s*(?:줄|실)|연속(?:된)?\s*(?:줄|실)\s*(?:한\s*가닥|하나)|one\s+continuous\s+(?:rope|string)|single\s+continuous\s+(?:rope|string)/;
const LEFT_BLANK_LOAD =
  /왼쪽.{0,24}(?:빈|무라벨|표시\s*없는)\s*(?:직사각형\s*)?추\s*(?:하나|한\s*개|1\s*개)|(?:빈|무라벨|표시\s*없는)\s*(?:직사각형\s*)?추\s*(?:하나|한\s*개|1\s*개).{0,24}왼쪽|(?:one|a\s+single)\s+blank\s+(?:rectangular\s+)?load.{0,24}(?:on\s+the\s+left|left\s+branch)|left\s+branch.{0,24}(?:one|a\s+single)\s+blank\s+(?:rectangular\s+)?load/;
const RIGHT_SPRING_MATCHED_LOAD =
  /오른쪽.{0,24}용수철.{0,24}(?:아래|끝|뒤).{0,16}(?:같은\s*모양|동일한\s*외형).{0,12}(?:빈|무라벨|표시\s*없는)\s*(?:직사각형\s*)?추\s*(?:하나|한\s*개|1\s*개)|right\s+branch.{0,24}(?:one|a\s+single)\s+spring.{0,24}(?:followed\s+by|then|above).{0,16}(?:one|a\s+single)\s+blank\s+(?:rectangular\s+)?load.{0,16}(?:of\s+the\s+same\s+shape|matching\s+shape)/;
const SAME_LOAD_SHAPE = /같은\s*모양|동일한\s*외형|same\s+shape|matching\s+shape/;
const PULLEY_EQUAL_MASS_CLAIM = /같은\s*(?:질량|무게)|동일한\s*(?:질량|무게)|질량이\s*같|무게가\s*같|equal\s+(?:mass|weight)|same\s+(?:mass|weight)/;
const PULLEY_UNSAFE =
  /움직(?:도르래|이는\s*도르래)|이동\s*도르래|복합\s*도르래|도르래\s*장치|경사면|손|사람|힘\s*(?:표시|벡터)|장력\s*(?:값|표시)|용수철\s*(?:감은\s*수|반지름|굵기|길이)|두\s*개(?:의)?\s*도르래|도르래\s*두\s*개|두\s*개(?:의)?\s*용수철|용수철\s*두\s*개|moving\s+pulley|compound\s+pulley|pulley\s+system|inclined\s+plane|hand|person|force\s+vector|tension\s+value|spring\s*(?:turns|radius|thickness|length)|two\s+pulleys|multiple\s+pulleys|two\s+springs|multiple\s+springs/;
const PULLEY_OTHER_SCENE =
  /학생|동물|식물|지도|해안선|우주선|로켓|자동차|회로|저항|전구|전원|스위치|비커|플라스크|시험관|입자\s*상자|그래프|좌표|등치선|렌즈|거울|스크린|student|animal|plant|map|coastline|spacecraft|rocket|vehicle|circuit|resistor|lamp|battery|switch|beaker|flask|particle\s*box|graph|chart|contour|lens|mirror|screen/;

const OPTICAL_BENCH = /광학\s*(?:대|벤치|배치)|렌즈.{0,16}거울.{0,16}스크린|optical\s+bench|lens.{0,24}mirror.{0,24}screen/;
const CONVEX_LENS = /볼록\s*렌즈|convex\s+lens/;
const PLANE_MIRROR_45 = /(?:45\s*(?:도|°).{0,18}평면\s*거울|평면\s*거울.{0,18}45\s*(?:도|°))|(?:plane\s+mirror.{0,28}45\s*degrees?|45\s*degrees?.{0,28}plane\s+mirror)/;
const OPTICAL_SCREEN = /스크린|screen/;
const LEFT_CONVEX_LENS = /왼쪽.{0,12}볼록\s*렌즈|볼록\s*렌즈.{0,12}왼쪽|(?:convex\s+lens).{0,18}(?:on\s+the\s+left|at\s+left)|left.{0,18}convex\s+lens/;
const CENTER_PLANE_MIRROR = /(?:중앙|가운데).{0,24}평면\s*거울|평면\s*거울.{0,24}(?:중앙|가운데)|plane\s+mirror.{0,32}(?:at\s+the\s+cent(?:er|re)|in\s+the\s+cent(?:er|re))|cent(?:er|re).{0,32}plane\s+mirror/;
const RIGHT_SCREEN = /오른쪽.{0,12}스크린|스크린.{0,12}오른쪽|screen.{0,18}(?:on\s+the\s+right|at\s+right)|right.{0,18}screen/;
const OPTICS_UNSAFE =
  /오목\s*렌즈|평면\s*렌즈|프리즘|광선|빛살|주축|광축|물체|촛불|광원|거리|초점\s*거리|상\s*(?:의|을|이|크기)|반사\s*경로|굴절\s*경로|concave\s+lens|flat\s+lens|prism|rays?|optical\s+axis|principal\s+axis|object|candle|light\s+source|distance|focal\s+length|image\s+size|reflection\s+path|refraction\s+path/;
const OPTICS_OTHER_SCENE =
  /학생|사람|동물|식물|지도|해안선|우주선|로켓|자동차|회로|저항|전구|전원|스위치|도르래|용수철|비커|플라스크|시험관|입자\s*상자|그래프|좌표|등치선|student|person|animal|plant|map|coastline|spacecraft|rocket|vehicle|circuit|resistor|lamp|battery|switch|pulley|spring|beaker|flask|particle\s*box|graph|chart|contour/;

const VESSEL_PARTICLE_COMPARISON = /비커.{0,28}입자\s*상자.{0,18}(?:비교|나란히)|(?:비교|나란히).{0,18}비커.{0,28}입자\s*상자|beaker.{0,30}particle\s*box.{0,18}(?:comparison|beside|side\s+by\s+side)|(?:comparison|beside|side\s+by\s+side).{0,18}beaker.{0,30}particle\s*box/;
const LIQUID_045 = /(?:비커|beaker).{0,32}(?:액체\s*(?:높이|채움|비율)|채움\s*비율|liquid\s*(?:level|fill|fraction)|fill\s*fraction).{0,12}(?:0\.45|45\s*%)|(?:0\.45|45\s*%).{0,12}(?:액체\s*(?:높이|채움|비율)|채움\s*비율|liquid\s*(?:level|fill|fraction)|fill\s*fraction)/;
const GAS_PARTICLES = /기체\s*(?:상태(?:의|인|이고)?\s*)?(?:원형\s*)?입자|gas(?:\s+state)?(?:.{0,12}(?:circle|circular))?\s+particles?|particlestate\s*(?:은|는|=)?\s*gas/;
const SIXTEEN_PARTICLES = /(?:입자\s*)?16\s*개(?:의\s*입자)?|입자\s*수(?:는|가)?\s*16|16\s+(?:gas\s+)?(?:(?:circle|circular|circle[-\s]*shaped)\s+)?particles?|particlecount\s*(?:은|는|=)?\s*16/;
const CIRCLE_PARTICLES = /원형\s*입자|동그란\s*입자|(?:circle\s*(?:shaped\s*)?|circular\s+)particles?|particles?.{0,10}(?:circle|circular)|particleshape\s*(?:은|는|=)?\s*circle/;
const MIX_FALSE = /혼합(?:하지\s*않|안\s*한|되지\s*않)|섞(?:지\s*않|이지\s*않)|비혼합|mix\s*(?:is|=)?\s*false|not\s+mixed|unmixed/;
const SINGULAR_VESSEL_PARTICLE_PAIR = /(?:비커|beaker)\s*(?:한\s*개\s*)?(?:와|과|및|and)\s*(?:입자\s*상자|particle\s*box)\s*(?:한\s*개)?|(?:one\s+)?beaker\s+and\s+(?:one\s+)?particle\s+box/;
const MULTIPLE_VESSEL_PARTICLE_COMPONENTS = /(?:비커|입자\s*상자)\s*(?:2|3|4|두|세|네|여러|복수)\s*개|(?:2|3|4|두|세|네|여러|복수)\s*개(?:의)?\s*(?:비커|입자\s*상자)|(?:추가|다른)\s*(?:비커|입자\s*상자)|(?:two|three|four|multiple)\s+(?:beakers?|particle\s+boxes?)|another\s+(?:beaker|particle\s+box)|\bbeakers\b|particle\s+boxes/;
const VESSEL_PARTICLE_UNSAFE =
  /플라스크|시험관|메스실린더|깔때기|고체\s*입자|액체\s*입자|사각\s*입자|삼각\s*입자|혼합(?:된|한)|섞인|움직이는\s*입자|입자\s*운동|flask|test\s*tube|graduated\s+cylinder|funnel|solid\s+particles?|liquid\s+particles?|square\s+particles?|triangular\s+particles?|mixed\s+particles?|particle\s+motion|moving\s+particles?/;
const VESSEL_PARTICLE_OTHER_SCENE =
  /학생|사람|동물|식물|지도|해안선|우주선|로켓|자동차|회로|저항|전구|전원|스위치|도르래|용수철|그래프|좌표|등치선|렌즈|거울|스크린|student|person|animal|plant|map|coastline|spacecraft|rocket|vehicle|circuit|resistor|lamp|battery|switch|pulley|spring|graph|chart|contour|lens|mirror|screen/;

const LOGISTIC_CURVE = /로지스틱|logistic/;
const S_CURVE = /s\s*자(?:형)?\s*(?:성장\s*)?(?:곡선|그래프)|에스\s*자(?:형)?\s*(?:곡선|그래프)|s[-\s]*shaped\s+(?:population\s+)?(?:growth\s+)?curve|s[-\s]*curve/;
const POPULATION_WORD = /개체군|개체수|population/;
const GENERIC_CURVE = /일반(?:적인)?|개략(?:적인)?|generic|schematic/;
const SINGLE_CURVE = /단일\s*(?:개체군\s*)?(?:곡선|그래프)|한\s*개(?:의)?\s*(?:곡선|그래프)|single\s+(?:population\s+)?(?:curve|graph)|one\s+(?:population\s+)?curve|(?:one|single)\s+(?:(?:generic|schematic|unlabell?ed|population|logistic|s[-\s]*shaped|growth)\s+){2,10}curve/;
const UNLABELED_CURVE = /무\s*(?:라벨|레이블)|(?:라벨|레이블|문자|숫자)\s*없이|unlabell?ed|without\s+(?:labels?|text|numbers?)/;
const LOGISTIC_UNSAFE =
  /값|수치|범위|축\s*눈금|눈금|격자|그리드|환경\s*수용력|수용력|k\s*값|점근선|여러\s*(?:곡선|계열|개체군)|복수\s*(?:곡선|계열|개체군)|두\s*(?:곡선|계열|개체군)|추가\s*곡선|다른\s*곡선|종(?:의|별|\s)|생물|동물|식물|세균|효모|토끼|포식자|먹이|values?|numeric|ranges?|ticks?|grid|carrying\s+capacity|asymptote|multiple\s+(?:curves?|series|populations?)|two\s+(?:curves?|series|populations?)|another\s+curve|species|organism|animal|plant|bacteria|yeast|rabbit|predator|prey/;
const LOGISTIC_OTHER_SCENE =
  /지도|해안선|우주선|로켓|자동차|회로|저항|전구|전원|스위치|도르래|용수철|비커|플라스크|시험관|입자\s*상자|등치선|렌즈|거울|스크린|map|coastline|spacecraft|rocket|vehicle|circuit|resistor|lamp|battery|switch|pulley|spring|beaker|flask|particle\s*box|contour|lens|mirror|screen/;

const STUDENT_WORD = /학생|students?/;
const TRIO_COUNT =
  /(?:(?<![0-9])3\s*(?:명|인)(?:의|이|은|과|이서)?(?![0-9])|(?<![가-힣])세\s*(?:명|명의|학생)|(?<![가-힣])삼\s*명|three\s+students?|student\s+trio|trio\s+of\s+students?)/;
const OTHER_PERSON_COUNT =
  /(?:(?<![0-9])(?:1|2|4|5|6|7|8|9|10|[1-9][1-9])\s*(?:명|인)(?:의|이|은|과|이서)?(?![0-9])|(?:한|두|네|다섯|여섯|일곱|여덟|아홉|열)\s*명|(?:열|스물|서른|마흔|쉰|예순|일흔|여든|아흔).{0,3}(?:한|두|세|네)?\s*명|(?:one|two|four|five|six|seven|eight|nine|ten|thirteen|twenty)\s+students?)/;
const SEATED = /앉(?:은|아|아서|아있는|아\s*있는)|착석|seated|sitting/;
const TABLE = /책상|탁자|테이블|desk|table/;
const DIALOGUE = /대화|토론|이야기(?:하|를)|말(?:하|을\s*나누)|conversation|dialogue|talking|discuss(?:ing|ion)?/;
const ROUND_TABLE = /원형\s*(?:책상|탁자|테이블)|둥근\s*(?:책상|탁자|테이블)|round\s+(?:desk|table)/;
const RECT_TABLE = /직사각형?\s*(?:책상|탁자|테이블)|사각형?\s*(?:책상|탁자|테이블)|rectangular\s+(?:desk|table)/;
const ROUND_SHAPE = /원형|둥근|\bround\b/;
const RECT_SHAPE = /직사각|사각|\brectangular\b/;
const SPEECH_BUBBLE = /말풍선|speech\s*bubbles?|dialogue\s*bubbles?/;
const SPEECH_BUBBLE_NEGATED =
  /(?:말풍선|speech\s*bubbles?).{0,12}(?:없이|없(?:는|게)|제외|빼|삭제|제거|넣지\s*말|그리지\s*말|생성하지\s*말|만들지\s*말)|(?:no|without)\s+(?:speech\s*|dialogue\s*)?bubbles?|do\s+not\s+(?:add|draw|include|make).{0,8}bubbles?/;
const SPEECH_BUBBLE_COUNT_CONFLICT =
  /(?:(?:1|2|4|5|6|7|8|9|10|하나|한|두|네|다섯|여섯|일곱|여덟|아홉|열)\s*개(?:의)?\s*말풍선|말풍선\s*(?:1|2|4|5|6|7|8|9|10|하나|한|두|네|다섯|여섯|일곱|여덟|아홉|열)(?:\s*개)?|(?:one|two|four|five|six|seven|eight|nine|ten)\s+(?:speech\s*|dialogue\s*)?bubbles?)/;
const SPEECH_BUBBLE_TEXT =
  /(?:말풍선|speech\s*bubbles?).{0,18}(?:대사|글자|텍스트|문구|문장|text|words?|sentence)|(?:대사|글자|텍스트|문구|문장|text|words?|sentence).{0,18}(?:말풍선|speech\s*bubbles?)/;
const STUDENT_EXTRA =
  /교사|선생|부모|어른|남자|여자|아이|칠판|화이트보드|교탁|의자|교실|창문|문\s*(?:앞|옆|뒤)|노트북|컴퓨터|태블릿|책\s*(?:을|이|과|와|한\s*권)|교과서|공책|실험\s*(?:장치|기구)|장치|기구|비커|플라스크|시험관|현미경|전구|회로|도르래|용수철|지도|해안선|우주선|로켓|그래프|좌표|로봇|동물|식물|웃는|표정|teacher|instructor|parent|adult|man|woman|child|blackboard|whiteboard|chair|classroom|window|door|laptop|computer|tablet|book|notebook|apparatus|equipment|beaker|flask|microscope|circuit|pulley|spring|map|coastline|spacecraft|rocket|graph|chart|robot|animal|plant|facial\s+expression|smiling/;
const MULTIPLE_TABLES =
  /(?:각자|각각|별도|서로\s*다른).{0,8}(?:책상|탁자|테이블)|(?:책상|탁자|테이블)\s*(?:2|3|두|세|여러)\s*개|(?:2|3|두|세|여러)\s*개(?:의)?\s*(?:책상|탁자|테이블)|individual\s+desks|separate\s+desks|\bdesks\b|multiple\s+tables/;

const SPACECRAFT_WORD = /우주선|spacecraft|space\s*ship|spaceship/;
const SIMPLE_WORD = /단순|간단|최소한|minimal|simple/;
const FLAT_WORD =
  /이차원|2\s*d|평면(?:형|적인)?\s*(?:우주선|외형|외곽|윤곽|껍데기|쉘|선체)|(?:우주선|외형|외곽|윤곽|껍데기|쉘|선체).{0,8}평면(?:형|적인)?|flat\s+(?:spacecraft|spaceship|space\s*ship|shell|hull|outline)|(?:spacecraft|spaceship|space\s*ship|shell|hull|outline).{0,8}flat/;
const SHELL_WORD = /외형|외곽|윤곽|껍데기|쉘|선체|shell|outline|hull/;
const SPACECRAFT_UNSAFE =
  /복잡|세부\s*묘사|정밀|사실적|실사|사진|포토리얼|입체|3\s*d|광택|그림자|질감|로켓|발사체|추진기|추진\s*장치|부스터|엔진|분사|날개|핀|안테나|태양\s*전지판|착륙\s*장치|랜딩\s*기어|realistic|photoreal|detailed|complex|rocket|launch\s*vehicle|thruster|booster|engine|exhaust|wing|\bfins?\b|antenna|solar\s*panel|landing\s*gear/;
const SPACECRAFT_OTHER_OBJECT =
  /행성|지구|달|별|궤도|궤적|경로|화살표|배경|우주\s*공간|자동차|사람\s*(?:밖|옆)|로봇|위성|망원경|카메라|컴퓨터|배터리|회로|전구|도르래|용수철|(?<!점)(?<!점\s)광원|일반\s*거울|planet|earth|moon|star|orbit|trajectory|route|arrow|background|outer\s*space|vehicle|robot|satellite|telescope|camera|computer|battery|circuit|pulley|spring|light\s*source|(?<!plane\s)mirror/;
const WINDOW_WORD = /창문?|관측창|현창|window|porthole/;
const WINDOW_NEGATED =
  /(?:창문?|관측창|현창|window|porthole).{0,10}(?:없이|없는|제외|빼|삭제|제거|넣지\s*말|그리지\s*말)|(?:no|without)\s+(?:window|porthole)|do\s+not\s+(?:add|draw|include).{0,8}(?:window|porthole)/;
const MULTIPLE_WINDOWS =
  /(?:(?:2|3|4|두|세|네|여러|복수)\s*개(?:의)?\s*(?:창문?|관측창|현창)|(?:창문?|관측창|현창)\s*(?:2|3|4|두|세|네|여러)\s*개|multiple\s+(?:windows|portholes)|\bwindows\b|\bportholes\b)/;
const WIDE_WINDOW = /(?:넓은|큰|와이드)\s*(?:창문?|관측창|현창)|wide\s+(?:window|porthole)/;
const SINGLE_WINDOW = /(?:하나|한\s*개|1\s*개)의?\s*(?:창문?|관측창|현창)|(?:single|one)\s+(?:window|porthole)/;
const SEATED_OCCUPANT =
  /(?:앉(?:은|아\s*있는)|착석한?)\s*(?:탑승자|승객|사람|우주인)|(?:탑승자|승객|사람|우주인)\s*(?:한\s*명\s*)?(?:이|가)?\s*앉|seated\s+(?:occupant|passenger|person|astronaut)/;
const ANY_OCCUPANT = /탑승자|승객|우주인|사람|occupant|passenger|astronaut|person/;
const MULTIPLE_OCCUPANTS =
  /(?:(?:2|3|4|두|세|네|여러|복수)\s*명(?:의)?\s*(?:탑승자|승객|우주인|사람)|(?:탑승자|승객|우주인|사람)\s*(?:2|3|4|두|세|네|여러)\s*명|\boccupants\b|\bpassengers\b|\bastronauts\b|\bpeople\b)/;
const POINT_SOURCE = /점\s*광원|point\s*source/;
const DETECTOR = /검출기(?:\s*상자)?|감지기(?:\s*상자)?|detector(?:\s*box)?/;
const PLANE_MIRROR = /평면\s*거울|plane\s*mirror/;
const ANY_DEVICE = /점\s*광원|검출기|감지기|평면\s*거울|point\s*source|detector|plane\s*mirror/;
const NEGATED_DEVICE =
  /(?:점\s*광원|검출기|감지기|평면\s*거울|point\s*source|detector|plane\s*mirror).{0,10}(?:없이|없는|제외|넣지\s*말)|(?:no|without)\s+(?:point\s*source|detector|plane\s*mirror)/;
const MULTIPLE_SAME_DEVICE =
  /(?:(?:2|3|4|두|세|네|여러|복수)\s*개(?:의)?\s*(?:점\s*광원|검출기|감지기|평면\s*거울)|(?:점\s*광원|검출기|감지기|평면\s*거울)\s*(?:2|3|4|두|세|네|여러)\s*개|multiple\s+(?:point\s*sources|detectors|plane\s*mirrors)|point\s+sources|detectors|plane\s+mirrors)/;
const MULTIPLE_SPACECRAFT =
  /(?:(?:2|3|4|두|세|네|여러|복수)\s*(?:대|개)(?:의)?\s*(?:우주선|spacecraft|spaceship)|(?:우주선|spacecraft|spaceship)\s*(?:2|3|4|두|세|네|여러)\s*(?:대|개)|\bspacecrafts\b|\bspaceships\b|multiple\s+spacecraft)/;
const LONG_SHELL = /길쭉|긴\s*(?:외형|선체|쉘)|elongated|long\s+(?:shell|hull|spacecraft)/;
const COMPACT_SHELL = /짧고\s*(?:넓은|둥근)|컴팩트|compact|short\s+(?:shell|hull|spacecraft)/;
const LEFT_FACING = /왼쪽(?:을|으로)?\s*(?:향|보)|좌향|left[-\s]facing|facing\s+left/;
const RIGHT_FACING = /오른쪽(?:을|으로)?\s*(?:향|보)|우향|right[-\s]facing|facing\s+right/;
const LEFT_DIRECTION_WORD = /왼쪽|좌향|\bleft\b/;
const RIGHT_DIRECTION_WORD = /오른쪽|우향|\bright\b/;
const REAR_SLOT = /(?:뒤|후방|뒤쪽|rear)\s*(?:에|의|쪽)?\s*(?:점\s*광원|검출기|감지기|평면\s*거울|point\s*source|detector|plane\s*mirror)|(?:점\s*광원|검출기|감지기|평면\s*거울|point\s*source|detector|plane\s*mirror).{0,8}(?:뒤|후방|뒤쪽|rear)/;
const CENTER_SLOT = /(?:중앙|가운데|center|centre)\s*(?:에|의|쪽)?\s*(?:점\s*광원|검출기|감지기|평면\s*거울|point\s*source|detector|plane\s*mirror)|(?:점\s*광원|검출기|감지기|평면\s*거울|point\s*source|detector|plane\s*mirror).{0,8}(?:중앙|가운데|center|centre)/;
const FRONT_SLOT = /(?:앞|전방|앞쪽|front)\s*(?:에|의|쪽)?\s*(?:점\s*광원|검출기|감지기|평면\s*거울|point\s*source|detector|plane\s*mirror)|(?:점\s*광원|검출기|감지기|평면\s*거울|point\s*source|detector|plane\s*mirror).{0,8}(?:앞|전방|앞쪽|front)/;

function normalizeRequest(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”‘’'"`]/g, " ")
    .replace(/[·•,;:(){}\[\]<>/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unmatched(reason) {
  return { matched: false, reason };
}

function matched(motif, options, reason) {
  return {
    matched: true,
    motifRequest: { type: "motif", motif, options },
    reason,
  };
}

function referencesPresent(references) {
  if (references == null) return false;
  if (Array.isArray(references)) return references.length > 0;
  return true;
}

function targetIsNegated(text, target) {
  const after = new RegExp(`(?:${target}).{0,12}(?:그리지\\s*마(?:라|세요)?|그리지\\s*말|만들지\\s*마(?:라|세요)?|만들지\\s*말|제외|삭제|제거|빼(?:고|줘|라)?|없애|필요\\s*없|사용하지\\s*마(?:라|세요)?|사용하지\\s*말|not\\s+(?:draw|include|use)|do\\s+not\\s+(?:draw|include|use))`);
  const before = new RegExp(`(?:그리지\\s*마(?:라|세요)?|그리지\\s*말|만들지\\s*마(?:라|세요)?|만들지\\s*말|사용하지\\s*마(?:라|세요)?|사용하지\\s*말|제외|삭제|제거|빼(?:고|줘|라)?|없애|do\\s+not\\s+(?:draw|include|use)|not\\s+(?:draw|include|use)|omit|exclude|remove).{0,12}(?:${target})`);
  return after.test(text) || before.test(text);
}

function stripExplicitlyNegatedDiagramDetails(text) {
  return text
    .replace(ENGLISH_NEGATED_DIAGRAM_DETAILS, " ")
    .replace(KOREAN_NEGATED_DIAGRAM_DETAILS, " ")
    .replace(ENGLISH_NEGATED_ANNOTATION_LIST, " ")
    .replace(NEGATED_ANNOTATION_LIST, " ");
}

function requestHasUnsupportedAnnotation(text) {
  const stripped = stripExplicitlyNegatedDiagramDetails(text)
    .replace(/무\s*(?:라벨|레이블)|\bunlabell?ed\b/gi, " ")
    .replace(/(?:라벨|레이블|문자|숫자)\s*없이/gi, " ");
  return ANNOTATION_TOKEN.test(stripped);
}

function exactlyOne(text, targetSource) {
  const before = new RegExp(`(?:정확히\\s*)?(?:하나의|한\\s*개(?:의)?|1\\s*개(?:의)?|one|a\\s+single|single|exactly\\s+one)\\s*(?:${targetSource})`, "i");
  const after = new RegExp(`(?:${targetSource})\\s*(?:은|는|이|가|을|를)?\\s*(?:하나|한\\s*개|1\\s*개|one)`, "i");
  return before.test(text) || after.test(text);
}

function mentionCount(text, targetSource) {
  return [...text.matchAll(new RegExp(`(?:${targetSource})`, "gi"))].length;
}

function exactlyOneMention(text, targetSource) {
  return exactlyOne(text, targetSource) && mentionCount(text, targetSource) === 1;
}

const EXPLICIT_MULTIPLE_COUNT_SOURCE =
  "(?:(?<![0-9.])[2-9][0-9]*(?![0-9.])|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열|열한|열두|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";

function hasExplicitMultiple(text, targetSource) {
  const before = new RegExp(
    `(?:${EXPLICIT_MULTIPLE_COUNT_SOURCE})\\s*(?:개(?:의)?\\s*)?(?:추가\\s*)?(?:additional\\s+)?(?:${targetSource})`,
    "i",
  );
  const after = new RegExp(
    `(?:추가\\s*)?(?:additional\\s+)?(?:${targetSource})\\s*(?:은|는|이|가|을|를|도)?\\s*(?:${EXPLICIT_MULTIPLE_COUNT_SOURCE})(?:\\s*개)?`,
    "i",
  );
  return before.test(text) || after.test(text);
}

function requestNumbers(text) {
  return (text.match(/[0-9]+(?:\.[0-9]+)?/g) || []).map(Number);
}

const COUNT_WORD_VALUES = Object.freeze({
  두: 2, 둘: 2, 이: 2,
  세: 3, 셋: 3, 삼: 3,
  네: 4, 넷: 4, 사: 4,
  다섯: 5, 오: 5,
  여섯: 6, 육: 6,
  일곱: 7, 칠: 7,
  여덟: 8, 팔: 8,
  아홉: 9, 구: 9,
  열: 10, 십: 10,
  열한: 11, 십일: 11,
  열두: 12, 십이: 12,
  two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
});
const COUNT_TOKEN_SOURCE =
  "(?:[0-9]{1,3}(?![0-9])|(?:두|둘|이|세|셋|삼|네|넷|사|다섯|오|여섯|육|일곱|칠|여덟|팔|아홉|구|열두|십이|열한|십일|열|십)(?=\\s|개|명|단계|등분|구간|$)|\\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\\b)";

function parseCountToken(token) {
  if (/^[0-9]+$/.test(token)) return Number(token);
  return COUNT_WORD_VALUES[token];
}

function exactScopedCount(text, patternSources, min, max) {
  const values = [];
  for (const source of patternSources) {
    const pattern = new RegExp(source, "gi");
    for (const match of text.matchAll(pattern)) {
      const token = match.groups?.count || match[1];
      const value = parseCountToken(token);
      if (Number.isInteger(value)) values.push(value);
    }
  }
  const unique = [...new Set(values)];
  if (unique.length !== 1) return null;
  if (unique[0] < min || unique[0] > max) return null;
  return unique[0];
}

function panelCount(text) {
  const noun = "(?:패널|입자\\s*상자|상자|용기|비커|플라스크|시험관|panels?|particle\\s*boxes?|boxes?|vessels?|beakers?|flasks?|test\\s*tubes?)";
  return exactScopedCount(text, [
    `panelcount\\s*(?:은|는|이|가|=)?\\s*(?<count>${COUNT_TOKEN_SOURCE})`,
    `(?<count>${COUNT_TOKEN_SOURCE})\\s*(?:개(?:의)?\\s*)?(?:(?:빈|empty)\\s+)?${noun}`,
    `${noun}\\s*(?<count>${COUNT_TOKEN_SOURCE})\\s*(?:개|panels?|boxes?|vessels?)?`,
    `(?<count>${COUNT_TOKEN_SOURCE})\\s*단계(?:의)?\\s*(?:입자|상태|과정|패널|particle|state|process|panel)`,
  ], 2, 5);
}

function particleStates(text) {
  const matches = [];
  const patterns = [
    /(?<state>기체|액체|고체)\s*(?:입자\s*)?(?<count>[0-9]{1,3})\s*개/g,
    /(?<state>gas|liquid|solid)\s*(?<count>[0-9]{1,3})\s*particles?/g,
    /(?<count>[0-9]{1,3})\s*(?<state>gas|liquid|solid)\s*particles?/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      matches.push({
        index: match.index,
        end: match.index + match[0].length,
        state: ({ 기체: "gas", 액체: "liquid", 고체: "solid" })[match.groups.state] || match.groups.state,
        count: Number(match.groups.count),
      });
    }
  }
  matches.sort((a, b) => a.index - b.index || b.end - a.end);
  const unique = matches.filter((entry, index) => (
    index === 0 || entry.index >= matches[index - 1].end
  ));
  if (unique.some((entry) => entry.count < 1 || entry.count > 100)) return null;
  const stateMentions = text.match(/기체|액체|고체|\bgas\b|\bliquid\b|\bsolid\b/g) || [];
  if (stateMentions.length !== unique.length) return null;
  return unique.map(({ state, count }) => ({ state, count }));
}

function matchSimpleSeriesCircuit(text) {
  const hasAllParts = DC_SOURCE.test(text) && CIRCUIT_SWITCH.test(text)
    && CIRCUIT_RESISTOR.test(text) && CIRCUIT_LAMP.test(text);
  if (!SERIES_LOOP.test(text) && !hasAllParts) return null;
  const positiveText = stripExplicitlyNegatedDiagramDetails(text);
  if (requestHasUnsupportedAnnotation(text)) return unmatched("series-circuit-annotation-requested");
  if (SERIES_CIRCUIT_UNSAFE.test(positiveText) || CIRCUIT_VALUE.test(positiveText)
      || requestNumbers(positiveText).some((value) => value !== 1)) {
    return unmatched("series-circuit-branch-component-or-value-unsupported");
  }
  if (CIRCUIT_OTHER_SCENE.test(text)) return unmatched("series-circuit-not-standalone");
  if (hasExplicitMultiple(positiveText, "직류\\s*전원|스위치|개폐기|저항(?:기)?|전구|램프|dc\\s*(?:power\\s*)?sources?|switches?|resistors?|lamps?|bulbs?")
      || /dc\s*(?:power\s*)?sources|switches|resistors|lamps|bulbs/.test(positiveText)) {
    return unmatched("series-circuit-component-count-not-exact");
  }
  if (!SERIES_LOOP.test(text) || !CLOSED_WIRING_LOOP.test(text)) {
    return unmatched("series-circuit-single-closed-loop-not-explicit");
  }
  const open = OPEN_SWITCH.test(text);
  const closed = CLOSED_SWITCH.test(text);
  if (open === closed) return unmatched("series-circuit-switch-state-not-exact");
  if (!exactlyOneMention(text, "직류\\s*전원(?:\\s*장치)?|dc\\s*(?:power\\s*)?source\\b")
      || !exactlyOneMention(text, "(?:열린|닫힌)\\s*(?:상태의\\s*)?(?:스위치|개폐기)|(?:open|closed)\\s+switch\\b|switch\\b")
      || !exactlyOneMention(text, "저항(?:기)?|resistor\\b")
      || !exactlyOneMention(text, "전구|램프|lamp\\b|bulb\\b")) {
    return unmatched("series-circuit-component-count-not-exact");
  }
  if (!LEFT_DC_SOURCE.test(text) || !TOP_SWITCH.test(text)
      || !RIGHT_RESISTOR.test(text) || !BOTTOM_LAMP.test(text)) {
    return unmatched("series-circuit-layout-not-exact");
  }
  return matched("simple_series_circuit", {
    switchState: open ? "open" : "closed",
  }, `local-simple-series-circuit-${open ? "open" : "closed"}`);
}

function matchFixedPulleySpringLoads(text) {
  const hasPulleyAssemblyWords = /도르래|pulley/.test(text) && /용수철|spring/.test(text)
    && /(?:줄|실)|rope|string/.test(text) && /추|load/.test(text);
  if (!FIXED_CEILING_PULLEY.test(text) && !hasPulleyAssemblyWords) return null;
  const positiveText = stripExplicitlyNegatedDiagramDetails(text);
  if (requestHasUnsupportedAnnotation(text)) return unmatched("pulley-annotation-requested");
  if (PULLEY_EQUAL_MASS_CLAIM.test(text)) return unmatched("pulley-equal-mass-claim-unsupported");
  if (PULLEY_UNSAFE.test(positiveText)
      || requestNumbers(positiveText).some((value) => value !== 1)) {
    return unmatched("pulley-complex-or-unsupported");
  }
  if (PULLEY_OTHER_SCENE.test(text)) return unmatched("pulley-not-standalone");
  if (hasExplicitMultiple(positiveText, "도르래|용수철|줄|실|추|pulleys?|springs?|ropes?|strings?|loads?")
      || /pulleys|springs|ropes|strings|loads/.test(positiveText)) {
    return unmatched("pulley-fixed-single-count-not-exact");
  }
  if (!FIXED_CEILING_PULLEY.test(positiveText)
      || !exactlyOneMention(positiveText, "(?:천장.{0,12}고정.{0,8})?도르래|(?:ceiling[-\\s]*fixed\\s+)?pulley\\b")) {
    return unmatched("pulley-fixed-single-count-not-exact");
  }
  if (!ONE_CONTINUOUS_ROPE.test(positiveText)
      || mentionCount(positiveText, "줄|실|rope\\b|string\\b") !== 1) {
    return unmatched("pulley-continuous-rope-not-explicit");
  }
  if (!exactlyOneMention(positiveText, "용수철|spring\\b")) {
    return unmatched("pulley-spring-count-not-exact");
  }
  if (mentionCount(positiveText, "추|loads?\\b") !== 2) {
    return unmatched("pulley-load-layout-or-shape-not-exact");
  }
  if (!LEFT_BLANK_LOAD.test(text) || !RIGHT_SPRING_MATCHED_LOAD.test(text) || !SAME_LOAD_SHAPE.test(text)) {
    return unmatched("pulley-load-layout-or-shape-not-exact");
  }
  return matched("fixed_pulley_spring_loads", {}, "local-fixed-pulley-spring-loads");
}

function matchLensMirrorScreenBench(text) {
  const hasAllParts = CONVEX_LENS.test(text) && /평면\s*거울|plane\s+mirror/.test(text)
    && OPTICAL_SCREEN.test(text);
  if (!OPTICAL_BENCH.test(text) && !hasAllParts) return null;
  const positiveText = stripExplicitlyNegatedDiagramDetails(text);
  if (requestHasUnsupportedAnnotation(text)) return unmatched("optical-bench-annotation-requested");
  if (OPTICS_UNSAFE.test(positiveText)) return unmatched("optical-bench-rays-object-or-detail-unsupported");
  if (OPTICS_OTHER_SCENE.test(text)) return unmatched("optical-bench-not-standalone");
  if (hasExplicitMultiple(positiveText, "볼록\\s*렌즈|평면\\s*거울|스크린|convex\\s+lenses?|plane\\s+mirrors?|screens?")
      || /convex\s+lenses|plane\s+mirrors|screens/.test(positiveText)) {
    return unmatched("optical-bench-component-count-not-exact");
  }
  if (!CONVEX_LENS.test(text) || !PLANE_MIRROR_45.test(text) || !OPTICAL_SCREEN.test(text)) {
    return unmatched("optical-bench-components-or-angle-not-exact");
  }
  if (!exactlyOneMention(text, "볼록\\s*렌즈|convex\\s+lens\\b")
      || !exactlyOneMention(text, "평면\\s*거울|plane\\s+mirror\\b")
      || !exactlyOneMention(text, "스크린|screen\\b")) {
    return unmatched("optical-bench-component-count-not-exact");
  }
  if (!LEFT_CONVEX_LENS.test(text) || !CENTER_PLANE_MIRROR.test(text) || !RIGHT_SCREEN.test(text)) {
    return unmatched("optical-bench-layout-not-exact");
  }
  if (requestNumbers(text).some((value) => value !== 1 && value !== 45)) {
    return unmatched("optical-bench-extra-number-or-distance");
  }
  return matched("lens_mirror_screen_bench", {
    lensKind: "convex_lens",
    mirrorRotation: 45,
  }, "local-lens-mirror-screen-bench");
}

function matchVesselParticleComparison(text) {
  if (!VESSEL_PARTICLE_COMPARISON.test(text)) return null;
  if (requestHasUnsupportedAnnotation(text)) return unmatched("vessel-particle-annotation-requested");
  if (VESSEL_PARTICLE_UNSAFE.test(text)) return unmatched("vessel-particle-state-or-motion-unsupported");
  if (VESSEL_PARTICLE_OTHER_SCENE.test(text)) return unmatched("vessel-particle-not-standalone");
  if (MULTIPLE_VESSEL_PARTICLE_COMPONENTS.test(text)
      || hasExplicitMultiple(text, "비커|입자\\s*상자|beakers?|particle\\s+boxes?")
      || (!SINGULAR_VESSEL_PARTICLE_PAIR.test(text)
        && (!exactlyOne(text, "비커|beaker\\b")
          || !exactlyOne(text, "입자\\s*상자|particle\\s*box\\b")))) {
    return unmatched("vessel-particle-component-count-not-exact");
  }
  if (!LIQUID_045.test(text) || !GAS_PARTICLES.test(text)
      || !SIXTEEN_PARTICLES.test(text) || !CIRCLE_PARTICLES.test(text) || !MIX_FALSE.test(text)) {
    return unmatched("vessel-particle-locked-state-incomplete");
  }
  if (requestNumbers(text).some((value) => ![1, 0.45, 45, 16].includes(value))) {
    return unmatched("vessel-particle-extra-number-or-state");
  }
  return matched("vessel_particle_comparison", {
    vesselKind: "beaker",
    liquid: 0.45,
    particleState: "gas",
    particleCount: 16,
    particleShape: "circle",
    mix: false,
  }, "local-vessel-particle-comparison-locked");
}

function matchLogisticPopulationGraph(text) {
  if (!LOGISTIC_CURVE.test(text) && !S_CURVE.test(text)) return null;
  if (requestHasUnsupportedAnnotation(text)) return unmatched("logistic-annotation-requested");
  if (LOGISTIC_UNSAFE.test(text)) return unmatched("logistic-values-context-or-series-unsupported");
  if (LOGISTIC_OTHER_SCENE.test(text)) return unmatched("logistic-not-standalone");
  if (hasExplicitMultiple(text, "곡선|그래프|계열|개체군|curves?|graphs?|series|populations?")
      || /curves|graphs|populations/.test(text)) {
    return unmatched("logistic-values-context-or-series-unsupported");
  }
  if (!LOGISTIC_CURVE.test(text) || !S_CURVE.test(text) || !POPULATION_WORD.test(text)
      || !GENERIC_CURVE.test(text) || !SINGLE_CURVE.test(text) || !UNLABELED_CURVE.test(text)) {
    return unmatched("logistic-generic-single-unlabeled-curve-not-explicit");
  }
  if (requestNumbers(text).length > 0) return unmatched("logistic-numeric-detail-unsupported");
  return matched("logistic_population_graph", {}, "local-logistic-population-graph");
}

function matchPanelFlow(text) {
  if (!PANEL_FLOW_WORD.test(text)) return null;
  if (requestHasUnsupportedAnnotation(text)) return unmatched("panel-annotation-requested");
  if (PANEL_OTHER_SCENE.test(text)) return unmatched("panel-not-standalone");
  const count = panelCount(text);
  if (count == null) return unmatched("panel-count-not-exact");

  const particle = PANEL_PARTICLE_BOX.test(text);
  const box = PANEL_BOX.test(text);
  const vessels = PANEL_VESSELS.filter((item) => item.pattern.test(text));
  const typeCount = Number(particle) + Number(box) + Number(vessels.length > 0);
  if (typeCount !== 1 || vessels.length > 1) return unmatched("panel-type-ambiguous");
  if (!particle && PANEL_UNSUPPORTED_STATE.test(text)) return unmatched("panel-state-unsupported");
  if (particle && !PANEL_SEQUENCE.test(text)) return unmatched("particle-panel-order-not-explicit");

  if (particle) {
    const states = particleStates(text);
    if (!states || states.length !== count) return unmatched("particle-panel-states-incomplete");
    if (!PANEL_CONNECTOR.test(text)) return unmatched("panel-connectors-not-explicit");
    return matched("panel_flow", {
      panelCount: count,
      panelType: "particlebox",
      states,
      connectors: true,
    }, "local-panel-flow-particlebox");
  }

  if (!PANEL_CONNECTOR.test(text)) return unmatched("panel-connectors-not-explicit");

  if (box) {
    return matched("panel_flow", {
      panelCount: count,
      panelType: "box",
      states: Array.from({ length: count }, () => ({ tone: "white" })),
      connectors: true,
    }, "local-panel-flow-empty-box");
  }

  if (!PANEL_EMPTY.test(text)) return unmatched("vessel-panel-empty-state-not-explicit");
  return matched("panel_flow", {
    panelCount: count,
    panelType: "vessel",
    vesselKind: vessels[0].id,
    states: Array.from({ length: count }, () => ({ liquid: 0 })),
    connectors: true,
  }, `local-panel-flow-empty-${vessels[0].id}`);
}

function dualAxisTickCount(text) {
  return exactScopedCount(text, [
    `tickcount\\s*(?:은|는|이|가|=)?\\s*(?<count>${COUNT_TOKEN_SOURCE})`,
    `눈금\\s*(?:은|는|을|를)?\\s*(?<count>${COUNT_TOKEN_SOURCE})\\s*(?:등분|구간)`,
    `(?<count>${COUNT_TOKEN_SOURCE})\\s*(?:등분|구간)(?:의)?\\s*눈금`,
    `(?<count>${COUNT_TOKEN_SOURCE})\\s*(?:equal\\s+)?(?:divisions?|intervals?|ticks?)`,
  ], 2, 12);
}

function matchDualAxisPlot(text) {
  if (!DUAL_AXIS_WORD.test(text)) return null;
  if (requestHasUnsupportedAnnotation(text)) return unmatched("dual-axis-annotation-requested");
  if (!DUAL_X_AXIS.test(text)) return unmatched("dual-axis-x-axis-not-explicit");
  if (!DUAL_BLANK.test(text)) return unmatched("dual-axis-empty-scaffold-not-explicit");
  if (DUAL_UNSUPPORTED.test(text)) return unmatched("dual-axis-series-or-grid-unsupported");
  if (DUAL_OTHER_SCENE.test(text)) return unmatched("dual-axis-not-standalone");
  const tickCount = dualAxisTickCount(text);
  if (tickCount == null) return unmatched("dual-axis-tick-count-not-exact");
  return matched("dual_axis_plot", {
    tickCount,
    leftSeries: [],
    rightSeries: [],
    grid: false,
  }, "local-dual-axis-empty-scaffold");
}

function wiringNodesAndEdges(strategy) {
  if (strategy === "orthogonal") {
    return {
      nodes: [
        { id: "a", at: [-48, -24] }, { id: "b", at: [48, -24] },
        { id: "c", at: [48, 24] }, { id: "d", at: [-48, 24] },
      ],
      edges: [
        { from: "a", to: "b" }, { from: "b", to: "c" },
        { from: "c", to: "d" }, { from: "d", to: "a" },
      ],
    };
  }
  return {
    nodes: [
      { id: "a", at: [-48, 26] }, { id: "b", at: [0, -28] }, { id: "c", at: [48, 26] },
    ],
    edges: [
      { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" },
    ],
  };
}

function exactWiringNodeCount(text, expected) {
  const count = exactScopedCount(text, [
    `(?<count>${COUNT_TOKEN_SOURCE})\\s*(?:개(?:의)?\\s*)?(?:단자(?:점)?|노드|꼭짓점|terminal\\s*nodes?|terminals?|nodes?|corners?|vertices)`,
    `(?:단자(?:점)?|노드|terminal\\s*nodes?|terminals?|nodes?)\\s*(?<count>${COUNT_TOKEN_SOURCE})\\s*(?:개)?`,
  ], expected, expected);
  return count === expected;
}

function matchWiring(text) {
  if (!WIRING_WORD.test(text)) return null;
  const orthogonal = ORTHOGONAL_WORD.test(text);
  const diagonal = DIAGONAL_WORD.test(text);
  if (!orthogonal && !diagonal) return null;
  if (requestHasUnsupportedAnnotation(text)) return unmatched("wiring-annotation-requested");
  if (orthogonal && diagonal) return unmatched("wiring-strategy-conflict");
  if (WIRING_UNSUPPORTED.test(text)) return unmatched("wiring-component-or-topology-unsupported");
  if (WIRING_OTHER_SCENE.test(text)) return unmatched("wiring-not-standalone");
  if (!WIRING_SCAFFOLD_ONLY.test(text)) return unmatched("wiring-scaffold-only-not-explicit");
  if (!CLOSED_LOOP.test(text) || !SOLID_WIRE.test(text)) {
    return unmatched("wiring-loop-or-line-style-not-explicit");
  }
  if (!TERMINAL_WORD.test(text)) return unmatched("wiring-terminals-not-explicit");

  const strategy = orthogonal ? "orthogonal" : "diagonal";
  const expectedNodes = orthogonal ? 4 : 3;
  const shapeMatches = orthogonal ? RECTANGULAR_LOOP.test(text) : TRIANGULAR_LOOP.test(text);
  if (!shapeMatches || !exactWiringNodeCount(text, expectedNodes)) {
    return unmatched("wiring-shape-or-node-count-not-exact");
  }
  const topology = wiringNodesAndEdges(strategy);
  return matched(`${strategy}_wiring`, {
    ...topology,
    showNodes: true,
  }, `local-${strategy}-wiring-closed-loop`);
}

function contourCount(text) {
  return exactScopedCount(text, [
    `(?<count>${COUNT_TOKEN_SOURCE})\\s*(?:개(?:의)?\\s*)?(?:닫힌\\s*|열린\\s*|평행한?\\s*|중첩된?\\s*|closed\\s+|open\\s+|parallel\\s+|nested\\s+)?(?:등치선|등고선|아이소라인|contours?|isolines?)`,
    `(?:등치선|등고선|아이소라인|contours?|isolines?)(?:\\s*(?:묶음|도식|골격|bundle|scaffold))?\\s*(?<count>${COUNT_TOKEN_SOURCE})\\s*(?:개|lines?)?`,
    `count\\s*(?:은|는|이|가|=)?\\s*(?<count>${COUNT_TOKEN_SOURCE})`,
  ], 2, 12);
}

function matchContourBundle(text) {
  if (!CONTOUR_WORD.test(text)) return null;
  if (requestHasUnsupportedAnnotation(text)) return unmatched("contour-annotation-requested");
  if (!CONTOUR_SCAFFOLD.test(text) || !VALUELESS_CONTOUR.test(text)) {
    return unmatched("contour-generic-valueless-scaffold-not-explicit");
  }
  if (CONTOUR_UNSUPPORTED.test(text)) return unmatched("contour-map-or-overlay-unsupported");
  if (CONTOUR_OTHER_SCENE.test(text)) return unmatched("contour-not-standalone");
  const nested = NESTED_CONTOUR.test(text);
  const parallel = PARALLEL_CONTOUR.test(text);
  if (nested === parallel) return unmatched("contour-variant-not-exact");
  if ((nested && !CLOSED_CONTOUR.test(text)) || (parallel && !OPEN_CONTOUR.test(text))) {
    return unmatched("contour-open-closed-state-not-exact");
  }
  const count = contourCount(text);
  if (count == null) return unmatched("contour-count-not-exact");
  return matched("contour_bundle", {
    count,
    variant: nested ? "nested" : "parallel",
  }, `local-contour-bundle-${nested ? "nested" : "parallel"}`);
}

function matchVerifiedMap(text) {
  const variants = MAP_VARIANTS.filter((item) => item.pattern.test(text));
  if (!variants.length) return null;
  if (variants.length !== 1) return unmatched("ambiguous-map-variant");
  if (MAP_UNSAFE_OR_OVERLAY.test(text)) return unmatched("map-overlay-or-unsafe-content");
  if (!COASTLINE_REQUEST.test(text) || !MAP_WORD.test(text)) {
    return unmatched("map-physical-coastline-not-explicit");
  }
  if (targetIsNegated(text, `${variants[0].pattern.source}|해안선|coastline`)) {
    return unmatched("map-target-negated");
  }
  if (MAP_OTHER_SCENE.test(text)) return unmatched("map-not-standalone");
  return matched(
    "verified_map_outline",
    { variant: variants[0].id, fillLand: false },
    `local-verified-map-outline:${variants[0].id}`,
  );
}

function matchStudentTrio(text) {
  if (!STUDENT_WORD.test(text)) return null;
  if (targetIsNegated(text, "학생|students?")) return unmatched("student-target-negated");
  if (!TRIO_COUNT.test(text)) {
    return unmatched(OTHER_PERSON_COUNT.test(text) ? "student-count-conflict" : "student-trio-count-not-explicit");
  }
  if (OTHER_PERSON_COUNT.test(text)) return unmatched("student-count-conflict");
  if (!SEATED.test(text) || !TABLE.test(text) || !DIALOGUE.test(text)) {
    return unmatched("student-scene-incomplete");
  }
  if (STUDENT_EXTRA.test(text)) return unmatched("student-scene-has-extra-object");
  if (MULTIPLE_TABLES.test(text)) return unmatched("student-table-count-conflict");
  if (RECT_SHAPE.test(text) && ROUND_SHAPE.test(text)) return unmatched("student-table-shape-conflict");
  if (/서(?:서|있는)|standing/.test(text)) return unmatched("student-pose-conflict");
  if (/대화.{0,8}(?:하지\s*않|안\s*하)|not\s+(?:talking|discussing)/.test(text)) {
    return unmatched("student-dialogue-negated");
  }

  const options = {
    tableShape: ROUND_SHAPE.test(text) ? "round" : "rect",
    speechBubbles: "none",
  };
  if (SPEECH_BUBBLE.test(text) && !SPEECH_BUBBLE_NEGATED.test(text)) {
    if (SPEECH_BUBBLE_COUNT_CONFLICT.test(text)) return unmatched("speech-bubble-count-conflict");
    if (SPEECH_BUBBLE_TEXT.test(text)) return unmatched("speech-bubble-text-unsupported");
    options.speechBubbles = "three_blank";
    options.speechBubbleEvidence = "request";
  }
  return matched(
    "student_trio_seated_dialogue",
    options,
    "local-student-trio-seated-dialogue",
  );
}

function matchSpacecraft(text) {
  if (!SPACECRAFT_WORD.test(text)) return null;
  if (targetIsNegated(text, "우주선|spacecraft|space\\s*ship|spaceship")) {
    return unmatched("spacecraft-target-negated");
  }
  if (SPACECRAFT_UNSAFE.test(text)) return unmatched("spacecraft-complex-or-unsupported");
  if (MULTIPLE_SPACECRAFT.test(text)) return unmatched("spacecraft-count-conflict");
  // "평면 거울" describes a device, not the dimensionality of the shell.
  const shellDescription = text.replace(/평면\s*거울|plane\s*mirror/g, " device ");
  if (!SIMPLE_WORD.test(text) || !FLAT_WORD.test(shellDescription) || !SHELL_WORD.test(text)) {
    return unmatched("spacecraft-shell-not-explicit");
  }
  if (SPACECRAFT_OTHER_OBJECT.test(text)) return unmatched("spacecraft-has-extra-object");
  if (LONG_SHELL.test(text) && COMPACT_SHELL.test(text)) return unmatched("spacecraft-proportion-conflict");
  if (LEFT_DIRECTION_WORD.test(text) && RIGHT_DIRECTION_WORD.test(text)) {
    return unmatched("spacecraft-facing-conflict");
  }

  const options = {};
  if (LONG_SHELL.test(text)) options.proportions = "long";
  if (COMPACT_SHELL.test(text)) options.proportions = "compact";
  if (LEFT_FACING.test(text)) options.facing = "left";
  if (RIGHT_FACING.test(text)) options.facing = "right";

  const windowMentioned = WINDOW_WORD.test(text) && !WINDOW_NEGATED.test(text);
  if (MULTIPLE_WINDOWS.test(text)) return unmatched("spacecraft-window-count-conflict");
  if (windowMentioned) {
    options.window = WIDE_WINDOW.test(text) ? "wide" : "single";
    if (SINGLE_WINDOW.test(text)) options.window = "single";
    if (WIDE_WINDOW.test(text) && SINGLE_WINDOW.test(text)) return unmatched("spacecraft-window-conflict");
  }

  const occupantMentioned = ANY_OCCUPANT.test(text);
  if (MULTIPLE_OCCUPANTS.test(text)) return unmatched("spacecraft-occupant-count-conflict");
  if (occupantMentioned && !SEATED_OCCUPANT.test(text)) {
    return unmatched("spacecraft-occupant-pose-not-explicit");
  }
  if (SEATED_OCCUPANT.test(text)) options.occupant = "seated";

  const devices = [
    ["point_source", POINT_SOURCE],
    ["detector_box", DETECTOR],
    ["plane_mirror", PLANE_MIRROR],
  ].filter(([, pattern]) => pattern.test(text));
  if (NEGATED_DEVICE.test(text)) return unmatched("spacecraft-device-negated");
  if (MULTIPLE_SAME_DEVICE.test(text)) return unmatched("spacecraft-device-count-conflict");
  if (devices.length > 1) return unmatched("spacecraft-device-conflict");
  if (ANY_DEVICE.test(text) && devices.length !== 1) return unmatched("spacecraft-device-ambiguous");
  if (devices.length === 1) options.device = devices[0][0];

  const needsWindow = options.occupant === "seated" || Boolean(options.device);
  if (needsWindow && !windowMentioned) return unmatched("spacecraft-window-required");
  if (options.occupant === "seated" && options.device && options.window !== "wide") {
    return unmatched("spacecraft-wide-window-required");
  }

  if (options.device) {
    const slots = [
      ["rear", REAR_SLOT], ["center", CENTER_SLOT], ["front", FRONT_SLOT],
    ].filter(([, pattern]) => pattern.test(text));
    if (slots.length > 1) return unmatched("spacecraft-device-slot-conflict");
    if (slots.length === 1) options.deviceSlot = slots[0][0];
    if (options.occupant === "seated" && options.deviceSlot === "rear") {
      return unmatched("spacecraft-rear-slot-reserved");
    }
  }

  return matched("spacecraft_flat_shell", options, "local-spacecraft-flat-shell");
}

/**
 * Return one model-free high-level motif request only for a strict exact match.
 * All misses fail closed and should continue through the normal engine router.
 */
export function matchLocalAssetRequest({
  request = "",
  mode = "diagram",
  references = [],
} = {}) {
  if (mode !== "diagram") return unmatched("diagram-mode-only");
  if (referencesPresent(references)) return unmatched("references-present");
  const text = normalizeRequest(request);
  if (!text) return unmatched("empty-or-invalid-request");
  if (DESTRUCTIVE_EDIT_REQUEST.test(text)) return unmatched("destructive-or-negative-edit-request");
  if (REVISION_REQUEST.test(text)) return unmatched("revision-request");

  const matchers = [
    matchVerifiedMap,
    matchStudentTrio,
    matchSpacecraft,
    matchSimpleSeriesCircuit,
    matchFixedPulleySpringLoads,
    matchLensMirrorScreenBench,
    matchVesselParticleComparison,
    matchLogisticPopulationGraph,
    matchPanelFlow,
    matchDualAxisPlot,
    matchWiring,
    matchContourBundle,
  ];
  for (const matcher of matchers) {
    const result = matcher(text);
    if (result) return result;
  }
  return unmatched("no-exact-local-asset-match");
}
