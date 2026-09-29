const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '../preview/js');
function files(dir) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):entry.name.endsWith('.js')?[path.join(dir,entry.name)]:[]);}
test('each imported preview module has exactly one resolved URL identity',()=>{
 const urls=new Map();
 for(const file of files(root)) for(const match of fs.readFileSync(file,'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+\.js(?:\?[^"']*)?)["']/g)) {
  const [module,query='']=match[1].split('?');const target=path.resolve(path.dirname(file),module);if(!urls.has(target))urls.set(target,new Set());urls.get(target).add(query);
 }
 const conflicts=[...urls].filter(([,versions])=>versions.size>1).map(([file,versions])=>({file:path.relative(root,file),versions:[...versions]}));
 assert.deepEqual(conflicts,[]);
});
