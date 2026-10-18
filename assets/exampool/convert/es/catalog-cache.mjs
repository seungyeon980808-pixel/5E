const CACHE = 'exam-library-catalog-v4';
const pending = new Map();
export function validCatalog(value) {
  return value?.schema === 'exam-browser-v3' && /^[a-f\d]{64}$/u.test(value.revision || '')
    && /^[a-f\d]{64}$/u.test(value.sourceRevision || '')
    && Array.isArray(value.files) && Array.isArray(value.facets) && Array.isArray(value.status?.subjects)
    && ['groups','years','frameworks','units','standards','paperOptions','incomplete'].every(key=>Array.isArray(value.status[key]))
    && value.facets.every(f=>typeof f.subject==='string' && Number.isFinite(f.year) && Array.isArray(f.standards) && typeof f.unit==='string' && typeof f.framework==='string')
    && value.status.questionCount > 0 && value.status.subjects.length > 0
    && value.files.every(f=>typeof f.pdfFile === 'string' && typeof f.publicPath === 'string')
    && value.status.subjects.every(s=>['browse','detail','search'].every(kind=>{
      const a=value.shards?.[s.value]?.[kind];
      return a && /^data\/browser\/[a-z_\d-]+\.json$/u.test(a.path) && /^[a-f\d]{64}$/u.test(a.sha256) && a.bytes>0
        && (kind!=='search'||a.format==='compact-search-v1');
    }));
}
async function cacheStore() { try { return await caches.open(CACHE); } catch { return null; } }
const base = new URL('./', import.meta.url);
export async function loadCatalog(onChange = () => {}) {
  const url = new URL('data/catalog.json', base).href;
  const cache = await cacheStore();
  const network = async () => {
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),30000);
    try {
    const response = await fetch(url, {cache:'no-cache',signal:controller.signal});
    if (!response.ok) throw new Error('문항 목록을 준비하지 못했습니다. 다시 시도해 주세요.');
    const value = await response.clone().json();
    if (!validCatalog(value)) throw new Error('문항 목록의 형식이 올바르지 않습니다.');
    try { await cache?.put(url, response); } catch { /* Browsing works without persistent storage. */ }
    return value;
    } catch(error) { if(controller.signal.aborted)throw new Error('목록 준비가 지연되고 있습니다. 다시 시도해 주세요.'); throw error; }
    finally { clearTimeout(timeout); }
  };
  let cached;
  try { cached = await (await cache?.match(url))?.json(); } catch { /* Invalid cache falls through to network. */ }
  if (!validCatalog(cached)) return network();
  // A changed catalog is offered on reload, never applied over an active selection/editor.
  void network().then(fresh=>{if(fresh.revision!==cached.revision)onChange(fresh);}).catch(()=>{});
  return cached;
}
export async function loadAsset(asset, {signal} = {}) {
  const url=new URL(asset.path,base).href;
  signal?.throwIfAborted();
  if (!signal && pending.has(url)) return pending.get(url);
  const work=(async()=>{
    const cache=await cacheStore();
    async function decode(response) {
      const buffer=await response.arrayBuffer();
      signal?.throwIfAborted();
      if(buffer.byteLength!==asset.bytes)throw new Error('문항 자료 크기를 확인하지 못했습니다.');
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==asset.sha256)throw new Error('문항 자료가 변경되었습니다. 새로고침해 주세요.');
      const value=JSON.parse(new TextDecoder().decode(buffer));
      signal?.throwIfAborted();
      const valid = asset.format==='compact-search-v1'
        ? q=>Array.isArray(q) && q.length>=6 && typeof q[0]==='string' && typeof q[1]==='string'
          && q.slice(2,6).every(n=>Number.isInteger(n)&&n>=0) && (q[6]===undefined||typeof q[6]==='string')
        : q=>q.id && q.pdfFile;
      if(!Array.isArray(value) || value.some(q=>!valid(q)))throw new Error('문항 자료 형식이 올바르지 않습니다.');
      return value;
    }
    let cached;
    try { cached=await cache?.match(url); if(cached)return await decode(cached); }
    catch(error) { signal?.throwIfAborted();try {await cache?.delete(url);}catch{} }
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
    const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted)controller.abort();
    try {
    const response=await fetch(url,{cache:'no-cache',signal:controller.signal});
    if(!response.ok)throw new Error('문항 자료를 불러오지 못했습니다. 다시 시도해 주세요.');
    const value=await decode(response.clone());
    try { await cache?.put(url,response); } catch {}
    return value;
    } catch(error) { signal?.throwIfAborted();if(controller.signal.aborted)throw new Error('문항 자료 준비가 지연되고 있습니다. 다시 시도해 주세요.'); throw error; }
    finally { clearTimeout(timeout);signal?.removeEventListener('abort',cancel); }
  })();
  if(!signal)pending.set(url,work);
  // Only share concurrent reads; long-lived decoded copies belong to the bounded worker cache.
  try { return await work; } finally { if(pending.get(url)===work)pending.delete(url); }
}
export async function pruneAssets(catalog) {
  const cache=await cacheStore();
  if(!cache)return;
  try { for(const name of await caches.keys())if(name.startsWith('exam-library-catalog-v')&&name!==CACHE)await caches.delete(name); } catch {}
  const allowed=new Set([new URL('data/catalog.json',base).href,...Object.values(catalog.shards)
    .flatMap(s=>[s.browse,s.detail,s.search]).map(a=>new URL(a.path,base).href)]);
  try { for(const key of await cache.keys())if(!allowed.has(key.url))await cache.delete(key); } catch {}
}
