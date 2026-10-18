import {loadCatalog} from './catalog-cache.mjs?v=library-release-20261011-3';
import {curriculumOptions,listFiles} from './catalog-filters.mjs?v=library-release-20261011-3';
let catalogPromise, workerPromise,worker,answersPromise;
let publicPaths=new Map(),nextId=0;
const requests=new Map(),listeners=new Set();
let searchState={phase:'idle',done:0,total:0};
function emit(state){searchState=state;for(const listener of listeners)listener(state);}
export function onSearchState(listener){listeners.add(listener);listener(searchState);return()=>listeners.delete(listener);}
export function driveFilePath(name){return publicPaths.get(name)||'';}
export async function browserCatalog(){
 if(!catalogPromise)catalogPromise=loadCatalog(()=>emit({...searchState,updateAvailable:true})).then(value=>{
  publicPaths=new Map(value.files.map(f=>[f.pdfFile,f.publicPath]));return value;
 }).catch(e=>{catalogPromise=null;throw e;});return catalogPromise;
}
function call(type,args={}, {signal,priority}={}){
 signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const id=++nextId;
  const cleanup=()=>signal?.removeEventListener('abort',cancel);
  const cancel=()=>{if(!requests.delete(id))return;cleanup();worker.postMessage({id,type:'cancel'});reject(signal.reason);};
  requests.set(id,{resolve:value=>{cleanup();resolve(value);},reject:error=>{cleanup();reject(error);}});
  signal?.addEventListener('abort',cancel,{once:true});
  worker.postMessage({id,type,priority,...args});
 });
}
async function searchWorker(){
 if(!workerPromise)workerPromise=(async()=>{
  const catalog=await browserCatalog();
  worker=new Worker(new URL('./search-worker.mjs?v=library-release-20261011-3',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
   if(data.type==='progress'){if(requests.has(data.id))emit({...searchState,phase:'preparing',done:data.done,total:data.total});return;}
   const request=requests.get(data.id);if(!request)return;requests.delete(data.id);
   if(data.error)request.reject(new Error(data.error));else request.resolve(data.value);
  };
  worker.onerror=()=>{
   const error=new Error('검색 준비가 중단되었습니다. 다시 시도해 주세요.');
   for(const request of requests.values())request.reject(error);requests.clear();worker.terminate();workerPromise=null;
   emit({...searchState,phase:'error',message:error.message});
  };
  await call('init',{catalog});return worker;
 })().catch(e=>{workerPromise=null;throw e;});return workerPromise;
}
let preparePromise;
export async function prepareSearch(filters={}){
 const all=!filters.subject&&!filters.group;
 if(all&&preparePromise)return preparePromise;
 const work=(async()=>{emit({...searchState,phase:'preparing',done:0});await searchWorker();
  const result=await call('prepare',{filters});emit({...searchState,phase:'ready',done:result.subjects,total:result.subjects});return result;
 })().catch(e=>{emit({...searchState,phase:'error',message:e.message});if(all)preparePromise=null;throw e;});
 if(all)preparePromise=work;return work;
}
// A chosen subject can prepare quietly while the user picks a year or types.
// It never changes visible search readiness. Whole-library preparation requires
// explicit keyword-input intent; opening the landing page does not trigger it.
export async function prefetchSearch(filters,{signal,intent=false}={}){
 if(!filters.subject&&!intent)return;
 signal?.throwIfAborted();await searchWorker();signal?.throwIfAborted();
 return call('prepare',{filters},{signal,priority:'background'});
}
async function answers(){
 if(!answersPromise)answersPromise=fetch(new URL('./data/answers.json',import.meta.url)).then(async r=>r.status===404?{items:[]}:r.ok?r.json():Promise.reject(new Error('정답 색인을 불러오지 못했습니다.')))
 .then(index=>new Map((index.items||[]).map(e=>[e.questionId,e]))).catch(e=>{answersPromise=null;throw e;});return answersPromise;
}
export async function getJson(path, options={}){
 options.signal?.throwIfAborted();
 const url=new URL(path,location.href),params=url.searchParams;
 if(url.pathname==='/api/answer'){const entry=(await answers()).get(params.get('id'));return entry?.verificationStatus === 'verified'?entry:null;}
 const catalog=await browserCatalog();
 if(url.pathname==='/api/status')return catalog.status;
 if(url.pathname==='/api/curriculum')return curriculumOptions(catalog,Object.fromEntries(params));
 if(url.pathname==='/api/files' && !['q','framework','unit','standard'].some(k=>params.get(k))) {
  const found=listFiles(catalog,Object.fromEntries(params)),size=Math.max(1,Math.min(100,Number(params.get('pageSize'))||12));
  const focus=params.get('focus'),index=focus?found.findIndex(f=>f.pdfFile===focus):-1;
  const offset=index<0?Math.max(0,Math.min(100000,Number(params.get('offset'))||0)):Math.floor(index/size)*size;
  const limit=Math.ceil(40/size)*size;
  return {total:found.length,offset,limit,items:found.slice(offset,offset+limit)};
 }
 if(url.pathname==='/api/file-pages'){const f=catalog.files.find(f=>f.pdfFile===params.get('name'));if(!f?.pageCount)throw new Error('시험지를 찾을 수 없습니다.');return{pageCount:f.pageCount};}
 await searchWorker();options.signal?.throwIfAborted();return call('request',{path},options);
}
