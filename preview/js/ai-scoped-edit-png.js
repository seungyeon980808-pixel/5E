/** Strict browser PNG v1 adapter for byte-exact RGBA scoped edits. */
import { compositeRgbaWithinMask, deriveRgbaChangeMask, isRgbaOutsideMaskUnchanged, validateRgbaImage, validateBinaryMask } from './ai-scoped-edit.js?v=1.6.0-preview-labeler-0917-1111';

const SIGNATURE = Uint8Array.of(137,80,78,71,13,10,26,10);
const MAX_PNG_BYTES = 64 * 1024 * 1024;
const MAX_RAW_BYTES = 64 * 1024 * 1024;
const MAX_DIMENSION = 16384;
const COLOR_CHUNKS = new Set(['gAMA', 'cHRM', 'sBIT', 'sRGB', 'iCCP']);
const ALLOWED = new Set(['IHDR', 'IDAT', 'IEND', ...COLOR_CHUNKS, 'caBX']);
let crcTable;
function fail(message) { throw new Error(`Unsupported or invalid PNG: ${message}`); }
function bytes(value, label = 'bytes') { if (!(value instanceof Uint8Array)) throw new TypeError(`${label} must be a Uint8Array.`); return value; }
function usesSharedBuffer(value) {
 return typeof SharedArrayBuffer !== 'undefined' && value.buffer instanceof SharedArrayBuffer;
}
function snapshotBytes(value, label) {
 const source = bytes(value, label);
 if (usesSharedBuffer(source)) throw new TypeError(`${label} must be a non-shared Uint8Array.`);
 return new Uint8Array(source);
}
function snapshotMask(mask) {
 if (!(mask instanceof Uint8Array) && !(mask instanceof Uint8ClampedArray)) {
  throw new TypeError('mask must be a Uint8Array or Uint8ClampedArray.');
 }
 if (usesSharedBuffer(mask)) throw new TypeError('mask must use non-shared memory.');
 return new Uint8Array(mask);
}
function u32(a, o) { return ((a[o] * 0x1000000) + ((a[o + 1] << 16) | (a[o + 2] << 8) | a[o + 3])) >>> 0; }
function put32(a, o, n) { a[o] = n >>> 24; a[o + 1] = n >>> 16; a[o + 2] = n >>> 8; a[o + 3] = n; }
function typeAt(a, o) { return String.fromCharCode(a[o], a[o + 1], a[o + 2], a[o + 3]); }
function ascii(s) { return Uint8Array.from([...s].map((c) => c.charCodeAt(0))); }
function crc32(a, start = 0, end = a.length) { if (!crcTable) { crcTable = new Uint32Array(256); for (let n=0;n<256;n+=1) { let c=n; for(let k=0;k<8;k+=1)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); crcTable[n]=c; } } let c=0xffffffff; for(let i=start;i<end;i+=1)c=crcTable[(c^a[i])&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function concat(parts) { const size = parts.reduce((n,p) => n + p.length, 0); const out = new Uint8Array(size); let o=0; for(const p of parts){out.set(p,o);o+=p.length;} return out; }
function equal(a,b) { return a.length === b.length && a.every((v,i)=>v===b[i]); }
function chunk(type, data) { const payload=bytes(data,'chunk data'); const out=new Uint8Array(payload.length+12); put32(out,0,payload.length); out.set(ascii(type),4); out.set(payload,8); put32(out,out.length-4,crc32(out,4,out.length-4)); return out; }
async function transform(input, mode) { if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') fail('CompressionStream/DecompressionStream is unavailable.'); const stream = new Blob([input]).stream().pipeThrough(mode === 'inflate' ? new DecompressionStream('deflate') : new CompressionStream('deflate')); const reader=stream.getReader(); const parts=[]; let total=0; for (;;) { const {value,done}=await reader.read(); if(done) break; total+=value.length; if(total>MAX_RAW_BYTES) fail(`${mode} output exceeds ${MAX_RAW_BYTES} bytes.`); parts.push(value); } return concat(parts); }
function metadataCompatible(a,b) { return a.length===b.length && a.every((x,i)=>x.type===b[i].type && equal(x.data,b[i].data)); }
function isValidPngKeyword(data, length) {
 if (length < 1 || length > 79) return false;
 for (let i = 0; i < length; i += 1) {
  const value = data[i];
  if (!((value >= 32 && value <= 126) || value >= 161)) return false;
  if (value === 32 && (i === 0 || i === length - 1 || data[i - 1] === 32)) return false;
 }
 return true;
}
function validateColorChunk(type, data, colorType = 6) {
 let valid = true;
 if (type === 'gAMA') valid = data.length === 4 && u32(data, 0) !== 0;
 else if (type === 'cHRM') valid = data.length === 32;
 else if (type === 'sBIT') valid = data.length === (colorType === 2 ? 3 : 4) && data.every(value => value > 0 && value <= 8);
 else if (type === 'sRGB') valid = data.length === 1 && data[0] <= 3;
 else if (type === 'iCCP') {
  const separator = data.indexOf(0);
  valid = isValidPngKeyword(data, separator)
   && separator + 2 < data.length && data[separator + 1] === 0;
 }
 if (!valid) fail(`${type} metadata is malformed.`);
}
function validateMetadata(metadata, colorType = 6) {
 if (!Array.isArray(metadata)) throw new TypeError('metadata must be an array.');
 const checked = [], seen = new Set();
 let hasSrgb = false, hasIccp = false;
 for (const item of metadata) {
  if (!item || typeof item.type !== 'string' || !COLOR_CHUNKS.has(item.type) || seen.has(item.type)) {
   fail('metadata contains unsupported, duplicate, or malformed chunks.');
  }
  const data = snapshotBytes(item.data, 'metadata data');
  validateColorChunk(item.type, data, colorType);
  checked.push({ type: item.type, data });
  seen.add(item.type);
  hasSrgb ||= item.type === 'sRGB';
  hasIccp ||= item.type === 'iCCP';
 }
 if (hasSrgb && hasIccp) fail('sRGB and iCCP cannot both be present.');
 return checked;
}
async function validateIccProfile(metadata) {
 const iccp = metadata.find(item => item.type === 'iCCP');
 if (!iccp) return;
 const profileOffset = iccp.data.indexOf(0) + 2;
 let profile;
 try {
  profile = await transform(iccp.data.subarray(profileOffset), 'inflate');
 } catch {
  fail('iCCP metadata is malformed.');
 }
 if (profile.length < 128 || u32(profile, 0) !== profile.length
  || typeAt(profile, 16) !== 'RGB ' || typeAt(profile, 36) !== 'acsp') {
  fail('iCCP metadata is malformed.');
 }
}
function paeth(a,b,c) { const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c); return pa<=pb&&pa<=pc?a:pb<=pc?b:c; }

export async function decodeScopedPng(input) {
 const png=bytes(input); if(png.length>MAX_PNG_BYTES) fail(`input exceeds ${MAX_PNG_BYTES} bytes.`); if(png.length<45 || !equal(png.subarray(0,8),SIGNATURE)) fail('bad PNG signature.');
 let o=8, width, height, channels, colorType, idat=[], metadata=[], hasCaBX=false, phase='start';
 while(o<png.length) { if(o+12>png.length) fail('truncated chunk.'); const len=u32(png,o); if(len>MAX_PNG_BYTES || o+12+len>png.length) fail('invalid chunk length.'); const type=typeAt(png,o+4), data=png.subarray(o+8,o+8+len); if(crc32(png,o+4,o+8+len)!==u32(png,o+8+len)) fail(`CRC mismatch in ${type}.`); o+=12+len;
  if(!ALLOWED.has(type)) fail(`${type === 'tRNS' ? 'tRNS transparency' : `chunk ${type}`} is not supported.`);
  if(type==='IHDR') { if(phase!=='start'||len!==13) fail('IHDR must be first and exactly 13 bytes.'); width=u32(data,0);height=u32(data,4);colorType=data[9]; if(!width||!height||width>MAX_DIMENSION||height>MAX_DIMENSION) fail('dimensions exceed limits.'); if(data[8]!==8 || (colorType!==2&&colorType!==6) || data[10]||data[11]||data[12]) fail('only non-interlaced 8-bit RGB/RGBA PNG is supported.'); channels=colorType===2?3:4; const pixels=width*height, scanlineBytes=height*(width*channels+1), rgbaBytes=pixels*4; if(scanlineBytes>MAX_RAW_BYTES||rgbaBytes>MAX_RAW_BYTES) fail('dimensions exceed limits.'); phase='before-idat'; continue; }
  if(phase==='start') fail('IHDR is missing.');
  if(type==='IEND') { if(len!==0||phase!=='idat'||o!==png.length) fail('IEND must follow IDAT and finish the PNG.'); phase='done'; break; }
  if(type==='IDAT') { phase='idat'; idat.push(data); continue; }
  if(phase!=='before-idat') fail(`${type} must occur before IDAT.`);
  // C2PA specifies caBX as an ancillary, private, unsafe-to-copy manifest store.
  // It never enters output metadata: editing invalidates its provenance signature.
  if(type==='caBX') { hasCaBX=true; continue; }
  metadata.push({type,data:data.slice()});
 }
 if(phase!=='done') fail('IEND is missing.'); metadata=validateMetadata(metadata,colorType); if(colorType===2) metadata=metadata.map(item=>item.type==='sBIT'?{type:item.type,data:Uint8Array.of(...item.data,8)}:item);
 const compressedPixels=concat(idat); await validateIccProfile(metadata);
 const row=width*channels, expected=height*(row+1); if(expected>MAX_RAW_BYTES) fail('inflated image exceeds limit.'); const raw=await transform(compressedPixels,'inflate'); if(raw.length!==expected) fail(`inflated data length ${raw.length} does not equal expected ${expected}.`);
 const scan=new Uint8Array(height*row); for(let y=0;y<height;y+=1){const f=raw[y*(row+1)], src=y*(row+1)+1, dst=y*row; if(f>4)fail(`invalid filter ${f}.`); for(let x=0;x<row;x+=1){const left=x>=channels?scan[dst+x-channels]:0, up=y?scan[dst-row+x]:0, ul=y&&x>=channels?scan[dst-row+x-channels]:0, v=raw[src+x]; scan[dst+x]=(v+(f===0?0:f===1?left:f===2?up:f===3?Math.floor((left+up)/2):paeth(left,up,ul)))&255;}}
 const rgba=new Uint8Array(width*height*4); for(let p=0,s=0,d=0;p<width*height;p+=1,s+=channels,d+=4){rgba[d]=scan[s];rgba[d+1]=scan[s+1];rgba[d+2]=scan[s+2];rgba[d+3]=channels===4?scan[s+3]:255;}
 return {width,height,data:rgba,metadata,metadataDisposition:hasCaBX ? 'caBX-recognized-not-preserved' : 'supported-metadata-preserved',removedMetadata:hasCaBX ? ['caBX'] : []};
}
export async function encodeScopedPng(image,{metadata=[]}={}) {
 const checked=validateRgbaImage(image), rawLength=checked.height*(checked.width*4+1); if(checked.data.constructor!==Uint8Array) throw new TypeError('image.data must be Uint8Array.'); if(checked.width>MAX_DIMENSION||checked.height>MAX_DIMENSION||checked.data.length>MAX_RAW_BYTES||rawLength>MAX_RAW_BYTES) fail('dimensions exceed limits.'); const preservedMetadata=validateMetadata(metadata);
 const raw=new Uint8Array(rawLength); for(let y=0;y<checked.height;y+=1)raw.set(checked.data.subarray(y*checked.width*4,(y+1)*checked.width*4),y*(checked.width*4+1)+1); await validateIccProfile(preservedMetadata); const compressed=await transform(raw,'deflate');
 const ihdr=new Uint8Array(13);put32(ihdr,0,checked.width);put32(ihdr,4,checked.height);ihdr[8]=8;ihdr[9]=6;
 return concat([SIGNATURE,chunk('IHDR',ihdr),...preservedMetadata.map((m)=>chunk(m.type,m.data)),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())]);
}
export async function applyScopedPngEdit(originalPng,candidatePng,mask) {
 const sourceBytes=bytes(originalPng,'originalPng');
 if(usesSharedBuffer(sourceBytes)) throw new TypeError('originalPng must be a non-shared Uint8Array.');
 const candidateBytes=snapshotBytes(candidatePng,'candidatePng'), capturedMask=snapshotMask(mask);
 const original=await decodeScopedPng(sourceBytes), candidate=await decodeScopedPng(candidateBytes);
 const removedMetadata=(original.removedMetadata.includes('caBX') || candidate.removedMetadata.includes('caBX')) ? ['caBX'] : [];
 const metadataDisposition=removedMetadata.length ? 'caBX-removed-after-edit-invalidates-C2PA-provenance; no replacement signature was generated' : 'supported-metadata-preserved'; if(original.width!==candidate.width||original.height!==candidate.height) throw new RangeError('original and candidate dimensions must match exactly; resize is forbidden.'); validateBinaryMask(capturedMask,original.width,original.height); if(!metadataCompatible(original.metadata,candidate.metadata)) fail('candidate color-profile metadata does not exactly match original; implicit color conversion is forbidden.');
 const result={width:original.width,height:original.height,data:compositeRgbaWithinMask(original,candidate,capturedMask)}; if(!isRgbaOutsideMaskUnchanged(original,result,capturedMask)) fail('internal outside-mask invariant failed.'); const png=await encodeScopedPng(result,{metadata:original.metadata}); const decoded=await decodeScopedPng(png); if(!isRgbaOutsideMaskUnchanged(original,decoded,capturedMask)) fail('encoded PNG changed pixels outside mask.'); const changes=deriveRgbaChangeMask(original,decoded); return {png,width:original.width,height:original.height,changedPixelCount:changes.changedPixelCount,changedBounds:changes.bounds,outsideUnchanged:true,metadataDisposition,removedMetadata};
}
