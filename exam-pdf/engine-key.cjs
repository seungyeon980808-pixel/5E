// 미리 변환한 문항이 지금 엔진과 같은 결과인지 가리는 열쇠: 변환 엔진 소스(assets/exampool/convert의 .js/.mjs, vendor 제외)의 해시 앞 12자리.
// 엔진을 고치면 열쇠가 바뀌어 5E는 옛 미리 변환 파일을 쓰지 않고 그 자리에서 바꾼다(검사 test-preconverted-key가 앱 쪽 열쇠와 맞는지 본다).
const fs=require('fs'),path=require('path'),crypto=require('crypto');
module.exports=function engineKey(root=path.join(__dirname,'..','assets/exampool/convert')){
  const files=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(!['vendor','data'].includes(e.name))walk(p);}else if(/\.(m?js)$/.test(e.name))files.push(p);}})(root);
  const h=crypto.createHash('sha256');for(const f of files.sort())h.update(path.relative(root,f)).update(fs.readFileSync(f));return h.digest('hex').slice(0,12);
};
