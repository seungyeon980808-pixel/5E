// Run manually when refreshing the provided metadata snapshot; never downloads PDFs.
import fs from 'node:fs/promises';
import { sha256Hex } from '../js/pdf-library/pack-store.js';
import { remoteCatalogSnapshot } from '../js/pdf-library/remote-pack.js';
const base='https://5e-google-drive-gateway.5e-desktop.workers.dev/v1/google-drive/folders/1N46Woe4wIXs-PoUpVf0Uu4hPkSIUBqgX/public/';
const [pack, checksums] = await Promise.all(['pack.json','checksums.json'].map(async name => (await fetch(base+name)).json()));
if(await sha256Hex(new TextEncoder().encode(JSON.stringify(pack))) !== checksums.pack) throw Error('metadata hash');
const bytes=new Uint8Array(await (await fetch(base+pack.paths.catalog)).arrayBuffer());
if(await sha256Hex(bytes)!==checksums.files[pack.paths.catalog]) throw Error('catalog hash');
const snapshot=await remoteCatalogSnapshot(base,pack,checksums,JSON.parse(new TextDecoder().decode(bytes)));
const output=JSON.stringify(snapshot);
const digest=await sha256Hex(new TextEncoder().encode(output));
await fs.writeFile('assets/pdf-library/catalog-bootstrap.json',output);
await fs.writeFile('js/pdf-library/catalog-bootstrap.js',`// Derived from the checksum-verified public catalog; no PDF bytes or full-text index.\nexport const PROVIDED_CATALOG_BOOTSTRAP = Object.freeze({ url: 'assets/pdf-library/catalog-bootstrap.json', sha256: '${digest}' });\n`);
console.log(JSON.stringify({bytes:Buffer.byteLength(output),documents:snapshot.payload.catalog.documents.length,digest}));
