const fs=require('node:fs');
const vm=require('node:vm');
function publicConfig(url,key) {
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||'')) throw new Error('Supabase project URL required');
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key||'')) {
    let role;try { role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role; } catch {}
    if(role!=='anon') throw new Error('Only a publishable key or legacy anon key may be deployed');
  }
  return {url,publishableKey:key};
}
function readConfig(file) {
  const window={};vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,Object});
  return publicConfig(window.MEMO_CONFIG?.url,window.MEMO_CONFIG?.publishableKey);
}
module.exports={publicConfig,readConfig};
