import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedObjectifyImage, objectifyImageFile } from '../js/image-objectify-source.js';

test('only one selected image becomes an objectification source', () => {
  const image={id:'crop',type:'image',src:'data:image/png;base64,AQ==',cutouts:[]};
  assert.equal(selectedObjectifyImage({objects:[image],selectedIds:['crop']}).id,'crop');
  assert.equal(selectedObjectifyImage({objects:[image],selectedIds:[]}),null);
  assert.equal(selectedObjectifyImage({objects:[image],selectedIds:['crop','other']}),null);
  assert.equal(selectedObjectifyImage({objects:[{...image,type:'rect'}],selectedIds:['crop']}),null);
});
test('selected erased image is baked before objectification, preserving edited pixels', async () => {
  const calls=[];
  const file=await objectifyImageFile({src:'original',cutouts:[{type:'rect'}]}, {
    renderCutouts:async image=>{calls.push(image.src);return 'baked';},
    fetchSource:async src=>{calls.push(src);return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png'}});},
  });
  assert.deepEqual(calls,['original','baked']);
  assert.equal(file.type,'image/png');assert.equal(file.size,3);
});
test('already saved crop reads its own source and does not rebake', async () => {
  const file=await objectifyImageFile({src:'crop',name:'잘라낸 그림',cutouts:[]}, {
    renderCutouts:()=>assert.fail('unexpected rebake'),
    fetchSource:async src=>{assert.equal(src,'crop');return new Response('png',{headers:{'Content-Type':'image/png'}});},
  });
  assert.equal(file.name,'잘라낸 그림.png');
});
test('failed source reads do not produce empty successful files', async () => {
  await assert.rejects(objectifyImageFile({src:'missing'}, {fetchSource:async()=>new Response('',{status:404})}),/읽지 못/);
});
