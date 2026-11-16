import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {forHancom} from '../assets/exampool/sheet/hancom-file.js';
const JSZip=createRequire(import.meta.url)('../assets/exampool/sheet/vendor/jszip.min.js');

test('한글로 가져가는 HWPX는 폭 없는 글자(WJ)를 같은 크기 빈칸으로 바꾸고 글자 수는 그대로 둔다', async () => {
  const zip=new JSZip();zip.file('mimetype','application/hwp+zip');
  const xml='<hp:p><hp:run charPrIDRef="3"><hp:t>⁠</hp:t></hp:run><hp:run><hp:t>1. 가⁠ 나</hp:t></hp:run></hp:p>';
  zip.file('Contents/section0.xml',xml);zip.file('Contents/header.xml','<h>⁠</h>');
  const out=await JSZip.loadAsync(await forHancom(await zip.generateAsync({type:'uint8array'}),JSZip));
  const got=await out.file('Contents/section0.xml').async('string');
  assert.equal(got,xml.replace(/⁠/g,' '));
  assert.equal(got.length,xml.length);
  assert.equal(await out.file('Contents/header.xml').async('string'),'<h>⁠</h>');
});

test('WJ가 없으면 파일을 그대로 돌려준다', async () => {
  const zip=new JSZip();zip.file('Contents/section0.xml','<hp:t>가</hp:t>');
  const bytes=await zip.generateAsync({type:'uint8array'});
  assert.equal(await forHancom(bytes,JSZip),bytes);
});
