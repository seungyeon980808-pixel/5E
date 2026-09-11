// Read-only App Server probe. No model turn, login change, or credential export.
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const {writeFileSync}=require('node:fs');
const path=require('node:path');
const allowed=new Set(['initialize','account/read','model/list']);
const child=spawn('codex',['app-server','--listen','stdio://'],{stdio:['pipe','pipe','ignore']});
let serial=0;
const pending=new Map();
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{let message;try{message=JSON.parse(line);}catch{return;}const p=pending.get(message.id);if(!p)return;pending.delete(message.id);message.error?p.reject(new Error('RPC failed: '+message.error.code)):p.resolve(message.result);});
child.on('error',error=>{for(const p of pending.values())p.reject(error);});
function rpc(method,params){if(!allowed.has(method))throw Error('Probe forbids this method');return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,params})+'\n');});}
const timer=setTimeout(()=>{child.kill();process.exitCode=1;console.error('Probe timed out');},30000);
(async()=>{try{
 await rpc('initialize',{clientInfo:{name:'5e-web-auth-probe',version:'0.1.0'},capabilities:{experimentalApi:true}});
 child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
 const account=await rpc('account/read',{refreshToken:false});
 const models=await rpc('model/list',{limit:100,includeHidden:false});
 const model=(models.data||[]).find(item=>item.model==='gpt-5.6-sol'||item.id==='gpt-5.6-sol');
 const result={checkedAt:new Date().toISOString(),environment:'local headless process, not a deployed server',accountType:account.account?.type||null,requiredModelAvailable:Boolean(model),mediumSupported:!!model?.supportedReasoningEfforts?.some(e=>e.reasoningEffort==='medium'),allowedRpc:[...allowed],generationCalls:0,credentialExported:false};
 writeFileSync(path.join(__dirname,'probe-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}finally{clearTimeout(timer);lines.close();child.kill();}})();
