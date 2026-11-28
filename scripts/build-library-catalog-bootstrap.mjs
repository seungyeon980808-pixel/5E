// Run manually when refreshing the provided metadata snapshot; never downloads PDFs.
// 11-19: LIBRARY_PACK_DIR=<묶음 폴더>를 주면 올리기 전에 로컬 묶음(pack.json·checksums.json·catalog.json)으로 만든다.
//        주소(base)는 그대로 공개 게이트웨이 주소를 쓴다 — 앱이 그 주소 기준으로 스냅숏을 확인하기 때문.
import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256Hex } from '../js/pdf-library/pack-store.js';
import { remoteCatalogSnapshot } from '../js/pdf-library/remote-pack.js';
const base='https://5e-google-drive-gateway.5e-desktop.workers.dev/v1/google-drive/folders/1N46Woe4wIXs-PoUpVf0Uu4hPkSIUBqgX/public/';
const local=process.env.LIBRARY_PACK_DIR;
const read=async name=>local?new Uint8Array(await fs.readFile(path.join(local,name))):new Uint8Array(await (await fetch(base+name)).arrayBuffer());
const [pack, checksums] = await Promise.all(['pack.json','checksums.json'].map(async name => JSON.parse(new TextDecoder().decode(await read(name)))));
if(await sha256Hex(new TextEncoder().encode(JSON.stringify(pack))) !== checksums.pack) throw Error('metadata hash');
const bytes=await read(pack.paths.catalog);
if(await sha256Hex(bytes)!==checksums.files[pack.paths.catalog]) throw Error('catalog hash');
const snapshot=await remoteCatalogSnapshot(base,pack,checksums,JSON.parse(new TextDecoder().decode(bytes)));
const output=JSON.stringify(snapshot);
const digest=await sha256Hex(new TextEncoder().encode(output));
await fs.writeFile('assets/pdf-library/catalog-bootstrap.json',output);
await fs.writeFile('js/pdf-library/catalog-bootstrap.js',`// Derived from the checksum-verified public catalog; no PDF bytes or full-text index.\nexport const PROVIDED_CATALOG_BOOTSTRAP = Object.freeze({ url: 'assets/pdf-library/catalog-bootstrap.json', sha256: '${digest}' });\n`);
console.log(JSON.stringify({bytes:Buffer.byteLength(output),documents:snapshot.payload.catalog.documents.length,digest}));
