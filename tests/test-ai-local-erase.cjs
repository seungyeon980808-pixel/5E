const test = require('node:test');
const assert = require('node:assert/strict');
const api = Promise.all([import('../js/ai-image-local-erase.js'), import('../js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration')]);
const url = bytes => 'data:image/png;base64,' + Buffer.from(bytes).toString('base64');
const bytes = data => new Uint8Array(Buffer.from(data.split(',')[1], 'base64'));

test('polygon erasure preserves dimensions, color metadata and every RGBA byte outside a concave mask', async () => {
  const [{ eraseImagePolygon, polygonPixelMask }, { encodeScopedPng, decodeScopedPng }] = await api;
  const width = 40, height = 30, data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([i % 255, (i * 13) % 255, (i * 7) % 255, i % 3 ? 255 : 0], i * 4);
  const metadata = [{ type: 'sRGB', data: Uint8Array.of(0) }];
  const source = url(await encodeScopedPng({ width, height, data }, { metadata }));
  const polygon = [{ x: 4, y: 3 }, { x: 20, y: 3 }, { x: 20, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 22 }, { x: 4, y: 22 }];
  const result = await eraseImagePolygon(source, polygon);
  const output = await decodeScopedPng(bytes(result.data)), mask = polygonPixelMask(width, height, polygon);
  assert.equal(output.width, width); assert.equal(output.height, height); assert.deepEqual(output.metadata, metadata);
  let erased = 0;
  for (let i = 0; i < mask.length; i++) {
    const offset = i * 4;
    assert.deepEqual(output.data.subarray(offset, offset + 4), mask[i] ? new Uint8Array(4) : data.subarray(offset, offset + 4));
    if (mask[i]) erased++;
  }
  assert.equal(result.maskedPixels, erased); assert.equal(result.outsideRgbaChanged, 0);
  assert.equal(mask[15 * width + 16], 0, 'the concave indentation is preserved');
  assert.equal(url(await encodeScopedPng({ width, height, data }, { metadata })), source, 'original byte source is untouched');
});

test('degenerate geometry, excessive allocation, cancellation and already erased pixels cannot create a revision', async () => {
  const [{ eraseImagePolygon, polygonPixelMask }, { encodeScopedPng }] = await api;
  assert.throws(() => polygonPixelMask(9000, 9000, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]), RangeError);
  assert.throws(() => polygonPixelMask(10, 10, [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]), TypeError);
  const source = url(await encodeScopedPng({ width: 10, height: 10, data: new Uint8Array(400) }));
  assert.equal(await eraseImagePolygon(source, [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }]), null);
  await assert.rejects(() => eraseImagePolygon(source, [{ x: 2, y: 2 }, { x: 2.1, y: 2 }, { x: 2, y: 2.1 }]), RangeError);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => eraseImagePolygon(source, [], { signal: controller.signal }), { name: 'AbortError' });
});

test('brush raster matches round segment distance, including sparse, reversed, single-point and outside-start paths', async () => {
  const {brushPixelMask,rectanglePixelMask}=await import('../js/image-erase-mask.js');
  const width=40,height=30;
  const paths=[[{x:3,y:4}],[{x:2,y:3},{x:35,y:27}],[{x:-15,y:4},{x:25,y:25}],[{x:-8,y:-8},{x:-8,y:35}], [{x:4,y:4},{x:32,y:4},{x:32,y:24},{x:4,y:24},{x:4,y:4}]];
  const distance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)||0));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
  for(const points of paths)for(const diameter of [1,4,9,40]){
    const mask=brushPixelMask(width,height,points,diameter);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      let expected=false;for(let j=0;j<Math.max(1,points.length-1);j++)expected ||= distance({x:x+.5,y:y+.5},points[j],points[Math.min(j+1,points.length-1)])<=diameter/2+1e-9;
      assert.equal(mask[y*width+x],Number(expected),JSON.stringify({points,diameter,x,y}));
    }
    assert.deepEqual(mask,brushPixelMask(width,height,[...points].reverse(),diameter));
  }
  assert.equal(brushPixelMask(width,height,paths.at(-1),4)[15*width+18],0,'a closed stroke does not fill its enclosed center');
  const rect=rectanglePixelMask(width,height,[{x:-20,y:3},{x:10,y:9}]);assert.equal(rect.reduce((a,b)=>a+b,0),60);assert.equal(rect[2*width],0);
  assert.throws(()=>brushPixelMask(width,height,[{x:0,y:0}],0),RangeError);
});

test('white and transparent brush/rectangle revisions preserve untouched RGBA and PNG metadata',async()=>{
  const [{eraseImageRegion},{encodeScopedPng,decodeScopedPng}]=await api;
  const {brushPixelMask,rectanglePixelMask}=await import('../js/image-erase-mask.js');
  const width=40,height=30,data=Uint8Array.from({length:width*height*4},(_,i)=>i%251),metadata=[{type:'sRGB',data:Uint8Array.of(0)}];
  const source=url(await encodeScopedPng({width,height,data},{metadata})),points=[{x:-5,y:5},{x:25,y:15}];
  for(const mode of ['brush','rect'])for(const background of ['white','transparent']){
    const result=await eraseImageRegion(source,{mode,points,diameter:6,background}),out=await decodeScopedPng(bytes(result.data));
    const mask=mode==='brush'?brushPixelMask(width,height,points,6):rectanglePixelMask(width,height,points);
    assert.deepEqual(out.metadata,metadata);assert.equal(result.outsideRgbaChanged,0);assert.equal(result.background,background);
    for(let i=0;i<mask.length;i++)assert.deepEqual(out.data.subarray(i*4,i*4+4),mask[i]?new Uint8Array(4).fill(background==='white'?255:0):data.subarray(i*4,i*4+4));
    assert.equal(await eraseImageRegion(result.data,{mode,points,diameter:6,background}),null,'same stroke cannot create an unchanged revision');
  }
  assert.equal(await eraseImageRegion(source,{mode:'brush',points:[{x:-20,y:1},{x:-20,y:20}],diameter:5}),null);
});

test('grayscale PNG erase fails with a Korean explanation instead of the raw parser error', async () => {
  const zlib = require('node:zlib');
  const { eraseImageRegion } = await import('../js/ai-image-erase-core.js?v=1.7.0-four-session-integration');
  // 4×4 8-bit grayscale (color type 0) PNG.
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(4, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, 10, 20, 30, 40])));
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  await assert.rejects(eraseImageRegion(url(png), { mode: 'rect', points: [{ x: 0, y: 0 }, { x: 3, y: 3 }] }), error => /회색조/.test(error.message) && !/Unsupported/.test(error.message));
});
