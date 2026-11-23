/* 11-20 밤: 맥 단축키 옆에 윈도우 키를 함께(⌘C → ⌘C / Ctrl+C, ⇧⌘V → ⇧⌘V / Ctrl+Shift+V, ⌥⌘1 → ⌥⌘1 / Ctrl+Alt+1). 프로그램 platform.js 규칙대로. */
(function(){
  'use strict';
  const RE=/(⌥⇧⌘|⇧⌥⌘|⌥⌘|⇧⌘|⌘)(Enter|[A-Z0-9])(?! \/ Ctrl)/g;
  const win=(m,k)=>'Ctrl+'+(m.includes('⌥')?'Alt+':'')+(m.includes('⇧')?'Shift+':'')+k;
  const conv=t=>t.replace(RE,(all,m,k)=>`${all} / ${win(m,k)}`);
  window.__5eKbd=conv;
  const ROOTS='#manif,.feat__text,.group,#arch,#faq,#download,#hx';
  function walk(root){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const v=n.nodeValue;if(v&&v.includes('⌘')){const c=conv(v);if(c!==v)n.nodeValue=c}}}
  let busy=false;const all=()=>{busy=true;document.querySelectorAll(ROOTS).forEach(walk);busy=false};
  const mo=new MutationObserver(()=>{if(busy)return;clearTimeout(mo.t);mo.t=setTimeout(all,60)});
  const start=()=>{all();document.querySelectorAll('#arch,#faq').forEach(r=>mo.observe(r,{childList:true,subtree:true}))};
  if(document.readyState==='complete')setTimeout(start,300);else addEventListener('load',()=>setTimeout(start,300));
  setTimeout(all,2500);
})();
