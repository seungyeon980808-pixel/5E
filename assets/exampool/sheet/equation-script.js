// 학교 양식 수식 글 손질(11-02): 한글 엔진(rhwp)이 그리는 모양을 바로잡는다. 카드에 적힌 수식은 그대로 두고 한글 문서에 넣는 글만 바꾼다.
// 1) 아래·위첨자를 같이 쓰면(NO_{3}^{-}) 엔진이 위첨자를 너무 낮게 놓아 3과 −가 겹친다 → 아래첨자까지를 묶고 위첨자를 그 묶음에 붙인다
//    ({NO_{3}}^{-}는 ₃ 뒤 위쪽에 −를 겹치지 않게 그림, 실측). 합·곱·적분·극한은 첨자가 위아래 한계라 그대로 둔다.
// 2) 수식 안 글(\text{중 분자량이})의 빈칸을 엔진이 지워 「중분자량이」로 붙여 그린다 → ¼ 빈칸 `로(실측: ~보다 좁아 분수가 덜 넓어지고 띄어 보임).
// 3) 화살표(→ ⇌ 등)가 앞뒤 글자에 붙어 겹친다(「cH⁺→aX」의 →와 a) → 양쪽에 수식 빈칸 ~(\, 는 너무 넓고 ` 는 한쪽만 먹음, 실측).
// 묶음 { }: 집합 괄호 \{ \}는 묶음으로 세지 않는다(GPT 검토 11-02: \{a\}_{1}^{2}가 깨졌다). 세 겹까지.
const IN=String.raw`(?:\\.|[^{}\\])`,GROUP=String.raw`(?<!\\)\{(?:${IN}|\{(?:${IN}|\{${IN}*\})*\})*\}`;
const ARG=String.raw`(?:${GROUP}|\\[A-Za-z]+|[^\s{}\\^_])`;
// 밑: 명령+묶음(\sqrt{x}·\mathrm{Na}) 통째, 명령, 묶음, 글자 하나. 앞이 }나 글자인 묶음(\frac{x}{y}의 {y}, \sqrt{x}의 {x})은 그 명령의 인자라 밑으로 보지 않는다
// — 첨자를 분모·근호 안으로 옮겼다(GPT 검토).
const BASE=String.raw`(\\[A-Za-z]+${GROUP}|\\[A-Za-z]+|(?<![}A-Za-z])${GROUP}|[A-Za-z0-9])`;
const LIMITS=/^\\(?:sum|prod|coprod|int|iint|iiint|oint|lim|limsup|liminf|max|min|sup|inf|bigcup|bigcap|bigoplus|bigotimes)$/;
// 빈 묶음({}^{14}_{6}C 같은 원소 기호 앞 질량수·원자 번호)도 그대로 둔다.
const keep=base=>LIMITS.test(base)||base==='{}';
const SUB_SUP=new RegExp(`${BASE}_(${ARG})\\^(${ARG})`,'g'),SUP_SUB=new RegExp(`${BASE}\\^(${ARG})_(${ARG})`,'g');
const ARROW=/[\s~]*(→|←|⇄|⇌|↔|⟶|\\(?:rightarrow|leftarrow|rightleftharpoons|leftrightarrow|longrightarrow|to)(?![A-Za-z]))[\s~]*/g;
// 4) 한글이 든 분수는 엔진이 분수 막대를 한글 아래·위 끝에 바짝 붙여 그린다(사용자 11-02: 분수 막대가 이상함) → 분자 끝에 ¼ 빈칸 아래첨자,
//    분모 앞에 ¼ 빈칸 위첨자를 붙여 막대 위아래를 띄운다(실측: 막대와 글자 사이가 고르게 벌어짐, 분수 높이 약 20% 커짐). 숫자 분수는 원래 깨끗해 그대로.
const HANGUL=/[가-힣]/;
function readGroup(s,at){if(s[at]!=='{')return null;let depth=0;for(let k=at;k<s.length;k++){if(s[k]==='\\'){k++;continue;}if(s[k]==='{')depth++;else if(s[k]==='}'&&--depth===0)return {start:at,end:k+1,inner:s.slice(at+1,k)};}return null;}
function spaceKoreanFractions(s){
  let out='',k=0;
  for(;;){const at=s.indexOf('\\frac{',k);if(at<0)break;const a=readGroup(s,at+5),b=a&&readGroup(s,a.end);if(!b){out+=s.slice(k,at+5);k=at+5;continue;}
    const num=spaceKoreanFractions(a.inner),den=spaceKoreanFractions(b.inner),pad=n=>HANGUL.test(n)&&!/_\{`\}$/.test(n),padTop=d=>HANGUL.test(d)&&!d.startsWith('{}^{`}');
    out+=s.slice(k,at)+`\\frac{${pad(num)?num+'_{`}':num}}{${padTop(den)?'{}^{`}'+den:den}}`;k=b.end;}
  return out+s.slice(k);
}
export function tidyEquationScript(script){
  let s=String(script??'').replace(/\\text\{([^{}]*)\}/g,(m,t)=>`\\text{${t.replace(/ +/g,'`')}}`);
  s=spaceKoreanFractions(s);
  s=s.replace(ARROW,(m,a)=>`~${a}~`);
  s=s.replace(SUB_SUP,(m,base,sub,sup)=>keep(base)?m:`{${base}_${sub}}^${sup}`);
  s=s.replace(SUP_SUB,(m,base,sup,sub)=>keep(base)?m:`{${base}_${sub}}^${sup}`);
  return s;
}
// 「$a$∼$d$」처럼 수식 사이에 물결만 있으면 물결이 뒤 수식과 겹쳐 그려진다(화학Ⅰ 「a∼d는 반응 계수」) → 수식 하나(a \sim d)로 합친다.
export function joinTildeEquations(text){
  // 「$x$∼$y$∼$z$」처럼 셋 이상 이어지면 바뀌지 않을 때까지 되풀이한다(GPT 검토).
  let s=String(text??''),prev;
  do{prev=s;s=s.replace(/\$([^$\n]+)\$\s*[∼～~]\s*\$([^$\n]+)\$/,(m,a,b)=>`$${a} \\sim ${b}$`);}while(s!==prev);
  return s;
}
// 수식이 기울어진 라틴 글자로 끝나고 바로 뒤에 한글이 붙으면(「$m$이다」「$W$와」) 엔진이 글자 끝을 수식 폭 밖으로 그려 뒤 한글과 겹친다 → 수식 끝에 ¼ 빈칸(`).
// 넓은 빈칸(\,)은 너무 벌어진다(실측). 뒤 글이 한글이 아니거나 숫자·괄호로 끝나는 수식은 그대로.
// 짧은 문자 수식(세 글자 이하: m·W·2m·mL)에만 — 긴 수식(100mL·mol)까지 붙이면 빡빡한 칸 줄이 넘어갔다(화학Ⅰ 〈보기〉 「…mol이다.」).
export const needsTail=(script,after)=>{const t=String(script).trim();return t.length<=3&&/[A-Za-z]'*$/.test(t)&&/^[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(String(after??''));};
// W·V처럼 넓게 기울어진 대문자는 ¼ 빈칸 하나로는 뒤 한글에 닿아(「W와」, 사용자 11-02) 둘을 붙인다(실측).
export const tailOf=(script,after)=>needsTail(script,after)?(/[WV]'*$/.test(String(script).trim())?'``':'`'):'';

// 11-06 수능 틀(기출): 「$1m$,」「$L=1m$일」처럼 라틴 글자로 끝나는 짧은 수식 뒤에 한글·쉼표·마침표가 붙으면 엔진이 글자를 수식 폭 밖으로 그려 겹쳤다.
// 겹침이 실제로 생긴 꼴(숫자 뒤 단위 글자: 1m·2s·L=1m)만, 여섯 글자 이하 — 다른 기출 조판은 그대로 둔다. 학교 양식은 위 tailOf 그대로.
export const kiceTailOf=(script,after)=>{const t=String(script).trim();return t.length<=6&&/\d[A-Za-z]{1,2}'*$/.test(t)&&/^[가-힣ㄱ-ㅎㅏ-ㅣ,.]/.test(String(after??''))?'`':'';};
