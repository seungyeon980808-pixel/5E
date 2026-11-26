// Georgia로 쓴 글씨를 맥의 Georgia 모양 그대로 SVG 도형으로 바꾼다(안드로이드처럼 Georgia가 없는 기기에서도 데스크톱과 똑같이).
// 페이지 끝에서 곧바로(첫 그림 전에) 바꾸고, 나중에 들어오는 글씨는 MutationObserver로 바꾼다.
// Georgia에 없는 글자(한글 등)는 기기 기본 명조 대신 받아 쓰는 Noto Serif KR로 — 어디서나 같게.
(()=>{const G=window.GEORGIA;if(!G)return;
const fam=f=>/^\s*["']?[^,]*Georgia/i.test(f||'')?'g':/^\s*["']?[^,]*Times New Roman/i.test(f||'')?'t':null;
const key=(cs,fm)=>{const b=(parseInt(cs.fontWeight)||400)>=600,i=/italic|oblique/.test(cs.fontStyle);const k=b&&i?'bi':b?'b':i?'i':'r';return fm==='t'?'t'+(k==='bi'?'b':k):k};
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function svgFor(text,cs,F){const u=F.upm,fs=parseFloat(cs.fontSize)||16;
  const ls=(cs.letterSpacing==='normal'?0:parseFloat(cs.letterSpacing)||0)/fs*u;
  let x=0,d='';for(const ch of text){const g=F.g[ch];if(g[1])d+=`<path transform="translate(${Math.round(x)} 0) scale(1 -1)" d="${g[1]}"/>`;x+=g[0]+ls;}
  const fill=(cs.webkitTextFillColor&&cs.webkitTextFillColor!==cs.color)?cs.webkitTextFillColor:'currentColor';
  const sw=parseFloat(cs.webkitTextStrokeWidth)||0, st=sw?` stroke="${cs.webkitTextStrokeColor}" stroke-width="${(sw/fs*u).toFixed(1)}"`:'';
  return `<svg aria-hidden="true" viewBox="0 ${-0.8*u} ${Math.round(x)} ${u}" style="width:${(x/u).toFixed(4)}em;height:1em;vertical-align:-0.2em;overflow:visible;display:inline-block" fill="${fill}"${st}>${d}</svg>`;}
function conv(el){const cs=getComputedStyle(el);const fm=fam(cs.fontFamily);if(!fm)return;const F=G[key(cs,fm)];if(!F)return;
  for(const n of [...el.childNodes]){if(n.nodeType!==3||!n.nodeValue.trim())continue;
    const t=n.nodeValue,runs=[];let cur='',ok=null;
    for(const ch of t){const has=!!F.g[ch];if(ok===null||has===ok)cur+=ch;else{runs.push([ok,cur]);cur=ch;}ok=has;}runs.push([ok,cur]);
    const sp=document.createElement('g-sv');sp.style.display='inline';sp.setAttribute('role','img');sp.setAttribute('aria-label',t);
    sp.innerHTML=runs.map(([o,s])=>o?svgFor(s,cs,F):`<g-sv aria-hidden="true" style="display:inline;font-family:'Noto Serif KR',serif">${esc(s)}</g-sv>`).join('');
    n.replaceWith(sp);}}
const skip=e=>e.closest('svg,g-sv');
function run(root){if(root.nodeType!==1||skip(root))return;conv(root);root.querySelectorAll('*').forEach(e=>{if(!skip(e))conv(e)})}
run(document.body);
new MutationObserver(ms=>{for(const m of ms){for(const n of m.addedNodes){if(n.nodeType===1)run(n);else if(n.nodeType===3&&n.parentElement&&!skip(n.parentElement))conv(n.parentElement)}}}).observe(document.body,{childList:true,subtree:true});
})();
