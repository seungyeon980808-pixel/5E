/* ===== AI IMAGE ENGINE ROUTER ============================================
 *
 * Keep this router conservative.  A fast-scene false positive costs more than
 * a raster fallback because the scene compiler will fail (or, worse, produce
 * an over-simplified scientific illustration) before the raster retry starts.
 *
 * Rule order is intentional:
 *   explicit force > exact audited assets > unsupported visual content >
 *   diagram-mode conflicts > supported vector families > reference-only
 *   structural edit > fallback.
 */

const OMITTABLE_RASTER_NOUN =
  "사람|인물|학생|교사|손|손가락|인체|동물|식물|자동차|버스|열차|자전거|우주선|로켓|비행기|선박";

const OMIT_AFTER_NOUN = new RegExp(
  `(?:${OMITTABLE_RASTER_NOUN})(?:은|는|이|가|을|를|과|와|도|만)?\\s*` +
  "(?:없이|제거(?!하지)|삭제(?!하지)|빼(?!지\\s*말)|없애(?!지)|제외(?!하지)|생략(?!하지)|그리지\\s*마)",
  "gi",
);

const OMIT_BEFORE_NOUN = new RegExp(
  "(?:제거|삭제|제외|생략)(?!하지)(?:할|해|하고|한|된|시킨|시켜)?\\s*" +
  `(?:${OMITTABLE_RASTER_NOUN})(?:은|는|이|가|을|를|과|와|도|만)?`,
  "gi",
);

const RASTER_RULES = Object.freeze([
  {
    id: "people-hands-anatomy",
    pattern: /사람|인물|학생|교사|손(?:가락|바닥|등|목|톱|금)?(?:은|는|이|가|을|를|과|와|으로|에서|만|도|\s|$)|인체|해부|장기(?:의|가|를|는|\s*구조|\s*모형|$)|뼈|근육|피부|척수|홍채|망막|각막|눈의?\s*구조|폐포|혈관/,
  },
  {
    id: "biological-illustration",
    pattern: /동물|식물|어류|곤충|조류|새(?:의|가|를|는|\s|$)|포유류|생물\s*(?:세밀화|삽화)|세포(?:막|질|핵|벽|\s*소기관|\s*구조)|소기관|미토콘드리아|엽록체|리보솜|뉴런|신경세포|효소\s*모양|단백질\s*복합체|세균\s*형태|음식|식품/,
  },
  {
    id: "exact-geography",
    pattern: /(?:정확|실제|실측|지명|행정구역|국경|위도|경도).{0,12}(?:지도|해안선|대륙)|(?:지도|해안선|대륙).{0,12}(?:정확|실제|실측|지명|행정구역|국경|위도|경도)|(?:세계|태평양|동아시아).{0,12}(?:지도|해안선|해안\s*윤곽|대륙)|(?:지도|해안선|해안\s*윤곽|대륙).{0,12}(?:세계|태평양|동아시아)|한반도|대한민국\s*지도|대륙\s*윤곽|지형도|지질도|일기도\s*지도/,
  },
  {
    id: "photographic-material",
    pattern: /사진|사실적|실사|실물처럼|사진처럼|위성\s*영상|구름\s*영상|현미경\s*(?:사진|영상|세밀화)|암석\s*(?:사진|표본)|화석\s*(?:사진|표본)/,
  },
  {
    id: "complex-vehicle-or-product",
    pattern: /우주선|로켓|자동차|버스|열차|기차|자전거|비행기|항공기|드론|선박|배(?:의|가|를|는|\s)+(?:모양|구조|외형)|전자레인지|노트북|랩톱|컴퓨터|스마트워치|카메라|현미경|가전제품|칠판|화이트보드/,
  },
  {
    id: "neural-reflex-conflict",
    pattern: /무릎\s*반사|척수\s*반사|반사\s*신경|반사궁|신경\s*반사/,
  },
]);

// These objects intrinsically render a glyph/arrow in the current native
// compiler.  그림형 must therefore skip the scene attempt and go straight to
// the safer raster path.  완성형 is allowed to use them.
const DIAGRAM_CONFLICT =
  /전류계|전압계|검류계|미지\s*소자|모터|전동기|트랜지스터|막대\s*자석|저울|전기력선|자기력선|방향\s*화살표/;

/*
 * Three illustration families have audited, closed code-native assets.  They
 * are deliberately matched with predicates instead of adding their broad
 * nouns (학생, 우주선, 지도) to FAST_RULES.  Any missing qualifier or extra
 * content therefore falls through to the raster rules below.
 */
const STRICT_OMITTABLE_FEATURE =
  "교사|선생님?|교수|칠판|화이트보드|스크린|게시판|실험\s*장치|실험\s*기구|도르래|용수철|스프링|회로|전지|저항|렌즈|거울|비커|플라스크|시험관|수레|블록|" +
  "로켓|엔진|추진기|분사구|화염|날개|꼬리날개|핀|안테나|착륙장치|바퀴|태양전지판|탑승자|우주비행사|승무원|창문|광원|검출기|" +
  "국경|정치적\s*경계|행정(?:구역|\s*경계)?|지명|도시|국가명|나라\s*이름|라벨|문자|글자|텍스트|숫자|기호|위도|경도|격자|축척|범례|" +
  "지질|지층|지형|고도|산맥|하천|호수|등고선|등치선|등압선|기압|일기도|날씨|기상|구름|태풍|강수|온도|해류|바람|경로|항로|루트|궤적|화살표|마커|위치\s*표시|오버레이";

const STUDENT_TRIO_COUNT =
  /(?:학생\s*(?:세|3)\s*명|(?:세|3)\s*명의?\s*학생|학생\s*3\s*인|3\s*인의?\s*학생)/;
const STUDENT_TRIO_SEATED = /착석|둘러앉|앉아|앉은|앉아서|앉아\s*있는/;
const STUDENT_TRIO_TABLE = /탁자|테이블|책상/;
const STUDENT_TRIO_DIALOGUE = /대화|토론|이야기|말풍선/;
const STUDENT_TRIO_FORBIDDEN =
  /교사|선생님?|교수|칠판|화이트보드|스크린|게시판|사람|인물|어른|아이|아동|부모|남성|여성|남자|여자|서\s*있는|서있는|도르래|용수철|스프링|회로|전지|저항|전류계|전압계|검류계|모터|전동기|트랜지스터|자석|저울|렌즈|거울|슬릿|광원|광전관|비커|플라스크|시험관|피스톤|뷰렛|깔때기|U\s*자관|용기|액체|기체|고체|입자|수레|블록|나침반|스피커|장치|기구|실험|관찰|측정|그래프|좌표|가계도|지도|우주선|로켓|문자|글자|텍스트|라벨|숫자|기호|화살표/;
const PERSON_COUNT = /(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|\d+)\s*명/g;
const MULTIPLE_TABLES =
  /(?:두|2|여러|복수|각각의?)\s*(?:개(?:의)?\s*)?(?:탁자|테이블|책상)|(?:탁자|테이블|책상)\s*(?:두|2|여러|복수)\s*개/;

const SPACECRAFT_SIMPLE = /단순|간단|평면|납작|플랫|2\s*D|이차원/;
const SPACECRAFT_SHELL = /껍질|쉘|외형|외곽|윤곽|선체|본체/;
const SPACECRAFT_FORBIDDEN =
  /로켓|엔진|추진|분사|화염|날개|핀|안테나|착륙|바퀴|태양전지|패널|복잡|정밀|사실적|실사|사진|3\s*D|입체|항공기|비행기|자동차|차량|사람|인물|우주비행사|탑승자|승무원|창문|광원|검출기|거울|장치|배경|행성|별|문자|글자|텍스트|라벨|숫자|기호|화살표|경로|궤적/;

const VERIFIED_MAP_VARIANTS = Object.freeze([
  { id: "world", pattern: /세계(?:\s*전체)?/ },
  { id: "pacific", pattern: /태평양/ },
  { id: "east_asia", pattern: /동아시아/ },
  { id: "korean_peninsula", pattern: /한반도/ },
]);
const PHYSICAL_COASTLINE = /해안선|해안\s*윤곽/;
const COASTLINE_ONLY =
  /(?:해안선|해안\s*윤곽)(?:\s*(?:윤곽|외곽|선화))?\s*(?:만|뿐)|(?:물리적|자연)\s*(?:해안선|해안\s*윤곽)|(?:해안선|해안\s*윤곽)\s*(?:윤곽|외곽|선화)/;
const VERIFIED_MAP_FORBIDDEN =
  /국경|정치|행정|시도|도시|국가명|나라\s*이름|지명|명칭|라벨|문자|글자|텍스트|숫자|기호|위도|경도|격자|축척|범례|지질|지층|지형|고도|산맥|하천|강(?:은|는|이|가|을|를|과|와|의|\s|,|$)|호수|등고선|등치선|등압선|기압|일기도|날씨|기상|구름|태풍|강수|온도|해류|바람|경로|항로|루트|궤적|이동|화살표|마커|위치\s*표시|표시점|오버레이|겹치|장치|그래프/;

const FAST_RULES = Object.freeze([
  {
    id: "circuit",
    pattern: /회로|도선|전선|배선|전지|전원|저항|축전기|콘덴서|코일|인덕터|다이오드|LED|전구|램프|스위치|개폐기|솔레노이드|직류|교류/,
  },
  {
    id: "mechanics-apparatus",
    pattern: /도르래|용수철|스프링|수레|블록|경사면|빗면|(?:^|\s)추(?:는|를|가|와|의|만|도)?(?:\s|$)|수평면|레일|진자|질점|매달린\s*물체|실에\s*매단|포물선\s*궤적|충돌\s*(?:전후|과정|장치)/,
  },
  {
    id: "optics",
    pattern: /렌즈|거울|광학|스크린|광원|점광원|슬릿|굴절|광선|매질|전반사|입사각|반사각|빛.{0,8}반사|반사.{0,8}빛|간섭\s*무늬|회절\s*무늬|광전관/,
  },
  {
    id: "laboratory-vessel",
    pattern: /비커|플라스크|시험관|눈금\s*실린더|메스\s*실린더|용기|피스톤|뷰렛|깔때기|U\s*자관|유자관|스포이트|스톱콕|유리콕|꼭지|마개|액체|기체|고체|입자\s*(?:배열|모형|상자)|온도계|검전기|나침반|스피커|전극|염다리/,
  },
  {
    id: "chart-or-graph",
    pattern: /그래프|좌표(?:축|평면)?|곡선|산점도|막대\s*그래프|원\s*그래프|이중\s*(?:축|y축)|좌우\s*y축|에너지\s*준위|상평형\s*(?:그림|곡선)|적정\s*곡선/,
  },
  {
    id: "repeated-panel-flow",
    pattern: /패널|과정\s*(?:배열|도식|순서)|상태\s*변화\s*(?:전후|과정|도식)|반응\s*전후\s*(?:배치|도식)|나란히\s*(?:배치|비교)|단계별\s*(?:배치|도식)/,
  },
  {
    id: "native-routing-motif",
    pattern: /직교\s*배선|대각선\s*배선|꺾은\s*배선|등고선|등치선|등압선|등수심선|윤곽선\s*묶음|등치선\s*묶음/,
  },
  {
    id: "generic-coastline-schematic",
    pattern: /(?:개략|모식|임의|단순)\s*(?:해안선|해안\s*윤곽)|(?:해안선|해안\s*윤곽)\s*(?:개략|모식|임의|단순)/,
  },
  {
    id: "simple-science-structure",
    pattern: /가계도|염색체\s*배열|구조도|장치도|회로도|모식도|블록\s*다이어그램/,
  },
]);

const REFERENCE_EDIT =
  /문자|숫자|기호|화살표|라벨|지시선|선화|평가원|배치|구조|재구성|옮|이동|삭제|제거|추가|간격|비율|크기|위치|정렬|회전|대칭/;

export const IMAGE_ENGINE_IDS = Object.freeze({
  FAST_SCENE: "fast-scene",
  RASTER: "raster",
});

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[·ㆍ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutPositivelyOmittedFeatures(text, featureSource = STRICT_OMITTABLE_FEATURE) {
  const particle = "(?:은|는|이|가|을|를|과|와|도|만)?";
  const item = `(?:${featureSource})${particle}`;
  const list = `${item}(?:\\s*(?:,|및|과|와)\\s*${item})*`;
  const after = new RegExp(
    `${list}\\s*(?:없이|제거(?!하지)|삭제(?!하지)|제외(?!하지)|생략(?!하지)|빼(?!지)|없애(?!지)|` +
      "그리지\\s*(?:말|않)|넣지\\s*(?:말|않)|표시하지\\s*(?:말|않)|추가하지\\s*(?:말|않)|포함하지\\s*(?:말|않))",
    "gi",
  );
  const before = new RegExp(
    "(?:제거|삭제|제외|생략)(?!하지)(?:할|해|하고|한|된|시킨|시켜)?\\s*" + list,
    "gi",
  );
  return text
    .replace(after, " 제거 ")
    .replace(before, " 제거 ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesStudentTrioAsset(text) {
  const checked = withoutPositivelyOmittedFeatures(text);
  if (!STUDENT_TRIO_COUNT.test(checked)
      || !STUDENT_TRIO_SEATED.test(checked)
      || !STUDENT_TRIO_TABLE.test(checked)
      || !STUDENT_TRIO_DIALOGUE.test(checked)
      || STUDENT_TRIO_FORBIDDEN.test(checked)
      || MULTIPLE_TABLES.test(checked)) {
    return false;
  }
  const counts = [...checked.matchAll(PERSON_COUNT)].map((match) => match[0].replace(/\s/g, ""));
  return counts.length === 1 && /^(?:세|3)명$/.test(counts[0]);
}

function matchesSpacecraftShellAsset(text) {
  const checked = withoutPositivelyOmittedFeatures(text);
  return /우주선/.test(checked)
    && SPACECRAFT_SIMPLE.test(checked)
    && SPACECRAFT_SHELL.test(checked)
    && !SPACECRAFT_FORBIDDEN.test(checked);
}

function matchVerifiedMapAsset(text) {
  const checked = withoutPositivelyOmittedFeatures(text);
  const variants = VERIFIED_MAP_VARIANTS.filter(({ pattern }) => pattern.test(checked));
  if (variants.length !== 1
      || !PHYSICAL_COASTLINE.test(checked)
      || !COASTLINE_ONLY.test(checked)
      || VERIFIED_MAP_FORBIDDEN.test(checked)) {
    return null;
  }
  return variants[0].id;
}

function matchStrictAuditedAsset(text, outputMode) {
  if (outputMode !== "diagram") return null;
  if (matchesStudentTrioAsset(text)) return { id: "student_trio_seated_dialogue" };
  if (matchesSpacecraftShellAsset(text)) return { id: "spacecraft_flat_shell" };
  const mapVariant = matchVerifiedMapAsset(text);
  return mapVariant ? { id: "verified_map_outline", variant: mapVariant } : null;
}

/**
 * Remove only positively worded omissions before checking raster-only nouns.
 * “사람을 제거하고 도르래만” can use the scene path; “사람을 제거하지
 * 말고” deliberately remains raster-only.
 */
function withoutOmittedRasterSubjects(text) {
  return text
    .replace(OMIT_AFTER_NOUN, " 제거 ")
    .replace(OMIT_BEFORE_NOUN, " 제거 ")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutNegatedExactGeography(text) {
  return text.replace(
    /정확(?:한|하게)?\s*(?:지형|지도|해안선|윤곽)?(?:이|가)?\s*(?:아닌|아니고|필요\s*없(?:는|이)?)/g,
    "개략 ",
  );
}

function firstMatchingRule(rules, text) {
  return rules.find((rule) => rule.pattern.test(text)) || null;
}

export function chooseImageEngine({ request = "", mode = "diagram", references = [], force = "auto" } = {}) {
  if (force === IMAGE_ENGINE_IDS.FAST_SCENE || force === IMAGE_ENGINE_IDS.RASTER) {
    return { engine: force, reason: "forced" };
  }

  const text = normalizeText(request);
  const outputMode = mode === "complete" ? "complete" : "diagram";
  const strictAsset = matchStrictAuditedAsset(text, outputMode);
  if (strictAsset) {
    return {
      engine: IMAGE_ENGINE_IDS.FAST_SCENE,
      reason: "supported-science-motif",
      rule: strictAsset.id,
      ...(strictAsset.variant ? { variant: strictAsset.variant } : {}),
    };
  }
  const rasterText = withoutNegatedExactGeography(withoutOmittedRasterSubjects(text));
  const rasterRule = firstMatchingRule(RASTER_RULES, rasterText);
  if (rasterRule) {
    return {
      engine: IMAGE_ENGINE_IDS.RASTER,
      reason: "illustration-required",
      rule: rasterRule.id,
    };
  }

  if (outputMode === "diagram" && DIAGRAM_CONFLICT.test(rasterText)) {
    return {
      engine: IMAGE_ENGINE_IDS.RASTER,
      reason: "diagram-symbol-conflict",
      rule: "diagram-intrinsic-symbol",
    };
  }

  const fastRule = firstMatchingRule(FAST_RULES, text);
  if (fastRule) {
    return {
      engine: IMAGE_ENGINE_IDS.FAST_SCENE,
      reason: "supported-science-motif",
      rule: fastRule.id,
    };
  }

  if (outputMode === "diagram" && references.length && REFERENCE_EDIT.test(text)) {
    return { engine: IMAGE_ENGINE_IDS.FAST_SCENE, reason: "reference-structure-edit" };
  }

  return { engine: IMAGE_ENGINE_IDS.RASTER, reason: "unclassified-fallback" };
}
