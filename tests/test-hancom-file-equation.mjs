// 1.7.1 B2: 한글로 내보낼 때 수식 LaTeX → 한글 수식 변환 검사(BL2). 단위 검사 실행기는 저장소 루트에서 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const WT=process.cwd(),req=createRequire(path.join(WT,'x.js'));
const {forHancom,forHancomHwp,hancomSectionXml,hancomSectionRecords}=await import(path.join(WT,'assets/exampool/sheet/hancom-file.js'));
const JSZip=req('./assets/exampool/sheet/vendor/jszip.min.js'),{CFB}=req('./assets/exampool/sheet/vendor/xlsx.full.min.js');

test('HWPX 수식 스크립트의 LaTeX를 한글 수식으로, 한글 수식·같은 글은 그대로', () => {
  const xml='<hp:equation><hp:script>E_{k} =\\frac{1}{2}mv^{2}</hp:script></hp:equation><hp:equation><hp:script>a over b</hp:script></hp:equation><hp:equation><hp:script>v_{0} t</hp:script></hp:equation>';
  assert.equal(hancomSectionXml(xml),'<hp:equation><hp:script>E_k ={1} over {2}mv^2</hp:script></hp:equation><hp:equation><hp:script>a over b</hp:script></hp:equation><hp:equation><hp:script>v_{0} t</hp:script></hp:equation>');
});
test('XML 이스케이프(<, &)와 \\text 한글은 살린다', () => {
  assert.equal(hancomSectionXml('<hp:script>x&lt;\\text{온도}</hp:script>'),'<hp:script>x&lt;"온도"</hp:script>');
});
test('글꼴 명령은 묶음으로 닫아 뒤 글자로 번지지 않게', () => {
  assert.equal(hancomSectionXml('<hp:script>\\mathrm{N}\\cdot m</hp:script>'),'<hp:script>{rm N} cdot m</hp:script>');
});
test('forHancom: 수식만 있어도 파일을 바꾼다', async () => {
  const zip=new JSZip();zip.file('Contents/section0.xml','<hp:script>\\frac{a}{b}</hp:script>');
  const out=await JSZip.loadAsync(await forHancom(await zip.generateAsync({type:'uint8array'}),JSZip));
  assert.equal(await out.file('Contents/section0.xml').async('string'),'<hp:script>{a} over {b}</hp:script>');
});

const rec=(tag,body)=>{const big=body.length>=4095,h=new Uint8Array(big?8:4),v=new DataView(h.buffer);v.setUint32(0,(tag|(1<<10)|((big?4095:body.length)<<20))>>>0,true);if(big)v.setUint32(4,body.length,true);const o=new Uint8Array(h.length+body.length);o.set(h);o.set(body,h.length);return o;};
const u16=s=>{const o=new Uint8Array(s.length*2),v=new DataView(o.buffer);for(let i=0;i<s.length;i++)v.setUint16(i*2,s.charCodeAt(i),true);return o;};
const cat=(...a)=>{const o=new Uint8Array(a.reduce((n,x)=>n+x.length,0));let p=0;for(const x of a){o.set(x,p);p+=x.length;}return o;};
const eq=s=>{const head=new Uint8Array(6),v=new DataView(head.buffer);v.setUint32(0,7,true);v.setUint16(4,s.length,true);return cat(head,u16(s),new Uint8Array([0x4c,4,0,0,0,0,0,0,0,0]));};
const readEq=b=>{const v=new DataView(b.buffer,b.byteOffset);const n=v.getUint16(8,true);let s='';for(let k=0;k<n;k++)s+=String.fromCharCode(v.getUint16(10+k*2,true));return s;};

test('HWP 레코드: PARA_TEXT의 U+2060 → 빈칸(길이 같음), 확장 컨트롤 안쪽 바이트는 건드리지 않음', () => {
  // 컨트롤 11(확장, 8칸) 안에 0x2060과 같은 값이 있어도 그대로
  const ctrl=new Uint8Array(16);ctrl[0]=11;ctrl[2]=0x60;ctrl[3]=0x20;ctrl[14]=11;
  const text=cat(ctrl,u16('1.⁠ 가'),u16('\r'));
  const out=hancomSectionRecords(rec(67,text));
  assert.equal(out.length,4+text.length);
  assert.deepEqual([...out.subarray(4,20)],[...ctrl]);
  assert.equal(new TextDecoder('utf-16le').decode(out.subarray(20)),'1.  가\r');
});
test('HWP 레코드: EQEDIT 스크립트를 바꾸고 레코드 길이·뒤 레코드를 맞춘다(4095바이트 넘는 긴 레코드 포함)', () => {
  const long='\\frac{1}{2}'+'+x'.repeat(2100);
  const input=cat(rec(88,eq('\\frac{1}{2}mv^{2}')),rec(88,eq(long)),rec(67,u16('끝\r')));
  const out=hancomSectionRecords(input),v=new DataView(out.buffer);
  const size0=v.getUint32(0,true)>>>20;assert.equal(readEq(out.subarray(0,4+size0)),'{1} over {2}mv^2');
  assert.deepEqual([...out.subarray(4+size0-10,4+size0)],[0x4c,4,0,0,0,0,0,0,0,0]);
  const second=out.subarray(4+size0),h=new DataView(second.buffer,second.byteOffset).getUint32(0,true);
  assert.equal(h>>>20,4095);const size1=new DataView(second.buffer,second.byteOffset).getUint32(4,true);
  const s1=second.subarray(8,8+size1),n=new DataView(s1.buffer,s1.byteOffset).getUint16(4,true);
  let script='';for(let k=0;k<n;k++)script+=String.fromCharCode(new DataView(s1.buffer,s1.byteOffset).getUint16(6+k*2,true));
  assert.ok(script.startsWith('{1} over {2}+x+x'));
  assert.equal(new TextDecoder('utf-16le').decode(second.subarray(8+size1+4)),'끝\r');
});
test('HWP 레코드: 바꿀 것이 없으면 null', () => {
  assert.equal(hancomSectionRecords(cat(rec(88,eq('a over b')),rec(67,u16('가\r')))),null);
});
test('forHancomHwp: 압축 구역을 풀어 바꾸고 다시 압축, 다른 스트림은 그대로', async () => {
  const cfb=CFB.utils.cfb_new();const header=new Uint8Array(256);header.set(new TextEncoder().encode('HWP Document File'));header[36]=1;
  CFB.utils.cfb_add(cfb,'/FileHeader',header);CFB.utils.cfb_add(cfb,'/DocInfo',new Uint8Array([1,2,3]));
  CFB.utils.cfb_add(cfb,'/BodyText/Section0',CFB.utils._deflateRaw(cat(rec(88,eq('\\sqrt{2}')),rec(67,u16('⁠\r')))));
  const bytes=new Uint8Array(CFB.write(cfb,{type:'array',fileType:'cfb'})),out=await forHancomHwp(bytes,CFB);
  const back=CFB.read(out,{type:'array'}),get=n=>back.FileIndex[back.FullPaths.findIndex(p=>p.endsWith(n))].content;
  const sec=CFB.utils._inflateRaw(Object.assign(new Uint8Array(get('/BodyText/Section0')),{l:0}));
  const size=new DataView(sec.buffer,sec.byteOffset).getUint32(0,true)>>>20;
  assert.equal(readEq(sec.subarray(0,4+size)),'sqrt {2}');
  assert.equal(new TextDecoder('utf-16le').decode(sec.subarray(4+size+4)),' \r');
  assert.deepEqual([...get('/DocInfo')],[1,2,3]);
  const plain=new Uint8Array(CFB.write((()=>{const c=CFB.utils.cfb_new();CFB.utils.cfb_add(c,'/FileHeader',header);CFB.utils.cfb_add(c,'/BodyText/Section0',CFB.utils._deflateRaw(rec(67,u16('가\r'))));return c;})(),{type:'array',fileType:'cfb'}));
  assert.equal(await forHancomHwp(plain,CFB),plain);
});
