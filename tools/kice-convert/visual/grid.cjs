// 원본·우리 카드 짝을 한 장에 n개씩(왼쪽 원본, 오른쪽 우리). node grid.cjs <원본 폴더> <우리 폴더> <출력 폴더> [n]
const R=require('path').resolve(__dirname,'../../..');const fs=require('fs'),path=require('path');const pw=require(R+'/node_modules/playwright');
const [od,ud,out,nArg]=process.argv.slice(2);const n=+nArg||6;fs.mkdirSync(out,{recursive:true});
const ids=fs.readdirSync(ud).filter(f=>f.endsWith('.png')).map(f=>f.slice(0,-4)).sort();
const b64=p=>'data:image/png;base64,'+fs.readFileSync(p).toString('base64');
(async()=>{const b=await pw.chromium.launch();const p=await b.newPage({viewport:{width:1400,height:800}});
 for(let k=0;k<ids.length;k+=n){const part=ids.slice(k,k+n);
  const html='<body style="margin:0;font:12px sans-serif;background:#fff"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;padding:6px">'+part.map(id=>`<div style="border:1px solid #ccc"><div>${id}</div><div style="display:flex;gap:4px;align-items:flex-start"><img src="${b64(path.join(od,id+'.png'))}" style="width:340px"><img src="${b64(path.join(ud,id+'.png'))}" style="width:340px"></div></div>`).join('')+'</div></body>';
  await p.setContent(html);await p.waitForTimeout(300);await p.screenshot({path:path.join(out,`grid${String(k/n).padStart(2,'0')}.png`),fullPage:true});}
 await b.close();console.log('grids',Math.ceil(ids.length/n));})();
