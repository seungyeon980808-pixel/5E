const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const canonicalRoot = path.resolve(__dirname, '../js');
const { mainModuleUrl, runtimeConfiguration } = require('./helpers/four-session-entry.cjs');
function files(dir) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):entry.name.endsWith('.js')?[path.join(dir,entry.name)]:[]);}
// 1.7.1: 옛 preview/ 사본을 지워 그 트리 검사는 뺐다. 아래는 실제로 싣는 정식 트리를 검사한다.
function moduleIdentities(sources, origin = 'http://owned-candidate.invalid') {
 const urls = new Map();
 for (const [filename, source] of sources) {
  const parent = new URL(filename, origin);
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']((?:\.{1,2}\/|\/)[^"']+\.js(?:[?#][^"']*)?)["']/g)) {
   const url = new URL(match[1], parent);
   const key = decodeURIComponent(url.pathname);
   if (!urls.has(key)) urls.set(key, new Set());
   urls.get(key).add(url.href);
  }
 }
 return urls;
}

test('each imported canonical root module has exactly one resolved URL identity', () => {
 const sources = files(canonicalRoot).map(file => [
  '/' + path.relative(path.resolve(__dirname, '..'), file).split(path.sep).join('/'),
  fs.readFileSync(file, 'utf8'),
 ]);
 const identities = moduleIdentities(sources);
 assert.deepEqual([...identities].filter(([, urls]) => urls.size > 1)
  .map(([file, urls]) => ({ file, urls: [...urls] })), []);
 assert.deepEqual([...identities.keys()].filter(file => file.startsWith('/preview/js/')), [],
  'canonical modules must not import the compatibility state tree');
});

test('the root HTML enters the canonical main and state instances', () => {
 const origin = 'http://owned-candidate.invalid';
 const mainSource = fs.readFileSync(path.join(canonicalRoot, 'main.js'), 'utf8');
 const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
 const entryUrl = new URL('/', origin).href;
 const main = mainModuleUrl(html, entryUrl);
 const runtime = runtimeConfiguration({ entry: '/' }, entryUrl, main, mainSource);
 assert.equal(runtime.moduleBase, '/js/');
 assert.equal(new URL(runtime.mainUrl).search, runtime.moduleQuery,
  'entry and state must preserve the same root query');
 const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)]
  .map(match => new URL(match[1], entryUrl));
 assert.deepEqual(scripts.filter(url => url.pathname.startsWith('/preview/')).map(url => url.href), []);
});

test('canonical scan detects dynamic, absolute and fragment identity conflicts', () => {
 const identities = moduleIdentities([
  ['/js/main.js', "import { state } from './state.js?v=owned'; import('/js/state.js?v=alias');"],
  ['/js/graph/modal.js', "export { state } from '../state.js?v=owned#duplicate';"],
 ]);
 assert.equal(identities.get('/js/state.js').size, 3);
});
