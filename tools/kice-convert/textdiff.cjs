#!/usr/bin/env node
// 글 일치 실패 진단: 한글 조판 글(shots/<id>.txt) vs 원본 본문(reference.json)의 빠진 글[-]·더한 글[+] 묶음.
//   node tools/kice-convert/textdiff.cjs <결과 폴더> [id,id…] [--top N]
'use strict';
const fs=require('fs'),path=require('path');const {norm,kor}=require('./score.cjs');
const dir=path.resolve(process.argv[2]),ref=JSON.parse(fs.readFileSync(path.join(__dirname,'reference.json')));
function diff(a,b){const n=a.length,m=b.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 let i=0,j=0,del='',ins='',out=[];const flush=()=>{if(del||ins)out.push([del,ins]);del='';ins='';};while(i<n&&j<m){if(a[i]===b[j]){flush();i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])del+=a[i++];else ins+=b[j++];}del+=a.slice(i);ins+=b.slice(j);flush();return out;}
const rows=fs.readFileSync(path.join(dir,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const ids=process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3].split(','):rows.filter(r=>r.reasons.some(x=>x.startsWith('text'))).map(r=>r.id);
const tally=new Map();
for(const id of ids){const f=path.join(dir,'shots',id+'.txt');if(!fs.existsSync(f))continue;const d=diff(kor(norm(ref[id].body)),kor(norm(fs.readFileSync(f,'utf8'))));
  for(const [del,ins] of d){const k=`[-${del.slice(0,24)}][+${ins.slice(0,24)}]`;if(!tally.has(k))tally.set(k,[]);tally.get(k).push(id);}
  if(ids.length<=8)console.log('==',id,'\n',d.map(([a,b])=>`[-${a}][+${b}]`).join(' ').slice(0,700));}
if(ids.length>8){const top=Number((process.argv.find(a=>a.startsWith('--top='))||'--top=40').split('=')[1]);
  for(const [k,v] of [...tally].sort((a,b)=>b[1].length-a[1].length).slice(0,top))console.log(String(v.length).padStart(4),k,v.slice(0,3).join(','));}
