const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inventory } = require('./web-release.cjs');
const assets = require('../memo/assets.json');
const {publicConfig,readConfig}=require('./memo-config.cjs');
function exactInventory(site,files) {
  const actual=inventory(site);
  if(JSON.stringify(Object.keys(actual).sort())!==JSON.stringify(Object.keys(files).sort()))throw new Error('Publication inventory changed');
  for(const [file,hash] of Object.entries(files))if(actual[file]!==hash)throw new Error(`Publication changed: ${file}`);
  return actual;
}
function verifyRoute(site,receipt) {
  const actual=exactInventory(site,receipt.files);
  for(const [file,hash] of Object.entries(receipt.baseFiles))if(!assets.includes(file)&&actual[file]!==hash)throw new Error(`Existing file changed: ${file}`);
  for(const file of Object.keys(actual))if(!assets.includes(file)&&!Object.hasOwn(receipt.baseFiles,file))throw new Error(`Unexpected addition: ${file}`);
  readConfig(path.join(site,'memo/config.js'));
  return Object.keys(actual).length;
}
function appendRoute(site,base,sourceRoot,config) {
  exactInventory(site,base.files);
  for(const file of ['index.html','404.html','js/release-receipt.js','examlibrary/index.html','ourdocs/index.html'])if(!base.files[file])throw new Error(`Incomplete published base: ${file}`);
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();
  for(const asset of assets) {
    const committed=execFileSync('git',['show',`${sourceCommit}:${asset}`],{cwd:sourceRoot});
    if(!fs.readFileSync(path.join(sourceRoot,asset)).equals(committed))throw new Error(`Uncommitted route input: ${asset}`);
    fs.mkdirSync(path.dirname(path.join(site,asset)),{recursive:true});fs.writeFileSync(path.join(site,asset),committed);
  }
  const validated=config.url || config.publishableKey ? publicConfig(config.url,config.publishableKey) : readConfig(path.join(site,'memo/config.js'));
  fs.writeFileSync(path.join(site,'memo/config.js'),'window.MEMO_CONFIG = Object.freeze('+JSON.stringify(validated)+');\n');
  const receipt={schemaVersion:1,sourceCommit,baseSourceCommit:base.baseSourceCommit||base.sourceCommit,baseRouteCommit:base.sourceCommit,baseFiles:base.files,files:inventory(site)};
  verifyRoute(site,receipt);return receipt;
}
async function readiness(site) {
  const config=readConfig(path.join(site,'memo/config.js'));
  const response=await fetch(config.url+'/rest/v1/rpc/memo_snapshot',{method:'POST',headers:{apikey:config.publishableKey,'content-type':'application/json'},body:JSON.stringify({p_archive:false,p_cursor:null}),signal:AbortSignal.timeout(20000)});
  const snapshot=await response.json();
  if(!response.ok||!Array.isArray(snapshot.entries)||!snapshot.server_time||snapshot.owner!==false||snapshot.owner_configured!==true)throw new Error('Public memo database is not ready');
  const denied=await fetch(config.url+'/rest/v1/rpc/memo_snapshot',{method:'POST',headers:{apikey:config.publishableKey,'content-type':'application/json'},body:JSON.stringify({p_archive:true,p_cursor:null}),signal:AbortSignal.timeout(20000)});
  if(denied.ok)throw new Error('Archive must reject anonymous access');
  const settings=await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.publishableKey},signal:AbortSignal.timeout(20000)});
  if(!settings.ok||!(await settings.json()).external?.google)throw new Error('Google login provider is not enabled');
}
if(require.main===module)(async()=>{
  const args=process.argv.slice(2),option=name=>{const value=args[args.indexOf(name)+1];if(!args.includes(name)||!value||value.startsWith('--'))throw new Error(`${name} required`);return path.resolve(value);};
  const site=option('--site');
  if(args.includes('--ready'))await readiness(site);
  else if(args.includes('--verify'))console.log(`Verified ${verifyRoute(site,JSON.parse(fs.readFileSync(option('--receipt'),'utf8')))} files`);
  else {
    const receipt=appendRoute(site,JSON.parse(fs.readFileSync(option('--base-receipt'),'utf8')),path.resolve(__dirname,'..'),{url:process.env.MEMO_SUPABASE_URL,publishableKey:process.env.MEMO_SUPABASE_PUBLISHABLE_KEY});
    const output=option('--receipt');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
    console.log('Added memo; every existing published file is unchanged');
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={assets,publicConfig,appendRoute,verifyRoute,readiness};
