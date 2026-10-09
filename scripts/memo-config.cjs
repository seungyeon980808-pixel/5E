const fs=require('node:fs');
const vm=require('node:vm');
function publicConfig(apiUrl,googleClientId) {
  let url;try{url=new URL(apiUrl);}catch{}
  if(!url||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Public HTTPS Worker origin required');
  if(!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId||''))throw new Error('Google web client ID required');
  return {apiUrl:url.origin,googleClientId};
}
function readConfig(file) {
  const window={};vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,Object});
  return publicConfig(window.MEMO_CONFIG?.apiUrl,window.MEMO_CONFIG?.googleClientId);
}
module.exports={publicConfig,readConfig};
